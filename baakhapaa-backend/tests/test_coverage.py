"""Script coverage — the reader's report.

Every AI screenwriting tool worth comparing against ships one and this product
shipped none, while already computing every input: review finds structural
problems, benchmark places the draft against the corpus, the linter names craft
faults, statistics measures shape. Four answers to four questions nobody asked
in that form.

The two rules this has to keep are what these cover: it costs no AI call, and
it never renders a verdict.
"""
import coverage as coverage_report
import screenplay

SHORT = """INT. CHIYA PASAL - MORNING

Steam rises.

SANJANA
Timro result aayo?
"""


def _long_script(scenes=12):
    return "\n\n".join(
        f"INT. LOCATION {i} - DAY\n\nAction for scene {i}.\n\nCHAR{i % 3}\n"
        f"Something spoken in scene {i}."
        for i in range(1, scenes + 1)
    )


def _cover(text, project=None, bible=None):
    return coverage_report.coverage(
        text,
        screenplay.scene_summaries(text),
        project or {"title": "Sapana", "genre": "Drama", "duration_minutes": 12},
        bible,
    )


# ---------------------------------------------------------------------------
# What the report is
# ---------------------------------------------------------------------------
def test_it_answers_the_question_a_writer_actually_asks():
    """One report, not four panels to assemble by hand."""
    report = _cover(_long_script())
    for section in ("premise", "runtime", "structure", "craft", "shape", "next_steps"):
        assert section in report


def test_it_never_renders_a_verdict():
    """Real coverage ends in RECOMMEND or PASS because a reader is deciding
    whether to buy. Nobody here is buying anything, and telling a writer their
    script is a PASS is useless and discouraging in one sentence."""
    report = _cover(_long_script())
    flat = str(report).upper()
    assert "RECOMMEND" not in flat
    assert "PASS" not in flat
    assert "measurement, not a judgement" in report["no_verdict"]


def test_the_premise_comes_from_the_writer_not_from_inference():
    report = _cover(SHORT, bible={"logline": "A girl waits for a result.", "theme": "Waiting"})
    assert report["premise"]["logline"] == "A girl waits for a result."
    assert report["premise"]["theme"] == "Waiting"


def test_a_missing_logline_is_reported_rather_than_invented():
    """"No logline" is itself the most useful note an unfinished project can
    get, and a made-up one would be the part a writer could not check."""
    report = _cover(SHORT)
    assert report["premise"]["logline"] == ""


def test_runtime_names_both_the_written_and_the_planned_length():
    report = _cover(_long_script(), {"title": "T", "genre": "Drama", "duration_minutes": 12})
    assert report["runtime"]["planned_minutes"] == 12
    assert report["runtime"]["minutes"] > 0
    assert report["runtime"]["scenes"] == 12


# ---------------------------------------------------------------------------
# Shape observations are readings, not numbers
# ---------------------------------------------------------------------------
def test_a_shape_note_says_what_the_number_is_evidence_of():
    """"dialogue/action 5.12" is not a note — it is a reading the writer has to
    do themselves."""
    report = _cover(_long_script())
    for note in report["shape"]:
        assert note["reading"]
        assert len(note["reading"]) > 30


def test_an_all_interior_script_is_told_so():
    report = _cover(_long_script())
    readings = " ".join(n["reading"] for n in report["shape"])
    assert "interior" in readings.lower()


# ---------------------------------------------------------------------------
# Not measuring what is too short to measure
# ---------------------------------------------------------------------------
def test_a_short_draft_is_not_benchmarked():
    """Percentiles on four scenes invite a writer to fix a problem they do not
    have."""
    report = _cover(SHORT)
    assert report["shape_ready"] is False
    assert report["comparison"] is None


def test_a_long_enough_draft_is_benchmarked():
    report = _cover(_long_script(12))
    assert report["shape_ready"] is True


def test_an_empty_draft_does_not_raise():
    report = _cover("")
    assert report["runtime"]["scenes"] == 0


# ---------------------------------------------------------------------------
# What to do next
# ---------------------------------------------------------------------------
def test_unfilmable_lines_reach_the_next_steps():
    """A camera cannot photograph a realisation. That is a fact about the
    medium, not an opinion about the writing, so it leads."""
    text = _long_script() + "\n\nINT. GHAR - DAY\n\nShe realises he has been lying to her all along.\n"
    report = _cover(text)
    assert any(step["from"] == "craft" for step in report["next_steps"])


def test_next_steps_are_capped():
    """A list of forty things to fix is a list of nothing to fix."""
    report = _cover(_long_script(40))
    assert len(report["next_steps"]) <= 6


def test_craft_counts_separate_how_arguable_each_note_is():
    """"A camera cannot photograph this" and "I read this as on the nose" must
    not arrive wearing the same authority."""
    report = _cover(_long_script())
    assert set(report["craft"]["by_confidence"]) == {"mechanical", "convention", "judgement"}


# ---------------------------------------------------------------------------
# The route
# ---------------------------------------------------------------------------
def test_coverage_is_served_for_a_script(client, make_user, make_script):
    user = make_user()
    _project_id, script_id = make_script(user)
    client.put(f"/scripts/{script_id}", json={"content": _long_script()}, headers=user["headers"])

    res = client.get(f"/scripts/{script_id}/coverage", headers=user["headers"])
    assert res.status_code == 200, res.text
    assert res.json()["runtime"]["scenes"] == 12


def test_coverage_is_free_on_every_tier(client, make_user, make_script):
    """It costs no AI call, so gating it would be charging for arithmetic."""
    user = make_user("free")
    _project_id, script_id = make_script(user)
    res = client.get(f"/scripts/{script_id}/coverage", headers=user["headers"])
    assert res.status_code == 200


def test_a_stranger_cannot_read_coverage(client, make_user, make_script):
    owner = make_user()
    _project_id, script_id = make_script(owner)
    stranger = make_user()
    res = client.get(f"/scripts/{script_id}/coverage", headers=stranger["headers"])
    assert res.status_code == 404
