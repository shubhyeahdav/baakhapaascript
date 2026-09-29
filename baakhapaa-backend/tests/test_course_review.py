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
