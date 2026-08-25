"""Bringing an existing screenplay in.

There was no import of any kind, which gated the things this product is best
at: a writer arriving with a finished script had to retype it before the
linter, the corpus benchmark or the structural review would say a word about
it.

Two themes run through these. First, a round trip through .fdx must not change
the screenplay — the export has existed for months and its inverse has to
agree with it exactly. Second, a bad file must fail *loudly and specifically*,
because the failure mode of a silent import is a writer who thinks the product
is broken three scenes later.
"""
import pytest

import export_service
import screenplay
import script_import
from conftest import GOOD_PASSWORD, _unique_email  # noqa: F401

SCREENPLAY = """INT. CHIYA PASAL, PATAN - MORNING

Steam rises from a glass of chiya.

SANJANA
Timro result aayo?

RAAJA
(not looking up)
Bholi.

CUT TO:

EXT. STREET - NIGHT

Rain falls on the empty road.
"""


# ---------------------------------------------------------------------------
# Final Draft
# ---------------------------------------------------------------------------
def test_a_script_survives_the_round_trip_unchanged():
    """The export has existed for months. Its inverse has to agree with it, or
    a writer loses structure by moving their own file out and back."""
    fdx = export_service.export_script_fdx(SCREENPLAY, "My Title")
    back = script_import.import_screenplay("script.fdx", fdx)["content"]

    before = [(e.type, e.text) for e in screenplay.parse(SCREENPLAY)]
    after = [(e.type, e.text) for e in screenplay.parse(back)]
    assert before == after


def test_the_title_page_does_not_become_a_line_of_the_screenplay():
    """A .fdx carries a <TitlePage> with its own <Content>, so sweeping every
    Paragraph in the file appends the title to the end of the script."""
    fdx = export_service.export_script_fdx(SCREENPLAY, "Chiya Pasal")
    back = script_import.import_screenplay("script.fdx", fdx)["content"]
    assert "Chiya Pasal" not in back


def test_import_reports_what_came_through():
    fdx = export_service.export_script_fdx(SCREENPLAY, "T")
    result = script_import.import_screenplay("script.fdx", fdx)
    assert result["source"] == "Final Draft"
    assert result["scenes"] == 2
    assert result["characters"] == 2


def test_a_damaged_fdx_is_refused_in_words_a_writer_can_act_on():
    with pytest.raises(script_import.ImportError_, match="could not be read"):
        script_import.import_screenplay("script.fdx", b"<FinalDraft><broken")


# ---------------------------------------------------------------------------
# The reason defusedxml is a dependency
# ---------------------------------------------------------------------------
def test_an_uploaded_fdx_cannot_read_files_off_the_server():
    """XXE. The export BUILDS xml, which is safe; this PARSES xml a user
    uploaded, which is not. Stock ElementTree resolves external entities, so a
    crafted .fdx would return the contents of a server file inside the
    screenplay."""
    hostile = b"""<?xml version="1.0"?>
    <!DOCTYPE FinalDraft [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
    <FinalDraft><Content>
      <Paragraph Type="Action"><Text>&xxe;</Text></Paragraph>
    </Content></FinalDraft>"""

    with pytest.raises(script_import.ImportError_):
        script_import.import_screenplay("evil.fdx", hostile)


def test_an_uploaded_fdx_cannot_hang_the_server_on_entity_expansion():
    """The billion laughs. Without defusedxml this expands until the process
    runs out of memory."""
    bomb = b"""<?xml version="1.0"?>
    <!DOCTYPE lolz [
      <!ENTITY lol "lol">
      <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
      <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">
      <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
    ]>
    <FinalDraft><Content>
      <Paragraph Type="Action"><Text>&lol3;</Text></Paragraph>
    </Content></FinalDraft>"""

    with pytest.raises(script_import.ImportError_):
        script_import.import_screenplay("bomb.fdx", bomb)


# ---------------------------------------------------------------------------
# Fountain and plain text
# ---------------------------------------------------------------------------
def test_plain_text_imports_as_written():
    result = script_import.import_screenplay("draft.txt", SCREENPLAY.encode("utf-8"))
    assert "INT. CHIYA PASAL, PATAN - MORNING" in result["content"]
    assert result["scenes"] == 2


def test_a_fountain_boneyard_note_does_not_become_dialogue():
    fountain = b"""INT. GHAR - DAY

/* remember to fix this scene */

She waits.
"""
    content = script_import.import_screenplay("d.fountain", fountain)["content"]
    assert "remember to fix" not in content


def test_a_windows_authored_file_is_not_rejected_for_its_encoding():
    """cp1252 is common and failing on it is a bad first experience for a
    format that is meant to be forgiving."""
    data = "INT. GHAR - DAY\n\nCaf\xe9 sign flickers.\n".encode("cp1252")
    result = script_import.import_screenplay("d.txt", data)
    assert result["scenes"] == 1


def test_devanagari_survives_import():
    data = "INT. चिया पसल - बिहान\n\nभाप उठ्छ।\n\nसन्जना\nतिम्रो रिजल्ट आयो?\n".encode("utf-8")
    result = script_import.import_screenplay("d.txt", data)
    assert "भाप उठ्छ।" in result["content"]


# ---------------------------------------------------------------------------
# Refusing what cannot be read
# ---------------------------------------------------------------------------
def test_a_scanned_pdf_says_it_is_a_scan():
    """A scan extracts to nothing and would otherwise import as an empty
    script — leaving the writer to conclude the product is broken."""
    problem = script_import._pdf_problem("")
    assert "scan" in problem.lower()


def test_a_pdf_that_is_not_a_screenplay_says_so():
    problem = script_import._pdf_problem("Chapter One. " + "It was a dark night. " * 60)
    assert "scene heading" in problem.lower()


def test_a_clean_extraction_is_accepted():
    assert script_import._pdf_problem(SCREENPLAY * 6) == ""


def test_a_file_with_no_scene_headings_is_refused():
    with pytest.raises(script_import.ImportError_, match="no screenplay"):
        script_import.import_screenplay("notes.txt", b"Some notes about a story I might write one day. " * 20)


def test_an_empty_file_is_refused():
    with pytest.raises(script_import.ImportError_, match="empty"):
        script_import.import_screenplay("d.txt", b"")


def test_an_oversized_upload_is_refused_before_it_is_parsed():
    huge = b"x" * (script_import.MAX_UPLOAD_BYTES + 1)
    with pytest.raises(script_import.ImportError_, match="larger than"):
        script_import.import_screenplay("d.txt", huge)


def test_an_unsupported_type_names_the_ones_that_work():
    with pytest.raises(script_import.ImportError_, match=r"\.fdx"):
        script_import.import_screenplay("script.docx", b"whatever")


# ---------------------------------------------------------------------------
# The route
# ---------------------------------------------------------------------------
def test_importing_replaces_the_draft_and_returns_the_scenes(client, make_user, make_script):
    user = make_user()
    _project_id, script_id = make_script(user)
    fdx = export_service.export_script_fdx(SCREENPLAY, "T")

    res = client.post(
        f"/scripts/{script_id}/import",
        files={"file": ("script.fdx", fdx, "application/xml")},
        headers=user["headers"],
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["imported"]["source"] == "Final Draft"
    assert len(body["scenes"]) == 2
    assert body["pagination"]["page_count"] >= 1


def test_the_previous_draft_is_snapshotted_before_it_is_overwritten(client, make_user, make_script):
    """Import is the most destructive action in the product. The undo for it
    has to exist before the overwrite, not after somebody asks for one."""
    user = make_user()
    _project_id, script_id = make_script(user)
    client.put(
        f"/scripts/{script_id}",
        json={"content": "INT. THE OLD DRAFT - DAY\n\nWorth keeping.\n"},
        headers=user["headers"],
    )

    fdx = export_service.export_script_fdx(SCREENPLAY, "T")
    client.post(
        f"/scripts/{script_id}/import",
        files={"file": ("script.fdx", fdx, "application/xml")},
        headers=user["headers"],
    )

    versions = client.get(f"/versions/{script_id}", headers=user["headers"]).json()
    assert any("THE OLD DRAFT" in (v.get("content") or "") for v in versions)


def test_a_bad_file_returns_a_message_meant_for_the_writer(client, make_user, make_script):
    user = make_user()
    _project_id, script_id = make_script(user)
    res = client.post(
        f"/scripts/{script_id}/import",
        files={"file": ("notes.txt", b"just some notes", "text/plain")},
        headers=user["headers"],
    )
    assert res.status_code == 422
    assert "screenplay" in res.json()["detail"].lower()


def test_import_requires_access_to_the_script(client, make_user, make_script):
    owner = make_user()
    _project_id, script_id = make_script(owner)
    stranger = make_user()

    res = client.post(
        f"/scripts/{script_id}/import",
        files={"file": ("s.txt", SCREENPLAY.encode(), "text/plain")},
        headers=stranger["headers"],
    )
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Television and camera elements
# ---------------------------------------------------------------------------
TV_SCRIPT = """ACT ONE

INT. NEWSROOM - DAY

ANGLE ON the clock.

MONTAGE - PRERANA LEARNS THE JOB

END MONTAGE

SANJANA
We go live in five.

END OF ACT ONE
"""


def test_a_television_script_exports_without_crashing():
    """`_FDX_TYPE[el.type]` was a direct index, so the first act break in a
    script took out the whole .fdx download with a KeyError."""
    fdx = export_service.export_script_fdx(TV_SCRIPT, "Pilot")
    assert b"Scene Heading" in fdx


def test_act_breaks_shots_and_montages_survive_a_round_trip():
    fdx = export_service.export_script_fdx(TV_SCRIPT, "Pilot")
    back = script_import.import_screenplay("pilot.fdx", fdx)["content"]
    types = [e.type for e in screenplay.parse(back)]
    assert "act_break" in types
    assert "shot" in types
    assert "montage" in types


def test_an_act_break_is_not_read_as_a_character():
    """ACT TWO is capitals on its own line, which is exactly the shape of a
    cue — so untested it became a speaker and ate the line beneath it."""
    types = {e.text: e.type for e in screenplay.parse(TV_SCRIPT)}
    assert types["ACT ONE"] == "act_break"
    assert types["END OF ACT ONE"] == "act_break"
    assert types["SANJANA"] == "character"
