import sqlite3
from dataclasses import replace
from datetime import date

import pytest

from closer_ai.cli import seed_store
from closer_ai.contract import ChildProfile, DayRecord, Drawing, MediaLog
from closer_ai.pipeline import ThresholdFallback, run_daily
from closer_ai.store import Store

TODAY = date(2026, 10, 24)


def _child(store: Store, pid: str = "p1") -> None:
    store.add_patient(ChildProfile(pid, 10, ("dessin", "foot"), True, date(2026, 10, 10)), "Léo", 2016)


def test_day_round_trip():
    store = Store()
    _child(store)
    record = DayRecord(
        day=TODAY, mood=2, feelings=("sad", "lonely"), activity="rest", meal="some", sleep_quality=2, nightmares=True,
        pain=4, worry=3, worry_topics=("home",), wants_to_talk=True, note="je m'ennuie", minutes_in_app=12.5,
        night_minutes=3.0, nudges_sent=2, nudge_replies=1, cards_opened=1, question_answered=True, family_contacts=3,
        friend_contacts=1, visits=("parent",), drawings=3, shared_drawings=(Drawing(2, ("home",), "ma maison"),),
        media=(MediaLog("movie", 90, "alone", 3, True),), screening=0.4,
    )
    store.add_day("p1", record)
    loaded = store.load(TODAY, days=1)[0].history.days[-1]
    assert loaded == record


def test_unshared_drawings_keep_no_details():
    store = Store()
    _child(store)
    with pytest.raises(sqlite3.IntegrityError):
        store.db.execute("INSERT INTO drawings (patient_id, local_date, shared_with_care_team, title) VALUES ('p1', ?, 0, 'x')",
                         (TODAY.isoformat(),))


def test_missing_days_are_empty_and_window_starts_at_admission():
    store = Store()
    _child(store)
    store.add_day("p1", DayRecord(day=date(2026, 10, 20), mood=4))
    days = store.load(TODAY)[0].history.days
    assert days[0].day == date(2026, 10, 10) and days[-1].day == TODAY
    assert sum(d.checked_in for d in days) == 1


def test_alerts_are_idempotent_and_reviews_become_psy_contacts():
    store = Store()
    _child(store)
    alert = {"patient_id": "p1", "for_date": TODAY.isoformat(), "source": "policy", "priority": "digest", "reason": "x"}
    assert store.save_alert(alert) and not store.save_alert(alert)
    alert_id = store.alerts()[0]["id"]
    store.review_alert(alert_id, "support_needed", "Dr. Martin")
    state = store.load(TODAY)[0].state
    assert state.alerts and state.psy_contacts
    assert store.labels()[0]["outcome"] == "support_needed"


def test_daily_job_on_fictional_children(assessor):
    store = Store()
    seed_store(store, 12, TODAY)
    decisions = run_daily(store, assessor, ThresholdFallback(0.4), TODAY)
    assert len(decisions) == 12
    assert {d.level for d in decisions} <= {"stable", "fragile", "distress"}
    saved = store.db.execute("SELECT COUNT(*) FROM ai_assessments").fetchone()[0]
    assert saved == 12
    # Running twice the same day changes nothing.
    alerts = len(store.alerts())
    run_daily(store, assessor, ThresholdFallback(0.4), TODAY)
    assert len(store.alerts()) == alerts


def test_crisis_note_raises_an_urgent_alert(assessor):
    store = Store()
    _child(store)
    store.add_day("p1", DayRecord(day=TODAY, mood=3, note="des fois je pense à me tuer"))
    decision = run_daily(store, assessor, ThresholdFallback(), TODAY)[0]
    assert decision.alerts[0]["priority"] == "urgent"
    assert store.alerts()[0]["source"] == "safety_rule"


def test_shifted_history_keeps_its_shape():
    from closer_ai.simulator import simulate_stay
    from closer_ai.store import shift_history

    sim = simulate_stay(1)
    shifted = shift_history(sim.history, TODAY)
    assert shifted.days[-1].day == TODAY
    assert [replace(d, day=None) for d in shifted.days] == [replace(d, day=None) for d in sim.history.days]


def test_local_env_only_loads_anthropic_settings(tmp_path, monkeypatch):
    from closer_ai.cli import load_local_env

    env_file = tmp_path / ".env.local"
    env_file.write_text("NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nANTHROPIC_API_KEY=from-file\n"
                        "CLOSER_CLAUDE_MODEL=\n")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_SUPABASE_URL", raising=False)
    monkeypatch.setenv("CLOSER_CLAUDE_MODEL", "already-set")
    load_local_env(env_file)
    import os

    assert os.environ["ANTHROPIC_API_KEY"] == "from-file"
    assert "NEXT_PUBLIC_SUPABASE_URL" not in os.environ
    assert os.environ["CLOSER_CLAUDE_MODEL"] == "already-set"
