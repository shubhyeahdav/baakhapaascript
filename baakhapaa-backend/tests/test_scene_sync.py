"""Scene rows and the written draft must describe the same story.

These tests pin the three failures that came from letting them drift: a
hand-typed screenplay could not be storyboarded at all, a rewritten scene was
storyboarded from the beat description it started as, and the editor's scene
index counted a different set of scenes than its jump-to-scene did.
"""
import json

import pytest

import screenplay
import scene_sync
import storyboard_engine


DRAFT = """INT. CHIYA PASAL, PATAN - MORNING

Steam rises from the glasses. Raaja turns his phone face-down.

                      SANJANA
          Timro result aayo?

                      RAAJA
          Aayo.

EXT. ROOFTOP, KATHMANDU - DUSK

Kanchha balances the borrowed camera on a water tank.

                      KANCHHA
          Ready?
"""


# --- the parser's side ------------------------------------------------------

def test_heading_splits_into_place_and_time():
    parts = screenplay.heading_parts("INT. CHIYA PASAL, PATAN - MORNING")
    assert parts["location"] == "CHIYA PASAL, PATAN"
    assert parts["time_of_day"] == "MORNING"
    assert parts["interior"] is True


def test_exterior_heading_without_a_time_still_parses():
    parts = screenplay.heading_parts("EXT. RIVERBANK")
    assert parts["location"] == "RIVERBANK"
    assert parts["time_of_day"] == ""
    assert parts["interior"] is False


def test_summaries_carry_action_not_dialogue():
    """A frame illustrating spoken words is a frame with text in it."""
    first = screenplay.scene_summaries(DRAFT)[0]
    assert "Steam rises" in first["action"]
    assert "Timro result" not in first["action"]
    assert first["characters"] == ["SANJANA", "RAAJA"]


def test_stray_text_above_the_first_slugline_does_not_shift_scenes():
    """Summary N must equal slugline N — the editor counts sluglines to jump."""
    text = "A note to self about the ending.\n\n" + DRAFT
    summaries = screenplay.scene_summaries(text)
    assert len(summaries) == 2
    assert summaries[0]["heading"].startswith("INT. CHIYA PASAL")


# --- sync -------------------------------------------------------------------

def test_a_handwritten_script_gains_scene_rows(client, make_user, make_script):
    """The dead end: type your screenplay, click Finalize & Storyboard, and the
    only button on the page returned "No scenes found for this script"."""
    user = make_user("pro")
    _, script_id = make_script(user)

    client.put(f"/scripts/{script_id}", json={"content": DRAFT}, headers=user["headers"])

    scenes = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()["scenes"]
    assert len(scenes) == 2
    assert [s["location"] for s in scenes] == ["CHIYA PASAL, PATAN", "ROOFTOP, KATHMANDU"]

    r = client.post(f"/storyboard/generate/{script_id}", headers=user["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["frames_generated"] == 2


def test_save_returns_the_synced_scenes(client, make_user, make_script):
    """So the editor's index cards refresh without a second round trip."""
    user = make_user("free")
    _, script_id = make_script(user)
    r = client.put(f"/scripts/{script_id}", json={"content": DRAFT}, headers=user["headers"])
    assert r.status_code == 200
    assert len(r.json()["scenes"]) == 2


def test_empty_draft_leaves_structure_scenes_alone(client, make_user, make_script):
    """Structure-added scenes are the right answer before anything is written."""
    user = make_user("pro")
    _, script_id = make_script(user)
    client.post(
        "/scripts/add-scene",
        json={"script_id": script_id, "title": "Dinner Expectations",
              "description": "Baba plans his son's stable future.", "order_index": 0},
        headers=user["headers"],
    )

    client.put(f"/scripts/{script_id}", json={"content": ""}, headers=user["headers"])

    scenes = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()["scenes"]
    assert len(scenes) == 1
    assert scenes[0]["title"] == "Dinner Expectations"


def test_sync_never_deletes_an_unwritten_scene(client, make_user, make_script):
    """A row can own a storyboard frame the user paid for. Deleting rows to tidy
    up bookkeeping would orphan it."""
    user = make_user("pro")
    _, script_id = make_script(user)
    for i, title in enumerate(["Written one", "Never written"]):
        client.post(
            "/scripts/add-scene",
            json={"script_id": script_id, "title": title, "description": "x", "order_index": i},
            headers=user["headers"],
        )

    client.put(
        f"/scripts/{script_id}",
        json={"content": "INT. CHIYA PASAL - DAY\n\nOne scene only.\n"},
        headers=user["headers"],
    )

    scenes = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()["scenes"]
    assert len(scenes) == 2
    titles = {s["title"] for s in scenes}
    assert "Never written" in titles


def test_sync_does_not_overwrite_the_structure_beat(client, make_user, make_script):
    """`description` is the plan and stays readable; the draft lands beside it."""
    user = make_user("pro")
    _, script_id = make_script(user)
    client.post(
        "/scripts/add-scene",
        json={"script_id": script_id, "title": "Morning", "description": "The plan for this beat.",
              "act_number": 2, "scene_type": "major", "time_allocation": 4.5, "order_index": 0},
        headers=user["headers"],
    )

    client.put(f"/scripts/{script_id}", json={"content": DRAFT}, headers=user["headers"])

    scenes = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()["scenes"]
    matched = next(s for s in scenes if s["title"] == "Morning")
    assert matched["description"] == "The plan for this beat."
    assert matched["act_number"] == 2
    assert matched["scene_type"] == "major"
    assert matched["time_allocation"] == 4.5
    assert "Steam rises" in scene_sync.read_draft(matched)["summary"]


def test_inserting_a_scene_mid_draft_keeps_rows_on_their_own_scene(
    client, make_user, make_script
):
    """Positional matching alone would slide every later row onto the next
    scene's content — and frames hang off rows, so somebody's storyboard would
    quietly re-attach to the wrong scenes."""
    user = make_user("pro")
    _, script_id = make_script(user)
    client.put(f"/scripts/{script_id}", json={"content": DRAFT}, headers=user["headers"])

    before = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()["scenes"]
    rooftop_id = next(s for s in before if s["location"] == "ROOFTOP, KATHMANDU")["id"]

    inserted = DRAFT.replace(
        "EXT. ROOFTOP, KATHMANDU - DUSK",
        "INT. FAMILY KITCHEN - NIGHT\n\nBaba serves rice in silence.\n\n"
        "EXT. ROOFTOP, KATHMANDU - DUSK",
    )
    client.put(f"/scripts/{script_id}", json={"content": inserted}, headers=user["headers"])

    after = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()["scenes"]
    assert len(after) == 3
    rooftop = next(s for s in after if s["id"] == rooftop_id)
    assert rooftop["location"] == "ROOFTOP, KATHMANDU"
    assert "water tank" in scene_sync.read_draft(rooftop)["summary"]


# --- what reaches the image prompt -----------------------------------------

def _captured_frames(client, user, script_id, monkeypatch):
    calls = []

    def fake_frame(description, shot_type, genre, location="", emotional_beat="",
                   time_of_day="", characters=()):
        calls.append({
            "description": description, "shot_type": shot_type, "genre": genre,
            "location": location, "emotional_beat": emotional_beat,
            "time_of_day": time_of_day, "characters": list(characters),
        })
        return "https://example.test/frame.png"

    monkeypatch.setattr(storyboard_engine, "generate_frame", fake_frame)
    r = client.post(f"/storyboard/generate/{script_id}", headers=user["headers"])
    assert r.status_code == 200, r.text
    return calls


def test_the_frame_illustrates_the_rewrite_not_the_original_beat(
    client, make_user, make_script, monkeypatch
):
    """The core of the bug: a board generated after a rewrite drew the plan."""
    user = make_user("pro")
    _, script_id = make_script(user)
    client.post(
        "/scripts/add-scene",
        json={"script_id": script_id, "title": "Morning",
              "description": "PLACEHOLDER BEAT that was never written.", "order_index": 0},
        headers=user["headers"],
    )
    client.put(f"/scripts/{script_id}", json={"content": DRAFT}, headers=user["headers"])

    calls = _captured_frames(client, user, script_id, monkeypatch)
    assert "Steam rises" in calls[0]["description"]
    assert "PLACEHOLDER" not in calls[0]["description"]


def test_structure_fields_reach_the_prompt_for_an_unwritten_scene(
    client, make_user, make_script, monkeypatch
):
    """add-scene used to drop location, emotional_beat and characters on the
    floor while the engine read two of them straight back out."""
    user = make_user("pro")
    _, script_id = make_script(user)
    client.post(
        "/scripts/add-scene",
        json={"script_id": script_id, "title": "Found Out",
              "description": "Baba discovers the truth.", "order_index": 0,
              "location": "Family kitchen", "emotional_beat": "rupture",
              "characters": ["Raaja", "Baba", "Aama"]},
        headers=user["headers"],
    )

    calls = _captured_frames(client, user, script_id, monkeypatch)
    assert calls[0]["location"] == "Family kitchen"
    assert calls[0]["emotional_beat"] == "rupture"
    assert calls[0]["characters"] == ["Raaja", "Baba", "Aama"]


def test_the_prompt_uses_the_project_genre(client, make_user, make_script, monkeypatch):
    """Every frame was requested as a "drama film aesthetic" regardless."""
    user = make_user("pro")
    _, script_id = make_script(user)  # the fixture's project is Drama
    client.put(f"/scripts/{script_id}", json={"content": DRAFT}, headers=user["headers"])

    calls = _captured_frames(client, user, script_id, monkeypatch)
    assert calls[0]["genre"] == "Drama"


def test_time_of_day_and_cast_reach_the_prompt(client, make_user, make_script, monkeypatch):
    user = make_user("pro")
    _, script_id = make_script(user)
    client.put(f"/scripts/{script_id}", json={"content": DRAFT}, headers=user["headers"])

    calls = _captured_frames(client, user, script_id, monkeypatch)
    assert calls[0]["time_of_day"] == "MORNING"
    assert "SANJANA" in calls[0]["characters"]


def test_generation_with_nothing_written_or_added_explains_itself(
    client, make_user, make_script
):
    user = make_user("pro")
    _, script_id = make_script(user)
    r = client.post(f"/storyboard/generate/{script_id}", headers=user["headers"])
    assert r.status_code == 404
    assert "INT./EXT." in r.json()["detail"]


# --- lenient readers --------------------------------------------------------

@pytest.mark.parametrize("blob", [None, "", "not json", "[]", "3"])
def test_a_bad_draft_blob_reads_as_never_synced(blob):
    """A malformed blob must not make a script unstoryboardable."""
    assert scene_sync.read_draft({"draft_json": blob}) == {}


@pytest.mark.parametrize("blob", [None, "", "{}", "oops"])
def test_a_bad_characters_blob_reads_as_unknown(blob):
    assert scene_sync.read_characters({"characters_json": blob}) == []


def test_scene_visual_falls_back_to_the_plan():
    scene = {"description": "The plan.", "location": "Kitchen", "emotional_beat": "rupture",
             "characters_json": json.dumps(["Baba"])}
    visual = storyboard_engine.scene_visual(scene)
    assert visual["description"] == "The plan."
    assert visual["characters"] == ["Baba"]
    assert visual["from_draft"] is False


# --- renaming a slugline -------------------------------------------------
#
# `title` is deliberately not synced from the draft, because a structure gives
# a scene a name ("The confession") that is a different thing from its
# slugline. But a row created FROM the page has its title set to the heading,
# so rewriting that heading left the scene index and the timeline showing a
# line no longer anywhere in the script — and no amount of saving fixed it.

RENAMED_BEFORE = "INT. CHIYA PASAL - DAY\n\nSanjana wipes the counter.\n"
RENAMED_AFTER = "INT. CHIYA PASAL, PATAN - MORNING\n\nSanjana wipes the counter.\n"


def _titles(client, user, script_id):
    scenes = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()["scenes"]
    return [s["title"] for s in scenes]


def test_a_renamed_slugline_reaches_the_scene_index(client, make_user, make_script):
    user = make_user("free")
    _, script_id = make_script(user)
    client.put(f"/scripts/{script_id}", json={"content": RENAMED_BEFORE}, headers=user["headers"])
    assert _titles(client, user, script_id) == ["INT. CHIYA PASAL - DAY"]

    client.put(f"/scripts/{script_id}", json={"content": RENAMED_AFTER}, headers=user["headers"])

    assert _titles(client, user, script_id) == ["INT. CHIYA PASAL, PATAN - MORNING"]


def test_a_title_somebody_wrote_survives_the_rename(client, make_user, make_script):
    """The whole reason sync does not own `title`."""
    from database import supabase
    user = make_user("free")
    _, script_id = make_script(user)
    client.put(f"/scripts/{script_id}", json={"content": RENAMED_BEFORE}, headers=user["headers"])
    rows = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()["scenes"]
    supabase.table("scenes").update({"title": "The confession"}).eq("id", rows[0]["id"]).execute()

    client.put(f"/scripts/{script_id}", json={"content": RENAMED_AFTER}, headers=user["headers"])

    assert _titles(client, user, script_id) == ["The confession"]
