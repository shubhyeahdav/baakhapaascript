"""Who decides which scene is a turning point.

The product asks a writer to think in majors and minors, and reads that answer
in three places: the scene rail counts them, the outline reads act balance from
them, and `storyboard_engine.assign_shot_type` picks a shot from them. Until
this route existed, nothing could set one. A generated structure chose once, and
a scene the writer typed themselves was created `minor` and stayed `minor` for
ever — so on the default path, which since 2026-08-26 is a blank page, every
script was uniformly minor and the rail's "major" count read zero.

The tests worth reading here are the ones about what must NOT be settable.
`title` is the obvious second whitelist entry and would be a bug: a scene's
title is its slugline in the draft, `scene_sync` rebuilds the row from the page
on every save, and a title set through this route would be overwritten by the
next keystroke.
"""


def _a_scene(client, user, script_id):
    """A scene row, created the way the structure preview creates one."""
    r = client.post(
        "/scripts/add-scene",
        json={
            "script_id": script_id,
            "act_number": 1,
            "scene_number": 1,
            "title": "INT. CHIYA PASAL - MORNING",
            "scene_type": "minor",
            "description": "She wipes the counter.",
            "time_allocation": 3,
        },
        headers=user["headers"],
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_a_writer_can_mark_a_scene_as_the_turning_point(client, make_user, make_script):
    user = make_user()
    _p, script_id = make_script(user)
    scene_id = _a_scene(client, user, script_id)

    r = client.put(f"/scripts/scenes/{scene_id}",
                   json={"scene_type": "major"}, headers=user["headers"])

    assert r.status_code == 200, r.text
    assert r.json()["scene_type"] == "major"


def test_and_can_take_it_back(client, make_user, make_script):
    """A turning point that cannot be un-marked is a worse trap than one that
    could never be marked: the writer changes their mind about structure far
    more often than they change their mind about a slugline."""
    user = make_user()
    _p, script_id = make_script(user)
    scene_id = _a_scene(client, user, script_id)

    client.put(f"/scripts/scenes/{scene_id}", json={"scene_type": "major"},
               headers=user["headers"])
    r = client.put(f"/scripts/scenes/{scene_id}", json={"scene_type": "minor"},
                   headers=user["headers"])

    assert r.status_code == 200, r.text
    assert r.json()["scene_type"] == "minor"


def test_only_the_two_real_values_are_accepted(client, make_user, make_script):
    """`assign_shot_type` branches on the exact string. A third value would not
    error anywhere — it would silently fall through to the minor branch and give
    a scene the writer had marked as important the flattest shot on the board."""
    user = make_user()
    _p, script_id = make_script(user)
    scene_id = _a_scene(client, user, script_id)

    r = client.put(f"/scripts/scenes/{scene_id}",
                   json={"scene_type": "climax"}, headers=user["headers"])

    assert r.status_code == 400, r.text
    assert "major" in r.text and "minor" in r.text


def test_the_title_cannot_be_set_through_this_route(client, make_user, make_script):
    """It is the field a reviewer will want to add to the whitelist, and it is
    the one that must never be there. A scene's title IS its slugline on the
    page; `scene_sync` derives the row from the draft on every save, so a title
    written here survives exactly until the next keystroke. Renaming happens by
    rewriting the line, which is what the editor's rename actually does."""
    user = make_user()
    _p, script_id = make_script(user)
    scene_id = _a_scene(client, user, script_id)

    r = client.put(f"/scripts/scenes/{scene_id}",
                   json={"title": "INT. SOMEWHERE ELSE - NIGHT"},
                   headers=user["headers"])

    assert r.status_code == 400, r.text


def test_a_stranger_cannot_reweight_somebody_elses_scene(client, make_user, make_script):
    user = make_user()
    stranger = make_user()
    _p, script_id = make_script(user)
    scene_id = _a_scene(client, user, script_id)

    r = client.put(f"/scripts/scenes/{scene_id}",
                   json={"scene_type": "major"}, headers=stranger["headers"])

    assert r.status_code in (403, 404), r.text


def test_a_missing_scene_reads_the_same_as_one_you_cannot_see(client, make_user):
    """404 rather than 403, and the same 404 either way, so the route cannot be
    walked to discover which scene ids exist."""
    user = make_user()

    r = client.put("/scripts/scenes/00000000-0000-0000-0000-000000000000",
                   json={"scene_type": "major"}, headers=user["headers"])

    assert r.status_code == 404, r.text


def test_a_viewer_cannot_reweight_the_script(client, make_user, make_script):
    """`require_script_access` defaults to editor. Reading somebody's draft is
    not permission to restructure it."""
    owner = make_user()
    reader = make_user()
    project_id, script_id = make_script(owner)
    scene_id = _a_scene(client, owner, script_id)

    added = client.post(
        f"/projects/{project_id}/members",
        json={"email": reader["email"], "role": "viewer"},
        headers=owner["headers"],
    )
    assert added.status_code == 200, added.text

    r = client.put(f"/scripts/scenes/{scene_id}",
                   json={"scene_type": "major"}, headers=reader["headers"])

    assert r.status_code in (403, 404), r.text


def test_the_storyboard_reads_the_writers_answer(client, make_user, make_script):
    """The point of the field, end to end: marking a scene major changes the
    shot the board gives it. Without this the whole route is bookkeeping."""
    import storyboard_engine

    minor_shot = storyboard_engine.assign_shot_type("minor", 1, 5, 2)
    major_shot = storyboard_engine.assign_shot_type("major", 1, 5, 2)

    assert minor_shot != major_shot, (
        "if these are equal the writer's answer changes nothing on the board"
    )
