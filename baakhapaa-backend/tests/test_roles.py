"""Project membership and roles (proposal FR12).

FR12 asks for "Admin, Editor, and Viewer roles with defined permissions across
all system features". What existed was a `role` column written as "editor" for
every account and read by nothing, while the nav bar linked to a Team tab that
said invites were not available.

This is authorization, so the tests are written the way authorization should be
reasoned about: for each role, what it may do AND what it must not.
"""
import pytest

import membership

PROJECT = {
    "title": "Seto Bagh", "genre": "Drama", "tone": "Emotional",
    "language": "English", "duration_minutes": 15, "target_audience": "Youth",
}

DRAFT = "INT. CHIYA PASAL - MORNING\n\nSteam rises. Raaja waits.\n"


@pytest.fixture
def shared(client, make_user):
    """An owner with a written script, plus one member at a given role."""

    def _make(role):
        owner = make_user("pro")
        project_id = client.post("/projects/", json=PROJECT, headers=owner["headers"]).json()["id"]
        script_id = client.get(f"/scripts/project/{project_id}",
                               headers=owner["headers"]).json()["id"]
        client.put(f"/scripts/{script_id}", json={"content": DRAFT}, headers=owner["headers"])

        member = make_user("pro")
        r = client.post(f"/projects/{project_id}/members",
                        json={"email": member["email"], "role": role},
                        headers=owner["headers"])
        assert r.status_code == 200, r.text
        return owner, member, project_id, script_id

    return _make


class TestRankings:
    def test_admin_outranks_editor_outranks_viewer(self):
        assert membership.rank(membership.ADMIN) > membership.rank(membership.EDITOR)
        assert membership.rank(membership.EDITOR) > membership.rank(membership.VIEWER)

    def test_an_unknown_role_outranks_nothing(self):
        """A typo in the database must not become an escalation."""
        assert membership.rank("superuser") == 0
        assert membership.rank(None) == 0


class TestOwner:
    def test_the_owner_is_an_admin_without_a_membership_row(self, client, make_user):
        """Every project created before this table existed keeps working."""
        owner = make_user("free")
        project = client.post("/projects/", json=PROJECT, headers=owner["headers"]).json()

        r = client.get(f"/projects/{project['id']}", headers=owner["headers"])
        assert r.json()["your_role"] == membership.ADMIN

    def test_the_owner_cannot_be_removed(self, client, make_user, shared):
        owner, _, project_id, _ = shared("editor")
        r = client.delete(f"/projects/{project_id}/members/{owner['id']}",
                          headers=owner["headers"])
        assert r.status_code == 400
        assert "Delete the project instead" in r.json()["detail"]

    def test_the_owners_role_cannot_be_changed(self, client, shared):
        owner, _, project_id, _ = shared("editor")
        r = client.put(f"/projects/{project_id}/members/{owner['id']}",
                       json={"role": "viewer"}, headers=owner["headers"])
        assert r.status_code == 400


class TestViewer:
    def test_can_read_the_script(self, client, shared):
        _, viewer, _, script_id = shared("viewer")
        r = client.get(f"/scripts/{script_id}", headers=viewer["headers"])
        assert r.status_code == 200
        assert "Steam rises" in r.json()["content"]

    def test_cannot_write_the_script(self, client, shared):
        _, viewer, _, script_id = shared("viewer")
        r = client.put(f"/scripts/{script_id}", json={"content": "Mine now."},
                       headers=viewer["headers"])
        assert r.status_code == 403
        assert "editor" in r.json()["detail"]

    def test_the_draft_is_actually_unchanged_after_a_refused_write(self, client, shared):
        owner, viewer, _, script_id = shared("viewer")
        client.put(f"/scripts/{script_id}", json={"content": "Mine now."},
                   headers=viewer["headers"])
        assert "Steam rises" in client.get(f"/scripts/{script_id}",
                                           headers=owner["headers"]).json()["content"]

    def test_can_export_a_pdf(self, client, shared):
        """A reader is exactly the person who needs the script as a file."""
        _, viewer, _, script_id = shared("viewer")
        assert client.get(f"/export/script/pdf/{script_id}",
                          headers=viewer["headers"]).status_code == 200

    def test_can_comment(self, client, shared):
        """Giving notes is the whole reason a reader is on someone's script."""
        _, viewer, _, script_id = shared("viewer")
        r = client.post("/collaboration/comments",
                        json={"script_id": script_id, "content": "Act 2 sags.", "line_number": 12},
                        headers=viewer["headers"])
        assert r.status_code == 200

    def test_cannot_add_a_scene(self, client, shared):
        _, viewer, _, script_id = shared("viewer")
        r = client.post("/scripts/add-scene",
                        json={"script_id": script_id, "title": "Mine", "order_index": 0},
                        headers=viewer["headers"])
        assert r.status_code == 403

    def test_cannot_generate_a_storyboard(self, client, shared):
        _, viewer, _, script_id = shared("viewer")
        r = client.post(f"/storyboard/generate/{script_id}", headers=viewer["headers"])
        assert r.status_code == 403

    def test_cannot_finalize(self, client, shared):
        _, viewer, _, script_id = shared("viewer")
        assert client.post(f"/scripts/{script_id}/finalize",
                           headers=viewer["headers"]).status_code == 403

    def test_cannot_delete_the_project(self, client, shared):
        _, viewer, project_id, _ = shared("viewer")
        assert client.delete(f"/projects/{project_id}",
                             headers=viewer["headers"]).status_code == 403

    def test_cannot_manage_members(self, client, make_user, shared):
        _, viewer, project_id, _ = shared("viewer")
        outsider = make_user("free")
        r = client.post(f"/projects/{project_id}/members",
                        json={"email": outsider["email"], "role": "editor"},
                        headers=viewer["headers"])
        assert r.status_code == 403


class TestEditor:
    def test_can_write_the_script(self, client, shared):
        _, editor, _, script_id = shared("editor")
        r = client.put(f"/scripts/{script_id}", json={"content": DRAFT + "\nMore.\n"},
                       headers=editor["headers"])
        assert r.status_code == 200

    def test_can_generate_a_storyboard(self, client, shared):
        _, editor, _, script_id = shared("editor")
        assert client.post(f"/storyboard/generate/{script_id}",
                           headers=editor["headers"]).status_code == 200

    def test_cannot_delete_the_project(self, client, shared):
        """Writing is not administering."""
        _, editor, project_id, _ = shared("editor")
        assert client.delete(f"/projects/{project_id}",
                             headers=editor["headers"]).status_code == 403

    def test_cannot_manage_members(self, client, make_user, shared):
        _, editor, project_id, _ = shared("editor")
        outsider = make_user("free")
        assert client.post(f"/projects/{project_id}/members",
                           json={"email": outsider["email"], "role": "viewer"},
                           headers=editor["headers"]).status_code == 403


class TestAdminMember:
    def test_a_promoted_admin_can_manage_members(self, client, make_user, shared):
        _owner, admin, project_id, _ = shared("admin")
        outsider = make_user("free")
        r = client.post(f"/projects/{project_id}/members",
                        json={"email": outsider["email"], "role": "viewer"},
                        headers=admin["headers"])
        assert r.status_code == 200

    def test_a_promoted_admin_can_delete_the_project(self, client, shared):
        _, admin, project_id, _ = shared("admin")
        assert client.delete(f"/projects/{project_id}",
                             headers=admin["headers"]).status_code == 200


class TestOutsiders:
    def test_a_stranger_gets_404_not_403(self, client, make_user, shared):
        """403 would confirm the id exists to someone probing for it."""
        _, _, project_id, script_id = shared("editor")
        stranger = make_user("pro")

        assert client.get(f"/scripts/{script_id}",
                          headers=stranger["headers"]).status_code == 404
        assert client.get(f"/projects/{project_id}",
                          headers=stranger["headers"]).status_code == 404

    def test_a_member_who_lacks_rank_gets_403_not_404(self, client, shared):
        """They already know it exists — a 404 there would read as data loss."""
        _, viewer, project_id, _ = shared("viewer")
        assert client.delete(f"/projects/{project_id}",
                             headers=viewer["headers"]).status_code == 403


class TestMemberManagement:
    def test_a_shared_project_appears_on_the_members_dashboard(self, client, shared):
        _, member, project_id, _ = shared("viewer")
        listed = client.get("/projects/", headers=member["headers"]).json()
        assert [p["id"] for p in listed] == [project_id]
        assert listed[0]["your_role"] == "viewer"
        assert listed[0]["owner"] is False

    def test_the_owners_own_projects_are_marked_as_theirs(self, client, shared):
        owner, _, _project_id, _ = shared("viewer")
        listed = client.get("/projects/", headers=owner["headers"]).json()
        assert listed[0]["owner"] is True
        assert listed[0]["your_role"] == "admin"

    def test_members_are_listed_with_the_owner_first(self, client, shared):
        owner, member, project_id, _ = shared("editor")
        body = client.get(f"/projects/{project_id}/members", headers=owner["headers"]).json()
        assert body["members"][0]["owner"] is True
        assert body["members"][0]["email"] == owner["email"]
        assert body["members"][1]["email"] == member["email"]
        assert body["members"][1]["role"] == "editor"

    def test_a_role_can_be_changed(self, client, shared):
        owner, member, project_id, script_id = shared("viewer")
        r = client.put(f"/projects/{project_id}/members/{member['id']}",
                       json={"role": "editor"}, headers=owner["headers"])
        assert r.status_code == 200
        # And it takes effect immediately.
        assert client.put(f"/scripts/{script_id}", json={"content": "Now I can."},
                          headers=member["headers"]).status_code == 200

    def test_removing_a_member_revokes_access(self, client, shared):
        owner, member, project_id, script_id = shared("editor")
        assert client.delete(f"/projects/{project_id}/members/{member['id']}",
                             headers=owner["headers"]).status_code == 200
        assert client.get(f"/scripts/{script_id}",
                          headers=member["headers"]).status_code == 404

    def test_an_unknown_email_is_refused_clearly(self, client, make_user):
        """There is no invitation email yet, so say so rather than creating a
        membership pointing at nobody."""
        owner = make_user("free")
        project_id = client.post("/projects/", json=PROJECT, headers=owner["headers"]).json()["id"]
        r = client.post(f"/projects/{project_id}/members",
                        json={"email": "nobody@example.com", "role": "editor"},
                        headers=owner["headers"])
        assert r.status_code == 404
        assert "register first" in r.json()["detail"]

    def test_adding_the_same_person_twice_is_refused(self, client, shared):
        owner, member, project_id, _ = shared("editor")
        r = client.post(f"/projects/{project_id}/members",
                        json={"email": member["email"], "role": "viewer"},
                        headers=owner["headers"])
        assert r.status_code == 400

    def test_adding_the_owner_is_refused(self, client, shared):
        owner, _, project_id, _ = shared("editor")
        r = client.post(f"/projects/{project_id}/members",
                        json={"email": owner["email"], "role": "viewer"},
                        headers=owner["headers"])
        assert r.status_code == 400

    @pytest.mark.parametrize("bad", ["owner", "superuser", "", "admin; drop table"])
    def test_an_invalid_role_is_rejected(self, client, make_user, shared, bad):
        owner, member, project_id, _ = shared("editor")
        r = client.put(f"/projects/{project_id}/members/{member['id']}",
                       json={"role": bad}, headers=owner["headers"])
        assert r.status_code in (400, 422)

    @pytest.mark.parametrize("given", ["ADMIN", " admin ", "Admin"])
    def test_case_and_whitespace_are_normalised(self, client, shared, given):
        """Forgiving input, exact storage — the stored value is what every
        permission check compares against, so it cannot be " Admin"."""
        owner, member, project_id, _ = shared("editor")
        r = client.put(f"/projects/{project_id}/members/{member['id']}",
                       json={"role": given}, headers=owner["headers"])
        assert r.status_code == 200

        listed = client.get(f"/projects/{project_id}/members",
                            headers=owner["headers"]).json()["members"]
        assert next(m for m in listed if m["email"] == member["email"])["role"] == "admin"

    def test_a_members_project_limit_is_not_consumed_by_being_added(self, client, make_user):
        """Being invited to someone's project must not use up the free plan's
        one-project allowance — otherwise sharing costs the reader their own work."""
        owner = make_user("pro")
        project_id = client.post("/projects/", json=PROJECT, headers=owner["headers"]).json()["id"]

        reader = make_user("free")
        client.post(f"/projects/{project_id}/members",
                    json={"email": reader["email"], "role": "viewer"}, headers=owner["headers"])

        r = client.post("/projects/", json={**PROJECT, "title": "My own"},
                        headers=reader["headers"])
        assert r.status_code == 200, "a shared project should not count against the free limit"
