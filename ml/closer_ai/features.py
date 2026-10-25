"""Causal daily features: the row for day t only uses data up to and including day t.

Most signals are compared to the child's own baseline (a child who always answers 3 is
not a child who drops from 5 to 3). Missing data stays NaN: not checking in is itself a
signal, and the assessor sees it through missing-value indicators.
"""

from __future__ import annotations

import math
from datetime import timedelta

import numpy as np

from .contract import ChildHistory, ChildProfile, ContextEvent, DayRecord, FEELINGS_NEGATIVE, FEELINGS_POSITIVE, interest_groups, interest_matches
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
)
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
)


def _value(x) -> float:
    return NAN if x is None else float(x)


def _mean(values: list[float]) -> float:
    values = [v for v in values if not math.isnan(v)]
    return sum(values) / len(values) if values else NAN


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
        for name in _CHANNELS:
            c[name].append(float(values[name]))
        self.days.append(rec.day)

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

        contact = [f + v for f, v in zip(c["family_contacts"][: t + 1], c["family_visit"][: t + 1])]
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
            "family_contacts_3d": sum(win("family_contacts", 3)), "days_since_family_contact": _days_since(contact, t),
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
        }
        return np.array([features[name] for name in FEATURES], dtype=float)

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
}


def describe(feature: str, value: float) -> str:
    if math.isnan(value):
        return _MISSING.get(feature, f"Not enough data yet ({feature.replace('_', ' ')})")
    return DESCRIPTIONS[feature](value)
