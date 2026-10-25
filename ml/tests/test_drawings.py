import base64
import io
import json
from dataclasses import replace
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from PIL import Image, ImageDraw

from closer_ai.bridge import BadRequest, Engine, ingest_drawing, sync_patient
from closer_ai.claude import ClaudeReader
from closer_ai.contract import DayRecord, DrawingReading
from closer_ai.drawings import analyze, color_features
from closer_ai.features import FEATURES, FeatureBuilder
from closer_ai.contract import ChildProfile
from closer_ai.pipeline import ThresholdFallback, run_daily
from closer_ai.store import Store

TODAY = date(2026, 10, 25)
LEO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


def png(draw) -> bytes:
    picture = Image.new("RGB", (400, 300), "white")
    draw(ImageDraw.Draw(picture))
    out = io.BytesIO()
    picture.save(out, format="PNG")
    return out.getvalue()


SUNNY = png(lambda d: (d.ellipse((20, 20, 110, 110), fill=(255, 200, 0)), d.rectangle((0, 230, 400, 300), fill=(40, 180, 60)),
                       d.rectangle((200, 120, 320, 230), fill=(220, 40, 40)), d.rectangle((150, 30, 190, 60), fill=(30, 90, 230))))
DARK = png(lambda d: (d.rectangle((40, 40, 360, 260), fill=(25, 25, 25)), d.ellipse((180, 100, 220, 140), fill=(90, 90, 90))))


def content(**fields) -> str:
    base = {"people": 1, "alone": True, "family": False, "smiling_faces": 0, "sad_faces": 1, "setting": "hospital",
            "sun": False, "rain": True, "affect": "negative", "safety": "none", "themes": ["hospital"],
            "description": "A child crying in a hospital bed under rain."}
    return json.dumps(base | fields)


def fake_client(*replies):
    calls = []

    def create(**request):
        calls.append(request)
        stop, text = replies[len(calls) - 1]
        body = [SimpleNamespace(type="text", text=text)] if text else []
        return SimpleNamespace(stop_reason=stop, stop_details=None, content=body)

    return SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(create=create))), calls


def test_colors_tell_a_bright_drawing_from_a_dark_one():
    bright, dark = color_features(SUNNY), color_features(DARK)
    assert bright["colors"] >= 3 and bright["warm_share"] > 0.4 and bright["dark_share"] < 0.1
    assert dark["dark_share"] > 0.8 and dark["colors"] == 0 and dark["coverage"] > 0.5
    assert color_features(png(lambda d: None))["coverage"] == 0.0


def test_claude_reads_the_content_and_is_sent_a_small_jpeg():
    client, calls = fake_client(("end_turn", content()))
    reading = analyze(DARK, ClaudeReader(client), title="moi")
    assert reading.read_by_claude and reading.affect == "negative" and reading.alone and reading.themes == ("hospital",)
    image = calls[0]["messages"][0]["content"][0]
    assert image["source"]["media_type"] == "image/jpeg"
    assert reading.dark_share > 0.8  # colors still come from the pixels


def test_without_claude_or_on_refusal_the_colors_remain():
    client, _ = fake_client(("refusal", None))
    for reader in (None, ClaudeReader(client)):
        reading = analyze(SUNNY, reader)
        assert not reading.read_by_claude and reading.affect == "unclear" and reading.colors >= 3


def test_every_drawing_is_stored_once_and_unshared_ones_keep_no_title(assessor):
    store = Store()
    store.add_patient(ChildProfile(LEO, 9, (), True, TODAY - timedelta(days=5)), "Leo", 2017)
    reading = analyze(SUNNY)
    assert store.add_drawing(LEO, TODAY, "hash1", reading)
    assert not store.add_drawing(LEO, TODAY, "hash1", reading)
    record = store.load(TODAY)[0].history.days[-1]
    assert record.drawings == 1 and record.shared_drawings == () and record.drawing_readings == (reading,)


def test_drawings_are_compared_with_the_child_own_style():
    usual = DrawingReading(brightness=0.7, saturation=0.6, dark_share=0.1, colors=7, coverage=0.3, warm_share=0.6)
    darker = replace(usual, dark_share=0.5, colors=2, brightness=0.4)
    builder = FeatureBuilder(ChildProfile("p", 10), [])
    start = TODAY - timedelta(days=20)
    for k in range(21):
        drawn = (usual,) if k < 14 else (darker,) if k >= 18 else ()
        builder.append(DayRecord(day=start + timedelta(days=k), drawings=len(drawn), drawing_readings=drawn))
    row = builder.row(20)
    assert row[FEATURES.index("drawing_dark_shift_7d")] > 0.3
    assert row[FEATURES.index("drawing_color_shift_7d")] < -3
    assert row[FEATURES.index("drawing_change_7d")] > builder.row(10)[FEATURES.index("drawing_change_7d")]


def test_a_dangerous_drawing_raises_an_urgent_alert(assessor):
    store = Store()
    store.add_patient(ChildProfile(LEO, 12, (), True, TODAY - timedelta(days=3)), "Leo", 2014)
    store.add_drawing(LEO, TODAY, "h", replace(analyze(DARK), safety="crisis", description="A child hurting themselves."))
    alert = run_daily(store, assessor, ThresholdFallback(0.99), TODAY)[0].alerts[0]
    assert alert["priority"] == "urgent" and "drawing" in alert["reason"]


def test_ingest_from_the_app(assessor):
    store = Store()
    sync_patient(store, LEO, {"today": TODAY.isoformat(), "checkins": [],
                              "patient": {"nickname": "Leo", "birth_year": 2017}})
    engine = Engine(assessor, ThresholdFallback())
    payload = {"local_date": TODAY.isoformat(), "image": base64.b64encode(SUNNY).decode(), "shared": True,
               "title": "ma maison", "emotion": 5}
    result = ingest_drawing(store, engine, LEO, payload)
    assert result["new"] and len(result["reading"]["vector"]) == 18
    assert store.load(TODAY)[0].history.days[-1].shared_drawings[0].title == "ma maison"
    with pytest.raises(BadRequest):
        ingest_drawing(store, engine, LEO, payload | {"image": base64.b64encode(b"not an image").decode()})


def test_drawings_page_compares_the_week_with_earlier_drawings():
    from closer_ai.bridge import drawings_view

    store = Store()
    store.add_patient(ChildProfile(LEO, 9, (), True, TODAY - timedelta(days=3)), "Leo", 2017)
    happy = replace(analyze(SUNNY), affect="positive", smiling_faces=2, people=2)
    sad = replace(analyze(DARK), affect="negative", sad_faces=1, people=1, alone=True)
    for k in (20, 16, 12):
        store.add_drawing(LEO, TODAY - timedelta(days=k), f"h{k}", happy)
    for k in (2, 0):
        store.add_drawing(LEO, TODAY - timedelta(days=k), f"s{k}", sad)
    view = drawings_view(store, LEO, TODAY)
    assert [d["days_ago"] for d in view["drawings"]] == [0, 2, 12, 16, 20]  # older drawings moved the admission back
    assert view["this_week"]["count"] == 2 and view["this_week"]["negative"] == 2 and view["this_week"]["alone"] == 2
    assert view["this_week"]["dark_shift"] > 0.3 and view["usual"]["from_drawings"] == 3
    assert view["drawings"][0]["palette"] and view["drawings"][0]["palette"][0].startswith("#")
