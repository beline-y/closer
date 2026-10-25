"""Lexicon-based reading of check-in notes, in French and English.

A deliberately simple, offline baseline: no note leaves the server. It turns a
280-character note into a few counts (sadness, loneliness, fear...) for the assessor.
It is meant to be reviewed by the psychologist and later replaced or complemented by a
trained model behind the same `analyze_note` interface.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

_FILLERS = {"du", "tout", "vraiment", "trop", "si", "tres", "really", "very", "so", "that", "even", "feel", "me"}
_NEGATORS = {"pas", "plus", "jamais", "aucun", "aucune", "rien", "not", "never", "no", "nothing"}
_PLUS_INTENSIFIERS = {"encore", "en", "le", "la", "de"}

SAD_EMOJI = set("😢😭😞😔☹🙁😿💔😥😓")
HAPPY_EMOJI = set("😀😃😄😁😆😊🙂😍🥰😎🤩😂🤣❤💛💙💚💜🧡♥👍🎉🥳")
ANGRY_EMOJI = set("😡😠🤬")
FEAR_EMOJI = set("😨😰😱😟😧😦")


def normalize(text: str) -> str:
    """Lowercase, strip accents, expand English negations, squash letter repeats.

    "J'ai TROOOP peur 😱" -> "j ai trop peur"; "I don't" -> "i do not".
    """
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.replace("’", "'")
    t = re.sub(r"n't\b", " not", t)
    t = re.sub(r"(\w)\1{2,}", r"\1", t)  # "tristeeee" -> "triste"
    t = re.sub(r"[^a-z0-9' ]+", " ", t)
    t = t.replace("'", " ")
    t = re.sub(r"\b(do|ca|did|is|was|does|wo|are|have|could|would|should)nt\b", r"\1 not", t)
    t = re.sub(r"\bim\b", "i m", t)
    return re.sub(r"\s+", " ", t).strip()


def compile_patterns(patterns: list[str]) -> list[re.Pattern[str]]:
    return [re.compile(rf"\b(?:{p})\b") for p in patterns]


# Everyday expressions with alarming words: "mort de rire", "this level is killing me".
# They are blanked out before looking for crisis or concern statements.
IDIOMS = compile_patterns([
    r"morte?s? de (?:rire|fatigue|faim|froid|peur|honte|soif)", r"mour+ire? de (?:rire|faim|ennui|froid|chaud|honte|fatigue|soif|peur)",
    r"mdr", r"ca me tue", r"(?:ce|ca|cet|le|la) (?:jeu|film|truc|niveau|prof|devoir|exercice)s? me tue",
    r"(?:va|vont|vas) me tuer", r"tuer le temps", r"je (?:vais|va) (?:le|la|les|te|vous) tuer", r"tape sur les nerfs",
    r"dying (?:of|from) (?:laughter|laughing|boredom|embarrassment)", r"die (?:of|from) (?:laughter|laughing|boredom|embarrassment)",
    r"dying laughing", r"die laughing", r"(?:lol|lmao) i m dead", r"i m dead (?:lol|lmao|xd)",
    r"(?:this|that|it|the game|this game|this level|homework|school) (?:is|was) killing me", r"killing it", r"killed it",
    r"dying to (?:see|go|play|watch|eat|meet|get|know)", r"to die for", r"(?:is going to|will|gonna) kill me",
    r"suicide squad",
])


def strip_idioms(norm: str) -> str:
    for rx in IDIOMS:
        norm = rx.sub(" ", norm)
    return re.sub(r"\s+", " ", norm).strip()


def negated(norm: str, start: int) -> bool:
    """True when one of the two meaningful words before `start` is a negation."""
    words = [w for w in norm[:start].split() if w not in _FILLERS]
    window = words[-3:]
    for i in range(max(0, len(window) - 2), len(window)):
        word = window[i]
        if word not in _NEGATORS:
            continue
        if word == "plus" and i > 0 and window[i - 1] in _PLUS_INTENSIFIERS:
            continue  # "encore plus triste" intensifies
        return True
    return False


def count_matches(patterns: list[re.Pattern[str]], norm: str) -> int:
    return sum(1 for rx in patterns for m in rx.finditer(norm) if not negated(norm, m.start()))


_LEXICON: dict[str, list[str]] = {
    "sad": [
        r"tristes?", r"tristesse", r"pleur\w*", r"chagrin", r"malheureu\w*", r"deprim\w*", r"cafard",
        r"ca va pas(?! mal)", r"pas bien", r"journee (?:nulle|pourrie|horrible)", r"horrible", r"marre",
        r"ras le bol", r"nulle?s?", r"degoute\w*", r"seum", r"bof", r"moral (?:a zero|bas)",
        r"sad+", r"cry\w*", r"cried", r"unhappy", r"upset", r"miserable", r"depress\w*",
        r"(?:feel|feeling|felt) (?:down|low|bad|awful|terrible)", r"not (?:ok|okay|good|well)", r"awful",
        r"terrible", r"fed up", r"sick of", r"worst (?:day|week)", r"meh", r"bad day",
    ],
    "lonely": [
        r"(?:tout|toute) seule?s?", r"seule?s?",
        r"(?<!une )(?<!la )personne (?:n )?(?:est|vient|viens|venu|venue|la|m appelle|m ecrit|me parle|joue)",
        r"me manque\w*",
        r"manque (?:de )?(?:maman|papa|ma famille|mon frere|ma soeur|mes copains|mes copines|mes amis|mon chien|mon chat|la maison|ma maison|mamie|papi)",
        r"(?:rentrer|retourner) (?:a la maison|chez moi)", r"abandonne\w*", r"m oublie\w*", r"isole\w*",
        r"alone", r"lonely", r"lonley", r"by myself",
        r"no ?(?:one|body) (?:came|comes|visits|visited|calls|called|texts|texted|plays|cares)",
        r"miss (?:my )?(?:mom|mum|mommy|dad|daddy|home|family|friends|brother|sister|dog|cat|you|them|school|room)",
        r"(?:want to|wanna) go home", r"homesick", r"forgot about me", r"forgotten", r"isolat\w*",
    ],
    "fear": [
        r"peur", r"angoiss\w*", r"stress\w*", r"inquiet\w*", r"panique\w*", r"effray\w*", r"terrifi\w*",
        r"flippe\w*", r"les jetons", r"cauchemar\w*", r"redout\w*",
        r"scared", r"scary", r"afraid", r"fear", r"fears", r"anxi\w*", r"worr(?:y|ied|ies|ying)", r"nervous",
        r"panic\w*", r"terrified", r"freak\w* out", r"nightmares?",
    ],
    "anger": [
        r"colere", r"enerve\w*", r"furieu\w*", r"detest\w*", r"hais", r"injuste", r"rage", r"saoule", r"soule",
        r"insupportable", r"fache\w*",
        r"angry", r"mad", r"hate(?! (?:de|d|que|qu)\b)\w*", r"furious", r"annoy\w*", r"unfair", r"pissed",
    ],
    "bored": [
        r"ennui\w*", r"ennuy\w*", r"rien a faire", r"c ?est (?:trop |tellement )?long", r"tourne en rond",
        r"bored", r"boring", r"nothing to do",
    ],
    "pain": [
        r"mal (?:au|a la|aux|a l|partout)", r"j ?ai mal", r"douleurs?", r"fatigu\w*", r"epuise\w*", r"vomi\w*",
        r"nause\w*", r"(?:ca|me) (?:fait|font) mal",
        r"hurts?", r"(?<!du )(?<!un )(?<!de )(?<!le )pain(?:s|ful)?", r"(?:head|stomach|tummy|back|ear|tooth)?aches?",
        r"sick", r"tired", r"exhausted", r"threw up", r"throw up", r"puk\w*",
    ],
    "withdrawal": [
        r"envie de rien", r"plus envie de (?:jouer|dessiner|parler|manger|rien faire|voir personne|sortir)",
        r"rien ne me fait (?:plaisir|rire)", r"veu[xt]? (?:voir|parler a) personne", r"laisse[z]? moi tranquille",
        r"m en (?:fiche|fous) de tout",
        r"do not (?:want|wanna|feel like) (?:to )?(?:do|play|talk|draw|eat|see) (?:anything|anyone|anybody|nothing)",
        r"nothing is fun", r"nothing (?:makes me|feels) (?:happy|good|fun)", r"leave me alone",
        r"do not care (?:about anything|anymore)",
    ],
    "positive": [
        r"contente?s?", r"heureu\w*", r"trop bien", r"super(?! (?:triste|nul|nulle|long|mal|dur))", r"genial\w*",
        r"co+l", r"rigole\w*", r"rire", r"mdr", r"morte? de rire", r"kiff\w*", r"j ?adore", r"joie", r"fier\w*",
        r"bonne journee", r"ca va bien", r"tout va bien", r"c ?etait (?:bien|chouette|top|marrant|drole)", r"top",
        r"youpi", r"hate de", r"amuse\w*", r"chouette",
        r"happy", r"great", r"awesome", r"fun", r"funny", r"good day", r"loved? (?:it|this|that)", r"laugh\w*",
        r"lol", r"proud", r"excited", r"yay", r"nice", r"amazing", r"best day", r"ca not wait", r"enjoy\w*",
    ],
}

# Strong statements about oneself or the future. Counted as a feature here; the safety
# layer also raises a priority alert for them (see safety.py).
CONCERN = compile_patterns([
    r"(?<!une )personne (?:ne )?m aime", r"tout le monde s en (?:fiche|fout|moque) de moi",
    r"je (?:ne )?sers? a rien", r"peur de mour+ire?", r"je (?:vais|va) mour+ire?",
    r"veu[xt]? (?:pas|plus) mour+ire?", r"(?:veux|voudrais|aimerais|envie de) disparaitre",
    r"guerirai jamais", r"(?:vais|va) jamais guerir", r"ca (?:n )?ira jamais mieux",
    r"(?:suis|me sens) (?:un )?(?:fardeau|poids)", r"marre de (?:la )?vie", r"marre de vivre",
    r"peur de rentrer (?:a la maison|chez moi)",
    r"no ?(?:one|body) (?:loves|cares about) me", r"i m (?:useless|worthless|a burden)",
    r"(?:scared|afraid) (?:of|to) (?:die|dying)", r"i m going to die", r"do not want to die",
    r"(?:want|wish i could) (?:to )?disappear", r"never (?:get|getting) better", r"scared to go home",
])

LEXICON = {category: compile_patterns(patterns) for category, patterns in _LEXICON.items()}


@dataclass(frozen=True)
class NoteSignals:
    sad: int = 0
    lonely: int = 0
    fear: int = 0
    anger: int = 0
    bored: int = 0
    pain: int = 0
    withdrawal: int = 0
    positive: int = 0
    concern: int = 0
    length: int = 0

    @property
    def negative(self) -> int:
        return self.sad + self.lonely + self.fear + self.anger + self.withdrawal + self.concern


def analyze_note(text: str | None) -> NoteSignals:
    if not text:
        return NoteSignals()
    raw = set(text)
    norm = normalize(text)
    counts = {category: count_matches(patterns, norm) for category, patterns in LEXICON.items()}
    counts["sad"] += len(raw & SAD_EMOJI)
    counts["positive"] += len(raw & HAPPY_EMOJI)
    counts["anger"] += len(raw & ANGRY_EMOJI)
    counts["fear"] += len(raw & FEAR_EMOJI)
    concern = count_matches(CONCERN, strip_idioms(norm))
    return NoteSignals(**counts, concern=concern, length=len(text))
