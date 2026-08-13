"""Spend controls on storyboard generation.

Every frame is a billed image. These tests exist because generation was open to
any authenticated user and looped once per scene with no ceiling, so one click
on a long script could bill an unbounded number of images — and a free account
could do it repeatedly.
"""
import storyboard


def add_scenes(client, user, script_id, n):
    for i in range(n):
        r = client.post(
            "/scripts/add-scene",
            json={
                "script_id": script_id, "act_number": 1, "scene_type": "minor",
                "title": f"Scene {i}", "description": "Two people fail to say a thing.",
                "time_allocation": 1.0, "order_index": i,
            },
            headers=user["headers"],
        )
        assert r.status_code == 200, r.text


def test_free_user_cannot_generate_a_storyboard(client, make_user, make_script):
    """The whole point: image generation costs money per call."""
    user = make_user("free")
    _, script_id = make_script(user)
    add_scenes(client, user, script_id, 3)

    r = client.post(f"/storyboard/generate/{script_id}", headers=user["headers"])
    assert r.status_code == 403
    assert "Pro or Studio" in r.json()["detail"]


def test_paid_user_can_generate(client, make_user, make_script):
    user = make_user("pro")
    _, script_id = make_script(user)
    add_scenes(client, user, script_id, 3)

    r = client.post(f"/storyboard/generate/{script_id}", headers=user["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["frames_generated"] == 3
    assert body["truncated"] is False


def test_frame_count_is_capped(client, make_user, make_script, monkeypatch):
    """A long script must not translate into unbounded billed images."""
    monkeypatch.setattr(storyboard, "MAX_FRAMES_PER_STORYBOARD", 5)
    user = make_user("pro")
    _, script_id = make_script(user)
    add_scenes(client, user, script_id, 12)

    body = client.post(f"/storyboard/generate/{script_id}", headers=user["headers"]).json()
    assert body["frames_generated"] == 5
    assert body["scene_count"] == 12
    assert body["truncated"] is True


def test_free_user_cannot_regenerate_a_frame(client, make_user, make_script):
    """Regeneration bills another image, so it needs the same gate as generate."""
    owner = make_user("pro")
    _, script_id = make_script(owner)
    add_scenes(client, owner, script_id, 2)
    frames = client.post(f"/storyboard/generate/{script_id}", headers=owner["headers"]).json()["frames"]
    frame_id = frames[0]["id"]

    free = make_user("free")
    r = client.post(
        f"/storyboard/regenerate/{frame_id}",
        params={"description": "x", "shot_type": "Wide Shot"},
        headers=free["headers"],
    )
    assert r.status_code == 403


def test_viewing_frames_stays_free(client, make_user, make_script):
    """Gate the spend, not the access — a downgraded user must still see the
    board they already paid to generate."""
    user = make_user("pro")
    _, script_id = make_script(user)
    add_scenes(client, user, script_id, 2)
    client.post(f"/storyboard/generate/{script_id}", headers=user["headers"])

    from database import supabase
    supabase.table("users").update({"subscription_tier": "free"}).eq("id", user["id"]).execute()

    r = client.get(f"/storyboard/{script_id}", headers=user["headers"])
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_generation_still_respects_ownership(client, make_user, make_script):
    owner = make_user("pro")
    intruder = make_user("pro")
    _, script_id = make_script(owner)
    add_scenes(client, owner, script_id, 2)

    r = client.post(f"/storyboard/generate/{script_id}", headers=intruder["headers"])
    assert r.status_code == 404
