import pytest

from closer_ai.contract import DayRecord, Drawing
from closer_ai.safety import check_day, check_text, most_severe
from closer_ai.text import analyze_note, normalize

CRISIS = [
    "jai envie de mourir", "je veu mourir", "des fois je pense à me tuer", "je veux plus vivre",
    "je voudrais dormir et plus jamais me réveiller", "ce serait mieux sans moi", "je me scarifie",
    "papa me frappe quand il est faché", "I want to die", "i dont want to live anymore",
    "sometimes I think about hurting myself", "my stepdad hits me", "I wish I was dead", "je veux me suicider",
]
CONCERN = [
    "j'ai peur de mourir", "personne m'aime", "je sers à rien", "je veux pas mourir", "nobody loves me",
    "I don't want to die", "jen ai marre de la vie", "je veux disparaitre", "I'm scared of dying",
]
NOTHING = [
    "mort de rire avec mon frère 😂", "je suis morte de fatigue", "ce jeu me tue mdr", "maman va me tuer jai cassé mon verre",
    "je vais mourir de faim", "lol im dead this show", "this level is killing me", "dying to see my dog",
    "on a regardé suicide squad", "j'ai pas envie de mourir", "la piqûre va me faire du mal", "je veux plus vivre ici",
    "I hurt myself when I fell", "ça sert à rien de pleurer", "il me tape sur les nerfs", "une personne m'aime bien ici",
    "je veux en finir avec ce livre",
]


@pytest.mark.parametrize("text", CRISIS)
def test_crisis_statements_are_caught(text):
    assert most_severe(check_text(text)).level == "crisis"


@pytest.mark.parametrize("text", CONCERN)
def test_strong_statements_are_concerns(text):
    assert most_severe(check_text(text)).level == "concern"


@pytest.mark.parametrize("text", NOTHING)
def test_idioms_and_benign_notes_raise_nothing(text):
    assert check_text(text) == []


def test_child_request_and_shared_drawing_titles_are_checked():
    flags = check_day(DayRecord(day=None, mood=3, wants_to_talk=True,
                                shared_drawings=(Drawing(title="moi je veux mourir"),)))
    assert {f.level for f in flags} == {"crisis", "child_request"}


def test_normalize_handles_kid_spelling():
    assert normalize("J'ai TROOOP peur 😱") == "j ai trop peur"
    assert normalize("I don't know") == "i do not know"


def test_negation_and_emoji():
    assert analyze_note("je suis pas triste").sad == 0
    assert analyze_note("je suis triste 😢").sad == 2
    assert analyze_note("I'm not scared").fear == 0
    assert analyze_note("ça va pas mal").sad == 0
    assert analyze_note("du pain au chocolat").pain == 0
