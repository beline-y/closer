"""Simulator of fictional hospitalized children, used to train and evaluate everything.

Each child has a hidden daily state (0 stable, 1 fragile, 2 distress) driven by stressors
(big days, isolation, days without family, pain, length of stay) and by support (family
visits, psychologist visits after an alert). The app only sees noisy, partly missing
signals: mood check-ins with their optional extras, notes, engagement, people, drawings
and media. Three things keep the problem honest:

- children differ a lot (some always use the app at night, some always watch alone),
  so only changes against the child's own habits are informative;
- treatment fatigue lowers mood and activity without any psychological distress;
- some children mask distress behind good moods and cheerful notes.

The nurse's round adds a second, independent view: brief and often skipped, but less
fooled by masking. What a child eats depends on the menu as much as on their mood, so
the ward's intake of the same dish is the baseline. Some children's app usage is not
tracked at all.

Randomness uses one stream per (child, day, purpose), so two policies that leave a child
in the same state see the same future draws (common random numbers).
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date, timedelta

import numpy as np

from .contract import (
    INTAKE_SCORE, WARD_MEALS, ChildHistory, ChildProfile, ContextEvent, DayRecord, Drawing, MediaLog, NurseObservation,
    WardMeal, interest_groups,
)
from .notes_gen import generate_note

STABLE, FRAGILE, DISTRESS = 0, 1, 2

_INTERESTS = {
    "fr": ("dessin", "foot", "dinosaures", "jeux vidéo", "musique", "lecture", "films", "lego", "animaux",
           "danse", "manga", "piano"),
    "en": ("drawing", "soccer", "dinosaurs", "video games", "music", "reading", "movies", "lego", "animals",
           "dance", "manga", "piano"),
}
_DRAWING_TITLES = {
    "family": {"fr": ["moi et maman", "ma famille"], "en": ["me and mom", "my family"]},
    "home": {"fr": ["ma maison", "ma chambre à la maison"], "en": ["my house", "my room at home"]},
    "friends": {"fr": ["mes copains"], "en": ["my friends"]},
    "animals": {"fr": ["un dinosaure", "mon chat"], "en": ["a dinosaur", "my cat"]},
    "nature": {"fr": ["un arbre", "la mer"], "en": ["a tree", "the sea"]},
    "hospital": {"fr": ["ma chambre", "l'hôpital"], "en": ["my room", "the hospital"]},
    "alone": {"fr": ["moi tout seul", "moi"], "en": ["just me", "me"]},
    "monsters": {"fr": ["un monstre"], "en": ["a monster"]},
    "superheroes": {"fr": ["un super-héros"], "en": ["a superhero"]},
    "sport": {"fr": ["un match de foot"], "en": ["a soccer game"]},
    "food": {"fr": ["une pizza"], "en": ["a pizza"]},
    "other": {"fr": ["un dessin"], "en": ["a drawing"]},
}
# Hospital dishes and how much children like them (shifts everyone's intake that day).
_DISHES = {
    "lunch": [({"fr": "pâtes bolognaise", "en": "pasta bolognese"}, 0.7), ({"fr": "poisson et riz", "en": "fish and rice"}, -0.6),
              ({"fr": "poulet frites", "en": "chicken and fries"}, 0.8), ({"fr": "lentilles", "en": "lentil stew"}, -0.5),
              ({"fr": "lasagnes", "en": "lasagna"}, 0.5), ({"fr": "quiche aux épinards", "en": "spinach quiche"}, -0.7),
              ({"fr": "steak haché purée", "en": "burger and mash"}, 0.4), ({"fr": "omelette", "en": "omelette"}, 0.0)],
    "dinner": [({"fr": "soupe de légumes", "en": "vegetable soup"}, -0.6), ({"fr": "pizza", "en": "pizza"}, 0.9),
               ({"fr": "jambon coquillettes", "en": "ham and pasta"}, 0.6), ({"fr": "gratin de courgettes", "en": "zucchini gratin"}, -0.5),
               ({"fr": "croque-monsieur", "en": "grilled cheese"}, 0.5), ({"fr": "riz cantonais", "en": "fried rice"}, 0.2)],
}
_ACTIVITY_LINKS = {"drawing": ("crafts",), "sport": ("sport", "walk"), "nature": ("walk",), "games": ("play",),
                   "school": ("school",)}
_THEME_LINKS = {"animals": ("animals",), "sport": ("sport",), "nature": ("nature",), "superheroes": ("superheroes",)}
_MEDIA_LINKS = {"screens": ("movie", "series", "cartoon"), "music": ("music",), "games": ("video_game",),
                "reading": ("book",)}


def _sigmoid(x: float) -> float:
    return float(1.0 / (1.0 + np.exp(-x)))


@dataclass(frozen=True)
class SimConfig:
    min_age: int = 5
    max_age: int = 17
    min_stay: int = 14
    max_stay: int = 42
    french_share: float = 0.5
    masking_share: float = 0.15
    no_family_share: float = 0.08
    isolation_share: float = 0.15
    crisis_note_rate: float = 0.05
    stress_scale: float = 1.0
    vulnerability: tuple[float, float] = (0.6, 1.5)
    checkin_rate: tuple[float, float] = (0.55, 0.95)
    note_scale: float = 1.0
    intervention_effect: float = 1.5
    intervention_days: int = 5
    nurse_rate: tuple[float, float] = (0.45, 0.95)  # share of days with a nurse observation, per child
    nurse_masking: float = 0.5  # share of their distress a masking child still shows the nurse
    untracked_share: float = 0.2  # children whose app usage data never reaches the store

    def randomized(self, rng: np.random.Generator) -> SimConfig:
        """Domain randomization over the parameters we are least sure about."""
        return replace(
            self,
            masking_share=float(rng.uniform(0.05, 0.3)),
            no_family_share=float(rng.uniform(0.03, 0.15)),
            isolation_share=float(rng.uniform(0.05, 0.3)),
            crisis_note_rate=float(rng.uniform(0.02, 0.08)),
            stress_scale=float(rng.uniform(0.8, 1.25)),
            note_scale=float(rng.uniform(0.6, 1.4)),
            intervention_effect=float(rng.uniform(0.8, 2.0)),
        )

    def randomized_ward(self, rng: np.random.Generator) -> SimConfig:
        """Same idea for the nurse's round and the app data, from a stream of their own."""
        return replace(self, nurse_masking=float(rng.uniform(0.3, 0.8)), untracked_share=float(rng.uniform(0.05, 0.4)))


@dataclass
class ChildParams:
    age: int
    lang: str
    interests: tuple[str, ...]
    baseline: float
    bias: float
    noise: float
    masking: bool
    vulnerability: float
    checkin_rate: float
    note_rate: float
    extras_rate: float
    has_family: bool
    family_level: float
    friend_rate: float
    drawing_rate: float
    media_rate: float
    minutes_scale: float
    pain_base: float
    fatigue_base: float
    night_base: float
    alone_base: float
    rewatch_base: float
    question_base: float
    nudge_base: float
    sleep_bias: float
    worry_bias: float
    stay: int
    start: date


@dataclass
class WardParams:
    nurse_rate: float
    appetite: float
    tracked: bool


@dataclass
class Truth:
    """What really happened, hidden from the policy: used for rewards and metrics."""

    states: list[int] = field(default_factory=list)
    psy_visits: list[int] = field(default_factory=list)
    crisis_notes: list[int] = field(default_factory=list)
    concern_notes: list[int] = field(default_factory=list)


class ChildSimulator:
    def __init__(self, config: SimConfig | None = None, seed: int = 0):
        self.base_config = config or SimConfig()
        self.config = self.base_config
        self.seed = seed
        self.t = -1

    def _rng(self, day: int, stream: int) -> np.random.Generator:
        return np.random.default_rng([self.seed, day, stream])

    # -- episode ---------------------------------------------------------------
    def reset(self, seed: int | None = None, randomize: bool = False) -> DayRecord:
        if seed is not None:
            self.seed = int(seed)
        rng = np.random.default_rng([self.seed, 1_000_000])
        self.config = self.base_config.randomized(rng) if randomize else self.base_config
        self.params = self._sample_child(rng)
        # Separate stream: adding the ward side left every child's own draws unchanged.
        ward_rng = np.random.default_rng([self.seed, 1_000_001])
        if randomize:
            self.config = self.config.randomized_ward(ward_rng)
        self.ward = WardParams(
            nurse_rate=float(ward_rng.uniform(*self.config.nurse_rate)), appetite=float(ward_rng.normal(0, 0.4)),
            tracked=bool(ward_rng.random() >= self.config.untracked_share),
        )
        p = self.params
        self.groups = interest_groups(p.interests)
        self.profile = ChildProfile(
            patient_id=f"sim-{self.seed}", age=p.age, interests=p.interests,
            has_family=p.has_family, admitted_on=p.start,
        )
        self.history = ChildHistory(self.profile, [], self._schedule_context(rng))
        self.truth = Truth()
        self.t = -1
        self._z = STABLE
        self._eps = 0.0
        self._family_away = not p.has_family
        self._days_without_family = 0
        self._pending_visits: set[int] = set()
        self._pending_screening: set[int] = set()
        self._last_psy_visit: int | None = None
        return self.step()

    @property
    def done(self) -> bool:
        return self.t >= self.params.stay - 1

    @property
    def state(self) -> int:
        return self._z

    def schedule_alert(self, priority: str) -> None:
        """An alert raised at the end of today: the psychologist may visit in the next days."""
        rng = self._rng(self.t, 4)
        if priority == "urgent":
            self._pending_visits.add(self.t + 1)
        elif priority == "priority":
            if rng.random() < 0.95:
                self._pending_visits.add(self.t + 1)
        elif priority == "digest":
            if rng.random() < 0.6:
                self._pending_visits.add(self.t + 1)
            elif rng.random() < 0.75:
                self._pending_visits.add(self.t + 2)
        else:
            raise ValueError(priority)

    def schedule_screening(self) -> None:
        """A short validated scale tomorrow (gentle questions chosen by the psychologist)."""
        self._pending_screening.add(self.t + 1)

    def step(self) -> DayRecord:
        self.t += 1
        t, p, cfg = self.t, self.params, self.config
        day = p.start + timedelta(days=t)
        ex = self._rng(t, 0)

        # Exogenous context for today.
        events = self.history.context
        active = {e.kind for e in events if e.active_on(day)}
        big_today = "big_day" in active
        big_tomorrow = any(e.kind == "big_day" and e.starts_on == day + timedelta(days=1) for e in events)
        big_yesterday = any(e.kind == "big_day" and e.starts_on == day - timedelta(days=1) for e in events)
        isolation = "isolation" in active
        restricted = isolation or "visit_restrictions" in active
        roommate_left = any(e.kind == "roommate_left" and 0 <= (day - e.starts_on).days <= 2 for e in events)
        weekend = day.weekday() >= 5
        if p.has_family:
            self._family_away = ex.random() < (0.6 if self._family_away else 0.06)
        p_visit = 0.0 if self._family_away else (0.15 + 0.5 * p.family_level) * (1.4 if weekend else 1.0)
        if restricted:
            p_visit *= 0.25
        visitors = []
        if ex.random() < p_visit:
            visitors.append(str(ex.choice(["parent", "sibling", "other_family", "friend"], p=[0.6, 0.2, 0.1, 0.1])))
        if ex.random() < 0.05:
            visitors.append("volunteer")
        if not weekend and p.age >= 6 and ex.random() < 0.08:
            visitors.append("teacher")
        family_visit = any(v in ("parent", "sibling", "other_family") for v in visitors)
        pain = p.pain_base + 3.5 * big_today + 2.0 * big_yesterday + ex.normal(0, 0.6)
        if ex.random() < 0.07:
            pain += ex.uniform(2, 4)
        pain = float(np.clip(pain, 0, 10))
        # Treatment fatigue: a physical confounder that looks a lot like low mood.
        fatigue = p.fatigue_base + 0.7 * big_today + 0.4 * big_yesterday + ex.normal(0, 0.1)
        if ex.random() < 0.12:
            fatigue += ex.uniform(0.4, 0.9)
        fatigue = float(np.clip(fatigue, 0, 1))

        # Psychologist visit planned by an earlier alert.
        if t in self._pending_visits:
            self._last_psy_visit = t
            self.truth.psy_visits.append(t)
        support = 0.0
        if self._last_psy_visit is not None and t - self._last_psy_visit < cfg.intervention_days:
            support = cfg.intervention_effect * (1 - (t - self._last_psy_visit) / cfg.intervention_days)

        # Hidden state.
        stress = (
            0.8 * big_tomorrow + 0.5 * big_today + 0.2 * big_yesterday + 0.7 * isolation
            + (0.3 * min(self._days_without_family, 3) if p.has_family else 0.6) + 0.5 * roommate_left
            + 0.06 * pain + 0.2 * min(t / 14, 2) + 0.3 * ("room_change" in active)
            + 0.4 * ("visit_restrictions" in active)
        ) * p.vulnerability * cfg.stress_scale
        stress -= 0.6 * family_visit + 0.3 * ("discharge_planned" in active)
        lat = self._rng(t, 1)
        if t == 0:
            self._z = int(lat.choice(3, p=[0.8, 0.16, 0.04]))
        else:
            self._z = self._transition(self._z, stress, support, lat)
        self._eps = 0.6 * self._eps + lat.normal(0, 0.3)
        z = self._z
        w = p.baseline + (0.0, -0.6, -1.3)[z] + self._eps
        self.truth.states.append(z)

        record = self._observe(day, z, w, pain, fatigue, visitors, big_today, big_tomorrow, isolation)
        if t in self._pending_screening:
            record.screening = float(np.clip(self._rng(t, 5).normal((0.15, 0.45, 0.75)[z], 0.12), 0, 1))
        record.ward_meals, popularity = self._menu(day)
        record.nurse = self._nurse(day, z, pain, fatigue, big_today, isolation, popularity)
        contact = record.family_contacts > 0 or family_visit
        self._days_without_family = 0 if contact else self._days_without_family + 1
        if not self.ward.tracked:  # the child still lives it; the store just never hears about it
            record.engagement_known = False
            record.minutes_in_app = record.night_minutes = 0.0
            record.nudges_sent = record.nudge_replies = record.cards_opened = 0
            record.family_contacts = record.friend_contacts = 0
            record.question_answered = False
        self.history.days.append(record)
        return record

    # -- internals -------------------------------------------------------------
    def _transition(self, z: int, s: float, support: float, rng: np.random.Generator) -> int:
        if z == STABLE:
            up = _sigmoid(-3.5 + 1.1 * s - support)
            jump = _sigmoid(-6.5 + 1.0 * s - support)
            probs = [1 - up - jump, up, jump]
        elif z == FRAGILE:
            up = _sigmoid(-2.8 + 0.9 * s - support)
            down = _sigmoid(-1.1 - 0.6 * s + support)
            probs = [down, 1 - up - down, up]
        else:
            down = _sigmoid(-1.3 - 0.5 * s + 1.2 * support)
            probs = [0.0, down, 1 - down]
        probs = np.clip(probs, 0, None)
        return int(rng.choice(3, p=probs / probs.sum()))

    def _sample_child(self, rng: np.random.Generator) -> ChildParams:
        cfg = self.config
        age = int(rng.integers(cfg.min_age, cfg.max_age + 1))
        lang = "fr" if rng.random() < cfg.french_share else "en"
        interests = tuple(rng.choice(_INTERESTS[lang], size=int(rng.integers(1, 4)), replace=False).tolist())
        note_rate = (0.06 if age <= 7 else 0.2 if age <= 10 else 0.32 if age <= 13 else 0.4)
        draws = "dessin" in interests or "drawing" in interests
        return ChildParams(
            age=age, lang=lang, interests=interests,
            baseline=float(rng.normal(0.15, 0.35)), bias=float(rng.normal(0, 0.4)),
            noise=float(rng.uniform(0.5, 1.0)), masking=bool(rng.random() < cfg.masking_share),
            vulnerability=float(rng.uniform(*cfg.vulnerability)), checkin_rate=float(rng.uniform(*cfg.checkin_rate)),
            note_rate=float(note_rate * cfg.note_scale * rng.uniform(0.5, 1.5)),
            extras_rate=float(rng.uniform(0.15, 0.6)),
            has_family=bool(rng.random() >= cfg.no_family_share), family_level=float(rng.uniform(0.3, 1.0)),
            friend_rate=float((0.1 + 0.08 * (age - 5)) * rng.uniform(0.5, 1.5)),
            drawing_rate=float((0.8 if draws else 0.2) * rng.uniform(0.4, 1.6) * (1.3 if age <= 10 else 0.7)),
            media_rate=float(rng.uniform(0.6, 2.0)), minutes_scale=float(rng.uniform(0.4, 1.8)),
            pain_base=float(rng.uniform(0.3, 2.0)), fatigue_base=float(rng.uniform(0.0, 0.3)),
            night_base=float(rng.uniform(0.02, 0.35)), alone_base=float(rng.uniform(0.3, 0.8)),
            rewatch_base=float(rng.uniform(0.1, 0.5)), question_base=float(rng.uniform(0.3, 0.9)),
            nudge_base=float(rng.uniform(0.3, 1.6)), sleep_bias=float(rng.normal(0, 0.5)),
            worry_bias=float(rng.normal(0, 0.6)),
            stay=int(rng.integers(cfg.min_stay, cfg.max_stay + 1)),
            start=date(2026, 1, 5) + timedelta(days=int(rng.integers(0, 300))),
        )

    def _schedule_context(self, rng: np.random.Generator) -> list[ContextEvent]:
        p, cfg = self.params, self.config

        def day(i: int) -> date:
            return p.start + timedelta(days=int(i))

        events = []
        i = int(rng.integers(1, 7))
        while i < p.stay - 1:
            events.append(ContextEvent("big_day", day(i), known_on=day(max(0, i - 3))))
            i += int(rng.integers(4, 12))
        if rng.random() < cfg.isolation_share:
            start = int(rng.integers(2, max(3, p.stay - 8)))
            end = min(p.stay - 1, start + int(rng.integers(5, 14)))
            events.append(ContextEvent("isolation", day(start), day(end), known_on=day(start)))
        if rng.random() < 0.05:
            start = int(rng.integers(1, max(2, p.stay - 4)))
            events.append(ContextEvent("visit_restrictions", day(start), day(start + int(rng.integers(3, 8))),
                                       known_on=day(start)))
        for i in range(1, p.stay):
            if rng.random() < 1 / 12:
                events.append(ContextEvent("roommate_left", day(i), known_on=day(i)))
            if rng.random() < 1 / 25:
                events.append(ContextEvent("room_change", day(i), known_on=day(i)))
        discharge = p.stay - int(rng.integers(2, 6))
        events.append(ContextEvent("discharge_planned", day(discharge), day(p.stay - 1), known_on=day(discharge)))
        return events

    def _observe(self, day: date, z: int, w: float, pain: float, fatigue: float, visitors: list[str],
                 big_today: bool, big_tomorrow: bool, isolation: bool) -> DayRecord:
        p, t = self.params, self.t
        rng = self._rng(t, 2)
        rec = DayRecord(day=day, visits=tuple(visitors))
        lonely_context = isolation or self._days_without_family >= 2
        engaged = (0.5, 0.4, 0.28)[z]  # chance a choice follows the child's interests

        if rng.random() < p.checkin_rate * (1.0, 0.85, 0.7)[z] * (0.8 if big_today else 1.0):
            m = 3.6 + 0.9 * (w + p.bias) - 0.06 * pain - 0.4 * fatigue + rng.normal(0, p.noise)
            if p.masking and z >= FRAGILE:
                m += rng.uniform(0.5, 1.4)
            rec.mood = int(np.clip(round(m), 1, 5))
            if rng.random() < p.extras_rate:
                rec.feelings = self._feelings(rng, z, big_tomorrow, lonely_context, fatigue)
            if rng.random() < p.extras_rate:
                rec.activity = self._activity(rng, z, bool(visitors), engaged, fatigue)
            if rng.random() < p.extras_rate:
                meal = np.array([(0.65, 0.28, 0.07), (0.57, 0.31, 0.12), (0.47, 0.35, 0.18)][z])
                shift = min(0.5, 0.06 * max(pain - 4, 0) + 0.3 * fatigue)
                meal = meal + np.array([-shift * meal[0], 0, shift * meal[0]])
                rec.meal = str(rng.choice(["all", "some", "none"], p=meal / meal.sum()))
            if rng.random() < p.extras_rate:
                sleep = 3.8 + p.sleep_bias - 0.35 * z - 0.1 * pain - 0.6 * fatigue - 0.3 * isolation + rng.normal(0, 0.9)
                rec.sleep_quality = int(np.clip(round(sleep), 1, 5))
                rec.nightmares = bool(rng.random() < 0.05 + 0.05 * z + 0.08 * big_tomorrow)
            if rng.random() < p.extras_rate:
                rec.pain = int(np.clip(round((pain + rng.normal(0, 1.0)) / 2) * 2, 0, 10))
            if rng.random() < p.extras_rate:
                worry = 0.6 + p.worry_bias + 0.5 * z + 1.5 * big_tomorrow + 0.4 * isolation + rng.normal(0, 0.8)
                rec.worry = int(np.clip(round(worry), 0, 4))
                topics = []
                if big_tomorrow or big_today:
                    topics.append("procedure")
                if big_today and rng.random() < 0.5:
                    topics.append("needles")
                if rng.random() < 0.1 + 0.15 * z:
                    topics.append("home")
                if lonely_context and rng.random() < 0.5:
                    topics.append("alone")
                if rng.random() < 0.05 + 0.08 * z:
                    topics.append("night")
                rec.worry_topics = tuple(topics[:3])
            rec.wants_to_talk = bool(rng.random() < (0.005, 0.02, 0.06)[z] * (1.3 if p.age >= 11 else 0.8))
            if rng.random() < p.note_rate * (1.0, 1.1, 0.9)[z]:
                rec.note = self._note(z, big_tomorrow or big_today, lonely_context, bool(visitors), pain, fatigue)

        tired = 1 - 0.35 * fatigue
        rec.minutes_in_app = float(rng.gamma(2.0, (25, 27, 20)[z] * p.minutes_scale * tired / 2))
        if rng.random() < min(0.9, p.night_base * (1.0, 1.3, 1.8)[z] + 0.1 * (pain > 6)):
            rec.night_minutes = float(rng.gamma(2.0, (4, 5, 7)[z] / 2))
        nudge_rate = p.nudge_base * (1.3 if p.age < 12 else 1.0) * (1.0 if p.has_family else 0.3)
        rec.nudges_sent = int(rng.poisson(nudge_rate * (1.0, 1.4, 0.75)[z] * tired))
        reply_rate = 0.0 if self._family_away else 0.3 + 0.6 * p.family_level
        rec.nudge_replies = int(rng.binomial(rec.nudges_sent, reply_rate))
        family_rate = 0.0 if self._family_away else (1.0 + 2.5 * p.family_level) * (1.3 if day.weekday() >= 5 else 1.0)
        rec.family_contacts = int(rng.poisson(family_rate)) + rec.nudge_replies
        rec.friend_contacts = int(rng.poisson(p.friend_rate))
        rec.cards_opened = int(rng.poisson(0.25 * p.family_level * (1.0, 0.9, 0.7)[z] * p.has_family))
        rec.question_answered = bool(rng.random() < p.question_base * (1.0, 0.9, 0.75)[z] * tired)

        rec.drawings = int(rng.poisson(p.drawing_rate * (1.0, 0.8, 0.55)[z] * tired))
        shared = []
        for _ in range(rec.drawings):
            if rng.random() < 0.3:
                themes = self._themes(rng, z, lonely_context, engaged)
                emotion = int(np.clip(round(3.4 + 0.5 * (w + p.bias) + rng.normal(0, 1.0)), 1, 5))
                title = str(rng.choice(_DRAWING_TITLES[themes[0]][p.lang]))
                shared.append(Drawing(emotion=emotion, themes=themes, title=title))
        rec.shared_drawings = tuple(shared)
        rec.media = tuple(
            self._media(rng, z, w, isolation, bool(visitors), engaged)
            for _ in range(int(rng.poisson(p.media_rate * (1.0, 1.1, 1.2)[z] * (1 + 0.3 * fatigue))))
        )
        return rec

    def _menu(self, day: date) -> tuple[tuple[WardMeal, ...], dict[str, float]]:
        """Today's dishes and the leave-one-out intake of ten other children (mostly stable)."""
        rng = self._rng(self.t, 7)
        meals, popularity = [], {}
        for meal in WARD_MEALS:
            names, liked = _DISHES[meal][int(rng.integers(len(_DISHES[meal])))]
            popularity[meal] = liked + float(rng.normal(0, 0.2))
            others = []
            for _ in range(10):
                if rng.random() < 0.7:  # observed by the nurse
                    v = float(rng.choice([0.0, 1.0, 2.0], p=[0.8, 0.16, 0.04]))
                    others.append(self._eaten(rng, rng.normal(0, 0.4) + popularity[meal], v, 2.0, 0.15))
            intake = float(np.mean([INTAKE_SCORE[o] for o in others])) if others else None
            meals.append(WardMeal(meal, names[self.params.lang], intake))
        return tuple(meals), popularity

    @staticmethod
    def _eaten(rng, appetite: float, shown: float, pain: float, fatigue: float) -> str:
        s = 0.9 + appetite - 0.45 * shown - 0.12 * max(pain - 3, 0) - 1.2 * fatigue + rng.normal(0, 0.6)
        return "all" if s > 0.6 else "half" if s > -0.2 else "little" if s > -1.0 else "none"

    def _nurse(self, day: date, z: int, pain: float, fatigue: float, big_today: bool, isolation: bool,
               popularity: dict[str, float]) -> NurseObservation | None:
        """The nurse's round: brief, partial, and less fooled by masking than the app."""
        p, rng = self.params, self._rng(self.t, 6)
        if rng.random() >= self.ward.nurse_rate * (0.7 if day.weekday() >= 5 else 1.0):
            return None
        shown = (0.0, 1.0, 2.0)[z] * (self.config.nurse_masking if p.masking else 1.0) - 0.8 * self._eps
        shown = max(0.0, shown + float(rng.normal(0, 0.5)))
        chances = {
            "calm": _sigmoid(0.6 - 1.1 * shown - 0.8 * big_today),
            "cheerful": _sigmoid(0.2 - 1.3 * shown - 1.5 * fatigue),
            "sad": _sigmoid(-3.2 + 1.3 * shown),
            "tearful": _sigmoid(-4.2 + 1.2 * shown + 0.8 * big_today),
            "anxious": _sigmoid(-3.0 + 0.8 * shown + 1.5 * big_today),
            "withdrawn": _sigmoid(-3.6 + 1.3 * shown + 2.0 * fatigue),  # fatigue looks the same from the door
            "irritable": _sigmoid(-3.4 + 0.8 * shown + 0.15 * pain),
            "agitated": _sigmoid(-4.5 + 0.8 * shown),
            "tired": _sigmoid(-2.2 + 4.0 * fatigue + 0.1 * pain),
        }
        ticked = [name for name, chance in chances.items() if rng.random() < chance]
        affect = tuple(sorted(rng.permutation(ticked)[:3].tolist())) if ticked else ()
        s = 1.0 - 0.6 * shown - 1.2 * fatigue - 0.08 * pain + rng.normal(0, 0.7)
        engagement = ("engaged" if s > 0.2 else "quiet" if s > -0.9 else "refuses") if rng.random() < 0.8 else None
        q = 0.8 - 0.4 * z - 0.12 * pain - 0.3 * isolation + rng.normal(0, 0.7)
        sleep = ("good" if q > 0.2 else "restless" if q > -0.6 else "poor") if rng.random() < 0.6 else None
        eaten = {}
        for meal in WARD_MEALS:
            if meal == "lunch" and big_today and rng.random() < 0.4:
                eaten[meal] = "fasting"
            elif rng.random() < 0.85:
                eaten[meal] = self._eaten(rng, self.ward.appetite + popularity[meal], shown, pain, fatigue)
        return NurseObservation(
            lunch=eaten.get("lunch"), dinner=eaten.get("dinner"), affect=affect, engagement=engagement,
            pain=int(np.clip(round(pain + rng.normal(0, 0.8)), 0, 10)) if rng.random() < 0.7 else None,
            night_sleep=sleep, refused_care=bool(rng.random() < _sigmoid(-4.5 + 0.9 * shown + 0.8 * big_today)),
            asks_psychologist=bool(rng.random() < _sigmoid(-6.0 + 1.9 * shown)),
        )

    def _feelings(self, rng, z: int, big_tomorrow: bool, lonely: bool, fatigue: float) -> tuple[str, ...]:
        pool = {
            "happy": (2.5, 1.4, 0.8), "calm": (1.5, 1.0, 0.6), "proud": (0.8, 0.4, 0.2), "excited": (0.8, 0.4, 0.2),
            "tired": (1.0, 1.3, 1.5), "bored": (0.8, 1.3, 1.1), "sad": (0.4, 1.0, 1.8), "lonely": (0.25, 0.7, 1.3),
            "angry": (0.2, 0.5, 0.9), "scared": (0.3, 0.6, 0.8), "worried": (0.4, 0.8, 1.0),
        }
        names = list(pool)
        weights = np.array([pool[n][z] for n in names], dtype=float)
        weights[names.index("tired")] += 2 * fatigue
        if big_tomorrow:
            weights[names.index("worried")] += 2
            weights[names.index("scared")] += 1
        if lonely:
            weights[names.index("lonely")] += 1.0
        if self.params.masking and z >= FRAGILE:
            weights[names.index("happy")] += 2.5
            weights[names.index("calm")] += 1.5
        k = int(rng.integers(1, 3))
        return tuple(rng.choice(names, size=k, replace=False, p=weights / weights.sum()).tolist())

    def _activity(self, rng, z: int, visited: bool, engaged: float, fatigue: float) -> str:
        linked = [a for g in sorted(self.groups) for a in _ACTIVITY_LINKS.get(g, ())]
        if rng.random() < 0.5 * fatigue:
            return "rest"
        if linked and rng.random() < engaged:
            return str(rng.choice(linked))
        if visited and rng.random() < 0.4:
            return "visit"
        options = [("play", "school", "walk", "crafts", "screen", "rest"),
                   ("play", "screen", "rest", "crafts", "school", "walk"),
                   ("rest", "screen", "play", "screen", "crafts", "rest")][z]
        return str(rng.choice(options))

    def _themes(self, rng, z: int, lonely: bool, engaged: float) -> tuple[str, ...]:
        linked = [t for g in sorted(self.groups) for t in _THEME_LINKS.get(g, ())]
        if linked and rng.random() < engaged:
            return (str(rng.choice(linked)),)
        pool = [("animals", "nature", "family", "superheroes", "friends", "food", "monsters", "home"),
                ("family", "home", "animals", "hospital", "nature", "monsters", "superheroes"),
                ("home", "family", "alone", "hospital", "monsters", "animals")][z]
        first = str(rng.choice(pool))
        if lonely and z >= FRAGILE and first != "alone" and rng.random() < 0.3:
            return (first, "alone")
        return (first,)

    def _media(self, rng, z: int, w: float, isolation: bool, visited: bool, engaged: float) -> MediaLog:
        p = self.params
        linked = [k for g in sorted(self.groups) for k in _MEDIA_LINKS.get(g, ())]
        if linked and rng.random() < engaged:
            kind = str(rng.choice(linked))
        elif p.age <= 9:
            kind = str(rng.choice(["cartoon", "movie", "music", "book"], p=[0.5, 0.25, 0.15, 0.1]))
        else:
            kind = str(rng.choice(["series", "video_game", "music", "movie", "podcast", "book"],
                                  p=[0.3, 0.25, 0.2, 0.15, 0.05, 0.05]))
        if rng.random() < min(p.alone_base + 0.08 * z + 0.15 * isolation - 0.3 * visited, 0.95):
            company = "alone"
        else:
            weights = np.array([0.6 if visited else 0.3, 0.15, 0.1 if visited else 0.25, 0.1, 0.05])
            company = str(rng.choice(["family", "friend", "other_patient", "care_team", "volunteer"],
                                     p=weights / weights.sum()))
        return MediaLog(
            kind=kind, minutes=int(np.clip(rng.gamma(2.0, (35, 40, 48)[z] / 2), 5, 300)), with_whom=company,
            reaction=int(np.clip(round(3.6 + 0.35 * (w + p.bias) + rng.normal(0, 1.0)), 1, 5)),
            is_rewatch=bool(rng.random() < p.rewatch_base + 0.07 * z),
        )

    def _note(self, z: int, big_soon: bool, lonely: bool, visited: bool, pain: float, fatigue: float) -> str:
        p, t = self.params, self.t
        rng = self._rng(t, 3)
        if z == DISTRESS and p.age >= 10 and rng.random() < self.config.crisis_note_rate:
            self.truth.crisis_notes.append(t)
            topics = ["crisis"] if rng.random() < 0.6 else ["sad", "crisis"]
            return generate_note(rng, p.lang, p.age, topics, self.groups)
        tough = pain > 5 or fatigue > 0.6
        weights = [
            {"positive": 4, "neutral": 2.5, "visit": 2 * visited, "interest": 1.5, "bored": 0.8, "homesick": 0.5,
             "worry": 0.3 + 1.5 * big_soon, "pain": 0.3 + 1.5 * tough, "sad": 0.2, "idiom": 0.3},
            {"positive": 1.5, "neutral": 2, "visit": 1.5 * visited, "interest": 0.8, "bored": 1.5, "homesick": 1.2,
             "lonely": 0.8 + 1.2 * lonely, "worry": 0.8 + 1.5 * big_soon, "pain": 0.6 + 1.5 * tough, "sad": 0.8,
             "angry": 0.5, "idiom": 0.2},
            {"neutral": 1.0, "positive": 0.5, "homesick": 1.2, "bored": 0.6, "lonely": 1.2 + 1.2 * lonely,
             "worry": 0.6 + 1.2 * big_soon, "pain": 0.6 + 1.0 * tough, "sad": 2.0, "angry": 0.9,
             "withdrawal": 1.0, "concern": 0.6},
        ][z]
        if p.masking and z >= FRAGILE:
            weights["positive"] = weights.get("positive", 0) * 4 + 1
            weights["neutral"] = weights.get("neutral", 0) * 4
        names = [k for k, v in weights.items() if v > 0]
        probs = np.array([weights[k] for k in names], dtype=float)
        k = 1 if p.age <= 8 or rng.random() < 0.6 else 2
        topics = rng.choice(names, size=min(k, len(names)), replace=False, p=probs / probs.sum()).tolist()
        if "concern" in topics:
            self.truth.concern_notes.append(t)
        return generate_note(rng, p.lang, p.age, topics, self.groups)


def simulate_stay(seed: int, config: SimConfig | None = None, randomize: bool = False) -> ChildSimulator:
    """Simulate a whole stay with no AI alert at all."""
    sim = ChildSimulator(config, seed)
    sim.reset(seed, randomize=randomize)
    while not sim.done:
        sim.step()
    return sim
