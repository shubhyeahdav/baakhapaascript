"""Cross-account isolation.

`require_script_access` returns 404 rather than 403 on purpose: a 403 confirms
the id exists, which lets an attacker enumerate the database by probing ids.
"""


def test_another_user_cannot_read_your_script(client, make_user, make_script):
    owner = make_user("pro")
    intruder = make_user("pro")
    _, script_id = make_script(owner)

    r = client.get(f"/scripts/{script_id}", headers=intruder["headers"])
    assert r.status_code == 404


def test_another_user_cannot_overwrite_your_script(client, make_user, make_script):
    owner = make_user("pro")
    intruder = make_user("pro")
    _, script_id = make_script(owner)

    r = client.put(
        f"/scripts/{script_id}",
        json={"content": "INT. SOMEWHERE - DAY\n\nVandalised."},
        headers=intruder["headers"],
    )
    assert r.status_code == 404


def test_another_user_cannot_export_your_script(client, make_user, make_script):
    owner = make_user("pro")
    intruder = make_user("pro")
    _, script_id = make_script(owner)

    r = client.get(f"/export/script/pdf/{script_id}", headers=intruder["headers"])
    assert r.status_code == 404


def test_owner_can_read_and_save_their_script(client, make_user, make_script):
    owner = make_user("pro")
    _, script_id = make_script(owner)

    saved = client.put(
        f"/scripts/{script_id}",
        json={"content": "INT. CHIYA PASAL - MORNING\n\nSteam rises."},
        headers=owner["headers"],
    )
    assert saved.status_code == 200

    read_back = client.get(f"/scripts/{script_id}", headers=owner["headers"])
    assert read_back.status_code == 200
    assert "CHIYA PASAL" in read_back.json()["content"]


def test_unauthenticated_requests_are_rejected(client):
    assert client.get("/projects/").status_code == 401
    assert client.post("/projects/", json={}).status_code == 401
