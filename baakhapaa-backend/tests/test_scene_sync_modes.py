"""The project's category has to reach the parser without widening the
interface both parsers share.

`parser_for` returns something with `scene_summaries(text)`, and ONE call site
uses it. That sameness is what lets one sync function serve two formats with no
special case, so the mode is BOUND rather than added as a parameter every
caller would have to know about.
"""
import scene_sync


def test_a_screenplay_still_gets_the_screenplay_parser():
    import screenplay
    assert scene_sync.parser_for("film") is screenplay
    assert scene_sync.parser_for(None) is screenplay


def test_a_course_project_parses_course_sections():
    parser = scene_sync.parser_for("long_form", "course")
    out = parser.scene_summaries("## EXERCISE\n\nWrite one scene heading.\n")
    assert out[0]["section_kind"] == "exercise"


def test_an_essay_project_parses_essay_sections():
    parser = scene_sync.parser_for("long_form", "essay")
    out = parser.scene_summaries("## HOOK - 0:15\n\nNobody finishes it.\n")
    assert out[0]["section_kind"] == "hook"


def test_no_category_is_an_essay():
    parser = scene_sync.parser_for("long_form")
    out = parser.scene_summaries("## HOOK\n\nWords.\n")
    assert out[0]["section_kind"] == "hook"


def test_the_bound_parser_still_takes_a_language():
    # The interface is `scene_summaries(text, language)`. Binding the mode must
    # not remove the argument the contract already has.
    parser = scene_sync.parser_for("long_form", "course")
    out = parser.scene_summaries("## CHECK\n\nRead it aloud.\n", "Nepali")
    assert out[0]["section_kind"] == "check"
