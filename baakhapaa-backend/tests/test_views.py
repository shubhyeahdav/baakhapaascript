"""What the Corkboard and Outline views need from the API.

Both are readings of the same scene rows, which only works because those rows
are now reconciled from the draft when a script is *loaded* rather than only
when it is saved. Before that, opening a hand-typed screenplay showed an empty
scene index, a dead timeline and an empty corkboard, and the only way to make
any of it appear was to edit the draft.
"""
import json

import payments  # noqa: F401  (keeps conftest's env pinning honest)
import screenplay


def _draft(scene):
    raw = scene.get("draft_json")
    return json.loads(raw) if raw else {}


SCREENPLAY = """INT. FRAME SHOP, PATAN - MORNING

Sunlight through dusty glass.

PRERANA
Pandhra.

EXT. PATAN COURTYARD - EVENING

Prerana sits on the step. Two BOYS play badminton.

BUBA
Ramro.

INT. KITCHEN, PRERANA'S HOME - NIGHT

Aama serves dal bhat.
"""


def _script_with_draft(client, make_user, make_script, tier="pro"):
    user = make_user(tier)
    _, script_id = make_script(user)
    saved = client.put(f"/scripts/{script_id}", json={"content": SCREENPLAY},
                       headers=user["headers"])
    assert saved.status_code == 200, saved.text
    return user, script_id


# ---------------------------------------------------------------------------
# Loading a script must populate the views
# ---------------------------------------------------------------------------
def test_opening_a_script_reconciles_its_scenes(client, make_user, make_script):
    """Sync ran on save, on storyboard and on review — never on load. A writer
    who typed a screenplay and reopened it met an empty scene index."""
    user = make_user("pro")
    _, script_id = make_script(user)

    # Write the draft straight onto the row, the way an import or an older
    # session would have left it — no save, so no sync has ever run.
    from database import supabase
    supabase.table("scripts").update({"content": SCREENPLAY}).eq("id", script_id).execute()

    loaded = client.get(f"/scripts/{script_id}", headers=user["headers"])
    assert loaded.status_code == 200
    assert len(loaded.json()["scenes"]) == 3


def test_loading_is_idempotent(client, make_user, make_script):
    """A GET that creates a row every time would multiply the corkboard."""
    user, script_id = _script_with_draft(client, make_user, make_script)
    first = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()["scenes"]
    second = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()["scenes"]
    assert len(first) == len(second) == 3
    assert [s["id"] for s in first] == [s["id"] for s in second]


# ---------------------------------------------------------------------------
# What the views read off each row
# ---------------------------------------------------------------------------
def test_every_scene_carries_a_runtime_and_a_page(client, make_user, make_script):
    """The corkboard shows both, and the timeline is only legible because of
    the first — `time_allocation` is zero on every hand-typed scene."""
    user, script_id = _script_with_draft(client, make_user, make_script)
    scenes = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()["scenes"]

    for scene in scenes:
        d = _draft(scene)
        assert d.get("minutes", 0) > 0, f"{scene['title']} has no measured runtime"
        assert d.get("page", 0) >= 1


def test_scenes_carry_the_metadata_a_board_needs(client, make_user, make_script):
    """Interior/exterior, time of day and cast were all parsed off the page and
    then shown nowhere — which is what made an index card useless to anyone but
    the writer."""
    user, script_id = _script_with_draft(client, make_user, make_script)
    scenes = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()["scenes"]

    first, second = _draft(scenes[0]), _draft(scenes[1])
    assert first["interior"] is True
    assert second["interior"] is False
    assert first["time_of_day"].upper() == "MORNING"
    assert "PRERANA" in first["characters"]


def test_the_script_reports_its_pagination(client, make_user, make_script):
    user, script_id = _script_with_draft(client, make_user, make_script)
    body = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()

    assert body["pagination"]["page_lines"] == screenplay.PAGE_LINES
    assert body["pagination"]["page_count"] == screenplay.page_count(SCREENPLAY)


def test_saving_returns_the_new_page_count(client, make_user, make_script):
    """The rules redraw as the draft grows, without a second round trip."""
    user = make_user("pro")
    _, script_id = make_script(user)
    long_draft = SCREENPLAY + "\n" * 200

    res = client.put(f"/scripts/{script_id}", json={"content": long_draft},
                     headers=user["headers"])
    assert res.json()["pagination"]["page_count"] == screenplay.page_count(long_draft)


# ---------------------------------------------------------------------------
# Custom scenes — the Corkboard's "+ New scene"
# ---------------------------------------------------------------------------
def test_a_writer_can_add_a_scene_of_their_own(client, make_user, make_script):
    """`add-scene` accepted these from the first structure commit and nothing
    ever called it that way, so every scene had to come from a suggestion."""
    user, script_id = _script_with_draft(client, make_user, make_script)

    res = client.post("/scripts/add-scene", json={
        "script_id": script_id,
        "title": "INT. ROOFTOP - NIGHT",
        "act_number": 2,
    }, headers=user["headers"])

    assert res.status_code == 200, res.text
    assert res.json()["title"] == "INT. ROOFTOP - NIGHT"
    assert res.json()["act_number"] == 2


def test_a_viewer_cannot_add_a_scene(client, make_user, make_script):
    """Adding a scene is a write. `require_script_access` defaults to editor."""
    _owner, script_id = _script_with_draft(client, make_user, make_script)
    stranger = make_user("pro")

    res = client.post("/scripts/add-scene",
                      json={"script_id": script_id, "title": "INT. NOWHERE - DAY"},
                      headers=stranger["headers"])
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Act balance — the Outline's act totals, and the review that reads them
# ---------------------------------------------------------------------------
def test_act_balance_stays_quiet_when_no_acts_were_assigned(client, make_user, make_script):
    """Sync gives a hand-written scene the act of the one before it, defaulting
    to Act 1 — so a typed screenplay put everything in Act 1 and the review
    fired three times: act 1 long, act 2 short, act 3 short. All three were
    artefacts of an assignment nobody had made."""
    user, script_id = _script_with_draft(client, make_user, make_script)
    findings = client.get(f"/scripts/{script_id}/review",
                          headers=user["headers"]).json()["findings"]

    rules = [f["rule"] for f in findings]
    assert "act_out_of_balance" not in rules
    assert rules.count("act_balance_unknown") == 1


def test_a_scene_cut_from_the_draft_is_marked_not_hidden(client, make_user, make_script):
    """The row survives — a storyboard frame points at it — but a corkboard
    that showed it as a live scene would be describing a script that no longer
    exists. A structure scene never written is a different thing and must not
    get the same mark."""
    user, script_id = _script_with_draft(client, make_user, make_script)

    trimmed = SCREENPLAY.replace(
        "INT. KITCHEN, PRERANA'S HOME - NIGHT\n\nAama serves dal bhat.\n", ""
    )
    scenes = client.put(f"/scripts/{script_id}", json={"content": trimmed},
                        headers=user["headers"]).json()["scenes"]

    cut = [s for s in scenes if _draft(s).get("removed")]
    assert len(cut) == 1
    assert "KITCHEN" in cut[0]["title"]
    # The two that remain on the page are untouched.
    assert sum(1 for s in scenes if not _draft(s).get("removed")) == 2


def test_a_planned_scene_is_not_marked_as_cut(client, make_user, make_script):
    """It was never on the page, so there is nothing to have been cut from."""
    user, script_id = _script_with_draft(client, make_user, make_script)
    client.post("/scripts/add-scene",
                json={"script_id": script_id, "title": "INT. ROOFTOP - NIGHT"},
                headers=user["headers"])

    scenes = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()["scenes"]
    planned = [s for s in scenes if s["title"] == "INT. ROOFTOP - NIGHT"]
    assert len(planned) == 1
    assert not _draft(planned[0]).get("removed")
