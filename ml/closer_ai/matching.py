"""Volunteer matching: which volunteer each child might most enjoy meeting this week.

Only the care team sees the plan. A suggestion puts a volunteer's card in front of a child, who
decides whether to ask for a visit, and volunteers never learn who a child is (docs/SPEC.md).
Three steps, each one shown to the care team:

1. Affinity: how a child's interests meet what a volunteer does and loves. Claude reads the
   child's age and interests (never a name, a check-in or anything medical) next to each
   volunteer's public story, and names what they share and a first question the child could ask.
   Without Claude, a small topic lexicon does the same, more coarsely.
2. Learning: every visit the care team rates (went well, okay, hard) updates a Bayesian linear
   model of how visits go, from the pair's features plus one effect per volunteer. Pairs are
   ranked by an upper confidence bound (LinUCB): a volunteer with few rated visits keeps the
   benefit of the doubt until visits say otherwise, and the plan is the same on every reload.
3. Assignment: each volunteer offers a few visits a week. Children who are most alone (no family
   linked, the wellbeing assessment, no recent volunteer visit) weigh more, and the Hungarian
   algorithm shares out the free visits for the highest need-weighted chance of a good visit.
   Requests in progress and this week's suggestions already hold their volunteer's visits.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
from scipy.optimize import linear_sum_assignment

from .contract import CONTACT_PENDING, MATCH_FITS, VISIT_OUTCOMES

FIT_AFFINITY = {"strong": 1.0, "good": 0.66, "some": 0.33, "none": 0.0}
REWARD = {"great": 1.0, "okay": 0.5, "hard": 0.0}
WEEK = timedelta(days=7)  # a suggestion, or an accepted request, holds its volunteer's visit for a week
COOLDOWN = timedelta(days=30)  # how long a request stays in view, and a declined pair stays apart
RECENT = timedelta(days=14)  # a volunteer visit within two weeks counts as recent

PAIR_FEATURES = ("bias", "affinity", "shared", "age_fit", "met_before")
# Before any rated visit, a visit goes well mostly when the child and the volunteer share an interest.
PRIOR_MEAN = np.array([0.35, 0.45, 0.10, 0.10, 0.20])
PRIOR_SD = np.array([0.10, 0.15, 0.10, 0.10, 0.15])
VOLUNTEER_SD = 0.15  # how much better or worse a volunteer's visits may go than their story suggests
NOISE_SD = 0.30  # one rated visit says little on its own
KAPPA = 0.5  # optimism: the weight of the uncertainty in the ranking
WORTH_SUGGESTING = 0.5  # a pair ranked below this is not worth a visit, even when a volunteer is free


@dataclass(frozen=True)
class Volunteer:
    id: str
    first_name: str
    job: str
    story: str = ""
    passions: tuple[str, ...] = ()
    dreams: str = ""
    fun_fact: str = ""
    languages: tuple[str, ...] = ()
    slots: int = 1  # visits offered a week
    ages: tuple[int, int] = (5, 17)  # the ages this volunteer is used to

    def profile(self) -> dict:
        """The public story, as children see it in the app: all that Claude reads about a volunteer."""
        return {"id": self.id, "first_name": self.first_name, "job": self.job, "story": self.story,
                "passions": list(self.passions), "dreams": self.dreams, "fun_fact": self.fun_fact,
                "languages": list(self.languages)}


@dataclass(frozen=True)
class Child:
    id: str
    nickname: str
    age: int
    interests: tuple[str, ...] = ()
    has_family: bool = True
    p_stable: float | None = None  # the wellbeing assessment's latest reading, when there is one
    level: str | None = None

    def profile(self) -> dict:
        """All that Claude reads about a child: no name, no check-in, nothing medical."""
        return {"age": self.age, "interests": sorted({i.strip().lower() for i in self.interests if i.strip()})}


@dataclass(frozen=True)
class Affinity:
    fit: str  # one of MATCH_FITS
    shared: tuple[str, ...]  # bridges such as "the ocean → dolphins"
    reason: str  # one sentence for the care team
    starter: str  # a first question the child could ask
    source: str  # "claude" or "rules"


@dataclass(frozen=True)
class Request:
    """A contact request from the app: started by the child, approved by the care team and the guardian."""

    patient_id: str
    volunteer_id: str
    status: str
    local_date: date


@dataclass(frozen=True)
class Suggestion:
    patient_id: str
    volunteer_id: str
    local_date: date


@dataclass(frozen=True)
class Visit:
    """A visit the care team rated: what the matching learns from."""

    patient_id: str
    volunteer_id: str
    local_date: date
    outcome: str  # one of VISIT_OUTCOMES
    features: dict  # the pair's features when the visit was rated


# -- affinity without Claude ------------------------------------------------------------------------
# A word ending in * matches every word it starts.
TOPICS = {
    "the ocean": "ocean* sea seas dolphin* whale* shark* coral* reef* diving dive* underwater marine fish* beach* snorkel*",
    "dinosaurs": "dinosaur* fossil* paleontolog* jurassic",
    "space": "space astronom* star stars planet* rocket* astronaut* moon* galax*",
    "planes": "plane planes flying fly flies flight* pilot* airplane* aircraft airline*",
    "music": "music* guitar* piano* sing singing singer* song* drum* violin* band album*",
    "animals": "cat cats kitten* dog dogs pupp* animal* horse* pet pets vet vets veterinar* fox wildlife",
    "trains": "train trains railway* locomotive* metro",
    "building": "lego build builds building builder* engineer* robot* brick*",
    "sport": "soccer football basketball sport* swim* coach* juggl* tournament*",
    "drawing": "draw drawing drawings drew paint* art artist* comic* illustrat* craft* crayon*",
    "cooking": "cook* baking bake* cake* chef* recipe*",
    "stories": "book books reading story stories writer* writing theatre theater magic*",
    "games": "game games chess puzzle*",
}


def _topics(text: str) -> set[str]:
    words = set(re.findall(r"[a-z]+", text.lower()))
    return {topic for topic, keys in TOPICS.items()
            if any(any(w.startswith(k[:-1]) for w in words) if k.endswith("*") else k in words for k in keys.split())}


def rule_affinity(child: Child, volunteer: Volunteer) -> Affinity:
    """The lexicon's view of a pair: two points for an interest the volunteer lives through their job or
    passions, one for an interest only their story mentions."""
    around = _topics(" ".join((volunteer.story, volunteer.dreams, volunteer.fun_fact)))
    points, shared, starters = 0, [], []
    for interest in child.profile()["interests"]:
        topics = _topics(interest)
        passions = [p for p in volunteer.passions if _topics(p) & topics]
        if passions or _topics(volunteer.job) & topics:
            points += 2
            shared.append(f"{interest} → {', '.join(x.lower() for x in (passions or [volunteer.job])[:2])}")
            starters.append(f"What's the best thing about {passions[0].lower()}?" if passions
                            else f"What is a day as a {volunteer.job.lower()} like?")
        elif topics & around:
            points += 1
            shared.append(f"{interest} → {volunteer.first_name}'s story")
    fit = "strong" if points >= 3 else "good" if points == 2 else "some" if points == 1 else "none"
    if fit == "none":
        return Affinity("none", (), f"No shared interest in {volunteer.first_name}'s story.", "", "rules")
    starter = starters[0] if starters else f"What is your job like, {volunteer.first_name}?"
    return Affinity(fit, tuple(shared[:3]), f"{volunteer.first_name}, {volunteer.job.lower()}: {'; '.join(shared[:3])}.",
                    starter, "rules")


# -- learning from rated visits ---------------------------------------------------------------------
def pair_features(child: Child, volunteer: Volunteer, affinity: Affinity, visits: list[Visit], before: date) -> dict:
    """What the learner sees of a pair, from what was known before `before`."""
    earlier = [REWARD[v.outcome] for v in visits
               if v.patient_id == child.id and v.volunteer_id == volunteer.id and v.local_date < before]
    low, high = volunteer.ages
    return {
        "bias": 1.0,
        "affinity": FIT_AFFINITY[affinity.fit],
        "shared": min(len(affinity.shared), 3) / 3,
        "age_fit": 1.0 if low <= child.age <= high else 0.0,
        "met_before": round(2 * float(np.mean(earlier)) - 1, 3) if earlier else 0.0,  # -1 hard, +1 went well
    }


def _vector(features: dict, volunteer_id: str, ids: tuple[str, ...]) -> np.ndarray:
    one_hot = np.zeros(len(ids))
    if volunteer_id in ids:  # a volunteer who left still teaches the pair weights
        one_hot[ids.index(volunteer_id)] = 1.0
    return np.concatenate([[float(features.get(name, 0.0)) for name in PAIR_FEATURES], one_hot])


@dataclass
class Learner:
    """How visits go: a Bayesian linear model of the rated outcome (1 went well, 0.5 okay, 0 hard).

    The pair weights start from PRIOR_MEAN and every volunteer gets an effect centered on zero: what
    their visits add beyond what their story predicts. Conjugate Gaussian updates, so refitting from
    every rated visit on each request costs microseconds.
    """

    volunteer_ids: tuple[str, ...]
    mean: np.ndarray
    cov: np.ndarray
    visits: int

    @classmethod
    def fit(cls, volunteer_ids, visits: list[Visit]) -> Learner:
        ids = tuple(volunteer_ids)
        variance = np.concatenate([PRIOR_SD, np.full(len(ids), VOLUNTEER_SD)]) ** 2
        precision = np.diag(1 / variance)
        moment = np.concatenate([PRIOR_MEAN, np.zeros(len(ids))]) / variance
        for visit in visits:
            x = _vector(visit.features, visit.volunteer_id, ids)
            precision += np.outer(x, x) / NOISE_SD**2
            moment += x * REWARD[visit.outcome] / NOISE_SD**2
        cov = np.linalg.inv(precision)
        return cls(ids, cov @ moment, cov, len(visits))

    def predict(self, features: dict, volunteer_id: str) -> tuple[float, float]:
        """Expected outcome of a visit, and its standard deviation."""
        x = _vector(features, volunteer_id, self.volunteer_ids)
        return float(x @ self.mean), float(np.sqrt(max(x @ self.cov @ x, 0.0)))

    def effect(self, volunteer_id: str) -> float:
        return float(self.mean[len(PAIR_FEATURES) + self.volunteer_ids.index(volunteer_id)])


# -- who needs a visit most, and who gets which volunteer ---------------------------------------------
def _in_progress(r: Request, today: date) -> bool:
    age = today - r.local_date
    return (r.status in CONTACT_PENDING and age < COOLDOWN) or (r.status == "accepted" and age < WEEK)


def need(child: Child, requests: list[Request], visits: list[Visit], today: date) -> tuple[float, list[str]]:
    """How much a volunteer visit could matter to this child this week, and why: the most isolated first."""
    weight, reasons = 1.0, []
    if not child.has_family:
        weight += 1.0
        reasons.append("no_family")
    if child.p_stable is not None:
        weight += 1.0 - child.p_stable
        if child.level in ("fragile", "distress"):
            reasons.append(child.level)
    mine = [r for r in requests if r.patient_id == child.id]
    met = [r.local_date for r in mine if r.status == "accepted"] + [v.local_date for v in visits if v.patient_id == child.id]
    if not any(today - day < RECENT for day in met):
        weight += 0.3
        reasons.append("no_recent_visit")
    if any(r.status in CONTACT_PENDING and _in_progress(r, today) for r in mine):
        weight -= 0.5
        reasons.append("request_in_progress")
    return weight, reasons


def assign(children: list[str], columns: list[str], value: dict[tuple[str, str], float],
           floor: dict[str, float]) -> dict[str, str | None]:
    """At most one volunteer visit (a column, one per free visit) per child, for the highest total value.

    value[(child, volunteer)] is missing when the pair may not be suggested. Each child also has a column
    of its own worth floor[child], so a weak match is left out rather than forced.
    """
    if not children:
        return {}
    blocked = 1e9
    cost = np.full((len(children), len(columns) + len(children)), blocked)
    for i, child in enumerate(children):
        for j, volunteer in enumerate(columns):
            if (child, volunteer) in value:
                cost[i, j] = -value[(child, volunteer)]
        cost[i, len(columns) + i] = -floor[child]
    rows, cols = linear_sum_assignment(cost)
    return {children[i]: columns[j] if j < len(columns) else None for i, j in zip(rows, cols)}


def _public(option: dict) -> dict:
    return {k: v for k, v in option.items() if k != "score"}  # the ranking score is internal


def plan_week(children: list[Child], volunteers: list[Volunteer], affinities: dict[tuple[str, str], Affinity],
              requests: list[Request], suggestions: list[Suggestion], visits: list[Visit], today: date) -> dict:
    """This week's suggestion for every child, with the alternatives, the requests in progress and the
    visits waiting for a rating. `suggestions` come oldest first: a child's latest one this week stands."""
    learner = Learner.fit([v.id for v in volunteers], visits)
    busy = {(r.patient_id, r.volunteer_id) for r in requests if _in_progress(r, today)}
    declined = {(r.patient_id, r.volunteer_id) for r in requests
                if r.status == "declined" and today - r.local_date < COOLDOWN}
    settled = {s.patient_id: s for s in suggestions if timedelta(0) <= today - s.local_date < WEEK}
    held = Counter(v for _, v in busy | {(s.patient_id, s.volunteer_id) for s in settled.values()})
    free = {v.id: max(0, v.slots - held[v.id]) for v in volunteers}

    weights, reasons = {}, {}
    for c in children:
        weights[c.id], reasons[c.id] = need(c, requests, visits, today)

    options = {}
    for c in children:
        for v in volunteers:
            a = affinities[(c.id, v.id)]
            x = pair_features(c, v, a, visits, today + timedelta(days=1))
            mean, sd = learner.predict(x, v.id)
            status = ("in_progress" if (c.id, v.id) in busy else "declined" if (c.id, v.id) in declined
                      else "nothing_in_common" if a.fit == "none" else None)
            options[(c.id, v.id)] = {
                "volunteer_id": v.id, "fit": a.fit, "shared": list(a.shared), "reason": a.reason,
                "starter": a.starter, "source": a.source, "expected": round(min(max(mean, 0.0), 1.0), 3),
                "met_before": x["met_before"], "status": status, "score": mean + KAPPA * sd,
            }

    open_children = [c.id for c in children if c.id not in settled]
    value = {key: weights[key[0]] * o["score"] for key, o in options.items()
             if key[0] not in settled and o["status"] is None}
    chosen = assign(open_children, [v.id for v in volunteers for _ in range(free[v.id])], value,
                    {cid: weights[cid] * WORTH_SUGGESTING for cid in open_children})
    left = Counter(free)
    left.subtract(vid for vid in chosen.values() if vid)

    rated = {(v.patient_id, v.volunteer_id, v.local_date) for v in visits}
    rows = []
    for c in sorted(children, key=lambda c: -weights[c.id]):
        mine = [o for (cid, _), o in options.items() if cid == c.id]
        if c.id in settled and (c.id, settled[c.id].volunteer_id) in options:
            s = settled[c.id]
            suggestion = _public(options[(c.id, s.volunteer_id)]) | {"suggested_on": s.local_date.isoformat()}
        elif chosen.get(c.id):
            suggestion = _public(options[(c.id, chosen[c.id])]) | {"suggested_on": None}
        else:
            suggestion = None
        worth = [o for o in mine if o["status"] is None and o["score"] >= WORTH_SUGGESTING]
        others = sorted((o for o in mine if o["status"] is None and o["volunteer_id"] != (suggestion or {}).get("volunteer_id")),
                        key=lambda o: -o["score"])[:3]
        recent = [r for r in requests if r.patient_id == c.id and today - r.local_date < COOLDOWN and r.status != "cancelled"]
        rows.append({
            "patient_id": c.id, "nickname": c.nickname, "age": c.age, "interests": list(c.interests),
            "level": c.level, "need": round(weights[c.id], 2), "reasons": reasons[c.id],
            "suggestion": suggestion,
            "unmatched": None if suggestion else "no_free_volunteer" if worth else "nothing_in_common",
            "options": [_public(o) | {"status": None if left[o["volunteer_id"]] > 0 else "full"} for o in others],
            "requests": [{"volunteer_id": r.volunteer_id, "status": r.status, "local_date": r.local_date.isoformat()}
                         for r in sorted(recent, key=lambda r: r.local_date, reverse=True)],
            "to_rate": [{"volunteer_id": r.volunteer_id, "local_date": r.local_date.isoformat()} for r in recent
                        if r.status == "accepted" and r.local_date < today
                        and (r.patient_id, r.volunteer_id, r.local_date) not in rated],
            "rated": [{"volunteer_id": v.volunteer_id, "local_date": v.local_date.isoformat(), "outcome": v.outcome}
                      for v in visits if v.patient_id == c.id and today - v.local_date < COOLDOWN],
        })

    proposed = Counter(vid for vid in chosen.values() if vid)
    return {
        "today": today.isoformat(),
        "children": rows,
        "volunteers": [{
            "volunteer_id": v.id, "slots": v.slots, "held": held[v.id], "proposed": proposed[v.id],
            "rated": sum(x.volunteer_id == v.id for x in visits),
            "went_well": sum(x.volunteer_id == v.id and x.outcome == "great" for x in visits),
            "effect": round(learner.effect(v.id), 3),
        } for v in volunteers],
        "rated_visits": len(visits),
        "claude_pairs": sum(a.source == "claude" for a in affinities.values()),
        "pairs": len(affinities),
    }


# -- does the learning pay off? ---------------------------------------------------------------------
def simulate(weeks: int = 16, n_children: int = 10, n_volunteers: int = 8, learn: bool = True, seed: int = 0) -> float:
    """Mean true chance that a suggested visit goes well over the second half of the run, on a simulated
    ward where every volunteer is better or worse than their story suggests: a hidden effect that only
    rated visits can reveal. learn=False ranks by affinity alone, as on the very first week."""
    rng = np.random.default_rng(seed)
    volunteers = [Volunteer(f"v{i}", f"V{i}", "job", slots=2) for i in range(n_volunteers)]
    hidden = {v.id: rng.normal(0.0, 0.2) for v in volunteers}
    children = [Child(f"c{j}", f"C{j}", int(rng.integers(5, 18)), has_family=bool(rng.random() < 0.6))
                for j in range(n_children)]
    shared = {"strong": 2, "good": 1, "some": 1, "none": 0}
    affinities = {}
    for c in children:
        for v in volunteers:
            fit = str(rng.choice(MATCH_FITS, p=[0.2, 0.3, 0.3, 0.2]))
            affinities[(c.id, v.id)] = Affinity(fit, ("x",) * shared[fit], "", "", "rules")
    by_id = {c.id: c for c in children} | {v.id: v for v in volunteers}
    visits, achieved = [], []
    for week in range(weeks):
        today = date(2026, 1, 5) + timedelta(weeks=week)
        plan = plan_week(children, volunteers, affinities, [], [], visits if learn else [], today)
        for row in plan["children"]:
            if row["suggestion"] is None:
                continue
            c, v = by_id[row["patient_id"]], by_id[row["suggestion"]["volunteer_id"]]
            p = float(np.clip(0.3 + 0.45 * FIT_AFFINITY[affinities[(c.id, v.id)].fit] + hidden[v.id], 0.02, 0.98))
            if week >= weeks // 2:
                achieved.append(p)
            draw = rng.random()
            outcome = VISIT_OUTCOMES[0] if draw < p else VISIT_OUTCOMES[1] if draw < p + (1 - p) / 2 else VISIT_OUTCOMES[2]
            visits.append(Visit(c.id, v.id, today, outcome, pair_features(c, v, affinities[(c.id, v.id)], visits, today)))
    return float(np.mean(achieved))
