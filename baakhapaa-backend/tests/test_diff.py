"""Version comparison (proposal FR11).

FR11 is a proposal requirement that shipped, and shipped wrong: the first
implementation compared two *sets* of lines. On a screenplay that is close to
useless. Blank lines and repeated character cues collapse to one entry, and a
line moved from act one to act three reports as no change at all, because it is
present in both sets. It was replaced with ordered `difflib` hunks and never
tested. These tests exist so the set-based version cannot come back by accident:
the moved-line and duplicate-line cases below are exactly what it got wrong.

The route half also pins an authorization ordering that was wrong until this
commit. `require_script_access` used to run *after* the 404 and after the
cross-script 400, which made the endpoint answer two questions about scripts the
caller cannot read — whether a version id exists, and whether two of them belong
to the same script. Everywhere else in this codebase an inaccessible id is a
404, precisely so ids cannot be probed. `test_a_stranger_probing_two_version_ids_learns_nothing`
is the regression test; it fails against the old ordering.
"""
import membership
from versions import DIFF_CONTEXT, _diff_hunks

PROJECT = {
    "title": "Sapana", "genre": "Drama", "tone": "Emotional",
    "language": "Bilingual", "duration_minutes": 15, "target_audience": "Youth",
}


def _save_version(client, user, script_id, content, label="Manual save"):
    """Versions are created with query params, not a body."""
    r = client.post(
        "/versions/",
        params={"script_id": script_id, "content": content, "label": label},
        headers=user["headers"],
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _compare(client, user, a, b):
    return client.get("/versions/diff/compare",
                      params={"version_id_a": a, "version_id_b": b},
                      headers=user["headers"])


def _flat(hunks):
    return [row for hunk in hunks for row in hunk]


def _typed(hunks, kind):
    return [r for r in _flat(hunks) if r["type"] == kind]


# --- _diff_hunks --------------------------------------------------------------

def test_an_unchanged_script_produces_no_hunks():
    assert _diff_hunks("INT. PASAL - DAY\n\nShe waits.\n",
                       "INT. PASAL - DAY\n\nShe waits.\n") == []


def test_a_line_moved_to_the_end_reads_as_a_move_not_as_nothing():
    """The exact failure of the set-based diff: the line is present on both
    sides, so a set saw no change. A writer moving a beat has changed the
    script more than almost anything else they can do."""
    before = "One.\nTwo.\nThree.\n"
    after = "Two.\nThree.\nOne.\n"

    hunks = _diff_hunks(before, after)

    assert hunks != []
    assert [r["text"] for r in _typed(hunks, "remove")] == ["One."]
    assert [r["text"] for r in _typed(hunks, "add")] == ["One."]


def test_a_repeated_character_cue_is_counted_once_per_occurrence():
    """Duplicates that a set collapsed. Deleting one of three identical cues is
    one removal, not zero."""
    before = "MIRA\nHello.\nMIRA\nStill here.\nMIRA\nGone.\n"
    after = "MIRA\nHello.\nMIRA\nStill here.\n"

    removed = _typed(_diff_hunks(before, after), "remove")

    assert [r["text"] for r in removed] == ["MIRA", "Gone."]


def test_blank_lines_are_diffable_content():
    """In a screenplay the blank line between a slugline and the action is
    formatting that means something. A diff that drops it is lying."""
    before = "INT. PASAL - DAY\n\nShe waits.\n"
    after = "INT. PASAL - DAY\nShe waits.\n"

    hunks = _diff_hunks(before, after)

    assert [r["text"] for r in _typed(hunks, "remove")] == [""]


def test_added_lines_are_numbered_from_the_new_side():
    hunks = _diff_hunks("One.\nTwo.\n", "One.\nInserted.\nTwo.\n")

    added = _typed(hunks, "add")
    assert [(r["line"], r["text"]) for r in added] == [(2, "Inserted.")]


def test_removed_lines_are_numbered_from_the_old_side():
    hunks = _diff_hunks("One.\nGone.\nTwo.\n", "One.\nTwo.\n")

    removed = _typed(hunks, "remove")
    assert [(r["line"], r["text"]) for r in removed] == [(2, "Gone.")]


def test_a_replaced_line_lists_the_removal_before_the_addition():
    """Reading order: what was there, then what replaced it."""
    rows = _flat(_diff_hunks("One.\nOld line.\nTwo.\n", "One.\nNew line.\nTwo.\n"))
    changed = [r for r in rows if r["type"] != "equal"]

    assert [r["type"] for r in changed] == ["remove", "add"]
    assert changed[0]["text"] == "Old line."
    assert changed[1]["text"] == "New line."


def test_two_distant_edits_become_two_hunks():
    filler = "\n".join(f"Line {i}." for i in range(20))
    before = f"Top.\n{filler}\nBottom.\n"
    after = f"Top changed.\n{filler}\nBottom changed.\n"

    assert len(_diff_hunks(before, after)) == 2


def test_two_adjacent_edits_become_one_hunk():
    """Within twice the context, two edits read as one moment in the script."""
    before = "One.\nTwo.\nThree.\n"
    after = "One changed.\nTwo.\nThree changed.\n"

    assert len(_diff_hunks(before, after)) == 1


def test_a_hunk_carries_context_either_side():
    """Two unchanged lines lead in, so the change reads as part of a scene. Only
    one trails it here, because the draft ends just after the edit — the window
    is clipped by the file rather than padded out."""
    filler = "\n".join(f"Line {i}." for i in range(20))
    hunks = _diff_hunks(f"{filler}\nEnd.\n", f"{filler}\nEnd changed.\n")

    kinds = [r["type"] for r in hunks[0]]
    assert kinds[:DIFF_CONTEXT] == ["equal"] * DIFF_CONTEXT
    assert kinds[DIFF_CONTEXT:] == ["remove", "add", "equal"]


def test_context_is_clipped_at_the_start_of_the_script():
    """An edit on line 1 has no lines above it. The window must not run
    negative and wrap around to the end of the file."""
    hunks = _diff_hunks("First.\nSecond.\nThird.\n", "Changed.\nSecond.\nThird.\n")

    assert hunks[0][0]["type"] == "remove"
    assert all(r["line"] >= 1 for r in _flat(hunks))


def test_an_empty_before_reads_as_lines_added_and_nothing_removed():
    """The first save against a blank page.

    Worth pinning precisely, because the obvious expectation is wrong. `"".split("\\n")`
    is `[""]` — one empty line, not zero — and difflib matches it against the blank
    line between the slugline and the action. So the writer is shown three additions
    and no removals, which is what actually happened. An implementation that reported
    a removed line here would be reporting a deletion from an empty page.
    """
    hunks = _diff_hunks("", "INT. PASAL - DAY\n\nShe waits.\n")

    assert [r["text"] for r in _typed(hunks, "add")] == [
        "INT. PASAL - DAY", "She waits.", ""
    ]
    assert _typed(hunks, "remove") == []


# --- GET /versions/diff/compare ----------------------------------------------

def test_a_diff_reports_what_changed(client, make_user, make_script):
    user = make_user()
    _, script_id = make_script(user)
    a = _save_version(client, user, script_id, "INT. PASAL - DAY\n\nShe waits.\n")
    b = _save_version(client, user, script_id, "INT. PASAL - DAY\n\nShe leaves.\n")

    r = _compare(client, user, a, b)

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["added"] == 1
    assert body["removed"] == 1
    assert body["summary"] == "1 line added, 1 removed, across 1 place."


def test_identical_versions_report_no_changes(client, make_user, make_script):
    user = make_user()
    _, script_id = make_script(user)
    draft = "INT. PASAL - DAY\n\nShe waits.\n"
    a = _save_version(client, user, script_id, draft)
    b = _save_version(client, user, script_id, draft, label="Same again")

    body = _compare(client, user, a, b).json()

    assert body["hunks"] == []
    assert body["added"] == 0 and body["removed"] == 0
    assert body["summary"] == "No changes between these versions."


def test_the_summary_pluralises_lines_and_places(client, make_user, make_script):
    """Both branches of both ternaries. It reads as a sentence to the writer, so
    "1 lines added" is a visible defect, not a nitpick."""
    user = make_user()
    _, script_id = make_script(user)
    filler = "\n".join(f"Line {i}." for i in range(20))
    a = _save_version(client, user, script_id, f"Top.\n{filler}\nBottom.\n")
    b = _save_version(client, user, script_id, f"Top changed.\n{filler}\nBottom changed.\n")

    summary = _compare(client, user, a, b).json()["summary"]

    assert summary == "2 lines added, 2 removed, across 2 places."


def test_comparing_a_version_that_does_not_exist_is_a_404(client, make_user, make_script):
    user = make_user()
    _, script_id = make_script(user)
    a = _save_version(client, user, script_id, "One.\n")

    r = _compare(client, user, a, "no-such-version")

    assert r.status_code == 404, r.text


def test_versions_from_two_different_scripts_are_refused(client, make_user, make_script):
    """Meaningless, and a way to read across scripts if it were allowed. This is
    the caller who owns both, so they are told plainly what is wrong."""
    user = make_user("pro")  # the free plan allows one project; this needs two
    _, script_one = make_script(user)
    _, script_two = make_script(user)
    a = _save_version(client, user, script_one, "One.\n")
    b = _save_version(client, user, script_two, "Two.\n")

    r = _compare(client, user, a, b)

    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "Those versions belong to different scripts."


def test_a_stranger_probing_two_version_ids_learns_nothing(client, make_user, make_script):
    """The regression test for the authorization ordering.

    A stranger sends two version ids belonging to two scripts they cannot read.
    With the access check running last, the 400 told them those ids exist and
    belong to different scripts — a working oracle over other people's version
    ids. It must be a 404, the same answer they get for anything else they
    cannot see.
    """
    owner = make_user("pro")  # the free plan allows one project; this needs two
    stranger = make_user()
    _, script_one = make_script(owner)
    _, script_two = make_script(owner)
    a = _save_version(client, owner, script_one, "One.\n")
    b = _save_version(client, owner, script_two, "Two.\n")

    r = _compare(client, stranger, a, b)

    assert r.status_code == 404, r.text


def test_a_stranger_gets_the_same_answer_for_same_script_ids(client, make_user, make_script):
    """The other half of the oracle: two versions of the SAME script must also
    be a 404 for a stranger, so the two cases are indistinguishable."""
    owner = make_user()
    stranger = make_user()
    _, script_id = make_script(owner)
    a = _save_version(client, owner, script_id, "One.\n")
    b = _save_version(client, owner, script_id, "Two.\n")

    r = _compare(client, stranger, a, b)

    assert r.status_code == 404, r.text


def test_a_viewer_can_read_a_diff(client, make_user, make_script):
    """Viewer is the documented minimum: reading what changed is not a
    privileged act on a script you have been given."""
    owner = make_user()
    viewer = make_user()
    project_id, script_id = make_script(owner)
    added = client.post(f"/projects/{project_id}/members",
                        json={"email": viewer["email"], "role": membership.VIEWER},
                        headers=owner["headers"])
    assert added.status_code == 200, added.text

    a = _save_version(client, owner, script_id, "One.\n")
    b = _save_version(client, owner, script_id, "Two.\n")

    r = _compare(client, viewer, a, b)

    assert r.status_code == 200, r.text
    assert r.json()["added"] == 1
