"""Pages, and the runtime measured from them.

The editor was one unbroken column with no page segmentation at all, so a writer
could not tell what page they were on — and in screenwriting the page IS the
unit of screen time. "Cut ten pages" is a note you can act on.

The subtler bug these cover: the product carried three different ideas of how
long a page was. `screenplay.statistics` used non-blank-lines/55, `review` kept
its own LINES_PER_MINUTE = 55, and the PDF export laid out 45 lines of an A4
page including blanks. So the toolbar could say "page 1 of 5" while the Craft
panel said 1.98 pages and a review called a scene half the length the timeline
showed. One definition now, in `screenplay.PAGE_LINES`.
"""
import io

import pypdf

import export_service
import screenplay


def _script(scene_count=20):
    return "\n\n".join(
        f"INT. LOCATION {i} - DAY\n\nAction for scene {i}.\n\nCHAR\nSome dialogue."
        for i in range(1, scene_count + 1)
    )


# ---------------------------------------------------------------------------
# One definition of a page
# ---------------------------------------------------------------------------
def test_the_editor_and_the_pdf_agree_on_the_page_count():
    """The whole point. A writer told they are on page 6 who prints a PDF where
    that scene sits on page 8 has been lied to by their own tool."""
    text = _script()
    pdf = export_service.export_script_pdf(text, "T")
    pdf_pages = len(pypdf.PdfReader(io.BytesIO(pdf)).pages) - 1  # less the title page
    assert screenplay.page_count(text) == pdf_pages


def test_statistics_reports_the_same_pages_the_editor_paginates_on():
    text = _script()
    # est_pages is fractional (content), page_count is physical sheets.
    assert screenplay.statistics(text)["estimated_pages"] <= screenplay.page_count(text)
    assert screenplay.page_count(text) - screenplay.statistics(text)["estimated_pages"] < 1


def test_review_no_longer_keeps_its_own_lines_per_minute():
    """It had a private copy of the constant and a different rule for which
    lines counted, which is how a review and the timeline came to disagree."""
    import review
    assert not hasattr(review, "LINES_PER_MINUTE")


def test_blank_lines_count_toward_a_page():
    """A screenplay is mostly white space. Measuring only typed lines
    undercounted every runtime in the product by roughly half."""
    dense = "\n".join("Action line." for _ in range(45))
    spaced = "\n\n".join("Action line." for _ in range(45))
    assert screenplay.page_count(spaced) > screenplay.page_count(dense)


# ---------------------------------------------------------------------------
# Page numbers
# ---------------------------------------------------------------------------
def test_page_numbering_is_one_indexed():
    assert screenplay.page_of(1) == 1
    assert screenplay.page_of(screenplay.PAGE_LINES) == 1
    assert screenplay.page_of(screenplay.PAGE_LINES + 1) == 2


def test_an_empty_draft_is_one_page_not_zero():
    assert screenplay.page_count("") == 1


def test_each_scene_reports_the_page_it_opens_on():
    text = _script()
    summaries = screenplay.scene_summaries(text)
    pages = [s["page"] for s in summaries]
    assert pages[0] == 1
    assert pages == sorted(pages), "page numbers must not go backwards"
    assert pages[-1] == screenplay.page_of(summaries[-1]["line_number"])


# ---------------------------------------------------------------------------
# Per-scene runtime — the timeline's actual bug
# ---------------------------------------------------------------------------
def test_every_written_scene_has_a_runtime():
    """`time_allocation` is what was PLANNED, and a hand-typed screenplay was
    never allocated anything — so every scene carried 0 and the editor's
    timeline rendered nine written scenes as exactly as wide as nothing."""
    summaries = screenplay.scene_summaries(_script())
    assert summaries
    assert all(s["estimated_minutes"] > 0 for s in summaries)


def test_a_scene_is_measured_by_its_span_not_its_typed_lines():
    """A scene occupies everything down to the next slugline, blanks included.
    Counting elements alone undercounts by about half."""
    text = "INT. A - DAY\n\nOne line.\n\n\n\n\n\nINT. B - DAY\n\nTwo.\n"
    first, second = screenplay.scene_summaries(text)
    assert first["line_count"] > second["line_count"]
    assert first["estimated_minutes"] > second["estimated_minutes"]


def test_scene_runtimes_sum_to_about_the_script_runtime():
    """If they did not, the timeline's per-scene blocks and its total would be
    describing two different screenplays."""
    text = _script()
    total = screenplay.statistics(text)["estimated_minutes"]
    summed = sum(s["estimated_minutes"] for s in screenplay.scene_summaries(text))
    assert abs(summed - total) < 0.5


def test_a_longer_scene_measures_longer():
    short = "INT. A - DAY\n\nShe waits.\n"
    long = "INT. A - DAY\n\n" + "\n\n".join("She waits." for _ in range(30))
    assert (screenplay.scene_summaries(long)[0]["estimated_minutes"]
            > screenplay.scene_summaries(short)[0]["estimated_minutes"])
