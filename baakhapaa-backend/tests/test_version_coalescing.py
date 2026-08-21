"""Auto-save must not drown version history.

The editor saves a few seconds after the last keystroke, and every save used to
insert a version row holding the whole previous draft. A morning's writing
produced dozens of rows all labelled "Auto save" — history became unreadable
exactly when it started to matter, and storage grew by a full copy of the script
per typing pause.
"""
from datetime import datetime, timedelta, timezone

import pytest

import scripts as scripts_module
from database import supabase


def _versions(client, user, script_id):
    r = client.get(f"/versions/{script_id}", headers=user["headers"])
    assert r.status_code == 200, r.text
    return r.json()


def _save(client, user, script_id, content):
    r = client.put(f"/scripts/{script_id}", json={"content": content}, headers=user["headers"])
    assert r.status_code == 200, r.text
    return r.json()


def _age_newest_version(script_id, seconds):
    """Backdate the latest snapshot so the window has demonstrably elapsed."""
    rows = supabase.table("versions").select("*").eq("script_id", script_id).execute().data
    newest = sorted(rows, key=lambda r: r["created_at"])[-1]
    stale = (datetime.now() - timedelta(seconds=seconds)).isoformat()
    supabase.table("versions").update({"created_at": stale}).eq("id", newest["id"]).execute()


def test_a_run_of_autosaves_leaves_one_snapshot(client, make_user, make_script):
    user = make_user("free")
    _, script_id = make_script(user)

    _save(client, user, script_id, "INT. PASAL - DAY\n\nOne.\n")      # nothing before it
    for line in ("Two.", "Three.", "Four.", "Five."):
        _save(client, user, script_id, f"INT. PASAL - DAY\n\n{line}\n")

    assert len(_versions(client, user, script_id)) == 1


def test_an_unchanged_save_records_nothing(client, make_user, make_script):
    """The editor re-saves on a timer, so identical saves are routine."""
    user = make_user("free")
    _, script_id = make_script(user)
    _save(client, user, script_id, "INT. PASAL - DAY\n\nOne.\n")
    _save(client, user, script_id, "INT. PASAL - DAY\n\nTwo.\n")

    before = len(_versions(client, user, script_id))
    for _ in range(3):
        _save(client, user, script_id, "INT. PASAL - DAY\n\nTwo.\n")
    assert len(_versions(client, user, script_id)) == before


def test_the_first_save_does_not_snapshot_an_empty_page(client, make_user, make_script):
    user = make_user("free")
    _, script_id = make_script(user)
    _save(client, user, script_id, "INT. PASAL - DAY\n\nFirst words.\n")
    assert _versions(client, user, script_id) == []


def test_a_save_after_the_window_snapshots_again(client, make_user, make_script):
    """Coalescing is a window, not a cap: a later session gets its own history."""
    user = make_user("free")
    _, script_id = make_script(user)
    _save(client, user, script_id, "INT. PASAL - DAY\n\nOne.\n")
    _save(client, user, script_id, "INT. PASAL - DAY\n\nTwo.\n")
    assert len(_versions(client, user, script_id)) == 1

    _age_newest_version(script_id, scripts_module.AUTOSAVE_SNAPSHOT_WINDOW_SECONDS + 60)
    _save(client, user, script_id, "INT. PASAL - DAY\n\nThree.\n")
    assert len(_versions(client, user, script_id)) == 2


def test_coalescing_never_crosses_a_manual_save(client, make_user, make_script):
    """A label the writer chose is a boundary in their own terms."""
    user = make_user("free")
    _, script_id = make_script(user)
    _save(client, user, script_id, "INT. PASAL - DAY\n\nOne.\n")

    r = client.post(
        "/versions/",
        params={"script_id": script_id, "content": "INT. PASAL - DAY\n\nOne.\n",
                "label": "Before the rewrite"},
        headers=user["headers"],
    )
    assert r.status_code == 200, r.text

    _save(client, user, script_id, "INT. PASAL - DAY\n\nTwo.\n")
    labels = [v["label"] for v in _versions(client, user, script_id)]
    assert "Before the rewrite" in labels
    assert scripts_module.AUTOSAVE_LABEL in labels


def test_the_snapshot_still_holds_the_previous_draft(client, make_user, make_script):
    """Coalescing must keep the state at the START of the window — that is the
    one a writer wants back."""
    user = make_user("free")
    _, script_id = make_script(user)
    _save(client, user, script_id, "INT. PASAL - DAY\n\nThe good version.\n")
    _save(client, user, script_id, "INT. PASAL - DAY\n\nA worse version.\n")
    _save(client, user, script_id, "INT. PASAL - DAY\n\nAn even worse version.\n")

    versions = _versions(client, user, script_id)
    assert len(versions) == 1
    assert "The good version." in versions[0]["content"]

    restored = client.post(f"/versions/{versions[0]['id']}/restore", headers=user["headers"])
    assert restored.status_code == 200
    assert "The good version." in restored.json()["content"]


class TestAgeSeconds:
    """Both storage modes write timestamps: the local store naive, Supabase aware."""

    def test_a_naive_timestamp_is_read_as_local(self):
        just_now = (datetime.now() - timedelta(seconds=30)).isoformat()
        assert 20 < scripts_module._age_seconds(just_now) < 60

    def test_an_aware_timestamp_is_read_as_utc(self):
        just_now = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat()
        assert 20 < scripts_module._age_seconds(just_now) < 60

    def test_a_trailing_z_is_accepted(self):
        stamp = (datetime.now(timezone.utc) - timedelta(seconds=30)) \
            .isoformat().replace("+00:00", "Z")
        assert 20 < scripts_module._age_seconds(stamp) < 60

    @pytest.mark.parametrize("value", [None, "", "yesterday", "2026-13-45"])
    def test_an_unreadable_timestamp_keeps_the_snapshot(self, value):
        """Fail towards preserving the writer's history, never towards dropping it."""
        assert scripts_module._age_seconds(value) == float("inf")
