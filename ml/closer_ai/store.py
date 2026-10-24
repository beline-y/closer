"""Local SQLite store for the AI module, standard library only.

One file holds the signals the AI may read, the care context, the nurse's daily round
and the ward's menu, and what the AI writes back (assessments, alerts and the
psychologist's review of each alert). It mirrors the data contract in contract.py.
Comfort cards, question answers and photos are never stored; drawings keep their details
only when the child shared them with the care team.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .contract import (
    ACTIVITIES, AFFECTS, CONTEXT_KINDS, DRAWING_THEMES, ENGAGEMENT, FEELINGS, INTAKE, INTAKE_SCORE, MEALS,
    MEDIA_COMPANY, MEDIA_KINDS, NIGHT_SLEEP, VISITOR_KINDS, WARD_MEALS, WORRY_TOPICS, ChildHistory, ChildProfile,
    ContextEvent, DayRecord, Drawing, MediaLog, NurseObservation, WardMeal,
)
from .policy.obs import AlertState


def _values(options: tuple[str, ...]) -> str:
    return ", ".join(f"'{o}'" for o in options)


SCHEMA_VERSION = 2
ACTION_RANK = {"wait": 0, "ask": 1, "digest": 2, "priority": 3}
_RANK_SQL = "CASE {} WHEN 'wait' THEN 0 WHEN 'ask' THEN 1 WHEN 'digest' THEN 2 ELSE 3 END"

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 40),
    birth_year INTEGER NOT NULL CHECK (birth_year BETWEEN 1990 AND 2100),
    interests TEXT NOT NULL DEFAULT '[]',  -- JSON list of free-text interests
    has_family INTEGER NOT NULL DEFAULT 1 CHECK (has_family IN (0, 1)),
    admitted_on TEXT NOT NULL,
    discharged_on TEXT,
    data_version INTEGER NOT NULL DEFAULT 0  -- bumped on every new input, so a stale assessment is easy to spot
);
-- One check-in a day: the mood is required, every extra is optional.
CREATE TABLE IF NOT EXISTS checkins (
    patient_id TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    local_date TEXT NOT NULL,
    mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
    feelings TEXT NOT NULL DEFAULT '[]',  -- JSON list among: {", ".join(FEELINGS)}
    activity TEXT CHECK (activity IN ({_values(ACTIVITIES)})),
    meal TEXT CHECK (meal IN ({_values(MEALS)})),
    sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
    nightmares INTEGER CHECK (nightmares IN (0, 1)),
    pain INTEGER CHECK (pain BETWEEN 0 AND 10),
    worry INTEGER CHECK (worry BETWEEN 0 AND 4),
    worry_topics TEXT NOT NULL DEFAULT '[]',  -- JSON list among: {", ".join(WORRY_TOPICS)}
    wants_to_talk INTEGER NOT NULL DEFAULT 0 CHECK (wants_to_talk IN (0, 1)),
    note TEXT CHECK (length(note) <= 280),
    PRIMARY KEY (patient_id, local_date)
);
-- Content-free daily aggregates sent by the app.
CREATE TABLE IF NOT EXISTS daily_activity (
    patient_id TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    local_date TEXT NOT NULL,
    minutes_in_app REAL NOT NULL DEFAULT 0 CHECK (minutes_in_app >= 0),
    night_minutes REAL NOT NULL DEFAULT 0 CHECK (night_minutes >= 0),
    nudges_sent INTEGER NOT NULL DEFAULT 0 CHECK (nudges_sent >= 0),
    nudge_replies INTEGER NOT NULL DEFAULT 0 CHECK (nudge_replies >= 0),
    cards_opened INTEGER NOT NULL DEFAULT 0 CHECK (cards_opened >= 0),
    question_answered INTEGER NOT NULL DEFAULT 0 CHECK (question_answered IN (0, 1)),
    family_contacts INTEGER NOT NULL DEFAULT 0 CHECK (family_contacts >= 0),
    friend_contacts INTEGER NOT NULL DEFAULT 0 CHECK (friend_contacts >= 0),
    PRIMARY KEY (patient_id, local_date)
);
CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    local_date TEXT NOT NULL,
    visitor_kind TEXT NOT NULL CHECK (visitor_kind IN ({_values(VISITOR_KINDS)}))
);
-- Unshared drawings are only counted: their row carries no emotion, theme or title.
CREATE TABLE IF NOT EXISTS drawings (
    id INTEGER PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    local_date TEXT NOT NULL,
    shared_with_care_team INTEGER NOT NULL DEFAULT 0 CHECK (shared_with_care_team IN (0, 1)),
    emotion INTEGER CHECK (emotion BETWEEN 1 AND 5),
    themes TEXT NOT NULL DEFAULT '[]',  -- JSON list among: {", ".join(DRAWING_THEMES)}
    title TEXT CHECK (length(title) <= 80),
    CHECK (shared_with_care_team = 1 OR (emotion IS NULL AND title IS NULL AND themes = '[]'))
);
-- Films, series, cartoons, music, games, books, podcasts.
CREATE TABLE IF NOT EXISTS media_logs (
    id INTEGER PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    local_date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ({_values(MEDIA_KINDS)})),
    title TEXT CHECK (length(title) <= 80),
    minutes INTEGER CHECK (minutes BETWEEN 0 AND 600),
    with_whom TEXT CHECK (with_whom IN ({_values(MEDIA_COMPANY)})),
    reaction INTEGER CHECK (reaction BETWEEN 1 AND 5),
    is_rewatch INTEGER NOT NULL DEFAULT 0 CHECK (is_rewatch IN (0, 1))
);
-- Coarse, non-medical context entered by the care team. Never a diagnosis.
CREATE TABLE IF NOT EXISTS care_context_events (
    id INTEGER PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ({_values(CONTEXT_KINDS)})),
    starts_on TEXT NOT NULL,
    ends_on TEXT,
    known_on TEXT NOT NULL,
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
-- What the nurse saw on the daily round. One row per child and day: editing it replaces it.
CREATE TABLE IF NOT EXISTS nurse_observations (
    patient_id TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    local_date TEXT NOT NULL,
    lunch TEXT CHECK (lunch IN ({_values(INTAKE)})),
    dinner TEXT CHECK (dinner IN ({_values(INTAKE)})),
    affect TEXT NOT NULL DEFAULT '[]',  -- JSON list among: {", ".join(AFFECTS)}
    engagement TEXT CHECK (engagement IN ({_values(ENGAGEMENT)})),
    pain INTEGER CHECK (pain BETWEEN 0 AND 10),
    night_sleep TEXT CHECK (night_sleep IN ({_values(NIGHT_SLEEP)})),
    refused_care INTEGER NOT NULL DEFAULT 0 CHECK (refused_care IN (0, 1)),
    asks_psychologist INTEGER NOT NULL DEFAULT 0 CHECK (asks_psychologist IN (0, 1)),
    note TEXT CHECK (length(note) <= 280),
    observed_by TEXT CHECK (length(observed_by) <= 80),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (patient_id, local_date)
);
-- The ward's menu, entered once a day by the care team.
CREATE TABLE IF NOT EXISTS ward_menus (
    local_date TEXT NOT NULL,
    meal TEXT NOT NULL CHECK (meal IN ({_values(WARD_MEALS)})),
    dish TEXT NOT NULL CHECK (length(dish) BETWEEN 1 AND 80),
    PRIMARY KEY (local_date, meal)
);
-- Short validated scales chosen by the psychologist.
CREATE TABLE IF NOT EXISTS screenings (
    id INTEGER PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    local_date TEXT NOT NULL,
    instrument TEXT NOT NULL,
    score REAL NOT NULL,
    score_max REAL NOT NULL CHECK (score_max > 0),
    CHECK (score BETWEEN 0 AND score_max)
);
CREATE TABLE IF NOT EXISTS ai_assessments (
    id INTEGER PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    for_date TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('stable', 'fragile', 'distress')),
    p_stable REAL NOT NULL CHECK (p_stable BETWEEN 0 AND 1),
    p_fragile REAL NOT NULL CHECK (p_fragile BETWEEN 0 AND 1),
    p_distress REAL NOT NULL CHECK (p_distress BETWEEN 0 AND 1),
    factors TEXT NOT NULL DEFAULT '[]',
    data_days INTEGER NOT NULL,
    policy_action TEXT NOT NULL CHECK (policy_action IN ('wait', 'digest', 'priority', 'ask')),
    urgency REAL,
    summary TEXT CHECK (length(summary) <= 2000),  -- the daily note the psychologist reads
    summary_source TEXT NOT NULL DEFAULT 'template' CHECK (summary_source IN ('claude', 'template')),
    trajectory TEXT NOT NULL DEFAULT '[]',  -- JSON: the reading of each of the last 14 days, as of this run
    data_version INTEGER NOT NULL DEFAULT 0,  -- patients.data_version the assessment was computed from
    model_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (patient_id, for_date, model_version)
);
-- The psychologist's review turns every alert into a label for the next training round.
CREATE TABLE IF NOT EXISTS ai_alerts (
    id INTEGER PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    for_date TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('safety_rule', 'child_request', 'nurse_request', 'policy', 'psy_manual')),
    priority TEXT NOT NULL CHECK (priority IN ('digest', 'priority', 'urgent')),
    reason TEXT NOT NULL CHECK (length(reason) <= 300),
    evidence TEXT NOT NULL DEFAULT '{{}}',
    model_version TEXT,
    created_at TEXT NOT NULL,
    reviewed_by TEXT,
    reviewed_at TEXT,
    outcome TEXT CHECK (outcome IN ('support_needed', 'not_needed', 'already_followed')),
    review_note TEXT CHECK (length(review_note) <= 500),
    UNIQUE (patient_id, for_date, source)
);
-- Claude's structured reading of a note or drawing, keyed by a hash of model and content.
CREATE TABLE IF NOT EXISTS ai_readings (
    key TEXT PRIMARY KEY,
    reading TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS visits_patient_date ON visits (patient_id, local_date);
CREATE INDEX IF NOT EXISTS drawings_patient_date ON drawings (patient_id, local_date);
CREATE INDEX IF NOT EXISTS media_patient_date ON media_logs (patient_id, local_date);
CREATE INDEX IF NOT EXISTS screenings_patient_date ON screenings (patient_id, local_date);
CREATE INDEX IF NOT EXISTS context_patient ON care_context_events (patient_id, starts_on);
CREATE INDEX IF NOT EXISTS alerts_patient_date ON ai_alerts (patient_id, for_date);
CREATE INDEX IF NOT EXISTS nurse_date ON nurse_observations (local_date);
"""


@dataclass
class PatientData:
    """Everything the daily job needs for one child: signals, context and alert history."""

    history: ChildHistory
    state: AlertState
    nickname: str
    window_start: date
    decided_today: str | None = None  # today's policy action if a run already took one: decisions only escalate
    data_version: int = 0


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: str | Path = ":memory:"):
        self.db = sqlite3.connect(str(path), timeout=10)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys = ON")
        version = self.db.execute("PRAGMA user_version").fetchone()[0]
        has_tables = self.db.execute("SELECT 1 FROM sqlite_master WHERE name = 'patients'").fetchone()
        if has_tables and version < SCHEMA_VERSION:
            raise RuntimeError(f"{path} was created by an older version of closer_ai: delete it and seed again")
        if str(path) != ":memory:":
            self.db.execute("PRAGMA journal_mode = WAL")  # the daily job and the care-tab service share the file
        self.db.executescript(SCHEMA)
        if version != SCHEMA_VERSION:
            self.db.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

    def close(self) -> None:
        self.db.close()

    # -- writes from the app (or the simulator) ----------------------------------
    def add_patient(self, profile: ChildProfile, nickname: str, birth_year: int) -> None:
        with self.db:
            self.db.execute(
                "INSERT INTO patients (id, nickname, birth_year, interests, has_family, admitted_on) VALUES (?, ?, ?, ?, ?, ?)",
                (profile.patient_id, nickname, birth_year, json.dumps(list(profile.interests)), int(profile.has_family),
                 (profile.admitted_on or date.today()).isoformat()),
            )

    def add_context(self, patient_id: str, events: list[ContextEvent]) -> None:
        with self.db:
            self.db.executemany(
                "INSERT INTO care_context_events (patient_id, kind, starts_on, ends_on, known_on) VALUES (?, ?, ?, ?, ?)",
                [(patient_id, e.kind, e.starts_on.isoformat(), e.ends_on.isoformat() if e.ends_on else None,
                  (e.known_on or e.starts_on).isoformat()) for e in events],
            )

    def add_day(self, patient_id: str, r: DayRecord) -> None:
        d = r.day.isoformat()
        with self.db:
            if r.mood is not None:
                self.db.execute(
                    "INSERT INTO checkins VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (patient_id, d, r.mood, json.dumps(list(r.feelings)), r.activity, r.meal, r.sleep_quality,
                     None if r.nightmares is None else int(r.nightmares), r.pain, r.worry,
                     json.dumps(list(r.worry_topics)), int(r.wants_to_talk), r.note),
                )
            if r.engagement_known:
                self.db.execute(
                    "INSERT INTO daily_activity VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (patient_id, d, r.minutes_in_app, r.night_minutes, r.nudges_sent, r.nudge_replies, r.cards_opened,
                     int(r.question_answered), r.family_contacts, r.friend_contacts),
                )
            if r.nurse is not None:
                self._write_observation(patient_id, r.day, r.nurse, None)
            self.db.executemany("INSERT OR IGNORE INTO ward_menus VALUES (?, ?, ?)",
                                [(d, m.meal, m.dish) for m in r.ward_meals if m.dish])
            self.db.executemany("INSERT INTO visits (patient_id, local_date, visitor_kind) VALUES (?, ?, ?)",
                                [(patient_id, d, v) for v in r.visits])
            shared = [(patient_id, d, 1, s.emotion, json.dumps(list(s.themes)), s.title) for s in r.shared_drawings]
            private = [(patient_id, d, 0, None, "[]", None)] * max(0, r.drawings - len(r.shared_drawings))
            self.db.executemany(
                "INSERT INTO drawings (patient_id, local_date, shared_with_care_team, emotion, themes, title) VALUES (?, ?, ?, ?, ?, ?)",
                shared + private,
            )
            self.db.executemany(
                "INSERT INTO media_logs (patient_id, local_date, kind, minutes, with_whom, reaction, is_rewatch) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [(patient_id, d, m.kind, m.minutes, m.with_whom, m.reaction, int(m.is_rewatch)) for m in r.media],
            )
            if r.screening is not None:
                self.db.execute(
                    "INSERT INTO screenings (patient_id, local_date, instrument, score, score_max) VALUES (?, ?, ?, ?, ?)",
                    (patient_id, d, "normalized", r.screening, 1.0),
                )

    def _write_observation(self, patient_id: str, day: date, n: NurseObservation, observed_by: str | None) -> None:
        self.db.execute(
            "INSERT OR REPLACE INTO nurse_observations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (patient_id, day.isoformat(), n.lunch, n.dinner, json.dumps(list(n.affect)), n.engagement, n.pain,
             n.night_sleep, int(n.refused_care), int(n.asks_psychologist), n.note, observed_by, _now()),
        )

    # -- writes from the care tab and the app bridge ----------------------------------
    def bump(self, patient_id: str | None = None) -> None:
        """New input for one child (or the whole ward): their assessment is now stale."""
        where, args = ("WHERE id = ?", (patient_id,)) if patient_id else ("WHERE discharged_on IS NULL", ())
        self.db.execute(f"UPDATE patients SET data_version = data_version + 1 {where}", args)

    def upsert_patient(self, patient_id: str, nickname: str, birth_year: int, interests: list[str], has_family: bool,
                       admitted_on: date) -> None:
        """Create or update a child from the app. The admission date only ever moves earlier."""
        with self.db:
            row = self.db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
            values = (nickname, birth_year, json.dumps(interests), int(has_family))
            if row is None:
                self.db.execute(
                    "INSERT INTO patients (id, nickname, birth_year, interests, has_family, admitted_on) VALUES (?, ?, ?, ?, ?, ?)",
                    (patient_id,) + values + (admitted_on.isoformat(),),
                )
            elif (row["nickname"], row["birth_year"], row["interests"], row["has_family"]) != values \
                    or admitted_on.isoformat() < row["admitted_on"]:
                self.db.execute(
                    "UPDATE patients SET nickname = ?, birth_year = ?, interests = ?, has_family = ?, admitted_on = min(admitted_on, ?) WHERE id = ?",
                    values + (admitted_on.isoformat(), patient_id),
                )
                self.bump(patient_id)

    def put_checkin(self, patient_id: str, day: date, mood: int, activity: str | None, meal: str | None,
                    note: str | None, big_day: bool) -> bool:
        """Today's check-in as the app has it (the child may edit it until midnight). True if anything changed."""
        d = day.isoformat()
        with self.db:
            old = self.db.execute("SELECT mood, activity, meal, note FROM checkins WHERE patient_id = ? AND local_date = ?",
                                  (patient_id, d)).fetchone()
            changed = old is None or tuple(old) != (mood, activity, meal, note)
            if changed:
                self.db.execute(
                    """INSERT INTO checkins (patient_id, local_date, mood, activity, meal, note) VALUES (?, ?, ?, ?, ?, ?)
                       ON CONFLICT (patient_id, local_date) DO UPDATE SET
                           mood = excluded.mood, activity = excluded.activity, meal = excluded.meal, note = excluded.note""",
                    (patient_id, d, mood, activity, meal, note),
                )
            # "Exam or treatment" in the check-in: a big day the care team may not have entered.
            if big_day and not self.db.execute(
                "SELECT 1 FROM care_context_events WHERE patient_id = ? AND kind = 'big_day' AND starts_on = ?",
                (patient_id, d),
            ).fetchone():
                self.db.execute("INSERT INTO care_context_events (patient_id, kind, starts_on, known_on) VALUES (?, 'big_day', ?, ?)",
                                (patient_id, d, d))
                changed = True
            if changed:
                self.bump(patient_id)
        return changed

    def put_observation(self, patient_id: str, day: date, observation: NurseObservation,
                        visits: list[str] | None, observed_by: str | None) -> None:
        """The nurse's round for one child and day, and the visitors they saw (replaces that day's visits)."""
        with self.db:
            self._write_observation(patient_id, day, observation, observed_by)
            if visits is not None:
                self.db.execute("DELETE FROM visits WHERE patient_id = ? AND local_date = ?", (patient_id, day.isoformat()))
                self.db.executemany("INSERT INTO visits (patient_id, local_date, visitor_kind) VALUES (?, ?, ?)",
                                    [(patient_id, day.isoformat(), v) for v in visits])
            self.bump(patient_id)

    def put_menu(self, day: date, dishes: dict[str, str | None]) -> None:
        """Today's ward menu. It changes every child's baseline, so the whole ward is stale."""
        with self.db:
            for meal in WARD_MEALS:
                dish = (dishes.get(meal) or "").strip()
                if dish:
                    self.db.execute("INSERT OR REPLACE INTO ward_menus VALUES (?, ?, ?)", (day.isoformat(), meal, dish))
                else:
                    self.db.execute("DELETE FROM ward_menus WHERE local_date = ? AND meal = ?", (day.isoformat(), meal))
            self.bump()

    # -- reads for the care tab ----------------------------------------------------------
    def menu(self, day: date) -> dict[str, str | None]:
        rows = {r["meal"]: r["dish"] for r in self.db.execute("SELECT * FROM ward_menus WHERE local_date = ?", (day.isoformat(),))}
        return {meal: rows.get(meal) for meal in WARD_MEALS}

    def observation(self, patient_id: str, day: date) -> dict | None:
        row = self.db.execute("SELECT * FROM nurse_observations WHERE patient_id = ? AND local_date = ?",
                              (patient_id, day.isoformat())).fetchone()
        if row is None:
            return None
        visits = [r[0] for r in self.db.execute("SELECT visitor_kind FROM visits WHERE patient_id = ? AND local_date = ? ORDER BY id",
                                                (patient_id, day.isoformat()))]
        return {"observation": _observation(row), "visits": visits, "observed_by": row["observed_by"],
                "updated_at": row["updated_at"]}

    def data_version(self, patient_id: str) -> int | None:
        row = self.db.execute("SELECT data_version FROM patients WHERE id = ?", (patient_id,)).fetchone()
        return None if row is None else row[0]

    def assessments(self, patient_id: str, start: date, end: date) -> list[dict]:
        """One assessment per day (the latest computed), oldest first."""
        rows = self.db.execute(
            """SELECT * FROM ai_assessments a WHERE patient_id = ? AND for_date BETWEEN ? AND ?
               AND created_at = (SELECT max(created_at) FROM ai_assessments b WHERE b.patient_id = a.patient_id AND b.for_date = a.for_date)
               GROUP BY for_date ORDER BY for_date""",
            (patient_id, start.isoformat(), end.isoformat()),
        )
        return [dict(r) | {"factors": json.loads(r["factors"]), "trajectory": json.loads(r["trajectory"])} for r in rows]

    def patient_alerts(self, patient_id: str, start: date, end: date) -> list[dict]:
        rows = self.db.execute("SELECT * FROM ai_alerts WHERE patient_id = ? AND for_date BETWEEN ? AND ? ORDER BY for_date DESC, id DESC",
                               (patient_id, start.isoformat(), end.isoformat()))
        return [dict(r) | {"evidence": json.loads(r["evidence"])} for r in rows]

    # -- reads for the daily job ---------------------------------------------------
    def load(self, today: date, days: int = 30, patient_ids: list[str] | None = None) -> list[PatientData]:
        """Every hospitalized minor, with the last `days` days of signals up to `today`."""
        rows = self.db.execute(
            "SELECT * FROM patients WHERE discharged_on IS NULL AND admitted_on <= ? AND ? - birth_year < 18",
            (today.isoformat(), today.year),
        ).fetchall()
        return [self._load_one(p, today, days) for p in rows if patient_ids is None or p["id"] in patient_ids]

    def _rows(self, table: str, pid: str, start: date, today: date, column: str = "local_date") -> list[sqlite3.Row]:
        return self.db.execute(
            f"SELECT * FROM {table} WHERE patient_id = ? AND {column} BETWEEN ? AND ? ORDER BY {column}",
            (pid, start.isoformat(), today.isoformat()),
        ).fetchall()

    def _load_one(self, p: sqlite3.Row, today: date, days: int) -> PatientData:
        pid = p["id"]
        admitted = date.fromisoformat(p["admitted_on"])
        start = max(admitted, today - timedelta(days=days - 1))
        record = {start + timedelta(days=k): DayRecord(day=start + timedelta(days=k))
                  for k in range((today - start).days + 1)}

        def day(row: sqlite3.Row, column: str = "local_date") -> DayRecord:
            return record[date.fromisoformat(row[column])]

        for row in self._rows("checkins", pid, start, today):
            r = day(row)
            r.mood, r.activity, r.meal, r.note = row["mood"], row["activity"], row["meal"], row["note"]
            r.feelings, r.worry_topics = tuple(json.loads(row["feelings"])), tuple(json.loads(row["worry_topics"]))
            r.sleep_quality, r.pain, r.worry = row["sleep_quality"], row["pain"], row["worry"]
            r.nightmares = None if row["nightmares"] is None else bool(row["nightmares"])
            r.wants_to_talk = bool(row["wants_to_talk"])
        for row in self._rows("daily_activity", pid, start, today):
            r = day(row)
            r.minutes_in_app, r.night_minutes = row["minutes_in_app"], row["night_minutes"]
            r.nudges_sent, r.nudge_replies, r.cards_opened = row["nudges_sent"], row["nudge_replies"], row["cards_opened"]
            r.question_answered = bool(row["question_answered"])
            r.family_contacts, r.friend_contacts = row["family_contacts"], row["friend_contacts"]
        for row in self._rows("visits", pid, start, today):
            day(row).visits += (row["visitor_kind"],)
        for row in self._rows("drawings", pid, start, today):
            r = day(row)
            r.drawings += 1
            if row["shared_with_care_team"]:
                r.shared_drawings += (Drawing(row["emotion"], tuple(json.loads(row["themes"])), row["title"]),)
        for row in self._rows("media_logs", pid, start, today):
            day(row).media += (MediaLog(row["kind"], row["minutes"], row["with_whom"], row["reaction"],
                                        bool(row["is_rewatch"])),)
        for row in self._rows("screenings", pid, start, today):
            day(row).screening = row["score"] / row["score_max"]
        tracked = {r["local_date"] for r in self._rows("daily_activity", pid, start, today)}
        for d, r in record.items():
            r.engagement_known = d.isoformat() in tracked
        for row in self._rows("nurse_observations", pid, start, today):
            day(row).nurse = _observation(row)
        self._attach_menus(pid, record, start, today)

        context = [
            ContextEvent(e["kind"], date.fromisoformat(e["starts_on"]),
                         date.fromisoformat(e["ends_on"]) if e["ends_on"] else None, date.fromisoformat(e["known_on"]))
            for e in self.db.execute(
                "SELECT * FROM care_context_events WHERE patient_id = ? AND known_on <= ?", (pid, today.isoformat()),
            )
        ]
        state = AlertState()
        index = {d: k for k, d in enumerate(sorted(record))}
        for a in self._rows("ai_alerts", pid, start, today, "for_date"):
            k = index[date.fromisoformat(a["for_date"])]
            # Today's shield alerts are raised again by this run and today's decision is in decided_today, so the
            # policy sees exactly what it saw in training: the day before it acts.
            if a["for_date"] != today.isoformat() or a["source"] == "psy_manual":
                state.alerts.append((k, a["source"], a["priority"]))
            if a["source"] == "psy_manual":
                state.psy_contacts.append(k)
            elif a["outcome"] in ("support_needed", "already_followed") and a["reviewed_at"]:
                reviewed = date.fromisoformat(a["reviewed_at"][:10])
                state.psy_contacts.append(index.get(reviewed, k))
        decided_today = None
        for a in self._rows("ai_assessments", pid, start, today, "for_date"):
            if a["for_date"] == today.isoformat():
                if decided_today is None or ACTION_RANK[a["policy_action"]] > ACTION_RANK[decided_today]:
                    decided_today = a["policy_action"]
            elif a["policy_action"] == "ask":
                state.asks.append(index[date.fromisoformat(a["for_date"])])
        for k, d in enumerate(sorted(record)):
            if record[d].screening is not None:
                state.screenings.append((k, record[d].screening))
        profile = ChildProfile(pid, today.year - p["birth_year"], tuple(json.loads(p["interests"])),
                               bool(p["has_family"]), admitted)
        history = ChildHistory(profile, [record[d] for d in sorted(record)], context)
        return PatientData(history, state, p["nickname"], start, decided_today, p["data_version"])

    def _attach_menus(self, pid: str, record: dict[date, DayRecord], start: date, today: date) -> None:
        """Menu and leave-one-out ward intake: how much the *other* observed children ate of each dish."""
        span = (start.isoformat(), today.isoformat())
        dishes = {(r["local_date"], r["meal"]): r["dish"] for r in self.db.execute(
            "SELECT * FROM ward_menus WHERE local_date BETWEEN ? AND ?", span)}
        eaten: dict[tuple[str, str], list[float]] = {}
        for r in self.db.execute(
            "SELECT local_date, lunch, dinner FROM nurse_observations WHERE local_date BETWEEN ? AND ? AND patient_id != ?",
            span + (pid,),
        ):
            for meal in WARD_MEALS:
                if r[meal] in INTAKE_SCORE:
                    eaten.setdefault((r["local_date"], meal), []).append(INTAKE_SCORE[r[meal]])
        for d, r in record.items():
            key = d.isoformat()
            r.ward_meals = tuple(
                WardMeal(meal, dishes.get((key, meal)),
                         sum(eaten[key, meal]) / len(eaten[key, meal]) if (key, meal) in eaten else None)
                for meal in WARD_MEALS if (key, meal) in dishes or (key, meal) in eaten
            )

    # -- what the AI writes back ---------------------------------------------------
    def save_assessment(self, row: dict) -> int:
        with self.db:
            self.db.execute(
                f"""INSERT INTO ai_assessments (patient_id, for_date, level, p_stable, p_fragile, p_distress, factors,
                       data_days, policy_action, urgency, summary, summary_source, trajectory, data_version, model_version, created_at)
                   VALUES (:patient_id, :for_date, :level, :p_stable, :p_fragile, :p_distress, :factors, :data_days,
                       :policy_action, :urgency, :summary, :summary_source, :trajectory, :data_version, :model_version,
                       :created_at)
                   ON CONFLICT (patient_id, for_date, model_version) DO UPDATE SET
                       level = excluded.level, p_stable = excluded.p_stable, p_fragile = excluded.p_fragile,
                       p_distress = excluded.p_distress, factors = excluded.factors, data_days = excluded.data_days,
                       policy_action = CASE WHEN {_RANK_SQL.format("excluded.policy_action")} >= {_RANK_SQL.format("policy_action")}
                           THEN excluded.policy_action ELSE policy_action END,
                       urgency = excluded.urgency, summary = excluded.summary, summary_source = excluded.summary_source,
                       trajectory = excluded.trajectory,
                       data_version = excluded.data_version, created_at = excluded.created_at""",
                {"summary": None, "summary_source": "template", "data_version": 0} | row
                | {"factors": json.dumps(row["factors"]), "trajectory": json.dumps(row.get("trajectory", [])),
                   "created_at": _now()},
            )
            return self.db.execute(
                "SELECT id FROM ai_assessments WHERE patient_id = ? AND for_date = ? AND model_version = ?",
                (row["patient_id"], row["for_date"], row["model_version"]),
            ).fetchone()[0]

    def save_alert(self, row: dict) -> bool:
        """One alert per child, day and source. Re-running the job the same day changes nothing, except that an
        alert can be raised to a higher priority (a concern that became a crisis); it is never lowered."""
        rank = "CASE {} WHEN 'digest' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END"
        with self.db:
            cursor = self.db.execute(
                f"""INSERT INTO ai_alerts (patient_id, for_date, source, priority, reason, evidence, model_version,
                       created_at)
                   VALUES (:patient_id, :for_date, :source, :priority, :reason, :evidence, :model_version, :created_at)
                   ON CONFLICT (patient_id, for_date, source) DO UPDATE SET
                       priority = excluded.priority, reason = excluded.reason, evidence = excluded.evidence
                   WHERE {rank.format("excluded.priority")} > {rank.format("priority")}""",
                row | {"evidence": json.dumps(row.get("evidence", {})), "created_at": _now(),
                       "model_version": row.get("model_version")},
            )
            return cursor.rowcount == 1

    def review_alert(self, alert_id: int, outcome: str, reviewer: str, note: str | None = None) -> None:
        with self.db:
            self.db.execute(
                "UPDATE ai_alerts SET outcome = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?",
                (outcome, reviewer, _now(), note, alert_id),
            )

    def add_manual_alert(self, patient_id: str, for_date: date, reason: str, reviewer: str) -> None:
        """A child the psychologist found herself: the label that tells the model what it missed."""
        self.save_alert({"patient_id": patient_id, "for_date": for_date.isoformat(), "source": "psy_manual",
                         "priority": "priority", "reason": reason, "evidence": {"reported_by": reviewer}})

    def alerts(self, for_date: date | None = None) -> list[dict]:
        query, args = "SELECT a.*, p.nickname FROM ai_alerts a JOIN patients p ON p.id = a.patient_id", ()
        if for_date:
            query, args = query + " WHERE for_date = ?", (for_date.isoformat(),)
        order = " ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END, id"
        return [dict(r) | {"evidence": json.loads(r["evidence"])} for r in self.db.execute(query + order, args)]

    def get_reading(self, key: str) -> dict | None:
        row = self.db.execute("SELECT reading FROM ai_readings WHERE key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def put_reading(self, key: str, reading: dict) -> None:
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO ai_readings VALUES (?, ?, ?)", (key, json.dumps(reading), _now()))

    def labels(self) -> list[dict]:
        """Reviewed alerts and manual reports: the supervision signal for retraining and offline RL."""
        return [dict(r) for r in self.db.execute(
            "SELECT patient_id, for_date, source, priority, outcome FROM ai_alerts WHERE outcome IS NOT NULL OR source = 'psy_manual'"
        )]


def _observation(row: sqlite3.Row) -> NurseObservation:
    return NurseObservation(
        lunch=row["lunch"], dinner=row["dinner"], affect=tuple(json.loads(row["affect"])), engagement=row["engagement"],
        pain=row["pain"], night_sleep=row["night_sleep"], refused_care=bool(row["refused_care"]),
        asks_psychologist=bool(row["asks_psychologist"]), note=row["note"],
    )


def shift_history(history: ChildHistory, last_day: date) -> ChildHistory:
    """Move a simulated history in time so that it ends on `last_day`."""
    delta = last_day - history.days[-1].day
    profile = replace(history.profile, admitted_on=history.profile.admitted_on + delta)
    days = [replace(r, day=r.day + delta) for r in history.days]
    context = [replace(e, starts_on=e.starts_on + delta, ends_on=e.ends_on + delta if e.ends_on else None,
                       known_on=e.known_on + delta if e.known_on else None) for e in history.context]
    return ChildHistory(profile, days, context)
