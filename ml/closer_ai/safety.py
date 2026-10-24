"""Deterministic safety rules. They run before any model and no model can silence them.

- crisis -> urgent alert: suicidal thoughts, self-harm, a child saying an adult hurts them.
- concern -> priority alert: strong statements such as "personne m'aime" or "j'ai peur de mourir".
- child_request -> priority alert: the child tapped "I'd like to talk to someone".
- care_request -> priority alert: the nurse asked for the psychologist to see the child.

The patterns are a starting point to review with the psychologist. They favour recall:
a false alarm costs a few minutes of a psychologist's time, a miss can cost far more.
"""

from __future__ import annotations

from dataclasses import dataclass

from .contract import DayRecord
from .text import CONCERN, compile_patterns, negated, normalize, strip_idioms

_ADULTS_FR = (
    r"(?:il|elle|ils|elles|on|papa|maman|mon pere|ma mere|mon beau pere|ma belle mere|mon oncle|ma tante|"
    r"quelqu un|un adulte|le monsieur|la dame|mon parrain|ma marraine|le voisin|la voisine|mon papi|ma mamie|"
    r"la nounou|mon cousin|ma cousine)"
)
_ADULTS_EN = (
    r"(?:he|she|they|someone|somebody|mom|mum|dad|my (?:dad|mom|mum|stepdad|stepmom|uncle|aunt|grandpa|grandma|"
    r"babysitter|cousin)|a man|a grown ?up|an adult)"
)

CRISIS = {
    "suicidal_thoughts": compile_patterns([
        r"[ae]nvie? de mour+ire?", r"(?:veu[xt]?|voudrais|voudrai|aimerais|aimerai) mour+ire?",
        r"(?:veu[xt]?|voudrais|aimerais|envie de|pense a|penser a|vais) (?:me tuer|me suicider|mettre fin a (?:mes jours|ma vie))",
        r"en finir avec (?:la vie|tout|moi)", r"(?:veu[xt]?|voudrais) (?:juste )?en finir$", r"su?i?[cs]+id\w*",
        r"(?:veu[xt]?|ai) plus (?:envie de )?vivre(?! (?:ici|a l hopital|dans|la))",
        r"(?:plus|pas) envie de vivre(?! (?:ca|cela|ce|cette|ces|comme))", r"(?:veu[xt]?|voudrais) (?:plus|pas|ne plus) exister",
        r"mieux (?:pour tout le monde )?(?:sans moi|si j ?etais (?:pas la|mort|morte|plus la))",
        r"(?:m endormir|dormir) (?:et )?(?:ne )?plus (?:jamais )?me reveiller", r"(?:m endormir|dormir) pour toujours",
        r"lettre d adieu",
        r"(?:want|wanna|wish i could|going to|gonna) (?:to )?(?:die|kill myself|end it all|end my life)",
        r"wish i (?:was|were) dead", r"kill(?:ing)? myself", r"end (?:it all|my life)",
        r"do not want to (?:live|be alive|exist)(?! (?:here|like this|in this))", r"better off (?:without me|dead)",
        r"(?:go to sleep|fall asleep|sleep) and never wake up", r"never wake up again",
    ]),
    "self_harm": compile_patterns([
        r"(?:veu[xt]?|voudrais|envie de|pense a|vais) me faire du mal",
        r"(?:veu[xt]?|voudrais|vais|envie de|pense a) me (?:couper|scarifier|bruler|griffer|mutiler|taillader|mordre|taper)",
        r"je me (?:coupe|scarifie|brule|griffe|mutile|taillade|fais du mal|tape la tete)", r"scarif\w*", r"automutil\w*",
        r"(?:want|wanna|going|gonna|try|tried|trying|think about|thinking about|thought about)(?: to)? "
        r"(?:hurting|hurt|cutting|cut|burning|burn|harming|harm) myself",
        r"(?:hurt|cut|burn) myself on purpose", r"cutting myself", r"self ?harm\w*",
    ]),
    "abuse": compile_patterns([
        rf"{_ADULTS_FR} (?:me|m) (?:a )?(?:frappe\w*|tape(?! sur)\w*|bat|battu\w*|fait des choses)",
        rf"{_ADULTS_FR} (?:me|m) (?:a )?touche\w* (?:la ou|en bas|mes parties|partout|sous (?:mes|ma|mon) \w+|mon zizi|ma zezette|mon corps|mes fesses)",
        r"attouchement\w*", r"on me fait du mal(?! (?:avec|quand|pendant) (?:les|la|le|mes|ma|mon) )",
        rf"{_ADULTS_EN} (?:hits|hit|beats|beat|kicks|kicked|slaps|slapped|hurts|hurt) me",
        r"touch(?:es|ed)? me (?:there|down there|in my private|under my)", r"(?:is|was) touching me (?:there|down there)",
        r"private parts",
    ]),
}


@dataclass(frozen=True)
class SafetyFlag:
    level: str  # "crisis" | "concern" | "child_request" | "care_request"
    category: str
    excerpt: str


# Alert raised for each level: (ai_alert_source, ai_alert_priority).
ALERT_FOR_LEVEL = {
    "crisis": ("safety_rule", "urgent"),
    "concern": ("safety_rule", "priority"),
    "child_request": ("child_request", "priority"),
    "care_request": ("nurse_request", "priority"),
}


def check_text(text: str | None) -> list[SafetyFlag]:
    if not text:
        return []
    norm = strip_idioms(normalize(text))
    flags = []
    for category, patterns in CRISIS.items():
        if any(not negated(norm, m.start()) for rx in patterns for m in rx.finditer(norm)):
            flags.append(SafetyFlag("crisis", category, text))
    if not flags and any(not negated(norm, m.start()) for rx in CONCERN for m in rx.finditer(norm)):
        flags.append(SafetyFlag("concern", "strong_statement", text))
    return flags


def check_day(record: DayRecord) -> list[SafetyFlag]:
    """Safety flags for one day: the check-in note, shared drawing titles, the nurse's note and both requests."""
    flags = check_text(record.note)
    for drawing in record.shared_drawings:
        flags += check_text(drawing.title)
    if record.wants_to_talk:
        flags.append(SafetyFlag("child_request", "wants_to_talk", ""))
    if record.nurse is not None:
        flags += check_text(record.nurse.note)
        if record.nurse.asks_psychologist:
            flags.append(SafetyFlag("care_request", "nurse_request", ""))
    return flags


def most_severe(flags: list[SafetyFlag]) -> SafetyFlag | None:
    order = {"crisis": 0, "concern": 1, "child_request": 2, "care_request": 3}
    return min(flags, key=lambda f: order[f.level], default=None)
