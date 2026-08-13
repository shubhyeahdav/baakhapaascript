"""Pure-function checks: the act split and Devanagari font selection.

These call the engine directly rather than through the API so they stay fast
and never touch the embedding model.
"""
import pytest

import export_service
from script_engine import _demo_structure


@pytest.mark.parametrize("duration", [5, 15, 22, 90])
def test_three_act_split_covers_the_full_duration(duration):
    """Act minutes must sum to the requested runtime — no time lost to rounding."""
    acts = _demo_structure(duration)["acts"]
    assert len(acts) == 3
    assert sum(a["duration_minutes"] for a in acts) == pytest.approx(duration, abs=0.15)


def test_three_act_split_is_33_33_34():
    acts = _demo_structure(15)["acts"]
    assert [a["percentage"] for a in acts] == [33, 33, 34]


def test_every_scene_declares_type_and_allocation():
    for act in _demo_structure(15)["acts"]:
        for scene in act["scenes"]:
            assert scene["scene_type"] in ("major", "minor")
            assert scene["time_allocation"] > 0
            assert scene["title"]


def test_devanagari_detection():
    assert export_service._has_devanagari("तिम्रो रिजल्ट आयो?")
    assert not export_service._has_devanagari("INT. CHIYA PASAL - MORNING")


def test_latin_lines_stay_monospaced():
    """Screenplay format depends on Courier; the Unicode face is proportional
    and must only be used where Devanagari actually appears."""
    assert export_service._font_for("INT. CHIYA PASAL - MORNING") == "Courier"


@pytest.mark.skipif(
    not export_service.DEVANAGARI_READY,
    reason="no Devanagari TTF installed; add assets/NotoSansDevanagari-Regular.ttf",
)
def test_devanagari_lines_use_the_unicode_font():
    assert export_service._font_for("तिम्रो रिजल्ट आयो?") == export_service.BODY_FONT


def test_pdf_export_handles_devanagari_without_crashing():
    nepali = "INT. CHIYA PASAL - MORNING\n\n          सपना देख्न पैसा लाग्दैन।\n"
    data = export_service.export_script_pdf(nepali, "Sapana")
    assert data[:4] == b"%PDF"
    assert len(data) > 500
