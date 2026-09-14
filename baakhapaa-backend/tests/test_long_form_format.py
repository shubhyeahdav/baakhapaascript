"""A fourth format: long-form video.

`short_form` is vertical social video capped at 180 seconds; `short`, `film`
and `web_series` are narrative screenwriting measured in pages. Nothing covered
a twelve-minute YouTube piece, so a writer with a video essay had two bad
options: force it through a three-act screenplay built for drama, or call it a
180-second reel and lie about the length.
"""
import pytest

import models


def test_long_form_is_a_project_format():
    assert "long_form" in models.PROJECT_FORMATS


def test_long_form_is_measured_in_minutes_not_seconds():
    """A twelve-minute video expressed in seconds is 720, past
    MAX_DURATION_SECONDS, and would have to be stored as a lie."""
    assert "long_form" not in models.SECOND_SCALE_FORMATS


def test_a_video_category_shapes_the_section_spine():
    assert models.VIDEO_CATEGORIES == (
        "essay", "tutorial", "documentary", "commentary", "vlog",
    )


def test_a_project_defaults_to_an_essay():
    assert models.ProjectBase().video_category == "essay"


def test_an_unknown_video_category_is_refused():
    """The category picks a beat spine. An unrecognised one would fall through
    to whatever the default branch does and give a tutorial an essay's shape."""
    with pytest.raises(ValueError):
        models.ProjectBase(video_category="unboxing")


def test_the_hook_types_are_reused_unchanged():
    """`hook_type` was written for short_form and all six values transfer to
    long-form exactly. Reusing it is a real saving, not a stretch — and if this
    ever fails, the two formats have diverged and long-form needs its own."""
    assert models.ProjectBase(format="long_form").hook_type in models.HOOK_TYPES


def test_onboarding_can_offer_it_too():
    """`models.FORMATS` is an alias of `PROJECT_FORMATS`, so a format added
    here is automatically something a writer can say they make. That alias
    exists because the two lists drifted once already."""
    assert "long_form" in models.FORMATS


def test_a_long_form_project_can_be_created_and_reads_back(client, make_user):
    """`target_audience` and `format` were both accepted by the request model
    and whitelisted for update while never being written on create, so they
    were dropped silently. A field added to the model and not to the create
    payload repeats that exactly, and nothing else would notice."""
    user = make_user()

    made = client.post(
        "/projects/",
        json={
            "title": "Why Kathmandu floods",
            "format": "long_form",
            "video_category": "documentary",
            "duration_minutes": 14,
        },
        headers=user["headers"],
    )

    assert made.status_code == 200, made.text
    assert made.json()["format"] == "long_form"
    assert made.json()["video_category"] == "documentary"


def test_the_category_can_be_changed_later(client, make_user):
    user = make_user()
    made = client.post(
        "/projects/",
        json={"title": "Draft", "format": "long_form", "duration_minutes": 12},
        headers=user["headers"],
    )
    project_id = made.json()["id"]

    r = client.put(
        f"/projects/{project_id}",
        json={"video_category": "tutorial"},
        headers=user["headers"],
    )

    assert r.status_code == 200, r.text
    assert r.json()["video_category"] == "tutorial"

def test_a_long_form_draft_produces_sections_end_to_end(client, make_user):
    """The whole point, walked the way a writer walks it: make a long-form
    project, save a draft with sections, and find them as rows — which is what
    the Outline and the Corkboard read.

    A screenplay parser would return nothing for this draft, so before the
    switch in `scene_sync` these rows did not exist and every view of the
    script was empty.
    """
    user = make_user()
    made = client.post(
        "/projects/",
        json={"title": "Why Kathmandu floods", "format": "long_form",
              "video_category": "documentary", "duration_minutes": 14},
        headers=user["headers"],
    )
    project_id = made.json()["id"]
    script_id = client.get(f"/scripts/project/{project_id}",
                           headers=user["headers"]).json()["id"]

    draft = (
        "## HOOK - 0:15" + chr(10)
        + "Every monsoon this street becomes a river." + chr(10) * 2
        + "## PAYOFF - 1:00" + chr(10)
        + "The water has nowhere to go." + chr(10)
    )
    saved = client.put(f"/scripts/{script_id}", json={"content": draft},
                       headers=user["headers"])
    assert saved.status_code == 200, saved.text

    scenes = client.get(f"/scripts/{script_id}",
                        headers=user["headers"]).json()["scenes"]

    assert len(scenes) == 2, scenes
    import json as _json
    first = _json.loads(scenes[0]["draft_json"])
    assert first["section_kind"] == "hook"
    assert first["target_seconds"] == 15


def test_a_screenplay_project_is_untouched_by_all_of_this(client, make_user):
    """The other half of the gate, through the API rather than the parser. A
    format switch that quietly changed screenplay behaviour would be a far
    worse bug than the one it fixes."""
    user = make_user()
    made = client.post("/projects/", json={"title": "Sapana", "format": "short",
                                           "duration_minutes": 12},
                       headers=user["headers"])
    script_id = client.get(f"/scripts/project/{made.json()['id']}",
                           headers=user["headers"]).json()["id"]

    draft = "INT. CHIYA PASAL - MORNING" + chr(10) * 2 + "She wipes the counter."
    client.put(f"/scripts/{script_id}", json={"content": draft},
               headers=user["headers"])

    scenes = client.get(f"/scripts/{script_id}",
                        headers=user["headers"]).json()["scenes"]

    assert len(scenes) == 1
    import json as _json
    payload = _json.loads(scenes[0]["draft_json"])
    assert payload["heading"] == "INT. CHIYA PASAL - MORNING"
    assert "section_kind" not in payload


def test_the_editor_is_told_what_format_it_is_looking_at(client, make_user):
    """`OutlineView` draws the retention shape only for a long-form project, so
    the format has to reach the editor. `script.project` is a field SUBSET —
    CLAUDE.md records it having no `id`, which cost a bug once — so what it
    carries is worth pinning rather than assuming."""
    user = make_user()
    made = client.post(
        "/projects/",
        json={"title": "Floods", "format": "long_form",
              "video_category": "documentary", "duration_minutes": 14},
        headers=user["headers"],
    )
    script_id = client.get(f"/scripts/project/{made.json()['id']}",
                           headers=user["headers"]).json()["id"]

    body = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()

    assert body["project"]["format"] == "long_form"
    assert body["project"]["video_category"] == "documentary"
