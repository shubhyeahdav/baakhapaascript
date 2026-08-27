"""Who has read this script.

Sharing works, so an unpublished screenplay can be opened by other people — and
the writer had no way to find out that it had been.

Two things make this a feature rather than a table. It records only the events
that answer the question, because logging every request writes an entry per
autosave and the one interesting line drowns. And it is admin-only, because a
log of who read a draft is itself sensitive: showing every collaborator who
else has been looking turns a safeguard into surveillance.
"""
import audit
import membership
from database import supabase


def _open(client, script_id, user):
    return client.get(f"/scripts/{script_id}", headers=user["headers"])


# ---------------------------------------------------------------------------
# What gets recorded
# ---------------------------------------------------------------------------
def test_a_collaborator_opening_a_script_is_recorded(client, make_user, make_script):
    owner = make_user()
    project_id, script_id = make_script(owner)
    reader = make_user()
    client.post(
        f"/projects/{project_id}/members",
        json={"email": reader["email"], "role": membership.VIEWER},
        headers=owner["headers"],
    )

    _open(client, script_id, reader)

    entries = client.get(f"/scripts/{script_id}/access", headers=owner["headers"]).json()["entries"]
    assert any(e["action"] == audit.OPENED and e["email"] == reader["email"] for e in entries)


def test_the_owner_reading_their_own_work_is_not_an_event(client, make_user, make_script):
    """A page of your own opens is not a log anyone reads twice."""
    owner = make_user()
    _project_id, script_id = make_script(owner)

    _open(client, script_id, owner)
    _open(client, script_id, owner)

    entries = client.get(f"/scripts/{script_id}/access", headers=owner["headers"]).json()["entries"]
    assert entries == []


def test_repeat_visits_collapse_into_one_entry(client, make_user, make_script):
    """A collaborator with the script open in a tab all afternoon is one line,
    not forty. That coalescing is what keeps the log readable, and readability
    is the whole feature."""
    owner = make_user()
    project_id, script_id = make_script(owner)
    reader = make_user()
    client.post(
        f"/projects/{project_id}/members",
        json={"email": reader["email"], "role": membership.VIEWER},
        headers=owner["headers"],
    )

    for _ in range(5):
        _open(client, script_id, reader)

    entries = client.get(f"/scripts/{script_id}/access", headers=owner["headers"]).json()["entries"]
    opens = [e for e in entries if e["action"] == audit.OPENED]
    assert len(opens) == 1


def test_taking_a_copy_out_is_recorded(client, make_user, make_script):
    """The event a writer most wants to know about, and the one that otherwise
    leaves no trace at all."""
    owner = make_user()
    project_id, script_id = make_script(owner)
    reader = make_user()
    client.post(
        f"/projects/{project_id}/members",
        json={"email": reader["email"], "role": membership.VIEWER},
        headers=owner["headers"],
    )

    client.get(f"/export/script/pdf/{script_id}", headers=reader["headers"])

    entries = client.get(f"/scripts/{script_id}/access", headers=owner["headers"]).json()["entries"]
    assert any(e["action"] == audit.EXPORTED for e in entries)


# ---------------------------------------------------------------------------
# Who may read the log
# ---------------------------------------------------------------------------
def test_a_viewer_cannot_see_who_else_has_been_looking(client, make_user, make_script):
    """Showing every collaborator the log would turn a safeguard into
    surveillance. The person entitled to it is the one whose work is read."""
    owner = make_user()
    project_id, script_id = make_script(owner)
    reader = make_user()
    client.post(
        f"/projects/{project_id}/members",
        json={"email": reader["email"], "role": membership.VIEWER},
        headers=owner["headers"],
    )

    res = client.get(f"/scripts/{script_id}/access", headers=reader["headers"])
    assert res.status_code == 403


def test_a_stranger_gets_a_404_not_a_403(client, make_user, make_script):
    owner = make_user()
    _project_id, script_id = make_script(owner)
    stranger = make_user()
    res = client.get(f"/scripts/{script_id}/access", headers=stranger["headers"])
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# What it holds, and what it must not
# ---------------------------------------------------------------------------
def test_the_log_holds_who_and_when_never_what():
    """No draft text, no scene names, nothing about the content of a visit."""
    audit.record("script-x", "user-y", audit.OPENED)
    rows = supabase.table("access_log").select("*").eq("script_id", "script-x").execute().data
    assert rows
    assert set(rows[0]) <= {"id", "script_id", "user_id", "action", "created_at"}


def test_a_failed_write_never_breaks_the_read():
    """An audit entry failing to save must not stop a writer opening their
    script. The log informs; breaking the product to protect it is the wrong
    trade."""
    assert audit.record("", "", audit.OPENED) is False
    assert audit.record("s", "u", "not-a-real-action") is False


def test_the_log_is_deleted_with_the_project(client, make_user, make_script):
    """A record of who used to read a deleted project is exactly what an
    erasure is supposed to remove."""
    owner = make_user()
    project_id, script_id = make_script(owner)
    audit.record(script_id, "someone-else", audit.OPENED)

    client.delete(f"/projects/{project_id}", headers=owner["headers"])

    rows = supabase.table("access_log").select("*").eq("script_id", script_id).execute().data
    assert not rows


def test_names_are_resolved_at_read_time_not_stored():
    """A copy of somebody's name in the log would go stale the moment they
    changed it, and would be a second place their personal data lives."""
    audit.record("script-z", "user-unknown", audit.OPENED)
    entries = audit.history("script-z")
    assert entries
    assert entries[0]["name"]


def test_the_repeat_visit_window_is_configurable(monkeypatch):
    """`ACCESS_LOG_WINDOW_SECONDS` is what decides whether a second visit is a
    new line or a bumped timestamp.

    Note the mechanic: `audit.py` reads the variable at IMPORT time, so
    `monkeypatch.setenv` does nothing here — the module attribute is what has to
    be patched. The same is true of `esewa.TIMEOUT` and `khalti.TIMEOUT` if
    anyone tests those later.
    """
    monkeypatch.setattr(audit, "ACCESS_LOG_WINDOW_SECONDS", 0)

    audit.record("script-window", "reader-1", audit.OPENED)
    audit.record("script-window", "reader-1", audit.OPENED)

    entries = audit.history("script-window")
    assert len(entries) == 2, "a zero-length window should collapse nothing"
