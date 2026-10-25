"""Causal daily features: the row for day t only uses data up to and including day t.

Most signals are compared to the child's own baseline (a child who always answers 3 is
not a child who drops from 5 to 3). Missing data stays NaN: not checking in is itself a
signal, and the assessor sees it through missing-value indicators. App usage the store
never received is NaN too, never zero: "no data" must not read as "no family contact".
"""

from __future__ import annotations

import math
from datetime import timedelta

import numpy as np

from .contract import (
    AFFECTS_NEGATIVE, AFFECTS_POSITIVE, FEELINGS_NEGATIVE, FEELINGS_POSITIVE, ChildHistory, ChildProfile, ContextEvent,
    DayRecord, interest_groups, interest_matches,
)
from .text import analyze_note

NAN = math.nan
MOOD_PRIOR = 3.6  # population mean mood, used to shrink the personal baseline early in a stay

FEATURES = (
    "mood_mean_3d", "mood_dev_3d", "mood_min_3d", "mood_slope_7d", "mood_std_7d", "low_mood_streak",
    "checkins_7d", "days_since_checkin",
    "feel_neg_3d", "feel_pos_3d", "feel_lonely_3d",
    "notes_7d", "note_neg_3d", "note_pos_3d", "note_lonely_3d", "note_fear_3d", "note_withdrawal_7d",
    "note_concern_7d", "note_len_dev",
    "sleep_mean_3d", "nightmares_3d", "pain_max_3d", "pain_mean_3d", "worry_max_3d", "worry_home_alone_3d",
    "meal_skipped_3d", "wants_to_talk_3d",
    "minutes_ratio_3d", "night_minutes_3d", "cards_opened_3d", "questions_answered_3d",
    "family_contacts_3d", "days_since_family_contact", "friend_contacts_7d", "visits_3d", "days_since_visit",
    "nudges_3d", "nudges_ratio_3d", "nudge_reply_rate_7d", "has_family",
    "drawings_3d", "drawings_ratio_7d", "drawing_emotion_7d", "drawing_home_alone_7d",
    "media_minutes_3d", "media_alone_share_3d", "media_reaction_3d", "media_rewatch_share_7d",
    "interest_matches_3d", "interest_ratio_7d",
    "big_day_today", "big_day_tomorrow", "big_day_recent", "isolation", "roommate_left_3d", "discharge_soon",
    "visit_restrictions",
    "age", "day_of_stay", "is_weekend",
    "nurse_rounds_3d", "nurse_neg_affect_3d", "nurse_pos_affect_3d", "nurse_tired_3d", "nurse_engagement_3d",
    "nurse_pain_max_3d", "nurse_sleep_3d", "refused_care_3d", "nurse_request_7d", "intake_3d", "intake_vs_ward_3d",
    "drawing_change_7d", "drawing_dark_shift_7d", "drawing_color_shift_7d", "drawing_sad_7d", "drawing_alone_7d",
)
NURSE_FEATURES = FEATURES[FEATURES.index("nurse_rounds_3d"): FEATURES.index("drawing_change_7d")]

# Drawing vectors (contract.DRAWING_VECTOR) across simulated children: the prior a child's own
# style is shrunk toward early in the stay, and the scale that makes dimensions comparable.
DRAWING_PRIOR = np.array([0.61, 0.55, 0.22, 0.44, 0.27, 0.49, 0.26, 0.17, 0.19, 0.24, 0.02, 0.32, 0.23, 0.32, 0.37,
                          0.06, 0.30, 0.06])
DRAWING_SCALE = np.array([0.12, 0.14, 0.12, 0.18, 0.12, 0.15, 0.24, 0.37, 0.39, 0.29, 0.08, 0.47, 0.42, 0.47, 0.48,
                          0.24, 0.46, 0.23])
DRAWING_PRIOR_WEIGHT = 3  # the prior counts as three drawings
INDEX = {name: i for i, name in enumerate(FEATURES)}

# How each feature reads in an explanation shown to the care team.
DESCRIPTIONS = {
    "mood_mean_3d": lambda v: f"Low moods lately (3-day average {v:.1f}/5)",
    "mood_dev_3d": lambda v: f"Mood {abs(v):.1f} point(s) {'below' if v < 0 else 'above'} their usual level",
    "mood_min_3d": lambda v: f"Lowest mood in 3 days: {v:.0f}/5",
    "mood_slope_7d": lambda v: f"Mood trend over 7 days: {v:+.2f} per day",
    "mood_std_7d": lambda v: f"Mood swings over 7 days (spread {v:.1f})",
    "low_mood_streak": lambda v: f"{v:.0f} low check-in(s) in a row",
    "checkins_7d": lambda v: f"{v:.0f} check-in(s) in the last 7 days",
    "days_since_checkin": lambda v: f"No check-in for {v:.0f} day(s)",
    "feel_neg_3d": lambda v: f"{v:.0f} difficult feeling(s) picked in 3 days",
    "feel_pos_3d": lambda v: f"{v:.0f} positive feeling(s) picked in 3 days",
    "feel_lonely_3d": lambda v: f"Picked 'lonely' {v:.0f} time(s) in 3 days",
    "notes_7d": lambda v: f"{v:.0f} note(s) in 7 days",
    "note_neg_3d": lambda v: f"Sad, scared or angry words in recent notes ({v:.0f})",
    "note_pos_3d": lambda v: f"Positive words in recent notes ({v:.0f})",
    "note_lonely_3d": lambda v: f"Notes about missing people or feeling alone ({v:.0f})",
    "note_fear_3d": lambda v: f"Notes about fear or worry ({v:.0f})",
    "note_withdrawal_7d": lambda v: f"Notes about not wanting to do anything ({v:.0f})",
    "note_concern_7d": lambda v: f"Worrying statements in notes this week ({v:.0f})",
    "note_len_dev": lambda v: f"Notes {'shorter' if v < 0 else 'longer'} than usual",
    "sleep_mean_3d": lambda v: f"Sleep rated {v:.1f}/5 lately",
    "nightmares_3d": lambda v: f"{v:.0f} night(s) with nightmares",
    "pain_max_3d": lambda v: f"Pain up to {v:.0f}/10 in 3 days",
    "pain_mean_3d": lambda v: f"Average pain {v:.1f}/10 in 3 days",
    "worry_max_3d": lambda v: f"Worry up to {v:.0f}/4 in 3 days",
    "worry_home_alone_3d": lambda v: f"Worries about home, being alone or the night ({v:.0f})",
    "meal_skipped_3d": lambda v: f"{v:.0f} day(s) without eating",
    "wants_to_talk_3d": lambda v: "Asked to talk to someone",
    "minutes_ratio_3d": lambda v: f"Time in Closer {'down' if v < 0 else 'up'} vs usual",
    "night_minutes_3d": lambda v: f"{v:.0f} min in Closer at night (3 days)",
    "cards_opened_3d": lambda v: f"{v:.0f} comfort card(s) opened in 3 days",
    "questions_answered_3d": lambda v: f"Question of the day answered {v:.0f}/3 days",
    "family_contacts_3d": lambda v: f"{v:.0f} family interaction(s) in 3 days",
    "days_since_family_contact": lambda v: f"No family contact for {v:.0f} day(s)",
    "friend_contacts_7d": lambda v: f"{v:.0f} friend interaction(s) in 7 days",
    "visits_3d": lambda v: f"{v:.0f} visit(s) in 3 days",
    "days_since_visit": lambda v: f"No visit for {v:.0f} day(s)",
    "nudges_3d": lambda v: f"{v:.0f} nudge(s) sent in 3 days",
    "nudges_ratio_3d": lambda v: f"Nudges {'down' if v < 0 else 'up'} vs usual",
    "nudge_reply_rate_7d": lambda v: f"{v:.0%} of nudges answered this week",
    "has_family": lambda v: "No family linked" if v < 0.5 else "Family linked",
    "drawings_3d": lambda v: f"{v:.0f} drawing(s) in 3 days",
    "drawings_ratio_7d": lambda v: f"Drawing {'less' if v < 0 else 'more'} than usual",
    "drawing_emotion_7d": lambda v: f"Shared drawings tagged {v:.1f}/5",
    "drawing_home_alone_7d": lambda v: f"Shared drawings about home or being alone ({v:.0f})",
    "media_minutes_3d": lambda v: f"{v:.0f} min of films, shows, games or music in 3 days",
    "media_alone_share_3d": lambda v: f"{v:.0%} of screen and media time alone",
    "media_reaction_3d": lambda v: f"Enjoyed media {v:.1f}/5",
    "media_rewatch_share_7d": lambda v: f"{v:.0%} rewatches this week",
    "interest_matches_3d": lambda v: f"{v:.0f} activity(ies) linked to their interests in 3 days",
    "interest_ratio_7d": lambda v: f"{'Less' if v < 0 else 'More'} time on their interests than usual",
    "big_day_today": lambda v: "Big day today",
    "big_day_tomorrow": lambda v: "Big day tomorrow",
    "big_day_recent": lambda v: "Big day in the last 2 days",
    "isolation": lambda v: "In protective isolation",
    "roommate_left_3d": lambda v: "Roommate left recently",
    "discharge_soon": lambda v: "Discharge planned",
    "visit_restrictions": lambda v: "Visits restricted",
    "age": lambda v: f"Age {v:.0f}",
    "day_of_stay": lambda v: f"Day {v:.0f} of the stay",
    "is_weekend": lambda v: "Weekend",
    "nurse_rounds_3d": lambda v: f"Seen by the nurse on {v:.0f} of the last 3 days",
    "nurse_neg_affect_3d": lambda v: f"Nurse noted {_n(v)} sign(s) of sadness, worry or withdrawal per round",
    "nurse_pos_affect_3d": lambda v: f"Nurse noted the child calm or cheerful ({_n(v)} per round)",
    "nurse_tired_3d": lambda v: f"Looked tired on {v:.0%} of the nurse's rounds",
    "nurse_engagement_3d": lambda v: f"Engagement during care {v:.0%} (engaged = 100%, refuses = 0%)",
    "nurse_pain_max_3d": lambda v: f"Nurse pain score up to {v:.0f}/10",
    "nurse_sleep_3d": lambda v: f"Night shift: {'poor' if v > 0.6 else 'restless' if v > 0.2 else 'good'} sleep lately",
    "refused_care_3d": lambda v: f"Refused care {v:.0f} time(s) in 3 days",
    "nurse_request_7d": lambda v: "The nurse asked for the psychologist",
    "intake_3d": lambda v: f"Ate {v:.0%} of the ward's meals",
    "intake_vs_ward_3d": lambda v: f"Ate {abs(v):.0%} {'less' if v < 0 else 'more'} than the other children of the same dishes",
    "drawing_change_7d": lambda v: f"Drawings {'very ' if v > 0.8 else ''}different from their usual ones this week ({v:.2f})",
    "drawing_dark_shift_7d": lambda v: f"Drawings {'darker' if v > 0 else 'lighter'} than usual ({abs(v):.0%} of the ink)",
    "drawing_color_shift_7d": lambda v: f"{abs(v):.1f} {'fewer' if v < 0 else 'more'} colors than usual in drawings",
    "drawing_sad_7d": lambda v: f"{v:.0f} drawing(s) with sad faces or an explicit sad message this week",
    "drawing_alone_7d": lambda v: f"{v:.0f} drawing(s) showing one person alone this week",
}

_CHANNELS = (
    "mood", "checked_in", "feel_neg", "feel_pos", "feel_lonely",
    "has_note", "note_neg", "note_pos", "note_lonely", "note_fear", "note_withdrawal", "note_concern", "note_len",
    "sleep", "nightmares", "pain", "worry", "worry_home_alone", "meal_none", "wants_to_talk",
    "minutes", "night_minutes", "cards_opened", "question_answered",
    "family_contacts", "friend_contacts", "visits", "family_visit", "nudges", "nudge_replies",
    "drawings", "drawing_emotion_sum", "drawing_emotion_n", "drawing_home_alone",
    "media_minutes", "media_alone", "media_n", "media_reaction_sum", "media_reaction_n", "media_rewatch",
    "interest_matches", "weekend",
    "nurse_seen", "nurse_neg", "nurse_pos", "nurse_tired", "nurse_engagement", "nurse_pain", "nurse_sleep",
    "refused_care", "nurse_request", "intake", "intake_vs_ward", "drawing_sad", "drawing_alone",
)
_USAGE = ("minutes", "night_minutes", "cards_opened", "question_answered", "family_contacts", "friend_contacts",
          "nudges", "nudge_replies")
ENGAGEMENT_SCORE = {"engaged": 1.0, "quiet": 0.5, "refuses": 0.0}
SLEEP_SCORE = {"good": 0.0, "restless": 0.5, "poor": 1.0}


def _n(v: float) -> str:
    """2.0 -> "2", 1.5 -> "1.5"."""
    return f"{v:.1f}".removesuffix(".0")


def _value(x) -> float:
    return NAN if x is None else float(x)


def _mean(values: list[float]) -> float:
    values = [v for v in values if not math.isnan(v)]
    return sum(values) / len(values) if values else NAN


def _sum(values: list[float]) -> float:
    """Sum over the days with data; NaN when no day has any."""
    values = [v for v in values if not math.isnan(v)]
    return sum(values) if values else NAN


def _max(values: list[float]) -> float:
    values = [v for v in values if not math.isnan(v)]
    return max(values) if values else NAN


def _days_since(flags: list[float], t: int) -> float:
    for back in range(0, min(t, 6) + 1):
        if flags[t - back] > 0:
            return float(back)
    return float(min(t + 1, 7))


def _log_ratio(recent: float, base: float, eps: float) -> float:
    if math.isnan(recent) or math.isnan(base):
        return NAN
    return math.log((recent + eps) / (base + eps))


class FeatureBuilder:
    """Accumulates one child's days and computes feature rows on demand."""

    def __init__(self, profile: ChildProfile, context: list[ContextEvent], note_analyzer=analyze_note):
        self.profile = profile
        self.context = context
        self.note_analyzer = note_analyzer
        self.groups = interest_groups(profile.interests)
        self.days = []
        self.ch: dict[str, list[float]] = {name: [] for name in _CHANNELS}
        self.drawing_vectors: list[list[np.ndarray]] = []  # one list per day

    def __len__(self) -> int:
        return len(self.days)

    def append(self, rec: DayRecord) -> None:
        c = self.ch
        notes = self.note_analyzer(rec.note)
        shared = rec.shared_drawings
        emotions = [d.emotion for d in shared if d.emotion is not None]
        reactions = [m.reaction for m in rec.media if m.reaction is not None]
        values = {
            "mood": _value(rec.mood), "checked_in": float(rec.checked_in),
            "feel_neg": sum(f in FEELINGS_NEGATIVE for f in rec.feelings),
            "feel_pos": sum(f in FEELINGS_POSITIVE for f in rec.feelings),
            "feel_lonely": float("lonely" in rec.feelings),
            "has_note": float(rec.note is not None), "note_neg": notes.negative, "note_pos": notes.positive,
            "note_lonely": notes.lonely, "note_fear": notes.fear, "note_withdrawal": notes.withdrawal,
            "note_concern": notes.concern, "note_len": float(notes.length) if rec.note else NAN,
            "sleep": _value(rec.sleep_quality), "nightmares": float(bool(rec.nightmares)), "pain": _value(rec.pain),
            "worry": _value(rec.worry),
            "worry_home_alone": sum(w in ("home", "alone", "night") for w in rec.worry_topics),
            "meal_none": float(rec.meal == "none"), "wants_to_talk": float(rec.wants_to_talk),
            "minutes": rec.minutes_in_app, "night_minutes": rec.night_minutes, "cards_opened": rec.cards_opened,
            "question_answered": float(rec.question_answered),
            "family_contacts": rec.family_contacts, "friend_contacts": rec.friend_contacts, "visits": len(rec.visits),
            "family_visit": float(any(v in ("parent", "sibling", "other_family") for v in rec.visits)),
            "nudges": rec.nudges_sent, "nudge_replies": rec.nudge_replies,
            "drawings": rec.drawings, "drawing_emotion_sum": sum(emotions), "drawing_emotion_n": len(emotions),
            "drawing_home_alone": sum(any(t in ("home", "alone") for t in d.themes) for d in shared),
            "media_minutes": sum(m.minutes or 0 for m in rec.media),
            "media_alone": sum(m.with_whom == "alone" for m in rec.media), "media_n": len(rec.media),
            "media_reaction_sum": sum(reactions), "media_reaction_n": len(reactions),
            "media_rewatch": sum(m.is_rewatch for m in rec.media),
            "interest_matches": interest_matches(rec, self.groups), "weekend": float(rec.day.weekday() >= 5),
        }
        if not rec.engagement_known:
            values |= dict.fromkeys(_USAGE, NAN)
        values |= self._nurse_values(rec)
        readings = rec.drawing_readings
        values |= {"drawing_sad": float(sum(x.affect == "negative" or x.sad_faces > 0 for x in readings)),
                   "drawing_alone": float(sum(x.alone for x in readings))}
        self.drawing_vectors.append([np.array(x.vector()) for x in readings])
        for name in _CHANNELS:
            c[name].append(float(values[name]))
        self.days.append(rec.day)

    @staticmethod
    def _nurse_values(rec: DayRecord) -> dict[str, float]:
        n = rec.nurse
        if n is None:
            return dict.fromkeys(("nurse_neg", "nurse_pos", "nurse_tired", "nurse_engagement", "nurse_pain",
                                  "nurse_sleep", "refused_care", "intake", "intake_vs_ward"), NAN) | {
                "nurse_seen": 0.0, "nurse_request": 0.0}
        ward = {m.meal: m.ward_intake for m in rec.ward_meals}
        eaten = n.intakes()
        gaps = [share - ward[meal] for meal, share in eaten if ward.get(meal) is not None]
        return {
            "nurse_seen": 1.0,
            "nurse_neg": float(sum(a in AFFECTS_NEGATIVE for a in n.affect)) if n.affect else NAN,
            "nurse_pos": float(sum(a in AFFECTS_POSITIVE for a in n.affect)) if n.affect else NAN,
            "nurse_tired": float("tired" in n.affect) if n.affect else NAN,
            "nurse_engagement": ENGAGEMENT_SCORE.get(n.engagement, NAN),
            "nurse_pain": _value(n.pain), "nurse_sleep": SLEEP_SCORE.get(n.night_sleep, NAN),
            "refused_care": float(n.refused_care), "nurse_request": float(n.asks_psychologist),
            "intake": _mean([share for _, share in eaten]), "intake_vs_ward": _mean(gaps),
        }

    def row(self, t: int) -> np.ndarray:
        c, day = self.ch, self.days[t]

        def win(name: str, k: int) -> list[float]:
            return c[name][max(0, t - k + 1): t + 1]

        def before(name: str, k: int) -> list[float]:
            return c[name][: max(0, t - k + 1)]

        moods3 = [m for m in win("mood", 3) if not math.isnan(m)]
        prior = [m for m in before("mood", 3) if not math.isnan(m)]
        baseline = (3 * MOOD_PRIOR + sum(prior)) / (3 + len(prior))
        mood_mean = sum(moods3) / len(moods3) if moods3 else NAN
        recent7 = [(i, m) for i, m in enumerate(win("mood", 7)) if not math.isnan(m)]
        slope = std = NAN
        if len(recent7) >= 3:
            xs, ys = np.array([i for i, _ in recent7], float), np.array([m for _, m in recent7], float)
            slope = float(np.polyfit(xs, ys, 1)[0])
            std = float(ys.std())
        streak = 0
        for m in reversed(c["mood"][: t + 1]):
            if math.isnan(m):
                continue
            if m > 2:
                break
            streak += 1
        notes_before = [n for n in before("note_len", 7) if not math.isnan(n)]
        note_len_dev = NAN
        recent_len = _mean(win("note_len", 7))
        if len(notes_before) >= 2 and not math.isnan(recent_len):
            note_len_dev = math.log((recent_len + 10) / (sum(notes_before) / len(notes_before) + 10))
        pains = [p for p in win("pain", 3) if not math.isnan(p)]
        worries = [w for w in win("worry", 3) if not math.isnan(w)]

        def ratio(name: str, k: int, min_base: int, eps: float) -> float:
            base_values = before(name, k)
            base = sum(base_values) / len(base_values) if len(base_values) >= min_base else NAN
            recent = win(name, k)
            return _log_ratio(sum(recent) / len(recent), base, eps)

        contact = [(0.0 if math.isnan(f) else f) + v for f, v in zip(c["family_contacts"][: t + 1], c["family_visit"][: t + 1])]
        since_contact = _days_since(contact, t)
        if since_contact == min(t + 1, 7) and any(math.isnan(f) for f in win("family_contacts", 7)):
            since_contact = NAN  # no visit seen, and the app's messages are unknown
        nudges7, replies7 = sum(win("nudges", 7)), sum(win("nudge_replies", 7))
        emo_n = sum(win("drawing_emotion_n", 7))
        media3, media7 = sum(win("media_n", 3)), sum(win("media_n", 7))
        react_n = sum(win("media_reaction_n", 3))

        known = [e for e in self.context if e.known_by(day)]
        tomorrow, yesterday, two_days_ago = day + timedelta(days=1), day - timedelta(days=1), day - timedelta(days=2)
        active = {e.kind for e in known if e.active_on(day)}

        features = {
            "mood_mean_3d": mood_mean, "mood_dev_3d": mood_mean - baseline if moods3 else NAN,
            "mood_min_3d": min(moods3) if moods3 else NAN, "mood_slope_7d": slope, "mood_std_7d": std,
            "low_mood_streak": float(min(streak, 7)), "checkins_7d": sum(win("checked_in", 7)),
            "days_since_checkin": _days_since(c["checked_in"], t),
            "feel_neg_3d": sum(win("feel_neg", 3)), "feel_pos_3d": sum(win("feel_pos", 3)),
            "feel_lonely_3d": sum(win("feel_lonely", 3)),
            "notes_7d": sum(win("has_note", 7)), "note_neg_3d": sum(win("note_neg", 3)),
            "note_pos_3d": sum(win("note_pos", 3)), "note_lonely_3d": sum(win("note_lonely", 3)),
            "note_fear_3d": sum(win("note_fear", 3)), "note_withdrawal_7d": sum(win("note_withdrawal", 7)),
            "note_concern_7d": sum(win("note_concern", 7)), "note_len_dev": note_len_dev,
            "sleep_mean_3d": _mean(win("sleep", 3)), "nightmares_3d": sum(win("nightmares", 3)),
            "pain_max_3d": max(pains) if pains else NAN, "pain_mean_3d": _mean(pains),
            "worry_max_3d": max(worries) if worries else NAN, "worry_home_alone_3d": sum(win("worry_home_alone", 3)),
            "meal_skipped_3d": sum(win("meal_none", 3)), "wants_to_talk_3d": sum(win("wants_to_talk", 3)),
            "minutes_ratio_3d": ratio("minutes", 3, 3, 5.0), "night_minutes_3d": sum(win("night_minutes", 3)),
            "cards_opened_3d": sum(win("cards_opened", 3)), "questions_answered_3d": sum(win("question_answered", 3)),
            "family_contacts_3d": sum(win("family_contacts", 3)), "days_since_family_contact": since_contact,
            "friend_contacts_7d": sum(win("friend_contacts", 7)), "visits_3d": sum(win("visits", 3)),
            "days_since_visit": _days_since(c["visits"], t), "nudges_3d": sum(win("nudges", 3)),
            "nudges_ratio_3d": ratio("nudges", 3, 3, 0.3),
            "nudge_reply_rate_7d": replies7 / nudges7 if nudges7 else NAN,
            "has_family": float(self.profile.has_family),
            "drawings_3d": sum(win("drawings", 3)), "drawings_ratio_7d": ratio("drawings", 7, 5, 0.1),
            "drawing_emotion_7d": sum(win("drawing_emotion_sum", 7)) / emo_n if emo_n else NAN,
            "drawing_home_alone_7d": sum(win("drawing_home_alone", 7)),
            "media_minutes_3d": sum(win("media_minutes", 3)),
            "media_alone_share_3d": sum(win("media_alone", 3)) / media3 if media3 else NAN,
            "media_reaction_3d": sum(win("media_reaction_sum", 3)) / react_n if react_n else NAN,
            "media_rewatch_share_7d": sum(win("media_rewatch", 7)) / media7 if media7 else NAN,
            "interest_matches_3d": sum(win("interest_matches", 3)),
            "interest_ratio_7d": ratio("interest_matches", 7, 5, 0.2),
            "big_day_today": float("big_day" in active),
            "big_day_tomorrow": float(any(e.kind == "big_day" and e.starts_on == tomorrow for e in known)),
            "big_day_recent": float(any(e.kind == "big_day" and e.active_on(d) for e in known for d in (yesterday, two_days_ago))),
            "isolation": float("isolation" in active),
            "roommate_left_3d": float(any(e.kind == "roommate_left" and 0 <= (day - e.starts_on).days <= 2 for e in known)),
            "discharge_soon": float("discharge_planned" in active),
            "visit_restrictions": float("visit_restrictions" in active),
            "age": float(self.profile.age), "day_of_stay": float(min(self._day_of_stay(t), 60)),
            "is_weekend": c["weekend"][t],
            "nurse_rounds_3d": sum(win("nurse_seen", 3)), "nurse_neg_affect_3d": _mean(win("nurse_neg", 3)),
            "nurse_pos_affect_3d": _mean(win("nurse_pos", 3)), "nurse_tired_3d": _mean(win("nurse_tired", 3)),
            "nurse_engagement_3d": _mean(win("nurse_engagement", 3)), "nurse_pain_max_3d": _max(win("nurse_pain", 3)),
            "nurse_sleep_3d": _mean(win("nurse_sleep", 3)),
            "refused_care_3d": _sum(win("refused_care", 3)),
            "nurse_request_7d": sum(win("nurse_request", 7)),
            "intake_3d": _mean(win("intake", 3)), "intake_vs_ward_3d": _mean(win("intake_vs_ward", 3)),
            "drawing_sad_7d": sum(win("drawing_sad", 7)), "drawing_alone_7d": sum(win("drawing_alone", 7)),
        } | self._drawing_shift(t)
        return np.array([features[name] for name in FEATURES], dtype=float)

    def _drawing_shift(self, t: int) -> dict[str, float]:
        """This week's drawings against the child's earlier ones (shrunk toward the prior early in the stay)."""
        recent = [v for day in self.drawing_vectors[max(0, t - 6): t + 1] for v in day]
        if not recent:
            return dict.fromkeys(("drawing_change_7d", "drawing_dark_shift_7d", "drawing_color_shift_7d"), NAN)
        earlier = [v for day in self.drawing_vectors[: max(0, t - 6)] for v in day]
        baseline = (DRAWING_PRIOR_WEIGHT * DRAWING_PRIOR + np.sum(earlier, axis=0)) / (DRAWING_PRIOR_WEIGHT + len(earlier))
        gap = np.mean(recent, axis=0) - baseline
        return {
            "drawing_change_7d": float(np.mean(np.abs(gap) / DRAWING_SCALE)),
            "drawing_dark_shift_7d": float(gap[2]), "drawing_color_shift_7d": float(gap[3] * 12),
        }

    def _day_of_stay(self, t: int) -> int:
        if self.profile.admitted_on is None:
            return t
        return max(0, (self.days[t] - self.profile.admitted_on).days)

    def matrix(self) -> np.ndarray:
        return np.vstack([self.row(t) for t in range(len(self.days))]) if self.days else np.empty((0, len(FEATURES)))


def build(history: ChildHistory, note_analyzer=analyze_note) -> FeatureBuilder:
    builder = FeatureBuilder(history.profile, history.context, note_analyzer)
    for record in history.days:
        builder.append(record)
    return builder


_MISSING = {
    "mood_mean_3d": "No mood check-in for 3 days", "mood_dev_3d": "No mood check-in for 3 days",
    "mood_min_3d": "No mood check-in for 3 days", "sleep_mean_3d": "Has not rated their sleep lately",
    "pain_max_3d": "Has not rated their pain lately", "worry_max_3d": "Has not rated their worries lately",
    "nudge_reply_rate_7d": "No nudge sent this week", "drawing_emotion_7d": "No shared drawing this week",
    "media_reaction_3d": "No film, show, game or music logged lately",
    "nurse_neg_affect_3d": "No nurse observation of how the child looked lately",
    "nurse_pos_affect_3d": "No nurse observation of how the child looked lately",
    "nurse_engagement_3d": "No nurse note on engagement during care lately",
    "intake_3d": "No meal recorded by the nurse lately", "intake_vs_ward_3d": "No meal recorded by the nurse lately",
    "days_since_family_contact": "Family contact unknown (no app data, no visit noted)",
    "drawing_change_7d": "No drawing this week", "drawing_dark_shift_7d": "No drawing this week",
    "drawing_color_shift_7d": "No drawing this week",
}


def describe(feature: str, value: float) -> str:
    if math.isnan(value):
        return _MISSING.get(feature, f"Not enough data yet ({feature.replace('_', ' ')})")
    return DESCRIPTIONS[feature](value)
