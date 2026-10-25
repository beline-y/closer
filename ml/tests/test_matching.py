import json
import threading
import urllib.error
import urllib.request
from datetime import date, timedelta
from http.server import ThreadingHTTPServer
from types import SimpleNamespace

import numpy as np
import pytest

from closer_ai.bridge import BadRequest, Engine, matching_view, volunteers_from_json
from closer_ai.claude import MATCH_SCHEMA
from closer_ai.matching import Child, rule_affinity, simulate
from closer_ai.pipeline import ThresholdFallback
from closer_ai.server import CareTabAPI
from closer_ai.store import Store

TODAY = date(2026, 10, 25)
LEO, AVA, LUCAS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
NO_ASSESSOR = SimpleNamespace(version="gam-test")  # the matching never runs the wellbeing models

ROSTER = [
    {"id": "maya", "first_name": "Maya", "job": "Marine biologist", "story": "I study dolphins and coral reefs.",
     "passions": ["Diving", "Dolphins", "Underwater photos"], "languages": ["English"], "slots": 2, "ages": [6, 14]},
    {"id": "tom", "first_name": "Tom", "job": "Train driver", "story": "I drive high-speed trains.",
     "passions": ["Model trains", "LEGO"], "slots": 1, "ages": [5, 12]},
    {"id": "clara", "first_name": "Clara", "job": "Music teacher", "story": "My cat sleeps on my guitar case.",
     "passions": ["Guitar", "Songwriting", "Cats"], "slots": 1, "ages": [8, 17]},
]
CHILDREN = [
    {"id": LEO, "nickname": "Leo", "birth_year": 2017, "interests": ["dinosaurs", "soccer", "drawing", "the ocean"],
     "has_family": True},
    {"id": AVA, "nickname": "Ava", "birth_year": 2014, "interests": ["music", "cats"], "has_family": False},
    {"id": LUCAS, "nickname": "Lucas", "birth_year": 2019, "interests": ["trains", "lego"], "has_family": False},
]


def payload(**extra) -> dict:
    return {"today": TODAY.isoformat(), "volunteers": ROSTER, "patients": CHILDREN, "requests": []} | extra


def child(board: dict, nickname: str) -> dict:
    return next(c for c in board["children"] if c["nickname"] == nickname)


def volunteer(board: dict, vid: str) -> dict:
    return next(v for v in board["volunteers"] if v["volunteer_id"] == vid)


def engine(client=None) -> Engine:
    return Engine(NO_ASSESSOR, ThresholdFallback(), client=client)


def test_the_lexicon_finds_what_a_child_and_a_volunteer_share():
    maya, tom, _ = volunteers_from_json(ROSTER)
    leo, lucas = Child(LEO, "Leo", 9, ("dinosaurs", "the ocean")), Child(LUCAS, "Lucas", 7, ("trains", "lego"))
    ocean = rule_affinity(leo, maya)
    assert ocean.fit == "good" and ocean.shared[0].startswith("the ocean →") and ocean.starter.endswith("?")
    assert rule_affinity(lucas, tom).fit == "strong"
    assert rule_affinity(lucas, maya).fit == "none" and rule_affinity(lucas, maya).shared == ()


def test_each_child_gets_the_volunteer_they_share_most_with():
    board = matching_view(Store(), engine(), payload())
    assert {c["nickname"]: c["suggestion"]["volunteer_id"] for c in board["children"]} == \
        {"Leo": "maya", "Ava": "clara", "Lucas": "tom"}
    assert board["children"][-1]["nickname"] == "Leo"  # the children with no family linked come first
    assert "no_family" in child(board, "Ava")["reasons"] and not board["claude"] and board["claude_pairs"] == 0


def test_the_most_isolated_child_gets_the_only_free_visit():
    # Leo loves music too, and Clara offers one visit a week: Ava, who has no family linked, gets it.
    board = matching_view(Store(), engine(), payload(patients=[CHILDREN[0] | {"interests": ["music"]}, CHILDREN[1]]))
    assert child(board, "Ava")["suggestion"]["volunteer_id"] == "clara"
    leo = child(board, "Leo")
    assert leo["suggestion"] is None and leo["unmatched"] == "no_free_volunteer"
    assert leo["options"][0]["volunteer_id"] == "clara" and leo["options"][0]["status"] == "full"


def test_requests_and_suggestions_hold_their_volunteer():
    store, matcher = Store(), engine()
    pending = [{"patient_id": AVA, "volunteer_id": "clara", "status": "pending_guardian", "local_date": TODAY.isoformat()}]
    board = matching_view(store, matcher, payload(requests=pending))
    ava = child(board, "Ava")
    assert ava["suggestion"] is None and "request_in_progress" in ava["reasons"]
    assert ava["requests"][0]["status"] == "pending_guardian" and volunteer(board, "clara")["held"] == 1

    board = matching_view(store, matcher, payload(), suggestion={"patient_id": LUCAS, "volunteer_id": "tom", "suggested_by": "Sarah"})
    assert child(board, "Lucas")["suggestion"]["suggested_on"] == TODAY.isoformat()
    assert volunteer(board, "tom")["held"] == 1 and volunteer(board, "tom")["proposed"] == 0
    # The care team changed its mind: the latest suggestion of the week stands, and Tom is free again.
    board = matching_view(store, matcher, payload(), suggestion={"patient_id": LUCAS, "volunteer_id": "maya"})
    assert child(board, "Lucas")["suggestion"]["volunteer_id"] == "maya" and volunteer(board, "tom")["held"] == 0
    with pytest.raises(BadRequest):
        matching_view(store, matcher, payload(), suggestion={"patient_id": LUCAS, "volunteer_id": "stranger"})


def test_a_rated_visit_teaches_the_matching():
    store, matcher = Store(), engine()
    met = (TODAY - timedelta(days=8)).isoformat()
    accepted = [{"patient_id": LUCAS, "volunteer_id": "tom", "status": "accepted", "local_date": met}]
    before = matching_view(store, matcher, payload(requests=accepted))
    assert child(before, "Lucas")["to_rate"] == [{"volunteer_id": "tom", "local_date": met}]

    rating = {"patient_id": LUCAS, "volunteer_id": "tom", "local_date": met, "outcome": "great", "rated_by": "Sarah"}
    board = matching_view(store, matcher, payload(requests=accepted), rating=rating)
    lucas = child(board, "Lucas")
    assert lucas["to_rate"] == [] and lucas["rated"][0]["outcome"] == "great" and board["rated_visits"] == 1
    assert lucas["suggestion"]["volunteer_id"] == "tom" and lucas["suggestion"]["met_before"] == 1.0
    assert lucas["suggestion"]["expected"] > child(before, "Lucas")["suggestion"]["expected"]
    assert volunteer(board, "tom")["effect"] > 0 and volunteer(board, "tom")["went_well"] == 1

    hard = matching_view(Store(), matcher, payload(requests=accepted), rating=rating | {"outcome": "hard"})
    assert volunteer(hard, "tom")["effect"] < 0
    for bad in ({"outcome": "amazing"}, {"local_date": (TODAY + timedelta(days=1)).isoformat()}):
        with pytest.raises(BadRequest):
            matching_view(store, matcher, payload(), rating=rating | bad)


def fake_claude(fits: dict[str, str]):
    calls = []

    def create(**request):
        calls.append(request)
        text = request["messages"][0]["content"][0]["text"]
        matches = [{"volunteer_id": v["id"], "fit": fits.get(v["id"], "none"), "shared": ["the ocean → dolphins"],
                    "reason": f"{v['first_name']} shares an interest.", "starter": "Do dolphins sleep?"}
                   for v in json.loads(text.split("Volunteers:\n", 1)[1])]
        matches.append({"volunteer_id": "stranger", "fit": "strong", "shared": [], "reason": "", "starter": ""})
        body = [SimpleNamespace(type="text", text=json.dumps({"matches": matches}))]
        return SimpleNamespace(stop_reason="end_turn", stop_details=None, content=body)

    return SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(create=create))), calls


def test_claude_reads_each_pair_once_and_never_sees_a_name():
    client, calls = fake_claude({"maya": "strong", "clara": "good", "tom": "some"})
    store, matcher = Store(), engine(client)
    board = matching_view(store, matcher, payload())
    assert len(calls) == 3  # one call per child, with every volunteer
    texts = [c["messages"][0]["content"][0]["text"] for c in calls]
    assert not any(name in text for text in texts for name in ("Leo", "Ava", "Lucas"))
    assert all('"age"' in text and '"interests"' in text for text in texts)
    assert calls[0]["output_config"]["format"]["schema"] == MATCH_SCHEMA
    assert board["claude"] and board["claude_pairs"] == 9  # the unknown "stranger" was dropped
    assert child(board, "Leo")["suggestion"]["source"] == "claude"
    matching_view(store, matcher, payload())
    assert len(calls) == 3  # the readings are cached in the store


def test_learning_beats_affinity_alone_in_simulation():
    gains = [simulate(learn=True, seed=s) - simulate(learn=False, seed=s) for s in range(5)]
    assert np.mean(gains) > 0.02 and sum(g > 0 for g in gains) >= 4


@pytest.fixture
def api(tmp_path):
    app = CareTabAPI(tmp_path / "care.sqlite", engine(), "s" * 32)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), app.handler())
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_port}"
    httpd.shutdown()


def call(base, path, body):
    request = urllib.request.Request(base + path, method="POST", data=json.dumps(body).encode(),
                                     headers={"Authorization": "Bearer " + "s" * 32, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def test_matching_over_http(api):
    status, board = call(api, "/v1/matching", payload())
    assert status == 200 and len(board["children"]) == 3
    status, board = call(api, "/v1/matching/suggestions", payload(suggestion={"patient_id": AVA, "volunteer_id": "clara"}))
    assert status == 200 and child(board, "Ava")["suggestion"]["suggested_on"] == TODAY.isoformat()
    visit = {"patient_id": AVA, "volunteer_id": "nobody", "local_date": TODAY.isoformat(), "outcome": "great"}
    assert call(api, "/v1/matching/visits", payload(visit=visit))[0] == 400
    assert call(api, "/v1/matching", payload(volunteers=[{"id": "../x", "first_name": "X"}]))[0] == 400
