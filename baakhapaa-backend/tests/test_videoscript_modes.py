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
    # invoking the essay grammar -- and vice versa. Each falls through to its
    # OWN mode's body-content kind; both of these read `== "segment"` until
    # 2026-10-09, which made the course assertion prove the opposite of its
    # name -- `segment` is the essay's kind, so the leak was in the expectation.
    assert v._kind_of("HOOK", "course") == "concept"
    assert v._kind_of("EXERCISE", "essay") == "segment"
    assert v._kind_of("HOOK", "course") != "hook"
    assert v._kind_of("EXERCISE", "essay") != "exercise"


def test_synonyms_resolve_within_their_mode():
    assert v._kind_of("OUTRO", "essay") == "cta"
    assert v._kind_of("CALL TO ACTION", "essay") == "cta"
    assert v._kind_of("INTRO", "essay") == "hook"
    # `OUTRO` is an essay synonym and nothing in a course, so it falls through
    # to the course's own fallback rather than to the essay's CTA.
    assert v._kind_of("OUTRO", "course") == "concept"


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


def test_an_unknown_heading_never_leaves_its_own_vocabulary():
    """The fallback kind must come from the mode's OWN kinds.

    `_kind_of` returned a bare "segment" in both modes until 2026-10-09, so a
    course section the course vocabulary did not hold came back as `segment` --
    not a course kind at all. `section_kind` is on the API payload and the
    editor seeds craft retrieval from it, so that leak drew essay craft for a
    course writer.
    """
    for mode, kinds in v.SECTION_KINDS_BY_MODE.items():
        kind = v._kind_of("SOMETHING NOBODY DEFINED", mode)
        assert kind in kinds, f"{mode} fell back to {kind!r}, which is not one of its kinds"


def test_the_course_fallback_is_concept_not_segment():
    """Named explicitly, because `in kinds` above would pass for any of the
    five and the choice of which one is a judgement worth pinning: `concept` is
    the course's body-content kind the way `segment` is the essay's."""
    assert v._kind_of("SOMETHING NOBODY DEFINED", "course") == "concept"
    assert v._kind_of("SOMETHING NOBODY DEFINED", "essay") == "segment"


def test_an_unknown_mode_still_falls_back_to_the_essay_default():
    """A mode nobody recognised must not raise mid-parse."""
    assert v._kind_of("WHATEVER", "podcast") == "segment"
