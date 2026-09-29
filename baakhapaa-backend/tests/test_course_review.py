"""The one genuinely checkable structural rule in either long-form mode.

From `lessons.py`, quoting SCRIPT_CORPUS_PLAN section 4: every lesson ends with
the user writing something the app can immediately respond to. A course script
with no `## EXERCISE` cannot be practised and one with no `## CHECK` cannot be
graded -- the module has no way to present either.

It REPORTS. Nothing here blocks a save, in line with the rest of review.py.
"""
import review

FULL = (
    "## OBJECTIVE\n\nCut a scene on the turn.\n\n"
    "## CONCEPT\n\nA scene ends when the charge changes.\n\n"
    "## PROOF\n\nMedian scene length in the corpus is 1.8 pages.\n\n"
    "## EXERCISE\n\nCut your longest scene at the turn.\n\n"
    "## CHECK\n\nRead both versions aloud.\n"
)


def test_a_complete_course_script_reports_nothing():
    assert review.course_section_findings(FULL, "course") == []


def test_a_missing_exercise_is_reported():
    text = FULL.replace("## EXERCISE\n\nCut your longest scene at the turn.\n\n", "")
    rules = [f["rule"] for f in review.course_section_findings(text, "course")]
    assert "course_missing_exercise" in rules


def test_a_missing_check_is_reported():
    text = FULL.replace("## CHECK\n\nRead both versions aloud.\n", "")
    rules = [f["rule"] for f in review.course_section_findings(text, "course")]
    assert "course_missing_check" in rules


def test_both_missing_are_reported_separately():
    rules = [f["rule"] for f in review.course_section_findings("## CONCEPT\n\nX.\n", "course")]
    assert rules == ["course_missing_exercise", "course_missing_check"]


def test_an_essay_is_not_held_to_the_course_rule():
    # Every section in the video framework is a convention. This rule is the
    # only one that is not, and it belongs to course mode alone.
    assert review.course_section_findings("## HOOK - 0:15\n\nWords.\n", "essay") == []
    assert review.course_section_findings(FULL, None) == []


def test_an_empty_draft_reports_nothing():
    # A writer who has typed nothing has not omitted anything.
    assert review.course_section_findings("", "course") == []
    assert review.course_section_findings("   \n", "course") == []


# Integration tests at review() level.
# The function-level tests above cover the function itself; these cover the
# wiring into the review() orchestrator.


def test_review_of_long_form_course_reports_missing_sections():
    # Long-form course project missing ## EXERCISE should trigger a finding.
    text = FULL.replace("## EXERCISE\n\nCut your longest scene at the turn.\n\n", "")
    project = {"format": "long_form", "video_category": "course"}
    result = review.review(text, [], project)

    assert isinstance(result, dict)
    assert set(result.keys()) == {"ready", "findings", "counts", "statistics"}
    rules = [f["rule"] for f in result["findings"]]
    assert "course_missing_exercise" in rules


def test_review_of_complete_long_form_course_reports_nothing():
    # A complete long-form course script should have no course-specific findings.
    project = {"format": "long_form", "video_category": "course"}
    result = review.review(FULL, [], project)

    rules = [f["rule"] for f in result["findings"]]
    assert "course_missing_exercise" not in rules
    assert "course_missing_check" not in rules


def test_review_of_long_form_essay_does_not_report_course_findings():
    # The most common long_form case is an essay, not a course. Verify that a
    # long_form+essay project, even when missing both ## EXERCISE and ## CHECK,
    # does not trigger course findings. This tests the inner gate (video_category
    # check) at the review() orchestrator level, closing a gap left by the
    # function-level test which never goes through review().
    text = "## CONCEPT\n\nX.\n"  # Missing both exercise and check
    project = {"format": "long_form", "video_category": "essay"}
    result = review.review(text, [], project)

    rules = [f["rule"] for f in result["findings"]]
    assert "course_missing_exercise" not in rules
    assert "course_missing_check" not in rules


def test_review_gates_on_format_not_category_alone():
    # The format gate must actually work, not just be absent. Use the same draft
    # and category in both cases; only the format differs. If the gate fails,
    # both should trigger course findings. If it works, only long_form triggers.
    text = "## CONCEPT\n\nX.\n"  # Missing both exercise and check

    # Case 1: long_form + course → SHOULD report findings
    result_long = review.review(text, [], {"format": "long_form", "video_category": "course"})
    rules_long = [f["rule"] for f in result_long["findings"]]
    assert "course_missing_exercise" in rules_long
    assert "course_missing_check" in rules_long

    # Case 2: film + course → should NOT report findings (format gate blocks it)
    result_film = review.review(text, [], {"format": "film", "video_category": "course"})
    rules_film = [f["rule"] for f in result_film["findings"]]
    assert "course_missing_exercise" not in rules_film
    assert "course_missing_check" not in rules_film


def test_medium_findings_do_not_block_ready():
    # Course findings are medium severity and should not set ready=False.
    text = FULL.replace("## EXERCISE\n\nCut your longest scene at the turn.\n\n", "")
    project = {"format": "long_form", "video_category": "course"}
    result = review.review(text, [], project)

    # Find the course_missing_exercise finding to verify it is medium.
    findings = result["findings"]
    course_findings = [f for f in findings if f["rule"] == "course_missing_exercise"]
    assert len(course_findings) > 0
    assert course_findings[0]["severity"] == "medium"

    # With only medium findings and no high findings, ready should be True.
    assert result["counts"]["high"] == 0
    assert result["ready"] is True
