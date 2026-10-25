"""Synthetic check-in notes for fictional children, in French and English.

Template-based on purpose: it runs offline and its output is easy to audit. Because the
same person wrote these templates and the lexicon in text.py, scores on synthetic notes
overestimate how well the lexicon reads real children. See ml/README.md, "Limits".
"""

from __future__ import annotations

import numpy as np

TOPICS = (
    "positive", "neutral", "visit", "interest", "bored", "homesick", "lonely", "worry",
    "pain", "sad", "angry", "withdrawal", "concern", "crisis", "idiom",
)

_FR = {
    "positive": [
        "trop bien aujourd'hui", "c'était une bonne journée", "j'ai rigolé avec l'infirmière", "je suis content",
        "je suis contente", "on a joué aux cartes c'était cool", "j'ai gagné au uno !", "les clowns sont venus trop drôle",
        "j'ai bien mangé des frites", "je suis fier de moi j'ai pas pleuré pour la prise de sang", "super journée",
    ],
    "neutral": [
        "ça va", "ça va un peu fatigué", "rien de spécial", "j'ai fait mes soins", "il pleut", "normal",
        "ça va tranquille", "j'ai regardé la télé", "un peu fatigué mais ça va", "j'ai dormi l'après midi",
    ],
    "visit": [
        "{visitor} est venu me voir", "{visitor} est venue !", "{visitor} m'a apporté des bonbons",
        "trop content {visitor} était là", "on a fait un puzzle avec {visitor}",
    ],
    "interest": [
        "j'ai fait {thing}", "j'ai trop aimé {thing}", "aujourd'hui {thing} trop bien", "j'ai passé l'après-midi à {thing}",
    ],
    "bored": [
        "je m'ennuie", "je m'ennuie trop ici", "c'est long", "rien à faire", "je tourne en rond dans ma chambre",
        "c'est trop long l'hôpital", "encore une journée à rien faire",
    ],
    "homesick": [
        "je veux rentrer à la maison", "ma maison me manque", "mon chat me manque", "je veux rentrer chez moi",
        "maman me manque", "mes copains me manquent", "je veux retourner à l'école", "j'ai hâte de rentrer",
    ],
    "lonely": [
        "personne est venu", "je suis tout seul", "je suis toute seule dans ma chambre", "personne m'appelle",
        "personne vient me voir", "je me sens seul", "j'ai l'impression qu'on m'oublie", "personne me parle ici",
    ],
    "worry": [
        "j'ai peur de l'opération demain", "j'ai peur des piqûres", "je suis inquiet pour demain", "j'ai un peu peur",
        "je stresse pour l'examen", "j'ai peur la nuit", "j'ai fait un cauchemar", "j'ai les jetons pour demain",
    ],
    "pain": [
        "j'ai mal au ventre", "j'ai mal à la tête", "j'ai mal partout", "je suis fatigué", "j'ai vomi",
        "ça fait mal", "j'ai encore mal", "trop fatiguée",
    ],
    "sad": [
        "je suis triste", "j'ai pleuré", "pas bien aujourd'hui", "journée nulle", "je suis triste tout le temps",
        "j'ai pleuré ce soir", "ça va pas", "j'ai le moral à zéro", "j'en ai marre",
    ],
    "angry": [
        "j'en ai marre de l'hôpital", "je déteste être ici", "c'est injuste", "je suis énervé", "ras le bol",
        "je suis en colère", "laissez moi tranquille",
    ],
    "withdrawal": [
        "j'ai envie de rien", "j'ai plus envie de jouer", "plus envie de dessiner", "rien ne me fait plaisir",
        "je veux voir personne", "je reste dans mon lit", "j'ai pas envie de parler",
    ],
    "concern": [
        "personne m'aime", "je sers à rien", "j'ai peur de mourir", "je vais mourir ?", "ça ira jamais mieux",
        "je guérirai jamais", "je veux disparaître", "j'en ai marre de la vie", "je suis un poids pour maman",
    ],
    "crisis": [
        "j'ai envie de mourir", "je veux plus vivre", "des fois je pense à me tuer", "je veux me faire du mal",
        "ce serait mieux sans moi", "je voudrais dormir et plus jamais me réveiller",
        # Indirect phrasings the lexicon is not expected to catch: they measure its limits.
        "j'ai écrit un mot pour dire au revoir à tout le monde", "bientôt je serai plus un problème pour personne",
    ],
    "idiom": [
        "mort de rire avec {visitor} 😂", "je suis morte de fatigue", "ce jeu me tue mdr", "je vais mourir de faim",
        "maman va me tuer j'ai renversé mon jus", "j'ai failli mourir de rire",
    ],
}

_EN = {
    "positive": [
        "today was so good", "it was a good day", "i laughed with the nurse", "i'm happy", "we played cards it was cool",
        "i won at uno!", "the clowns came so funny", "i ate fries yay", "i'm proud i didn't cry for the blood test",
        "great day",
    ],
    "neutral": [
        "ok", "fine a bit tired", "nothing special", "had my treatment", "it's raining", "normal day",
        "i watched tv", "tired but ok", "napped in the afternoon",
    ],
    "visit": [
        "{visitor} came to see me", "{visitor} came!", "{visitor} brought me candy", "so happy {visitor} was here",
        "did a puzzle with {visitor}",
    ],
    "interest": ["i did {thing}", "i loved {thing}", "today {thing} so fun", "spent the afternoon doing {thing}"],
    "bored": [
        "i'm bored", "so bored here", "it's so long", "nothing to do", "stuck in my room all day", "hospital is boring",
    ],
    "homesick": [
        "i want to go home", "i miss home", "i miss my cat", "i miss my mom", "i miss my friends", "i miss school",
        "can't wait to go home",
    ],
    "lonely": [
        "nobody came", "i'm alone", "all alone in my room", "nobody calls me", "no one visits", "i feel lonely",
        "i feel like everyone forgot about me",
    ],
    "worry": [
        "scared of the surgery tomorrow", "i'm scared of needles", "worried about tomorrow", "a bit scared",
        "nervous about the test", "scared at night", "i had a nightmare",
    ],
    "pain": ["my tummy hurts", "headache", "everything hurts", "i'm tired", "i threw up", "it hurts", "so tired"],
    "sad": [
        "i'm sad", "i cried", "not good today", "bad day", "i'm sad all the time", "cried tonight", "not ok",
        "i feel down", "i'm fed up",
    ],
    "angry": ["sick of the hospital", "i hate it here", "it's unfair", "i'm angry", "so mad", "leave me alone"],
    "withdrawal": [
        "i don't want to do anything", "nothing is fun", "don't feel like playing", "i don't want to see anyone",
        "staying in bed", "don't want to talk",
    ],
    "concern": [
        "nobody loves me", "i'm useless", "i'm scared of dying", "am i going to die", "i'll never get better",
        "i want to disappear", "i'm a burden",
    ],
    "crisis": [
        "i want to die", "i don't want to live anymore", "sometimes i think about killing myself",
        "i want to hurt myself", "everyone would be better off without me", "i want to go to sleep and never wake up",
        "i wrote goodbye letters for everyone", "soon i won't be a problem for anyone",
    ],
    "idiom": [
        "lol i'm dead this show", "this level is killing me", "dying to see {visitor}", "i'm starving i could die",
        "mom is gonna kill me i broke my tablet", "i was dying laughing",
    ],
}

_VISITORS = {
    "fr": ["maman", "papa", "mamie", "papi", "mon frère", "ma sœur", "mon copain", "ma copine", "tata"],
    "en": ["mom", "dad", "grandma", "grandpa", "my brother", "my sister", "my friend", "my aunt"],
}
_THINGS = {
    "drawing": {"fr": ["un dessin", "du coloriage", "de la peinture"], "en": ["a drawing", "some coloring", "painting"]},
    "sport": {"fr": ["du foot dans le couloir", "de la kiné"], "en": ["soccer in the hallway", "physio exercises"]},
    "animals": {"fr": ["un livre sur les dinosaures", "une vidéo de chats"], "en": ["a dinosaur book", "cat videos"]},
    "screens": {"fr": ["un film", "ma série", "un dessin animé"], "en": ["a movie", "my show", "a cartoon"]},
    "music": {"fr": ["de la musique", "du piano sur la tablette"], "en": ["music", "piano on the tablet"]},
    "games": {"fr": ["minecraft", "des légos", "un jeu de cartes"], "en": ["minecraft", "legos", "a card game"]},
    "reading": {"fr": ["une bd", "un livre"], "en": ["a comic", "a book"]},
}
_EMOJI = {
    "positive": "😊😄😂❤🎉", "visit": "😊❤", "interest": "😊😎", "sad": "😢😭😞", "lonely": "😢😞",
    "worry": "😨😟", "angry": "😡😠", "homesick": "😢", "concern": "😢",
}
_SLANG_FR = [(" je suis ", " chui "), ("je ne ", "je "), ("il y a", "y a"), ("trop", "grave")]
_SLANG_EN = [(" you ", " u "), ("really", "rly"), (" right now", " rn"), ("i don't", "i dont")]


def _misspell(text: str, rng: np.random.Generator, lang: str, strength: float) -> str:
    """Young-child spelling: dropped accents and apostrophes, phonetic shortcuts, stretched letters."""
    if lang == "fr":
        swaps = [("é", "e"), ("è", "e"), ("ê", "e"), ("à", "a"), ("ç", "c"), ("j'ai", "jai"), ("c'est", "cest"),
                 ("trop", "tro"), ("qu'", "k"), ("m'", "m"), ("est", "et"), ("aujourd'hui", "ojourdui")]
    else:
        swaps = [("i'm", "im"), ("don't", "dont"), ("can't", "cant"), ("really", "realy"), ("because", "cuz"),
                 ("tomorrow", "tomorow"), ("scared", "scard")]
    for old, new in swaps:
        if old in text and rng.random() < strength:
            text = text.replace(old, new)
    if rng.random() < strength * 0.4:
        words = text.split()
        i = int(rng.integers(len(words)))
        if words[i][-1:].isalpha():
            words[i] += words[i][-1] * int(rng.integers(2, 5))
        text = " ".join(words)
    return text


def generate_note(
    rng: np.random.Generator, lang: str, age: int, topics: list[str], interest_groups: frozenset[str],
) -> str:
    """Write a short note for the given topics, styled for the child's age."""
    bank = _FR if lang == "fr" else _EN
    parts = []
    for topic in topics:
        text = str(rng.choice(bank[topic]))
        if "{visitor}" in text:
            text = text.replace("{visitor}", str(rng.choice(_VISITORS[lang])))
        if "{thing}" in text:
            groups = sorted(g for g in interest_groups if g in _THINGS) or ["screens"]
            text = text.replace("{thing}", str(rng.choice(_THINGS[str(rng.choice(groups))][lang])))
        parts.append(text)
    note = (". " if rng.random() < 0.5 else " ").join(parts)
    emoji = _EMOJI.get(topics[0])
    if emoji and rng.random() < (0.6 if age < 13 else 0.35):
        note += " " + str(rng.choice(list(emoji)))
    if age <= 8:
        note = _misspell(note, rng, lang, strength=0.7)
    elif age <= 12:
        note = _misspell(note, rng, lang, strength=0.3)
    else:
        for old, new in (_SLANG_FR if lang == "fr" else _SLANG_EN):
            if old in f" {note} " and rng.random() < 0.4:
                note = f" {note} ".replace(old, new).strip()
        if rng.random() < 0.3:
            note += " lol" if lang == "en" else " mdr"
    if rng.random() < 0.6:
        note = note.lower()
    return note[:280]
