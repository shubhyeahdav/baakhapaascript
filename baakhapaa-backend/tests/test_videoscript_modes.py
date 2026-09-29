"""Section vocabulary is per MODE, not global.

`SECTION_KINDS` was a flat tuple, so `_kind_of` matched the first word against
one list for every project. Two consequences this pins: the five course
sections all fell through to `segment`, and `## OUTRO` / `## CALL TO ACTION`
did too, because neither is in the essay list either.
"""
import videoscript as v


def test_essay_kinds_resolve_in_essay_mode():
    assert v._kind_of("HOOK", "essay") == "hook"
    assert v._kind_of("PAYOFF", "essay") == "payoff"


def test_course_kinds_resolve_in_course_mode():
    assert v._kind_of("OBJECTIVE", "course") == "objective"
    assert v._kind_of("EXERCISE", "course") == "exercise"
    assert v._kind_of("CHECK", "course") == "check"


def test_vocabularies_do_not_leak():
    # A course writer typing HOOK is writing a section called Hook, not
    # invoking the essay grammar -- and vice versa.
    assert v._kind_of("HOOK", "course") == "segment"
    assert v._kind_of("EXERCISE", "essay") == "segment"


def test_synonyms_resolve_within_their_mode():
    assert v._kind_of("OUTRO", "essay") == "cta"
    assert v._kind_of("CALL TO ACTION", "essay") == "cta"
    assert v._kind_of("INTRO", "essay") == "hook"
    assert v._kind_of("OUTRO", "course") == "segment"


def test_unknown_heading_is_still_a_segment():
    # A writer inventing a section name is writing, not erring.
    assert v._kind_of("WHY NOBODY FINISHES", "essay") == "segment"
    assert v._kind_of("", "essay") == "segment"


def test_mode_for_maps_every_category():
    assert v.mode_for("course") == "course"
    assert v.mode_for("essay") == "essay"
    assert v.mode_for("tutorial") == "essay"
    # A stored value nobody recognises is far more likely to be an essay.
    assert v.mode_for("podcast") == "essay"
    assert v.mode_for(None) == "essay"


def test_sections_carry_the_mode_through():
    text = "## OBJECTIVE\n\nYou will be able to cut a scene on the turn.\n"
    assert v.sections(text, mode="course")[0].kind == "objective"
    assert v.sections(text, mode="essay")[0].kind == "segment"


def test_scene_summaries_carry_the_mode_through():
    text = "## CHECK\n\nRead it aloud and time it.\n"
    assert v.scene_summaries(text, mode="course")[0]["section_kind"] == "check"
