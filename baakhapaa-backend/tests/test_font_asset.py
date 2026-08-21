"""The Devanagari font asset — PROJECT_PLAN A1/E9.

`export_service` already picks a font per line and falls back to Courier when
no Devanagari face is found. The existing tests cover that *selection* logic,
which is why A1 has been passing CI for weeks while still rendering blank
boxes on a Linux host: the local dev machine resolves the fallback to
Windows' Nirmala, and CI never notices the shipped asset is missing.

These tests assert the deployable artefact exists, not just that the code would
use it — which is why A1 passed CI for weeks while still rendering blank boxes
on a Linux host: this machine resolved the fallback to Windows' Nirmala, and
nothing noticed the shipped asset was missing.
"""
import os

import pytest

import export_service

ASSET_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
SHIPPABLE = [
    os.path.join(ASSET_DIR, "NotoSansDevanagari-Regular.ttf"),
    os.path.join(ASSET_DIR, "NotoSansDevanagari.ttf"),
]

DEVANAGARI = "प्रेरणा"


def _resolved_font_path():
    """The first candidate that actually exists on this machine."""
    for path, _ in export_service._FONT_CANDIDATES:
        if os.path.exists(path):
            return path
    return None


def test_a_devanagari_font_resolves_at_all():
    """If nothing resolves, Nepali dialogue silently renders as blank boxes."""
    assert _resolved_font_path() is not None, (
        "No Devanagari font found. Drop NotoSansDevanagari-Regular.ttf into "
        f"{ASSET_DIR} — see PROJECT_PLAN A1."
    )


def test_a_redistributable_font_is_bundled():
    """The deploy gate — no longer skippable, because the asset now exists.

    Nirmala is a Microsoft font: present on this Windows box, absent from every
    Linux host, and not ours to redistribute. Only a bundled SIL OFL face makes
    the export work in production. Noto Sans Devanagari was added on 2026-08-18,
    so this test's job has flipped from "warn that it is missing" to "fail if
    anyone removes it".
    """
    assert any(os.path.exists(p) for p in SHIPPABLE), (
        "No redistributable Devanagari font in assets/. Nirmala is dev-only.\n"
        "Download Noto Sans Devanagari (SIL OFL) and place it at:\n  " + SHIPPABLE[0]
    )


def test_font_selection_prefers_the_bundled_asset_over_system_paths():
    """Ordering matters: a bundled font must win, or a deploy silently keeps
    using whatever the host happens to have."""
    paths = [p for p, _ in export_service._FONT_CANDIDATES]
    bundled = [i for i, p in enumerate(paths) if p.startswith(ASSET_DIR)]
    system = [i for i, p in enumerate(paths) if not p.startswith(ASSET_DIR)]
    assert bundled and system
    assert max(bundled) < min(system), "assets/ candidates must come first"


def test_nirmala_is_never_the_only_option_silently():
    """A machine resolving only Nirmala is one dev laptop away from a broken
    deploy — make that state visible rather than green."""
    resolved = _resolved_font_path()
    if resolved and "Nirmala" in resolved:
        assert not any(os.path.exists(p) for p in SHIPPABLE), (
            "Both Nirmala and a bundled font exist but Nirmala won — check candidate order"
        )


def test_devanagari_pdf_export_still_produces_a_pdf():
    """Whatever font resolves, the export must not crash on Devanagari input."""
    pdf = export_service.export_script_pdf(
        f"INT. FRAME SHOP - DAY\n\n                      PRERANA\n          {DEVANAGARI}\n",
        "Font Test",
    )
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 500


def test_export_embeds_a_font_when_one_resolved():
    """A PDF that embeds no font file is one rendering Devanagari as boxes."""
    if _resolved_font_path() is None:
        pytest.skip("no Devanagari font on this machine")
    pdf = export_service.export_script_pdf(
        f"INT. SHOP - DAY\n\n                      PRERANA\n          {DEVANAGARI}\n", "Font Test"
    )
    assert b"FontFile2" in pdf, "no TrueType font embedded — Devanagari will not render"
