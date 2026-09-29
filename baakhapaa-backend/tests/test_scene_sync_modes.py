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


# --- Integration tests: mode reaches sync_from_draft -------------------------


def test_sync_from_draft_threads_category_to_parser_for_course(monkeypatch):
    """The mode must thread from project parameter through to parser_for.

    This test verifies that parser_for is CALLED with the correct category.
    It uses EXERCISE content which:
    - In course mode: produces "exercise" kind
    - In essay mode: would not parse as a valid section (essay has no EXERCISE)

    If the category is not passed to parser_for, the parser will treat it as
    essay mode and fail to parse EXERCISE as a section, proving the category
    did not reach the parser.
    """
    from unittest.mock import Mock
    import json

    # Use content that requires course mode to parse correctly
    content = "## EXERCISE\n\nWrite one scene heading.\n"

    # Patch database functions
    mock_get_scenes = Mock(return_value=[])
    monkeypatch.setattr("database.get_scenes_by_script", mock_get_scenes)

    # Create a real supabase mock that captures insert calls
    insert_calls = []
    mock_insert = Mock(side_effect=lambda payload: (
        insert_calls.append(payload),
        Mock(execute=Mock(return_value=Mock(data=[
            {**payload, "id": "scene-1", "script_id": "test-script"}
        ])))
    )[1])

    mock_supabase = Mock()
    mock_supabase.table.return_value.insert = mock_insert
    monkeypatch.setattr("database.supabase", mock_supabase)

    # Call sync_from_draft with course category
    rows = scene_sync.sync_from_draft(
        script_id="test-script",
        content=content,
        project_format="long_form",
        project={"video_category": "course"}
    )

    # Verify that parser_for was called and produced course-mode output
    assert len(rows) > 0, "sync_from_draft should have created rows"

    # Parse the actual draft_json that was inserted
    draft = json.loads(rows[0]["draft_json"])
    section_kind = draft.get("section_kind")

    # EXERCISE is a course-only section kind. If we got "exercise",
    # the parser was called with course mode. If we got anything else or None,
    # the category did not reach the parser.
    assert section_kind == "exercise", (
        f"Expected 'exercise' (course mode), got '{section_kind}'. "
        "Category may not have been passed to parser_for."
    )


def test_sync_from_draft_unrecognised_category_falls_back_to_essay(monkeypatch):
    """An unrecognised category must fall back to essay mode, never raise.

    Uses EXERCISE (a course-only kind). In essay mode it is unknown and
    parses as 'segment'. If mode_for wrongly mapped 'bogus' to course mode,
    this would produce 'exercise' instead, failing the test.
    """
    from unittest.mock import Mock
    import json

    content = "## EXERCISE\n\nWords.\n"

    # Patch database functions
    mock_get_scenes = Mock(return_value=[])
    monkeypatch.setattr("database.get_scenes_by_script", mock_get_scenes)

    # Create a real supabase mock that captures insert calls
    insert_calls = []
    mock_insert = Mock(side_effect=lambda payload: (
        insert_calls.append(payload),
        Mock(execute=Mock(return_value=Mock(data=[
            {**payload, "id": "scene-1", "script_id": "test-script"}
        ])))
    )[1])

    mock_supabase = Mock()
    mock_supabase.table.return_value.insert = mock_insert
    monkeypatch.setattr("database.supabase", mock_supabase)

    # Call with bogus category - should fall back to essay mode without raising
    rows = scene_sync.sync_from_draft(
        script_id="test-script",
        content=content,
        project_format="long_form",
        project={"video_category": "bogus"}  # Unrecognised
    )

    # Verify we got essay-mode output
    assert len(rows) > 0, "sync_from_draft should have created rows"

    draft = json.loads(rows[0]["draft_json"])
    section_kind = draft.get("section_kind")

    # EXERCISE in essay mode produces 'segment'. If we got this, essay mode was
    # used, confirming the unrecognised category fell back safely.
    assert section_kind == "segment", (
        f"Expected 'segment' (essay mode fallback), got '{section_kind}'. "
        "Bogus category handling failed."
    )
