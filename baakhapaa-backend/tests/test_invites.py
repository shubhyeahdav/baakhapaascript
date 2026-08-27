"""Inviting someone who has no account yet.

Until this existed, `add_member` refused an unknown address — "they need to
register first" — so collaboration could only happen between two people who had
both already found the product and signed up. That is not how collaboration
starts, and it made the Studio tier's whole proposition (team seats)
unsellable.

The property this file exists to defend is the one that could leak an
unproduced screenplay: **the invitation link does not grant access.** It only
describes what is being offered. Membership is granted when somebody registers
with the invited address. If that ever inverts, the link becomes a bearer token
in a forwarded WhatsApp message and whoever receives it lands inside a stranger's
script.

No email is sent, deliberately — there is no SMTP account, and `renewals.py`
already shows what pretending otherwise costs. The inviter passes the link on
themselves.
"""
import uuid

import invites
from database import supabase

PROJECT = {
    "title": "Sapana", "genre": "Drama", "tone": "Emotional",
    "language": "Bilingual", "duration_minutes": 15, "target_audience": "Youth",
}


def _project(client, owner):
    return client.post("/projects/", json=PROJECT, headers=owner["headers"]).json()["id"]


def _invite(client, owner, project_id, email, role="editor"):
    return client.post(f"/projects/{project_id}/members",
                       json={"email": email, "role": role},
                       headers=owner["headers"])


def _address(tag="guest"):
    """A fresh address per call.

    Several tests below REGISTER the address they invited, and the mock store is
    process-global — so a literal reused across tests is already a real account
    by the time the next test runs, and the invite path is never exercised.
    """
    return f"{tag}-{uuid.uuid4().hex[:10]}@example.com"


def _register(client, email, name="Invited Person"):
    return client.post("/auth/register",
                       json={"email": email, "password": "Kathmandu!2026", "name": name})


def _projects_for(client, user):
    return client.get("/projects/", headers=user["headers"]).json()


# --- creating an invitation ---------------------------------------------------

def test_an_unknown_address_becomes_an_invitation_rather_than_an_error(
        client, make_user):
    """The old behaviour was a 404 telling the inviter to go and recruit."""
    owner = make_user("pro")
    project_id = _project(client, owner)

    nobody = _address("nobody")
    r = _invite(client, owner, project_id, nobody)

    assert r.status_code == 200, r.text
    assert r.json()["pending"] is True
    assert r.json()["email"] == nobody


def test_the_address_is_normalised_the_way_login_normalises_it(client, make_user):
    """`Mira@Studio.com` and `mira@studio.com` are one person. An invite that
    disagreed with the users table would simply never be claimed."""
    owner = make_user("pro")
    project_id = _project(client, owner)

    r = _invite(client, owner, project_id, "  Mira@Studio.COM  ")

    assert r.json()["email"] == "mira@studio.com"


def test_re_inviting_returns_the_same_invitation(client, make_user):
    """Not an error — it is what somebody does when the first message was
    missed. The link has to keep working."""
    owner = make_user("pro")
    project_id = _project(client, owner)

    same = _address("nobody")
    first = _invite(client, owner, project_id, same).json()
    second = _invite(client, owner, project_id, same).json()

    assert first["invite_id"] == second["invite_id"]
    assert first["token"] == second["token"]


def test_an_existing_account_still_joins_immediately(client, make_user):
    """Invitations are only for addresses with no account. Someone who has one
    should not be made to wait for a link."""
    owner = make_user("pro")
    guest = make_user()
    project_id = _project(client, owner)

    r = _invite(client, owner, project_id, guest["email"])

    assert r.status_code == 200, r.text
    assert "pending" not in r.json()
    assert r.json()["user_id"] == guest["id"]


def test_an_invitation_needs_a_real_role(client, make_user):
    """422, not 400: `MemberCreate` carries a role validator, so FastAPI rejects
    the body before the route runs. `invites.create` re-checks anyway, because a
    module that trusts its caller is one refactor from being called by something
    that has not validated."""
    owner = make_user("pro")
    project_id = _project(client, owner)

    r = _invite(client, owner, project_id, _address("nobody"), role="superuser")

    assert r.status_code == 422, r.text


def test_only_an_admin_may_invite(client, make_user):
    owner = make_user("pro")
    editor = make_user()
    project_id = _project(client, owner)
    _invite(client, owner, project_id, editor["email"], role="editor")

    r = client.post(f"/projects/{project_id}/members",
                    json={"email": _address("nobody"), "role": "viewer"},
                    headers=editor["headers"])

    assert r.status_code == 403, r.text


# --- seats --------------------------------------------------------------------

def test_a_pending_invitation_occupies_a_seat(client, make_user):
    """Otherwise a free project could invite fifty people and meet the cap only
    as they arrived one at a time — a cap that does nothing at the moment it is
    being exceeded."""
    owner = make_user("free")            # two collaborators
    project_id = _project(client, owner)

    assert _invite(client, owner, project_id, _address("one")).status_code == 200
    assert _invite(client, owner, project_id, _address("two")).status_code == 200

    r = _invite(client, owner, project_id, _address("three"))

    assert r.status_code == 402, r.text


def test_seats_count_members_and_invitations_together(client, make_user):
    owner = make_user("free")
    joined = make_user()
    project_id = _project(client, owner)
    _invite(client, owner, project_id, joined["email"])       # a real member
    _invite(client, owner, project_id, _address("pending"))  # and an invite

    r = _invite(client, owner, project_id, _address("third"))

    assert r.status_code == 402, r.text


def test_studio_can_invite_without_limit(client, make_user):
    owner = make_user("studio")
    project_id = _project(client, owner)

    for i in range(7):
        r = _invite(client, owner, project_id, _address(f"guest{i}"))
        assert r.status_code == 200, r.text


# --- the link describes, it does not grant -----------------------------------

def test_the_link_explains_the_offer_without_an_account(client, make_user):
    """The recipient has to see what they are being asked to join before
    deciding to register. Public on purpose."""
    owner = make_user("pro")
    project_id = _project(client, owner)
    token = _invite(client, owner, project_id, _address("nobody")).json()["token"]

    r = client.get(f"/invites/{token}")

    assert r.status_code == 200, r.text
    assert r.json()["project_title"] == "Sapana"
    assert r.json()["role"] == "editor"


def test_the_link_reveals_nothing_about_the_work_or_the_team(client, make_user):
    """It is a public endpoint holding a guessable-length token. It may say what
    the project is called and nothing else."""
    owner = make_user("pro")
    project_id = _project(client, owner)
    token = _invite(client, owner, project_id, _address("nobody")).json()["token"]

    body = client.get(f"/invites/{token}").json()

    assert set(body) == {"project_title", "role", "email"}


def test_holding_the_link_grants_no_access(client, make_user):
    """THE PROPERTY THIS FILE EXISTS FOR.

    A link that granted membership on its own would be a bearer token in a
    forwarded chat message. Someone who registers with a DIFFERENT address must
    get nothing, however they came by the token.
    """
    owner = make_user("pro")
    project_id = _project(client, owner)
    _invite(client, owner, project_id, _address("intended"))

    outsider = _address("outsider")
    _register(client, outsider)
    interloper = client.post("/auth/login",
                             json={"email": outsider,
                                   "password": "Kathmandu!2026"}).json()
    headers = {"Authorization": f"Bearer {interloper['token']}"}

    assert _projects_for(client, {"headers": headers}) == []
    assert client.get(f"/projects/{project_id}", headers=headers).status_code == 404


def test_an_unknown_token_is_a_404(client):
    assert client.get("/invites/not-a-real-token").status_code == 404


# --- claiming -----------------------------------------------------------------

def test_registering_with_the_invited_address_joins_the_project(client, make_user):
    owner = make_user("pro")
    project_id = _project(client, owner)
    newcomer = _address("newcomer")
    _invite(client, owner, project_id, newcomer, role="editor")

    _register(client, newcomer)
    token = client.post("/auth/login",
                        json={"email": newcomer,
                              "password": "Kathmandu!2026"}).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    mine = _projects_for(client, {"headers": headers})
    assert [p["id"] for p in mine] == [project_id]
    assert mine[0]["your_role"] == "editor"


def test_the_invited_role_is_the_role_granted(client, make_user):
    owner = make_user("pro")
    project_id = _project(client, owner)
    reader = _address("reader")
    _invite(client, owner, project_id, reader, role="viewer")

    _register(client, reader)
    token = client.post("/auth/login",
                        json={"email": reader,
                              "password": "Kathmandu!2026"}).json()["token"]

    mine = _projects_for(client, {"headers": {"Authorization": f"Bearer {token}"}})
    assert mine[0]["your_role"] == "viewer"


def test_an_invitation_is_claimed_only_once(client, make_user):
    owner = make_user("pro")
    project_id = _project(client, owner)
    once = _address("once")
    _invite(client, owner, project_id, once)
    _register(client, once)

    remaining = invites.pending_for_project(project_id)

    assert remaining == []


def test_registering_with_a_different_case_still_claims(client, make_user):
    """The invite stored lowercase; registration may not."""
    owner = make_user("pro")
    project_id = _project(client, owner)
    mixed = _address("mixed")
    _invite(client, owner, project_id, mixed)

    _register(client, mixed.upper())
    token = client.post("/auth/login",
                        json={"email": mixed.upper(),
                              "password": "Kathmandu!2026"}).json()["token"]

    mine = _projects_for(client, {"headers": {"Authorization": f"Bearer {token}"}})
    assert [p["id"] for p in mine] == [project_id]


def test_one_person_can_be_invited_to_several_projects(client, make_user):
    owner = make_user("pro")
    first = _project(client, owner)
    second = _project(client, owner)
    busy = _address("busy")
    _invite(client, owner, first, busy)
    _invite(client, owner, second, busy, role="viewer")

    _register(client, busy)
    token = client.post("/auth/login",
                        json={"email": busy,
                              "password": "Kathmandu!2026"}).json()["token"]

    mine = _projects_for(client, {"headers": {"Authorization": f"Bearer {token}"}})
    assert sorted(p["id"] for p in mine) == sorted([first, second])


def test_registration_survives_an_invitation_to_a_deleted_project(client, make_user):
    """Somebody who has just chosen a password must not be told their account
    could not be created because a project they were invited to is gone."""
    owner = make_user("pro")
    project_id = _project(client, owner)
    orphan = _address("orphan")
    _invite(client, owner, project_id, orphan)
    client.delete(f"/projects/{project_id}", headers=owner["headers"])

    r = _register(client, orphan)

    assert r.status_code == 200, r.text


def test_deleting_a_project_takes_its_unclaimed_invitations(client, make_user):
    """Leaving them keeps an email address on file after the erasure that was
    supposed to remove it."""
    owner = make_user("pro")
    project_id = _project(client, owner)
    _invite(client, owner, project_id, _address("gone"))

    client.delete(f"/projects/{project_id}", headers=owner["headers"])

    rows = supabase.table("project_invites").select("*").eq(
        "project_id", project_id).execute().data or []
    assert rows == []


# --- listing and revoking -----------------------------------------------------

def test_the_team_panel_can_see_who_is_still_pending(client, make_user):
    owner = make_user("pro")
    project_id = _project(client, owner)
    waiting = _address("waiting")
    _invite(client, owner, project_id, waiting)

    r = client.get(f"/projects/{project_id}/invites", headers=owner["headers"])

    assert r.status_code == 200, r.text
    assert [i["email"] for i in r.json()["invites"]] == [waiting]


def test_the_pending_list_does_not_expose_who_did_the_inviting(client, make_user):
    owner = make_user("pro")
    project_id = _project(client, owner)
    _invite(client, owner, project_id, _address("waiting"))

    body = client.get(f"/projects/{project_id}/invites",
                      headers=owner["headers"]).json()

    assert "invited_by" not in body["invites"][0]


def test_a_stranger_cannot_read_the_pending_list(client, make_user):
    owner = make_user("pro")
    stranger = make_user()
    project_id = _project(client, owner)
    _invite(client, owner, project_id, _address("waiting"))

    r = client.get(f"/projects/{project_id}/invites", headers=stranger["headers"])

    assert r.status_code == 404, r.text


def test_an_invitation_can_be_taken_back(client, make_user):
    owner = make_user("pro")
    project_id = _project(client, owner)
    invite_id = _invite(client, owner, project_id, "regret@example.com").json()["invite_id"]

    r = client.delete(f"/projects/{project_id}/invites/{invite_id}",
                      headers=owner["headers"])

    assert r.status_code == 200, r.text
    assert invites.pending_for_project(project_id) == []


def test_a_revoked_invitation_grants_nothing_on_registration(client, make_user):
    owner = make_user("pro")
    project_id = _project(client, owner)
    regret = _address("regret")
    invite_id = _invite(client, owner, project_id, regret).json()["invite_id"]
    client.delete(f"/projects/{project_id}/invites/{invite_id}", headers=owner["headers"])

    _register(client, regret)
    token = client.post("/auth/login",
                        json={"email": regret,
                              "password": "Kathmandu!2026"}).json()["token"]

    mine = _projects_for(client, {"headers": {"Authorization": f"Bearer {token}"}})
    assert mine == []


def test_revoking_frees_the_seat_it_held(client, make_user):
    owner = make_user("free")
    project_id = _project(client, owner)
    _invite(client, owner, project_id, _address("one"))
    invite_id = _invite(client, owner, project_id, _address("two")).json()["invite_id"]
    assert _invite(client, owner, project_id, _address("three")).status_code == 402

    client.delete(f"/projects/{project_id}/invites/{invite_id}", headers=owner["headers"])

    assert _invite(client, owner, project_id, _address("three")).status_code == 200


def test_only_an_admin_may_revoke(client, make_user):
    owner = make_user("pro")
    viewer = make_user()
    project_id = _project(client, owner)
    _invite(client, owner, project_id, viewer["email"], role="viewer")
    invite_id = _invite(client, owner, project_id, "regret@example.com").json()["invite_id"]

    r = client.delete(f"/projects/{project_id}/invites/{invite_id}",
                      headers=viewer["headers"])

    assert r.status_code == 403, r.text


def test_revoking_an_invitation_from_another_project_is_a_404(client, make_user):
    owner = make_user("pro")
    mine = _project(client, owner)
    theirs = _project(client, owner)
    invite_id = _invite(client, owner, theirs, _address("x")).json()["invite_id"]

    r = client.delete(f"/projects/{mine}/invites/{invite_id}", headers=owner["headers"])

    assert r.status_code == 404, r.text
