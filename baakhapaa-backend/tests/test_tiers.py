"""Tier gating: the monetization mechanic.

Every one of these was reachable by a free user before this suite existed,
because the limits were enforced in the UI only.
"""
import projects


def _project_payload(title="Second Project"):
    return {
        "title": title,
        "genre": "Drama",
        "tone": "Emotional",
        "language": "English",
        "duration_minutes": 10,
        "target_audience": "Youth",
    }


def test_free_user_is_limited_to_the_free_allowance(client, make_user):
    """Reads the constant rather than a hardcoded count.

    The allowance was 1 and became 3 on 2026-08-26, because 1 collided with the
    product's own course: the course ends by asking for a complete short, so a
    free account that finished it had spent everything and could never start
    the thing it had just been taught to write. Pinning the number here would
    make this test break every time that pricing judgement is revisited, which
    is the opposite of what it is for — the behaviour under test is that a
    limit exists and is enforced.
    """
    user = make_user("free")
    for i in range(projects.FREE_PROJECT_LIMIT):
        r = client.post("/projects/", json=_project_payload(f"Project {i}"),
                        headers=user["headers"])
        assert r.status_code == 200, r.text

    over = client.post("/projects/", json=_project_payload("One too many"),
                       headers=user["headers"])
    assert over.status_code == 402
    assert "free plan" in over.json()["detail"].lower()


def test_paid_user_can_create_multiple_projects(client, make_user):
    user = make_user("pro")
    for title in ("First", "Second", "Third"):
        r = client.post("/projects/", json=_project_payload(title), headers=user["headers"])
        assert r.status_code == 200, r.text


def test_free_user_cannot_call_ai_generation(client, make_user):
    user = make_user("free")
    r = client.post(
        "/scripts/generate-scene",
        json={"scene_description": "A quiet argument", "genre": "Drama", "tone": "Emotional"},
        headers=user["headers"],
    )
    assert r.status_code == 403


def test_free_user_cannot_export_word(client, make_user, make_script):
    """Regression: GET /export/script/word/{id} returned 200 for free users
    because the restriction lived only in the frontend."""
    user = make_user("free")
    _, script_id = make_script(user)
    r = client.get(f"/export/script/word/{script_id}", headers=user["headers"])
    assert r.status_code == 403


def test_free_user_cannot_export_production_package(client, make_user, make_script):
    user = make_user("free")
    _, script_id = make_script(user)
    r = client.get(f"/export/package/{script_id}", headers=user["headers"])
    assert r.status_code == 403


def test_free_user_can_still_export_pdf(client, make_user, make_script):
    """PDF export is advertised on the free plan — the gate must not overreach."""
    user = make_user("free")
    _, script_id = make_script(user)
    r = client.get(f"/export/script/pdf/{script_id}", headers=user["headers"])
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"


def test_paid_user_can_export_word(client, make_user, make_script):
    user = make_user("pro")
    _, script_id = make_script(user)
    r = client.get(f"/export/script/word/{script_id}", headers=user["headers"])
    assert r.status_code == 200
    assert r.content[:2] == b"PK"  # .docx is a zip container
