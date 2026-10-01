"""Marking a first draft complete.

The gate this unlocks is the product's central argument made enforceable: a
writer meets a blank page and fills it themselves before a model is allowed
near it. `generate-structure` was already taken out of the creation wizard for
the same reason — a writer used to arrive in an editor holding scenes nobody
had asked for.

It is a DECLARATION. Nothing here reads the draft and decides whether it is any
good; the craft linter does that, and it reports rather than judges. The only
refusal is an empty page, because unlocking the AI on a blank draft would hand
a model the very page this gate exists to make the writer face.
"""

SCENE = "INT. CHIYA PASAL - MORNING\n\nSteam rises off a kettle.\n"


def _mark(client, user, script_id):
    return client.post(f"/scripts/{script_id}/first-draft", headers=user["headers"])


def test_a_written_draft_can_be_marked_complete(client, make_user, make_script):
    user = make_user()
    _, script_id = make_script(user)
    client.put(f"/scripts/{script_id}", json={"content": SCENE}, headers=user["headers"])

    res = _mark(client, user, script_id)

    assert res.status_code == 200, res.text
    assert res.json()["status"] == "first_draft"


def test_an_empty_draft_is_refused(client, make_user, make_script):
    # A declaration about nothing is not a declaration.
    user = make_user()
    _, script_id = make_script(user)

    res = _mark(client, user, script_id)

    assert res.status_code == 400
    assert "nothing here yet" in res.json()["detail"].lower()


def test_a_draft_of_only_whitespace_is_refused(client, make_user, make_script):
    user = make_user()
    _, script_id = make_script(user)
    client.put(f"/scripts/{script_id}", json={"content": "   \n\n  \n"},
               headers=user["headers"])

    res = _mark(client, user, script_id)

    assert res.status_code == 400


def test_the_status_survives_a_reload(client, make_user, make_script):
    # The unlock is a property of the script, not of the browser session.
    user = make_user()
    _, script_id = make_script(user)
    client.put(f"/scripts/{script_id}", json={"content": SCENE}, headers=user["headers"])
    _mark(client, user, script_id)

    res = client.get(f"/scripts/{script_id}", headers=user["headers"])

    assert res.json()["status"] == "first_draft"


def test_writing_more_does_not_un_declare_it(client, make_user, make_script):
    # Re-locking someone mid-session over a word count would be the tool
    # overruling the person. The declaration is about intent.
    user = make_user()
    _, script_id = make_script(user)
    client.put(f"/scripts/{script_id}", json={"content": SCENE}, headers=user["headers"])
    _mark(client, user, script_id)

    client.put(f"/scripts/{script_id}",
               json={"content": SCENE + "\nINT. BUS PARK - NIGHT\n\nRain.\n"},
               headers=user["headers"])
    res = client.get(f"/scripts/{script_id}", headers=user["headers"])

    assert res.json()["status"] == "first_draft"


def test_finalize_still_works_from_first_draft(client, make_user, make_script):
    # `draft -> first_draft -> finalized`. The new status sits BETWEEN the two
    # that already existed; it must not become a dead end.
    user = make_user()
    _, script_id = make_script(user)
    client.put(f"/scripts/{script_id}", json={"content": SCENE}, headers=user["headers"])
    _mark(client, user, script_id)

    res = client.post(f"/scripts/{script_id}/finalize", headers=user["headers"])

    assert res.status_code == 200, res.text
    assert res.json()["status"] == "finalized"


def test_finalize_still_works_without_marking_first(client, make_user, make_script):
    # The new status is not a required step. A writer who goes straight to
    # finalize is not doing anything wrong.
    user = make_user()
    _, script_id = make_script(user)
    client.put(f"/scripts/{script_id}", json={"content": SCENE}, headers=user["headers"])

    res = client.post(f"/scripts/{script_id}/finalize", headers=user["headers"])

    assert res.status_code == 200, res.text
    assert res.json()["status"] == "finalized"


def test_someone_elses_script_cannot_be_marked(client, make_user, make_script):
    # Same rule as every other script route: a 404 rather than a 403, so an id
    # cannot be probed for existence.
    owner = make_user()
    _, script_id = make_script(owner)
    client.put(f"/scripts/{script_id}", json={"content": SCENE},
               headers=owner["headers"])
    stranger = make_user()

    res = _mark(client, stranger, script_id)

    assert res.status_code == 404
