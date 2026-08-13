"""Tier gating: the monetization mechanic.

Every one of these was reachable by a free user before this suite existed,
because the limits were enforced in the UI only.
"""


def _project_payload(title="Second Project"):
    return {
        "title": title,
        "genre": "Drama",
        "tone": "Emotional",
        "language": "English",
        "duration_minutes": 10,
        "target_audience": "Youth",
    }


def test_free_user_is_limited_to_one_project(client, make_user):
    user = make_user("free")
    first = client.post("/projects/", json=_project_payload("First"), headers=user["headers"])
    assert first.status_code == 200

    second = client.post("/projects/", json=_project_payload("Second"), headers=user["headers"])
    assert second.status_code == 402
    assert "free plan" in second.json()["detail"].lower()


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
