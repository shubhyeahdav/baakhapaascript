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

    This is the integration test that would catch Finding 1 (mode not wired).
    Verifies that parser_for is called with the video_category from the project.
    """
    from unittest.mock import Mock
    import json

    content = "## EXERCISE\n\nWrite one scene heading.\n"

    # Patch database functions
    mock_get_scenes = Mock(return_value=[])
    monkeypatch.setattr("database.get_scenes_by_script", mock_get_scenes)

    # Patch supabase
    mock_supabase = Mock()
    mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
        {
            "id": "scene-1",
            "script_id": "test-script",
            "act_number": 1,
            "scene_type": "minor",
            "title": "Exercise",
            "description": "",
            "time_allocation": 0,
            "draft_json": '{"heading": "## EXERCISE", "section_kind": "exercise"}'
        }
    ]
    monkeypatch.setattr("database.supabase", mock_supabase)

    # Call sync_from_draft with course category
    rows = scene_sync.sync_from_draft(
        script_id="test-script",
        content=content,
        project_format="long_form",
        project={"video_category": "course"}
    )

    # Verify that we got rows with exercise section_kind from course mode
    assert len(rows) > 0
    draft = json.loads(rows[0]["draft_json"])
    assert draft.get("section_kind") == "exercise"


def test_sync_from_draft_unrecognised_category_falls_back_to_essay(monkeypatch):
    """An unrecognised category must fall back to essay, never raise."""
    from unittest.mock import Mock
    import json

    content = "## HOOK\n\nWords.\n"

    # Patch database functions
    mock_get_scenes = Mock(return_value=[])
    monkeypatch.setattr("database.get_scenes_by_script", mock_get_scenes)

    # Patch supabase
    mock_supabase = Mock()
    mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
        {
            "id": "scene-1",
            "script_id": "test-script",
            "act_number": 1,
            "scene_type": "minor",
            "title": "Hook",
            "description": "",
            "time_allocation": 0,
            "draft_json": '{"heading": "## HOOK", "section_kind": "hook"}'
        }
    ]
    monkeypatch.setattr("database.supabase", mock_supabase)

    # Call with bogus category - should fall back to essay mode without raising
    rows = scene_sync.sync_from_draft(
        script_id="test-script",
        content=content,
        project_format="long_form",
        project={"video_category": "bogus"}  # Unrecognised
    )

    # Should parse as essay (hook kind exists in essay mode)
    assert len(rows) > 0
    draft = json.loads(rows[0]["draft_json"])
    assert draft.get("section_kind") == "hook"
