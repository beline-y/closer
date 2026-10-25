"""Data contract shared by the simulator and the Supabase source.

A child is one ChildHistory: a small profile, one DayRecord per local day (contiguous,
empty days included) and the care context events entered so far. Every field maps to a
column the care team can already see (docs/SPEC.md, "AI wellbeing analysis"). Comfort
cards, question answers, photos and unshared drawings never reach the model.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date

# Chip vocabularies. They match the check constraints and enums in the database.
FEELINGS_POSITIVE = ("happy", "calm", "proud", "excited")
FEELINGS_NEGATIVE = ("sad", "lonely", "angry", "scared", "worried")
FEELINGS = FEELINGS_POSITIVE + FEELINGS_NEGATIVE + ("tired", "bored")
ACTIVITIES = ("play", "school", "walk", "sport", "crafts", "screen", "visit", "rest")
MEALS = ("all", "some", "none")
WORRY_TOPICS = ("procedure", "needles", "home", "alone", "night", "school", "other")
DRAWING_THEMES = (
    "family", "home", "friends", "animals", "nature", "hospital",
    "alone", "monsters", "superheroes", "sport", "food", "other",
)
MEDIA_KINDS = ("movie", "series", "cartoon", "music", "video_game", "book", "podcast", "other")
MEDIA_COMPANY = ("alone", "family", "friend", "other_patient", "care_team", "volunteer")
VISITOR_KINDS = ("parent", "sibling", "other_family", "friend", "volunteer", "teacher", "other")
CONTEXT_KINDS = (
    "big_day", "isolation", "room_change", "roommate_left", "discharge_planned", "visit_restrictions",
)
LEVELS = ("stable", "fragile", "distress")


@dataclass(frozen=True)
class Drawing:
    """A drawing the child chose to share with the care team."""

    emotion: int | None = None  # 1..5, the emoji the child picked for it
    themes: tuple[str, ...] = ()
    title: str | None = None


@dataclass(frozen=True)
class MediaLog:
    """Something the child watched, listened to, played or read."""

    kind: str
    minutes: int | None = None
    with_whom: str | None = None
    reaction: int | None = None  # 1..5
    is_rewatch: bool = False


@dataclass(frozen=True)
class ContextEvent:
    """Coarse, non-medical stay context entered by the care team (never a diagnosis)."""

    kind: str
    starts_on: date
    ends_on: date | None = None  # None means a single day
    known_on: date | None = None  # day it was entered; None means known from the start

    def active_on(self, day: date) -> bool:
        return self.starts_on <= day <= (self.ends_on or self.starts_on)

    def known_by(self, day: date) -> bool:
        return self.known_on is None or self.known_on <= day


@dataclass
class DayRecord:
    day: date
    # Mood check-in: mood is None when the child did not check in. Extras are optional.
    mood: int | None = None  # 1..5
    feelings: tuple[str, ...] = ()
    activity: str | None = None
    meal: str | None = None
    sleep_quality: int | None = None  # 1..5
    nightmares: bool | None = None
    pain: int | None = None  # 0..10, faces scale
    worry: int | None = None  # 0..4, faces scale
    worry_topics: tuple[str, ...] = ()
    wants_to_talk: bool = False  # "I'd like to talk to someone"
    note: str | None = None  # <= 280 characters
    # Engagement, content-free
    minutes_in_app: float = 0.0
    night_minutes: float = 0.0  # between 22:00 and 06:00 local time
    nudges_sent: int = 0
    nudge_replies: int = 0
    cards_opened: int = 0
    question_answered: bool = False
    # People around the child
    family_contacts: int = 0
    friend_contacts: int = 0
    visits: tuple[str, ...] = ()  # visitor kinds
    # Creative and media
    drawings: int = 0  # all drawings, counted without content
    shared_drawings: tuple[Drawing, ...] = ()
    media: tuple[MediaLog, ...] = ()
    # Validated scale chosen by the psychologist, normalized to 0..1 (higher = more distress)
    screening: float | None = None

    @property
    def checked_in(self) -> bool:
        return self.mood is not None


@dataclass(frozen=True)
class ChildProfile:
    patient_id: str
    age: int
    interests: tuple[str, ...] = ()
    has_family: bool = True
    admitted_on: date | None = None


@dataclass
class ChildHistory:
    profile: ChildProfile
    days: list[DayRecord] = field(default_factory=list)
    context: list[ContextEvent] = field(default_factory=list)


# Declared interests (patients.interests, free text in French or English) mapped to the
# chips showing the child still does what they love. Losing interest is a classic sign of
# low mood, so the model tracks it against the child's own baseline.
INTEREST_LINKS: dict[str, dict[str, tuple[str, ...]]] = {
    "drawing": {"keywords": ("draw", "dessin", "art", "paint", "peinture", "coloriage", "colouring", "coloring"),
                "activities": ("crafts",)},
    "sport": {"keywords": ("soccer", "foot", "sport", "basket", "tennis", "danse", "dance", "swim",
                           "natation", "rugby", "judo", "velo", "bike"),
              "activities": ("sport", "walk"), "themes": ("sport",)},
    "animals": {"keywords": ("dinosaur", "dino", "animal", "animaux", "chat", "chien", "cat", "dog",
                             "cheval", "horse", "poney", "pony"),
                "themes": ("animals",)},
    "nature": {"keywords": ("nature", "garden", "jardin", "plante", "plant"),
               "activities": ("walk",), "themes": ("nature",)},
    "screens": {"keywords": ("movie", "film", "cinema", "series", "serie", "cartoon", "dessin anime",
                             "manga", "anime"),
                "media": ("movie", "series", "cartoon")},
    "music": {"keywords": ("music", "musique", "chant", "sing", "guitar", "guitare", "piano"),
              "media": ("music",)},
    "games": {"keywords": ("game", "jeu", "jeux", "minecraft", "lego", "cartes", "cards", "puzzle"),
              "activities": ("play",), "media": ("video_game",)},
    "reading": {"keywords": ("book", "livre", "lecture", "read", "bd", "comic"), "media": ("book",)},
    "podcasts": {"keywords": ("podcast",), "media": ("podcast",)},
    "school": {"keywords": ("school", "ecole", "math", "science"), "activities": ("school",)},
    "superheroes": {"keywords": ("hero", "heros", "marvel"), "themes": ("superheroes",)},
}


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def interest_groups(interests: tuple[str, ...] | list[str]) -> frozenset[str]:
    """Map free-text interests to INTEREST_LINKS groups ("dinosaurs" -> {"animals"})."""
    groups = set()
    for raw in interests:
        text = _fold(raw)
        for group, links in INTEREST_LINKS.items():
            if any(re.search(rf"\b{re.escape(k)}", text) for k in links["keywords"]):
                groups.add(group)
    return frozenset(groups)


def interest_matches(record: DayRecord, groups: frozenset[str]) -> int:
    """How many of today's activities, drawings and media match the child's interests (capped at 4)."""
    if not groups:
        return 0
    links = [INTEREST_LINKS[g] for g in groups]
    count = 0
    if "drawing" in groups and record.drawings > 0:
        count += 1
    if record.activity and any(record.activity in g.get("activities", ()) for g in links):
        count += 1
    count += sum(1 for m in record.media if any(m.kind in g.get("media", ()) for g in links))
    count += sum(
        1 for d in record.shared_drawings
        if any(t in g.get("themes", ()) for g in links for t in d.themes)
    )
    return min(count, 4)
