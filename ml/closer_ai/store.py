"""Local SQLite store for the AI module, standard library only.

One file holds the signals the AI may read, the care context, and what the AI writes
back (assessments, alerts and the psychologist's review of each alert). It mirrors the
data contract in contract.py. Comfort cards, question answers and photos are never
stored; drawings keep their details only when the child shared them with the care team.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .contract import (
    ACTIVITIES, CONTEXT_KINDS, DRAWING_THEMES, FEELINGS, MEALS, MEDIA_COMPANY, MEDIA_KINDS, VISITOR_KINDS,
    WORRY_TOPICS, ChildHistory, ChildProfile, ContextEvent, DayRecord, Drawing, MediaLog,
)
from .policy.obs import AlertState


def _values(options: tuple[str, ...]) -> str:
    return ", ".join(f"'{o}'" for o in options)


SCHEMA = f"""
CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 40),
    birth_year INTEGER NOT NULL CHECK (birth_year BETWEEN 1990 AND 2100),
    interests TEXT NOT NULL DEFAULT '[]',  -- JSON list of free-text interests
    has_family INTEGER NOT NULL DEFAULT 1 CHECK (has_family IN (0, 1)),
    admitted_on TEXT NOT NULL,
    discharged_on TEXT
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
    model_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (patient_id, for_date, model_version)
);
-- The psychologist's review turns every alert into a label for the next training round.
CREATE TABLE IF NOT EXISTS ai_alerts (
    id INTEGER PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    for_date TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('safety_rule', 'child_request', 'policy', 'psy_manual')),
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
"""


@dataclass
class PatientData:
    """Everything the daily job needs for one child: signals, context and alert history."""

    history: ChildHistory
    state: AlertState
    nickname: str
    window_start: date


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: str | Path = ":memory:"):
        self.db = sqlite3.connect(str(path))
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(SCHEMA)

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
            self.db.execute(
                "INSERT INTO daily_activity VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (patient_id, d, r.minutes_in_app, r.night_minutes, r.nudges_sent, r.nudge_replies, r.cards_opened,
                 int(r.question_answered), r.family_contacts, r.friend_contacts),
            )
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
            state.alerts.append((k, a["source"], a["priority"]))
            if a["source"] == "psy_manual":
                state.psy_contacts.append(k)
            elif a["outcome"] in ("support_needed", "already_followed") and a["reviewed_at"]:
                reviewed = date.fromisoformat(a["reviewed_at"][:10])
                state.psy_contacts.append(index.get(reviewed, k))
        for a in self._rows("ai_assessments", pid, start, today, "for_date"):
            if a["policy_action"] == "ask":
                state.asks.append(index[date.fromisoformat(a["for_date"])])
        for k, d in enumerate(sorted(record)):
            if record[d].screening is not None:
                state.screenings.append((k, record[d].screening))
        profile = ChildProfile(pid, today.year - p["birth_year"], tuple(json.loads(p["interests"])),
                               bool(p["has_family"]), admitted)
        history = ChildHistory(profile, [record[d] for d in sorted(record)], context)
        return PatientData(history, state, p["nickname"], start)

    # -- what the AI writes back ---------------------------------------------------
    def save_assessment(self, row: dict) -> int:
        with self.db:
            self.db.execute(
                """INSERT INTO ai_assessments (patient_id, for_date, level, p_stable, p_fragile, p_distress, factors,
                       data_days, policy_action, urgency, model_version, created_at)
                   VALUES (:patient_id, :for_date, :level, :p_stable, :p_fragile, :p_distress, :factors, :data_days,
                       :policy_action, :urgency, :model_version, :created_at)
                   ON CONFLICT (patient_id, for_date, model_version) DO UPDATE SET
                       level = excluded.level, p_stable = excluded.p_stable, p_fragile = excluded.p_fragile,
                       p_distress = excluded.p_distress, factors = excluded.factors, data_days = excluded.data_days,
                       policy_action = excluded.policy_action, urgency = excluded.urgency, created_at = excluded.created_at""",
                row | {"factors": json.dumps(row["factors"]), "created_at": _now()},
            )
            return self.db.execute(
                "SELECT id FROM ai_assessments WHERE patient_id = ? AND for_date = ? AND model_version = ?",
                (row["patient_id"], row["for_date"], row["model_version"]),
            ).fetchone()[0]

    def save_alert(self, row: dict) -> bool:
        """One alert per child, day and source: re-running the job the same day changes nothing."""
        with self.db:
            cursor = self.db.execute(
                """INSERT OR IGNORE INTO ai_alerts (patient_id, for_date, source, priority, reason, evidence,
                       model_version, created_at)
                   VALUES (:patient_id, :for_date, :source, :priority, :reason, :evidence, :model_version, :created_at)""",
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


def shift_history(history: ChildHistory, last_day: date) -> ChildHistory:
    """Move a simulated history in time so that it ends on `last_day`."""
    delta = last_day - history.days[-1].day
    profile = replace(history.profile, admitted_on=history.profile.admitted_on + delta)
    days = [replace(r, day=r.day + delta) for r in history.days]
    context = [replace(e, starts_on=e.starts_on + delta, ends_on=e.ends_on + delta if e.ends_on else None,
                       known_on=e.known_on + delta if e.known_on else None) for e in history.context]
    return ChildHistory(profile, days, context)
