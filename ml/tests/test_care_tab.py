import json
import math
import sqlite3
import threading
import urllib.error
import urllib.request
from datetime import date, timedelta

import numpy as np
import pytest

from closer_ai.bridge import BadRequest, Engine, observation_from_json, report, sync_patient
from closer_ai.contract import NurseObservation
from closer_ai.features import FEATURES, build
from closer_ai.pipeline import ThresholdFallback, run_daily
from closer_ai.policy.obs import ASK, WAIT
from closer_ai.store import Store

TODAY = date(2026, 10, 25)
LEO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


def app_payload(days=3, **patient):
    checkins = [{"local_date": (TODAY - timedelta(days=k)).isoformat(), "mood": 4, "meals": ["lunch"],
                 "meal_amount": "half", "activities": ["treatment", "drew"] if k == 1 else ["played"], "note": None}
                for k in range(days)]
    return {"today": TODAY.isoformat(), "checkins": checkins,
            "patient": {"nickname": "Leo", "birth_year": 2017, "interests": ["dinosaurs"], "has_family": True} | patient}


def test_app_checkins_map_to_the_contract_and_sync_is_idempotent():
    store = Store()
    sync_patient(store, LEO, app_payload())
    version = store.data_version(LEO)
    day = store.load(TODAY, patient_ids=[LEO])[0].history
    yesterday = day.days[-2]
    assert yesterday.activity == "crafts" and yesterday.meal == "some"
    assert [e.kind for e in day.context] == ["big_day"]  # "Exam or treatment" became a big day
    assert not any(r.engagement_known for r in day.days)  # the app sends no usage data yet
    sync_patient(store, LEO, app_payload())
    assert store.data_version(LEO) == version


def test_unknown_usage_is_not_read_as_no_family_contact():
    store = Store()
    sync_patient(store, LEO, app_payload(days=9))
    X = build(store.load(TODAY, patient_ids=[LEO])[0].history).matrix()
    assert math.isnan(X[-1, FEATURES.index("days_since_family_contact")])
    assert math.isnan(X[-1, FEATURES.index("family_contacts_3d")])


def test_ward_intake_leaves_the_child_out():
    store = Store()
    for pid, name in ((LEO, "Leo"), ("c", "Ava"), ("d", "Lucas")):
        sync_patient(store, pid, app_payload(nickname=name))
    store.put_menu(TODAY, {"lunch": "fish and rice", "dinner": ""})
    store.put_observation(LEO, TODAY, NurseObservation(lunch="little"), None, "Sarah")
    store.put_observation("c", TODAY, NurseObservation(lunch="all"), None, "Sarah")
    store.put_observation("d", TODAY, NurseObservation(lunch="half"), None, "Sarah")
    leo = store.load(TODAY, patient_ids=[LEO])[0].history.days[-1]
    assert leo.ward_meals[0].dish == "fish and rice" and leo.ward_meals[0].ward_intake == pytest.approx(0.75)
    assert store.menu(TODAY) == {"lunch": "fish and rice", "dinner": None}


def test_nurse_form_is_validated():
    observation, visits = observation_from_json({"lunch": "half", "affect": ["sad", "sad", "withdrawn"], "pain": 3,
                                                 "visits": ["parent"], "note": "  quiet today  "})
    assert observation.affect == ("sad", "withdrawn") and observation.note == "quiet today" and visits == ["parent"]
    for bad in ({"lunch": "lots"}, {"pain": 11}, {"affect": ["grumpy"]}, {"visits": ["dog"]}):
        with pytest.raises(BadRequest):
            observation_from_json(bad)


def test_nurse_request_raises_a_priority_alert(assessor):
    store = Store()
    sync_patient(store, LEO, app_payload())
    store.put_observation(LEO, TODAY, NurseObservation(asks_psychologist=True, affect=("withdrawn",)), None, "Sarah")
    decision = run_daily(store, assessor, ThresholdFallback(0.99), TODAY)[0]
    assert decision.alerts[0]["source"] == "nurse_request" and decision.alerts[0]["priority"] == "priority"


def test_a_concern_in_the_nurse_note_goes_through_the_rules(assessor):
    store = Store()
    sync_patient(store, LEO, app_payload())
    store.put_observation(LEO, TODAY, NurseObservation(note="Leo m'a dit: personne m'aime"), None, "Sarah")
    alert = run_daily(store, assessor, ThresholdFallback(0.99), TODAY)[0].alerts[0]
    assert alert["source"] == "safety_rule" and "nurse" in alert["reason"]


class Scripted:
    """A policy that plays a fixed list of actions, one per run."""

    version = "scripted"

    def __init__(self, *actions):
        self.actions = list(actions)

    def act_obs(self, obs, mask):
        return self.actions.pop(0)


def test_a_decision_taken_today_only_escalates(assessor):
    store = Store()
    sync_patient(store, LEO, app_payload())
    engine = Engine(assessor, Scripted(ASK, WAIT))
    engine.refresh(store, LEO, TODAY)
    store.put_observation(LEO, TODAY, NurseObservation(affect=("calm",)), None, "Sarah")
    assert engine.refresh(store, LEO, TODAY)
    assert report(store, LEO, TODAY, engine)["assessment"]["action"] == "ask"
    assert not engine.refresh(store, LEO, TODAY)  # nothing new: no second run, no second Claude call


def test_alerts_can_rise_but_never_drop():
    store = Store()
    sync_patient(store, LEO, app_payload())
    alert = {"patient_id": LEO, "for_date": TODAY.isoformat(), "source": "safety_rule", "reason": "x"}
    assert store.save_alert(alert | {"priority": "priority"})
    assert store.save_alert(alert | {"priority": "urgent"})
    assert not store.save_alert(alert | {"priority": "digest"})
    assert [a["priority"] for a in store.alerts()] == ["urgent"]


def test_an_old_store_file_is_refused(tmp_path):
    path = tmp_path / "old.sqlite"
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE patients (id TEXT)")
    db.close()
    with pytest.raises(RuntimeError, match="older version"):
        Store(path)


@pytest.fixture
def api(tmp_path, assessor):
    from closer_ai.server import CareTabAPI
    from http.server import ThreadingHTTPServer

    app = CareTabAPI(tmp_path / "care.sqlite", Engine(assessor, ThresholdFallback(0.5)), "s" * 32)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), app.handler())
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_port}"
    httpd.shutdown()


def call(base, method, path, body=None, token="s" * 32):
    request = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body else None,
                                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def test_http_api_round_trip(api):
    assert call(api, "GET", "/v1/health", token="")[0] == 200
    assert call(api, "POST", f"/v1/patients/{LEO}/sync", app_payload(), token="wrong")[0] == 401
    status, first = call(api, "POST", f"/v1/patients/{LEO}/sync", app_payload())
    assert status == 200 and first["assessment"]["level"] in ("stable", "fragile", "distress")
    assert first["assessment"]["summary_source"] == "template" and first["observation"] is None
    status, _ = call(api, "PUT", "/v1/menu/2026-10-25", {"lunch": "lasagna"})
    assert status == 200
    round_ = {"observation": {"lunch": "none", "affect": ["tearful", "withdrawn"], "engagement": "refuses",
                              "asks_psychologist": True, "visits": []}, "observed_by": "Sarah"}
    status, after = call(api, "PUT", f"/v1/patients/{LEO}/observations/2026-10-25", round_)
    assert status == 200 and after["observation"]["observed_by"] == "Sarah" and after["menu"]["lunch"] == "lasagna"
    assert any(a["source"] == "nurse_request" for a in after["alerts"])
    assert after["assessment"]["p"]["distress"] > first["assessment"]["p"]["distress"]
    assert call(api, "PUT", f"/v1/patients/{LEO}/observations/2026-10-25", {"observation": {"pain": 42}})[0] == 400
    status, overview = call(api, "POST", "/v1/overview", {"patients": [app_payload() | {"id": LEO}]})
    assert status == 200 and overview["patients"][0]["open_alerts"] >= 1 and overview["patients"][0]["nurse_seen_today"]


def test_sync_rejects_future_checkins_and_bad_ids(api):
    future = app_payload()
    future["checkins"][0]["local_date"] = (TODAY + timedelta(days=1)).isoformat()
    assert call(api, "POST", f"/v1/patients/{LEO}/sync", future)[0] == 400
    assert call(api, "POST", "/v1/patients/..%2F/sync", app_payload())[0] in (400, 404)


def test_engine_scores_are_finite(assessor):
    store = Store()
    sync_patient(store, LEO, app_payload(days=14))
    decision = run_daily(store, assessor, ThresholdFallback(), TODAY, write=False)[0]
    assert np.isfinite(decision.probs).all()
