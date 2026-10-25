import json
from datetime import date
from types import SimpleNamespace

import numpy as np
from sklearn.tree import DecisionTreeClassifier

from closer_ai.claude import FALLBACK_BETA, MODEL, ClaudeReader, ClaudeSummarizer, StoreCache
from closer_ai.contract import ChildProfile, DayRecord
from closer_ai.pipeline import ThresholdFallback, run_daily
from closer_ai.policy.distill import TreePolicy
from closer_ai.policy.obs import DIGEST, OBS_NAMES, WAIT
from closer_ai.policy.whittle import GRID, indices_from
from closer_ai.store import Store

TODAY = date(2026, 10, 24)
INDIRECT = "j'ai écrit un mot pour dire au revoir à tout le monde"


class FakeMessages:
    def __init__(self, replies):
        self.replies, self.requests = list(replies), []

    def create(self, **request):
        self.requests.append(request)
        stop, text = self.replies.pop(0)
        content = [SimpleNamespace(type="thinking", thinking="")]
        if text is not None:
            content.append(SimpleNamespace(type="text", text=text))
        return SimpleNamespace(stop_reason=stop, stop_details=None, content=content)


def fake_client(*replies):
    messages = FakeMessages(replies)
    return SimpleNamespace(beta=SimpleNamespace(messages=messages)), messages


def reading(safety="none", category="none", **signals):
    full = {name: 0 for name in ("sad", "lonely", "fear", "anger", "bored", "pain", "withdrawal", "positive")} | signals
    return json.dumps({"safety": safety, "category": category, "signals": full, "themes": [], "evidence": ""})


def test_request_uses_structured_output_and_fallbacks():
    client, messages = fake_client(("end_turn", reading("crisis", "suicidal_thoughts", sad=2)))
    result = ClaudeReader(client).read_note(INDIRECT)
    request = messages.requests[0]
    assert request["model"] == MODEL and request["betas"] == [FALLBACK_BETA] and request["fallbacks"] == "default"
    assert request["output_config"]["format"]["type"] == "json_schema"
    assert INDIRECT in request["messages"][0]["content"][0]["text"]
    assert result.flag(INDIRECT).level == "crisis"


def test_refusal_falls_back_without_crashing():
    client, _ = fake_client(("refusal", None))
    assert ClaudeReader(client).read_note("note") is None


def test_claude_can_only_add_signals():
    client, _ = fake_client(("end_turn", reading(sad=0, lonely=2)))
    signals = ClaudeReader(client).note_analyzer("je suis triste")
    assert signals.sad >= 1 and signals.lonely == 2  # lexicon kept "sad", Claude added "lonely"


def test_readings_are_cached_in_the_store():
    store = Store()
    client, messages = fake_client(("end_turn", reading("concern", "hopelessness")))
    ClaudeReader(client, cache=StoreCache(store)).read_note("ça ira jamais mieux")
    again = ClaudeReader(client, cache=StoreCache(store)).read_note("ça ira jamais mieux")
    assert again.safety == "concern" and len(messages.requests) == 1


def test_second_reader_catches_what_the_lexicon_misses(assessor):
    store = Store()
    store.add_patient(ChildProfile("p1", 13, (), True, date(2026, 10, 15)), "Jade", 2013)
    store.add_day("p1", DayRecord(day=TODAY, mood=4, note=INDIRECT))
    without = run_daily(store, assessor, ThresholdFallback(0.99), TODAY, write=False)[0]
    assert not without.alerts
    client, _ = fake_client(("end_turn", reading("crisis", "suicidal_thoughts", sad=2)),
                            ("end_turn", "Jade wrote an indirect goodbye today; see her now."))
    reader, summarizer = ClaudeReader(client), ClaudeSummarizer(client)
    decision = run_daily(store, assessor, ThresholdFallback(0.99), TODAY, reader, summarizer, write=False)[0]
    assert reader.calls == 1  # the features and the shield share one reading of the note
    assert decision.alerts[0]["priority"] == "urgent"
    assert decision.alerts[0]["evidence"]["detected_by"] == "claude"
    assert decision.summary.startswith("Jade wrote")


class MonotonePolicy:
    """Alerts while lambda is below a per-child cut: index should equal the cut's grid value."""

    def __init__(self, cuts):
        self.cuts = cuts

    def actions_for_lambdas(self, obs, masks, lams):
        return np.array([[DIGEST if lam <= cut else WAIT for lam in lams] for cut in self.cuts])


def test_whittle_index_is_the_highest_alerting_price():
    cuts = [GRID[3], GRID[10], 0.0]
    index = indices_from(MonotonePolicy(cuts), np.zeros((3, len(OBS_NAMES))), np.ones((3, 4), bool))
    assert np.allclose(index, [GRID[3], GRID[10], 0.0])


def test_tree_policy_prints_readable_rules_and_paths():
    rng = np.random.default_rng(0)
    X = rng.random((400, len(OBS_NAMES))).astype(np.float32)
    y = np.where(X[:, 2] > 0.5, DIGEST, WAIT)
    tree = TreePolicy(DecisionTreeClassifier(max_depth=2).fit(X, y), lam=1.0)
    assert "p_distress" in tree.rules()
    obs = np.zeros(len(OBS_NAMES), np.float32)
    obs[2] = 0.9
    assert tree.act_obs(obs, np.ones(4, bool)) == DIGEST
    assert any("p_distress >" in step for step in tree.path(obs))


def test_tradeoff_chart_is_valid_svg():
    import xml.etree.ElementTree as ET

    from closer_ai.chart import SERIES, tradeoff_svg

    fronts = {key: [(0.1, 0.2, 0.5), (0.3, 0.6, 0.2), (5.0, 1.4, 0.05)] for key, *_ in SERIES}
    svg = tradeoff_svg(fronts, 0.4, "Title", ("Spec rules", 0.8, 0.3))
    root = ET.fromstring(svg)
    paths = [el for el in root.iter("{http://www.w3.org/2000/svg}path")]
    assert len(paths) == len(SERIES)
    assert "Spec rules" in svg and "Budget 0.4" in svg and "not shown" in svg


def test_access_check_reports_missing_credentials_without_raising():
    from closer_ai.claude import check_access

    class NoCredentials:
        class models:
            @staticmethod
            def retrieve(model):
                raise TypeError("Could not resolve authentication method. Expected one of api_key")

    assert check_access(NoCredentials()) == "Could not resolve authentication method"


def test_every_child_gets_a_stored_daily_summary(assessor):
    from closer_ai.cli import seed_store

    class Recorder:
        def __init__(self):
            self.facts = []

        def summarize(self, facts):
            self.facts.append(facts)
            return f"{facts['child']['nickname']} is doing {facts['assessment']['level']}."

    store = Store()
    seed_store(store, 5, TODAY)
    recorder = Recorder()
    decisions = run_daily(store, assessor, ThresholdFallback(0.99), TODAY, summarizer=recorder)
    assert len(recorder.facts) == 5 and all(d.summary.endswith(".") for d in decisions)
    assert {"child", "assessment", "last_7_days", "recent_notes", "care_context", "decision"} <= set(recorder.facts[0])
    stored = [row[0] for row in store.db.execute("SELECT summary FROM ai_assessments")]
    assert sorted(stored) == sorted(d.summary for d in decisions)
