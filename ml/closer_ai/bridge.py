"""Bridge between the Closer app and the AI store.

The app (Supabase) stays the source of truth for what the child shares; the AI module keeps
its own SQLite store. The Next.js server is the only link: it forwards the check-ins the
signed-in care team member may read (RLS), the nurse's round, the ward's menu and the
volunteer roster, and gets back what the care tab shows. The app's vocabulary is mapped to
the data contract here, in one place.
"""

from __future__ import annotations

import base64
import binascii
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from PIL import UnidentifiedImageError

from .contract import (
    AFFECTS, CONTACT_STATUSES, ENGAGEMENT, INTAKE, NIGHT_SLEEP, VISIT_OUTCOMES, VISITOR_KINDS, WARD_MEALS, Drawing,
    NurseObservation,
)
from .drawings import analyze, image_hash
from .features import DRAWING_PRIOR, DRAWING_PRIOR_WEIGHT, DRAWING_SCALE, FEATURES, FeatureBuilder
from .matching import WEEK, Affinity, Child, Request, Suggestion, Visit, Volunteer, pair_features, plan_week, rule_affinity
from .pipeline import run_daily
from .store import Store

# The app's check-in chips (src/lib/checkin.ts). "treatment" is a big day, not an activity.
APP_ACTIVITIES = {"played": "play", "movie": "screen", "drew": "crafts", "school": "school", "visit": "visit",
                  "rested": "rest", "walk": "walk"}
APP_MEAL_AMOUNTS = {"all": "all", "half": "some", "a_little": "some"}
PATIENT_ID = re.compile(r"[A-Za-z0-9-]{1,64}")


class BadRequest(ValueError):
    """Input the care tab should never send: answered with HTTP 400."""


def parse_day(value) -> date:
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise BadRequest(f"not a date: {value!r}") from None


def _choice(value, allowed: tuple[str, ...], name: str) -> str | None:
    if value in (None, ""):
        return None
    if value not in allowed:
        raise BadRequest(f"{name} must be one of {', '.join(allowed)}")
    return value


def _choices(values, allowed: tuple[str, ...], name: str) -> tuple[str, ...]:
    if not isinstance(values, list):
        raise BadRequest(f"{name} must be a list")
    return tuple(dict.fromkeys(_choice(v, allowed, name) for v in values if v))


def _text(value, limit: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise BadRequest("text fields must be strings")
    return value.strip()[:limit] or None


def _int(value, low: int, high: int, name: str) -> int | None:
    if value in (None, ""):
        return None
    if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
        raise BadRequest(f"{name} must be an integer from {low} to {high}")
    return value


def patient_id(value: str) -> str:
    if not PATIENT_ID.fullmatch(value):
        raise BadRequest("bad patient id")
    return value


# -- what comes in -----------------------------------------------------------------------------
def sync_patient(store: Store, pid: str, payload: dict) -> date:
    """Profile and check-ins as the app has them. Returns the child's local today."""
    today = parse_day(payload.get("today"))
    child = payload.get("patient") or {}
    checkins = payload.get("checkins") or []
    days = [parse_day(c.get("local_date")) for c in checkins]
    if any(d > today for d in days):
        raise BadRequest("check-in after today")
    nickname = _text(child.get("nickname"), 40)
    birth_year = _int(child.get("birth_year"), 1990, 2100, "birth_year") or today.year - 10
    if not nickname:
        raise BadRequest("nickname is required")
    interests = [i for i in (_text(x, 40) for x in child.get("interests") or []) if i]
    store.upsert_patient(pid, nickname, birth_year, interests, bool(child.get("has_family", True)),
                         min(days, default=today))
    for day, c in zip(days, checkins):
        mood = _int(c.get("mood"), 1, 5, "mood")
        if mood is None:
            raise BadRequest("a check-in needs a mood")
        activities = [a for a in c.get("activities") or [] if isinstance(a, str)]
        activity = next((APP_ACTIVITIES[a] for a in activities if a in APP_ACTIVITIES), None)
        store.put_checkin(pid, day, mood, activity, APP_MEAL_AMOUNTS.get(c.get("meal_amount")),
                          _text(c.get("note"), 280), "treatment" in activities)
    return today


def observation_from_json(data: dict) -> tuple[NurseObservation, list[str] | None]:
    """The nurse's form, checked against the contract's vocabularies."""
    observation = NurseObservation(
        lunch=_choice(data.get("lunch"), INTAKE, "lunch"),
        dinner=_choice(data.get("dinner"), INTAKE, "dinner"),
        affect=_choices(data.get("affect") or [], AFFECTS, "affect"),
        engagement=_choice(data.get("engagement"), ENGAGEMENT, "engagement"),
        pain=_int(data.get("pain"), 0, 10, "pain"),
        night_sleep=_choice(data.get("night_sleep"), NIGHT_SLEEP, "night_sleep"),
        refused_care=bool(data.get("refused_care")),
        asks_psychologist=bool(data.get("asks_psychologist")),
        note=_text(data.get("note"), 280),
    )
    visits = data.get("visits")
    return observation, None if visits is None else list(_choices(visits, VISITOR_KINDS, "visits"))


def menu_from_json(data: dict) -> dict[str, str | None]:
    return {meal: _text(data.get(meal), 80) for meal in WARD_MEALS}


MAX_IMAGE = 8_000_000


def ingest_drawing(store: Store, engine: Engine, pid: str, payload: dict) -> dict:
    """A drawing from the app: colors and content read, stored as a reading (never the image)."""
    day = parse_day(payload.get("local_date"))
    if store.data_version(pid) is None:
        raise BadRequest("unknown patient: sync it first")
    try:
        image = base64.b64decode(payload.get("image") or "", validate=True)
    except (binascii.Error, ValueError):
        raise BadRequest("image must be base64") from None
    if not image or len(image) > MAX_IMAGE:
        raise BadRequest(f"image must be 1 byte to {MAX_IMAGE // 1_000_000} MB")
    title = _text(payload.get("title"), 80)
    try:
        reading = analyze(image, engine.reader(store), title)
    except (UnidentifiedImageError, OSError):
        raise BadRequest("not an image Pillow can read") from None
    shared = Drawing(_int(payload.get("emotion"), 1, 5, "emotion"), (), title) if payload.get("shared") else None
    new = store.add_drawing(pid, day, image_hash(image), reading, shared)
    return {"new": new, "reading": asdict(reading) | {"themes": list(reading.themes), "palette": list(reading.palette),
                                                      "vector": list(reading.vector())}}


def drawings_view(store: Store, pid: str, today: date, days: int = 30) -> dict:
    """The care tab's drawings page: each drawing, the child's usual range, and this week against it.

    The comparisons are the assessor's own drawing features, so the page shows what the model compares.
    """
    loaded = store.load(today, days=days, patient_ids=[pid])
    if not loaded:
        raise BadRequest("unknown patient")
    history = loaded[0].history
    builder = FeatureBuilder(history.profile, history.context)
    for record in history.days:
        builder.append(record)
    t = len(history.days) - 1
    row = dict(zip(FEATURES, builder.row(t)))
    week = [x for r in history.days[-7:] for x in r.drawing_readings]
    earlier = [x for r in history.days[:-7] for x in r.drawing_readings]

    def usual(i: int, scale: float = 1.0) -> dict:
        values = [x.vector()[i] for x in earlier]
        mean = (DRAWING_PRIOR_WEIGHT * DRAWING_PRIOR[i] + sum(values)) / (DRAWING_PRIOR_WEIGHT + len(values))
        sd = float(np.std(values)) if len(values) >= 3 else float(DRAWING_SCALE[i])
        return {"mean": round(float(mean) * scale, 3), "sd": round(max(sd, 0.02) * scale, 3)}

    def number(name: str) -> float | None:
        value = row[name]
        return None if np.isnan(value) else round(float(value), 3)

    return {
        "today": today.isoformat(),
        "drawings": [
            asdict(x) | {"themes": list(x.themes), "palette": list(x.palette), "local_date": r.day.isoformat(),
                         "days_ago": (today - r.day).days}
            for r in reversed(history.days) for x in r.drawing_readings
        ],
        "usual": {"dark_share": usual(2), "colors": usual(3, 12), "from_drawings": len(earlier),
                  "per_week": round(len(earlier) / max(1, len(history.days) - 7) * 7, 1) if len(history.days) > 7 else None},
        "this_week": {
            "count": len(week), "positive": sum(x.affect == "positive" for x in week),
            "negative": sum(x.affect == "negative" or x.sad_faces > 0 for x in week),
            "alone": sum(x.alone for x in week), "change": number("drawing_change_7d"),
            "dark_shift": number("drawing_dark_shift_7d"), "color_shift": number("drawing_color_shift_7d"),
        },
    }


# -- volunteer matching ---------------------------------------------------------------------------
VOLUNTEER_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")


def volunteer_id(value) -> str:
    if not isinstance(value, str) or not VOLUNTEER_ID.fullmatch(value):
        raise BadRequest("bad volunteer id")
    return value


def _objects(value, limit: int, name: str) -> list[dict]:
    if not isinstance(value, list) or len(value) > limit or not all(isinstance(x, dict) for x in value):
        raise BadRequest(f"{name} must be a list of at most {limit} objects")
    return value


def _texts(values, limit: int, name: str, count: int = 20) -> tuple[str, ...]:
    if values is None:
        return ()
    if not isinstance(values, list):
        raise BadRequest(f"{name} must be a list")
    return tuple(t for t in (_text(v, limit) for v in values[:count]) if t)


def volunteers_from_json(items) -> list[Volunteer]:
    """The app's roster: each volunteer's public story, the visits they offer a week and their usual ages."""
    roster = {}
    for v in _objects(items, 100, "volunteers"):
        vid, first_name = volunteer_id(v.get("id")), _text(v.get("first_name"), 40)
        if not first_name:
            raise BadRequest("a volunteer needs a first name")
        ages = v.get("ages", [5, 17])
        low, high = (_int(a, 3, 18, "ages") for a in ages) if isinstance(ages, list) and len(ages) == 2 else (None, None)
        if low is None or high is None or low > high:
            raise BadRequest("ages must be [youngest, oldest]")
        slots = _int(v.get("slots"), 0, 14, "slots")
        roster[vid] = Volunteer(
            vid, first_name, _text(v.get("job"), 80) or "Volunteer", _text(v.get("story"), 600) or "",
            _texts(v.get("passions"), 40, "passions", 8), _text(v.get("dreams"), 200) or "",
            _text(v.get("fun_fact"), 200) or "", _texts(v.get("languages"), 30, "languages", 6),
            1 if slots is None else slots, (low, high),
        )
    return list(roster.values())


def children_from_json(store: Store, items, today: date) -> list[Child]:
    """The children this care team member may see (RLS), with the wellbeing assessment's latest reading."""
    children = {}
    for c in _objects(items, 200, "patients"):
        pid, nickname = patient_id(str(c.get("id", ""))), _text(c.get("nickname"), 40)
        if not nickname:
            raise BadRequest("nickname is required")
        birth_year = _int(c.get("birth_year"), 1990, 2100, "birth_year") or today.year - 10
        interests = _texts(c.get("interests"), 40, "interests")
        has_family = bool(c.get("has_family", True))
        store.upsert_patient(pid, nickname, birth_year, list(interests), has_family, today)
        latest = store.assessments(pid, today - timedelta(days=2), today)
        a = latest[-1] if latest else None
        children[pid] = Child(pid, nickname, max(0, today.year - birth_year), interests, has_family,
                              a["p_stable"] if a else None, a["level"] if a else None)
    return list(children.values())


def requests_from_json(items, children: list[Child], volunteers: list[Volunteer]) -> list[Request]:
    """The app's contact requests. Those about a child or a volunteer outside the plan are left out."""
    known = {c.id for c in children}, {v.id for v in volunteers}
    requests = []
    for r in _objects(items or [], 1000, "requests"):
        status = _choice(r.get("status"), CONTACT_STATUSES, "status")
        if status is None:
            raise BadRequest("a request needs a status")
        if r.get("patient_id") in known[0] and r.get("volunteer_id") in known[1]:
            requests.append(Request(r["patient_id"], r["volunteer_id"], status, parse_day(r.get("local_date"))))
    return requests


def _visits(store: Store) -> list[Visit]:
    return [Visit(r["patient_id"], r["volunteer_id"], date.fromisoformat(r["local_date"]), r["outcome"], r["features"])
            for r in store.volunteer_visits()]


def matching_view(store: Store, engine: Engine, payload: dict, suggestion: dict | None = None,
                  rating: dict | None = None) -> dict:
    """The care team's matching board. A suggestion or a visit rating, when given, is recorded first."""
    today = parse_day(payload.get("today"))
    volunteers = volunteers_from_json(payload.get("volunteers"))
    children = children_from_json(store, payload.get("patients"), today)
    requests = requests_from_json(payload.get("requests"), children, volunteers)
    affinities = engine.affinities(store, children, volunteers)
    by_child, by_volunteer = {c.id: c for c in children}, {v.id: v for v in volunteers}

    def pair(data: dict) -> tuple[Child, Volunteer]:
        pid, vid = patient_id(str(data.get("patient_id", ""))), volunteer_id(data.get("volunteer_id"))
        if pid not in by_child or vid not in by_volunteer:
            raise BadRequest("this child or this volunteer is not in the plan")
        return by_child[pid], by_volunteer[vid]

    if suggestion is not None:
        child, volunteer = pair(suggestion)
        store.put_volunteer_suggestion(child.id, volunteer.id, today, _text(suggestion.get("suggested_by"), 80))
    visits = _visits(store)
    if rating is not None:
        child, volunteer = pair(rating)
        day = parse_day(rating.get("local_date"))
        outcome = _choice(rating.get("outcome"), VISIT_OUTCOMES, "outcome")
        if outcome is None or day > today:
            raise BadRequest("a visit is rated once it happened, as one of " + ", ".join(VISIT_OUTCOMES))
        features = pair_features(child, volunteer, affinities[(child.id, volunteer.id)], visits, day)
        store.put_volunteer_visit(child.id, volunteer.id, day, outcome, features, _text(rating.get("rated_by"), 80))
        visits = _visits(store)
    suggestions = [Suggestion(r["patient_id"], r["volunteer_id"], date.fromisoformat(r["local_date"]))
                   for r in store.volunteer_suggestions(today - WEEK)]
    return plan_week(children, volunteers, affinities, requests, suggestions, visits, today) | {"claude": engine.claude}


# -- the engine: models and Claude, shared by every request ---------------------------------------
@dataclass
class Engine:
    assessor: object
    policy: object
    tree: object | None = None
    client: object | None = None  # anthropic.Anthropic when Claude is available
    language: str = "English"

    def __post_init__(self):
        self.version = f"{self.assessor.version}+{getattr(self.policy, 'version', 'policy')}"
        self._guard = threading.Lock()
        self._locks: dict[str, threading.Lock] = {}
        self._matching = threading.Lock()

    @property
    def claude(self) -> bool:
        return self.client is not None

    def reader(self, store: Store):
        """A Claude reader whose readings are cached in this store, or None without Claude."""
        if self.client is None:
            return None
        from .claude import ClaudeReader, StoreCache

        return ClaudeReader(self.client, cache=StoreCache(store))

    def affinities(self, store: Store, children: list[Child], volunteers: list[Volunteer]) -> dict[tuple[str, str], Affinity]:
        """Every pair's affinity: Claude's reading, cached in the store; new pairs are read with one call per
        child, in parallel; the lexicon stands in without Claude or when a call fails. One computation at a
        time, so two requests never pay for the same reading."""
        if self.client is None:
            return {(c.id, v.id): rule_affinity(c, v) for c in children for v in volunteers}
        from .claude import ClaudeMatcher

        matcher = ClaudeMatcher(self.client, language=self.language)
        with self._matching:
            found, todo = {}, {}
            for c in children:
                for v in volunteers:
                    cached = store.get_reading(matcher.key(c.profile(), v.profile()))
                    if cached is None:
                        todo.setdefault(c.id, []).append(v)
                    else:
                        found[(c.id, v.id)] = Affinity(cached["fit"], tuple(cached["shared"]), cached["reason"],
                                                       cached["starter"], "claude")
            by_id = {c.id: c for c in children}
            with ThreadPoolExecutor(max_workers=4) as pool:  # threads never touch the store
                answers = dict(zip(todo, pool.map(
                    lambda cid: matcher.read(by_id[cid].profile(), [v.profile() for v in todo[cid]]), todo)))
            for cid, missing in todo.items():
                for v in missing:
                    reading = (answers[cid] or {}).get(v.id)
                    if reading is None:
                        found[(cid, v.id)] = rule_affinity(by_id[cid], v)
                        continue
                    store.put_reading(matcher.key(by_id[cid].profile(), v.profile()), reading)
                    found[(cid, v.id)] = Affinity(reading["fit"], tuple(reading["shared"]), reading["reason"],
                                                  reading["starter"], "claude")
            return found

    def refresh(self, store: Store, pid: str, today: date, force: bool = False) -> bool:
        """Re-run the daily job for one child if its inputs (or the models) changed since the last run.

        One refresh per child at a time: a second request waits, then finds the fresh assessment.
        """
        with self._guard:
            lock = self._locks.setdefault(pid, threading.Lock())
        with lock:
            latest = store.assessments(pid, today, today)
            current = store.data_version(pid)
            if current is None:
                raise BadRequest("unknown patient")
            if not force and latest and latest[-1]["data_version"] >= current and latest[-1]["model_version"] == self.version:
                return False
            reader, summarizer = self.reader(store), None
            if reader is not None:
                from .claude import ClaudeSummarizer

                summarizer = ClaudeSummarizer(self.client, language=self.language)
                days = store.load(today, patient_ids=[pid])[0].history.days
                reader.warm([(r.note, "child") for r in days if r.note]
                            + [(d.title, "child") for r in days for d in r.shared_drawings if d.title]
                            + [(r.nurse.note, "nurse") for r in days[-1:] if r.nurse and r.nurse.note])
            run_daily(store, self.assessor, self.policy, today, reader, summarizer, self.tree, patient_ids=[pid])
            return True


# -- what goes out -------------------------------------------------------------------------------------
def _assessment(row: dict) -> dict:
    return {
        "for_date": row["for_date"], "level": row["level"],
        "p": {"stable": round(row["p_stable"], 3), "fragile": round(row["p_fragile"], 3),
              "distress": round(row["p_distress"], 3)},
        "summary": row["summary"], "summary_source": row["summary_source"], "action": row["policy_action"],
        "urgency": row["urgency"], "signals": [{"text": f["text"], "weight": f["weight"]} for f in row["factors"]],
        "data_days": row["data_days"], "computed_at": row["created_at"], "model_version": row["model_version"],
        "trajectory": row["trajectory"],
    }


def _alert(row: dict) -> dict:
    return {
        "id": row["id"], "for_date": row["for_date"], "source": row["source"], "priority": row["priority"],
        "reason": row["reason"], "detected_by": row["evidence"].get("detected_by"),
        "outcome": row["outcome"], "reviewed_by": row["reviewed_by"], "reviewed_at": row["reviewed_at"],
    }


def report(store: Store, pid: str, today: date, engine: Engine, days: int = 14) -> dict:
    """Everything the patient page of the care tab shows."""
    start = today - timedelta(days=days - 1)
    history = store.assessments(pid, start, today)
    latest = history[-1] if history and history[-1]["for_date"] == today.isoformat() else None
    seen = store.observation(pid, today)
    return {
        "patient_id": pid, "today": today.isoformat(), "claude": engine.claude,
        "assessment": _assessment(latest) if latest else None,
        "history": [{"for_date": a["for_date"], "level": a["level"], "p_distress": round(a["p_distress"], 3),
                     "action": a["policy_action"]} for a in history],
        "alerts": [_alert(a) for a in store.patient_alerts(pid, start, today)],
        "observation": None if seen is None else asdict(seen["observation"]) | {
            "affect": list(seen["observation"].affect), "visits": seen["visits"], "observed_by": seen["observed_by"],
            "updated_at": seen["updated_at"]},
        "menu": store.menu(today),
        "drawings": [{k: v for k, v in d.items() if k != "read_by_claude"}
                     for d in store.drawing_readings(pid, start, today)][:12],
    }


def overview_row(store: Store, pid: str, today: date) -> dict:
    """One line of the patients table."""
    latest = store.assessments(pid, today, today)
    a = latest[-1] if latest else None
    open_alerts = [x for x in store.patient_alerts(pid, today - timedelta(days=6), today) if x["outcome"] is None]
    return {
        "patient_id": pid, "level": a["level"] if a else None, "p_distress": round(a["p_distress"], 3) if a else None,
        "action": a["policy_action"] if a else None, "summary": a["summary"] if a else None,
        "open_alerts": len(open_alerts),
        "top_priority": min((x["priority"] for x in open_alerts), key=["urgent", "priority", "digest"].index, default=None),
        "nurse_seen_today": store.observation(pid, today) is not None,
    }


def open_store(path: str | Path) -> Store:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    return Store(path)
