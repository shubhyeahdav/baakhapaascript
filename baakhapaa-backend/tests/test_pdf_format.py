"""The exported PDF as a document a producer would accept.

Four things were wrong with it, and they are the four things a reader notices
before reading a word: it was A4 rather than US Letter, every element was drawn
flush at the same 1.25" indent, long lines were cut at a fixed 90 characters
without saying so, and a page could break between a character cue and the words
they speak with no (MORE) or (CONT'D) to carry the speech over.

The 90-character cut was the worst of them: at 12pt Courier a 90-character line
is 9 inches wide, so on a 595pt A4 page the text ran off the right edge of the
paper before the truncation even applied.
"""
import io

import pypdf

import export_service
import screenplay

LETTER_W, LETTER_H = 612.0, 792.0
COURIER_CHAR_W = 12 * 0.6  # 12pt Courier advances 0.6em


def _pdf_text(pdf_bytes):
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    return reader, "\n".join(p.extract_text() for p in reader.pages)


def _long_speech_script():
    """A draft that breaks a page in the middle of a speech."""
    return (
        "INT. CHIYA PASAL, PATAN - MORNING\n\nSteam rises.\n\nSANJANA\n"
        + "\n".join("Another line of what she is saying." for _ in range(60))
        + "\n\nEXT. STREET - NIGHT\n\nRain.\n"
    )


# ---------------------------------------------------------------------------
# The page itself
# ---------------------------------------------------------------------------
def test_the_page_is_us_letter():
    """A screenplay is a US Letter document everywhere that buys one."""
    reader, _ = _pdf_text(export_service.export_script_pdf("INT. A - DAY\n", "T"))
    box = reader.pages[0].mediabox
    assert (float(box.width), float(box.height)) == (LETTER_W, LETTER_H)


def test_the_production_package_uses_the_same_page():
    reader, _ = _pdf_text(
        export_service.export_production_package("INT. A - DAY\n", [], "T")
    )
    box = reader.pages[0].mediabox
    assert (float(box.width), float(box.height)) == (LETTER_W, LETTER_H)


def test_the_row_grid_fits_between_one_inch_margins():
    """PAGE_LINES rows at this leading have to fit the page, or the last rows of
    every page print into the paper edge."""
    used = screenplay.PAGE_LINES * export_service.LEADING
    assert used <= LETTER_H - export_service.TOP_MARGIN - export_service.BOTTOM_MARGIN + 0.01


# ---------------------------------------------------------------------------
# Nothing is silently dropped
# ---------------------------------------------------------------------------
def test_a_long_action_line_is_wrapped_not_truncated():
    tail = "and this is the part that used to be cut off entirely"
    action = (
        "Sanjana pushes through the crowded gully past the tea stalls "
        "and the shuttered shopfronts as the rain starts again, " + tail
    )
    _, text = _pdf_text(export_service.export_script_pdf(f"INT. A - DAY\n\n{action}\n", "T"))
    flat = " ".join(text.split())
    assert tail in flat


def test_no_row_can_be_drawn_past_the_right_margin():
    """The wrap measure and the indent have to agree, or wrapping just moves
    where the text runs off the page."""
    for element, width in screenplay.ELEMENT_WIDTH.items():
        right_edge = export_service.INDENT[element] + width * COURIER_CHAR_W
        assert right_edge <= LETTER_W - 72 + 0.01, element


def test_every_element_gets_its_own_indent():
    """Dialogue drawn at the action margin is not a screenplay."""
    indents = export_service.INDENT
    assert indents["action"] < indents["dialogue"] < indents["parenthetical"] < indents["character"]


# ---------------------------------------------------------------------------
# Speech that crosses a page
# ---------------------------------------------------------------------------
def test_a_speech_broken_across_pages_carries_more_and_contd():
    _, text = _pdf_text(export_service.export_script_pdf(_long_speech_script(), "T"))
    assert "(MORE)" in text
    assert "(CONT'D)" in text
    assert "SANJANA (CONT'D)" in " ".join(text.split())


def test_a_short_script_gets_no_more_marker():
    """(MORE) on a page nothing continues past would be a lie about the page."""
    _, text = _pdf_text(export_service.export_script_pdf("INT. A - DAY\n\nRain.\n", "T"))
    assert "(MORE)" not in text


# ---------------------------------------------------------------------------
# Scene numbers
# ---------------------------------------------------------------------------
def test_scenes_are_numbered_in_document_order():
    """A production script without scene numbers cannot be broken down,
    scheduled, or shot-listed by anybody."""
    script = "INT. A - DAY\n\nOne.\n\nEXT. B - NIGHT\n\nTwo.\n\nINT. C - DAY\n\nThree.\n"
    _, text = _pdf_text(export_service.export_script_pdf(script, "T"))
    flat = " ".join(text.split())
    for n, heading in ((1, "INT. A - DAY"), (2, "EXT. B - NIGHT"), (3, "INT. C - DAY")):
        # Both margins carry the number; extraction reports them in draw
        # order, which is left number, right number, then the slugline.
        assert f"{n} {n} {heading}" in flat, f"scene {n} not numbered in both margins"


# ---------------------------------------------------------------------------
# The invariant the whole page model exists for
# ---------------------------------------------------------------------------
def test_the_pdf_still_paginates_exactly_as_the_editor_does():
    """(MORE) and (CONT'D) are drawn in the margins rather than as rows for
    this reason: taking a row would push the printed page count away from the
    number the editor shows the writer."""
    script = _long_speech_script()
    reader, _ = _pdf_text(export_service.export_script_pdf(script, "T"))
    assert len(reader.pages) - 1 == screenplay.page_count(script)
