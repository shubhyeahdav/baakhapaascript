"""The things the proposal actually promises to hand over.

Each test here pins a deliverable that existed as code but not as an outcome:
the production package (FR13) that contained no storyboard and a shot list of
`Scene 1 | Wide Shot`, the camera notes (FR08) that were written as `""` on
every frame ever generated, the frame controls (FR09) whose routes nothing
called, and the pre-finalization review (FR07) that was wired to nothing.
"""
import io

import pytest
from pypdf import PdfReader

import export_service
import review as review_module
import storyboard_engine

DRAFT = """INT. CHIYA PASAL, PATAN - MORNING

Steam rises from the glasses. Raaja turns his phone face-down as Sanjana sits.

                      SANJANA
          Timro result aayo?

EXT. ROOFTOP, KATHMANDU - DUSK

Kanchha balances the borrowed camera on a water tank. The city hums below.
"""


def _pdf_text(data: bytes) -> str:
    return "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(data)).pages)


def _board(client, user, content=DRAFT):
    """A project with a written draft and a generated board."""
    project = client.post(
        "/projects/",
        json={"title": "Seto Bagh", "genre": "Thriller", "tone": "Tense",
              "language": "English", "duration_minutes": 15, "target_audience": "Youth"},
        headers=user["headers"],
    ).json()
    script_id = client.get(f"/scripts/project/{project['id']}", headers=user["headers"]).json()["id"]
    client.put(f"/scripts/{script_id}", json={"content": content}, headers=user["headers"])
    client.post(f"/storyboard/generate/{script_id}", headers=user["headers"])
    return project, script_id


# --- FR13: the production package ------------------------------------------

class TestProductionPackage:
    def test_the_shot_list_names_the_scene_not_just_a_number(self, client, make_user):
        """It read `Scene 1 | Wide Shot`. Nobody can shoot from that."""
        user = make_user("pro")
        _, script_id = _board(client, user)

        text = _pdf_text(client.get(f"/export/package/{script_id}",
                                    headers=user["headers"]).content)
        assert "SHOT LIST" in text
        assert "CHIYA PASAL, PATAN" in text
        assert "ROOFTOP, KATHMANDU" in text

    def test_the_shot_list_carries_cast_and_camera_notes(self, client, make_user):
        user = make_user("pro")
        _, script_id = _board(client, user)

        text = _pdf_text(client.get(f"/export/package/{script_id}",
                                    headers=user["headers"]).content)
        assert "Cast: SANJANA" in text
        assert "Camera:" in text

    def test_the_package_contains_a_storyboard_section(self, client, make_user):
        """"Script + storyboard + shot list" had no storyboard in it at all."""
        user = make_user("pro")
        _, script_id = _board(client, user)

        text = _pdf_text(client.get(f"/export/package/{script_id}",
                                    headers=user["headers"]).content)
        assert "STORYBOARD" in text

    def test_an_unreachable_image_degrades_to_a_captioned_frame(self, client, make_user, monkeypatch):
        """The export must never hang or fail on a dead image URL — DALL-E links
        expire after about an hour, so this is the normal case for an old board."""
        monkeypatch.setattr(export_service, "_fetch_image", lambda url, deadline: None)
        user = make_user("pro")
        _, script_id = _board(client, user)

        text = _pdf_text(client.get(f"/export/package/{script_id}",
                                    headers=user["headers"]).content)
        assert "frame image not embedded" in text

    def test_image_embedding_can_be_switched_off(self, monkeypatch):
        """One env var, for offline or air-gapped builds."""
        monkeypatch.setattr(export_service, "EMBED_STORYBOARD_IMAGES", False)
        assert export_service._fetch_image("https://example.test/x.png", float("inf")) is None

    def test_a_fetch_is_skipped_once_the_budget_is_spent(self):
        """The set shares a deadline, so one slow host cannot stall a download."""
        assert export_service._fetch_image("https://example.test/x.png", 0.0) is None

    def test_only_http_urls_are_ever_fetched(self):
        """An export must not be a way to read the server's own filesystem."""
        for url in ("", "file:///etc/passwd", "data:image/png;base64,AAAA"):
            assert export_service._fetch_image(url, float("inf")) is None

    def test_a_package_with_no_board_still_exports(self, client, make_user):
        user = make_user("pro")
        project = client.post(
            "/projects/",
            json={"title": "Empty", "genre": "Drama", "tone": "Warm", "language": "English",
                  "duration_minutes": 10, "target_audience": "Youth"},
            headers=user["headers"],
        ).json()
        script_id = client.get(f"/scripts/project/{project['id']}",
                               headers=user["headers"]).json()["id"]

        r = client.get(f"/export/package/{script_id}", headers=user["headers"])
        assert r.status_code == 200
        assert "generate a storyboard" in _pdf_text(r.content)


# --- every export is named after the project --------------------------------

class TestExportNaming:
    @pytest.mark.parametrize("path,extension", [
        ("/export/script/pdf/", "pdf"),
        ("/export/script/fdx/", "fdx"),
    ])
    def test_free_exports_carry_the_project_title(self, client, make_user, path, extension):
        user = make_user("free")
        project = client.post(
            "/projects/",
            json={"title": "Seto Bagh", "genre": "Drama", "tone": "Warm", "language": "English",
                  "duration_minutes": 10, "target_audience": "Youth"},
            headers=user["headers"],
        ).json()
        script_id = client.get(f"/scripts/project/{project['id']}",
                               headers=user["headers"]).json()["id"]

        r = client.get(f"{path}{script_id}", headers=user["headers"])
        assert r.status_code == 200
        # Everything used to download as `script.pdf`, whatever the project was.
        assert f'filename="Seto_Bagh.{extension}"' in r.headers["content-disposition"]

    def test_a_title_that_would_break_a_filename_is_sanitised(self, client, make_user):
        user = make_user("free")
        project = client.post(
            "/projects/",
            json={"title": 'A/B: "Draft" <2>', "genre": "Drama", "tone": "Warm",
                  "language": "English", "duration_minutes": 10, "target_audience": "Youth"},
            headers=user["headers"],
        ).json()
        script_id = client.get(f"/scripts/project/{project['id']}",
                               headers=user["headers"]).json()["id"]

        disposition = client.get(f"/export/script/pdf/{script_id}",
                                 headers=user["headers"]).headers["content-disposition"]
        for bad in ('"A', "/", ":", "<", ">"):
            assert bad not in disposition.split("filename=")[1].strip('"')


# --- FR08: camera notes ------------------------------------------------------

class TestCameraNotes:
    def test_generation_writes_a_note_on_every_frame(self, client, make_user):
        """`camera_notes` was the empty string on every frame ever generated."""
        user = make_user("pro")
        _, script_id = _board(client, user)

        frames = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()
        assert frames
        assert all(f["camera_notes"].strip() for f in frames)

    def test_the_note_reflects_the_scene(self, client, make_user):
        user = make_user("pro")
        _, script_id = _board(client, user)

        frames = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()
        assert "Establishes the location." in frames[0]["camera_notes"]
        assert "SANJANA" in frames[0]["camera_notes"]

    def test_notes_are_deterministic(self):
        """A crew reloads this document on set; it must not change under them."""
        visual = {"characters": ["RAAJA"], "time_of_day": "NIGHT", "emotional_beat": "rupture"}
        first = storyboard_engine.camera_note("Close Up", visual, 1, 3)
        assert first == storyboard_engine.camera_note("Close Up", visual, 1, 3)
        assert "Practicals in shot" in first
        assert "Favour RAAJA" in first


# --- FR09: frame controls ----------------------------------------------------

class TestFrameControls:
    def test_frames_arrive_knowing_which_scene_they_are(self, client, make_user):
        """A board that cannot be matched to the script is not a pre-viz document."""
        user = make_user("pro")
        _, script_id = _board(client, user)

        frames = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()
        assert frames[0]["scene"]["slugline"] == "INT. CHIYA PASAL, PATAN - MORNING"
        assert "SANJANA" in frames[0]["scene"]["characters"]

    def test_shot_type_can_be_overridden(self, client, make_user):
        user = make_user("pro")
        _, script_id = _board(client, user)
        frame = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()[0]

        r = client.put(f"/storyboard/{frame['id']}", json={"shot_type": "Extreme Close Up"},
                       headers=user["headers"])
        assert r.status_code == 200
        assert r.json()["shot_type"] == "Extreme Close Up"

    def test_camera_notes_can_be_edited(self, client, make_user):
        user = make_user("pro")
        _, script_id = _board(client, user)
        frame = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()[0]

        client.put(f"/storyboard/{frame['id']}", json={"camera_notes": "Handheld, follow her out."},
                   headers=user["headers"])
        after = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()[0]
        assert after["camera_notes"] == "Handheld, follow her out."

    def test_regenerating_keeps_a_note_the_user_wrote(self, client, make_user):
        """Redrawing an image must not delete somebody's own camera note."""
        user = make_user("pro")
        _, script_id = _board(client, user)
        frame = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()[0]
        client.put(f"/storyboard/{frame['id']}", json={"camera_notes": "Mine, not yours."},
                   headers=user["headers"])

        client.post(f"/storyboard/regenerate/{frame['id']}",
                    params={"shot_type": "Close Up"}, headers=user["headers"])

        after = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()[0]
        assert after["camera_notes"] == "Mine, not yours."
        assert after["shot_type"] == "Close Up"

    def test_regenerating_refreshes_a_note_it_wrote_itself(self, client, make_user):
        user = make_user("pro")
        _, script_id = _board(client, user)
        frame = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()[0]

        client.post(f"/storyboard/regenerate/{frame['id']}",
                    params={"shot_type": "Close Up"}, headers=user["headers"])

        after = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()[0]
        assert "Push in and hold" in after["camera_notes"]

    def test_regenerating_needs_no_description_from_the_caller(self, client, make_user):
        """It reads the scene, which tracks the draft — a UI that guesses the
        description redraws the wrong scene."""
        user = make_user("pro")
        _, script_id = _board(client, user)
        frame = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()[0]

        r = client.post(f"/storyboard/regenerate/{frame['id']}", headers=user["headers"])
        assert r.status_code == 200

    def test_frames_can_be_reordered(self, client, make_user):
        user = make_user("pro")
        _, script_id = _board(client, user)
        frames = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()
        first, second = frames[0], frames[1]

        client.put(f"/storyboard/{first['id']}", json={"order_index": second["order_index"]},
                   headers=user["headers"])
        client.put(f"/storyboard/{second['id']}", json={"order_index": first["order_index"]},
                   headers=user["headers"])

        after = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()
        assert after[0]["id"] == second["id"]

    def test_the_shot_type_vocabulary_is_published(self, client):
        r = client.get("/storyboard/shot-types")
        assert r.status_code == 200
        assert "Close Up" in r.json()["shot_types"]


# --- FR07: the pre-finalization review --------------------------------------

class TestReview:
    def test_near_duplicate_character_names_are_caught(self):
        """RAAJA on page 4 and RAJA on page 40 is two people to a casting director."""
        text = ("INT. A - DAY\n\n                      RAAJA\n          One.\n\n"
                "                      RAJA\n          Two.\n")
        rules = [f["rule"] for f in review_module.check_character_names(text)]
        assert "character_name_inconsistent" in rules

    def test_distinct_characters_are_not_flagged(self):
        """A linter that fires on RAAJA vs RAJESH gets switched off."""
        text = ("INT. A - DAY\n\n                      RAAJA\n          One.\n\n"
                "                      RAJESH\n          Two.\n")
        assert review_module.check_character_names(text) == []

    def test_a_scene_with_time_allotted_but_nothing_written_is_flagged(self):
        scenes = [{"title": "The Screening", "time_allocation": 5.0, "draft_json": None}]
        rules = [f["rule"] for f in review_module.check_scene_timing("", scenes)]
        assert "scene_not_written" in rules

    def test_runtime_drift_against_the_project_length(self):
        findings = review_module.check_total_runtime(DRAFT, 90)
        assert findings and findings[0]["rule"] == "runtime_drift"

    def test_a_matching_runtime_is_silent(self):
        assert review_module.check_total_runtime("INT. A - DAY\n\nOne line.\n", 0) == []

    def test_review_runs_on_finalize_and_does_not_block(self, client, make_user):
        """FR07 puts a review before finalization. It reports; the writer decides."""
        user = make_user("free")
        _, script_id = _board(client, user, content=DRAFT)

        r = client.post(f"/scripts/{script_id}/finalize", headers=user["headers"])
        assert r.status_code == 200
        assert r.json()["status"] == "finalized"
        assert "review" in r.json()
        assert "counts" in r.json()["review"]

    def test_review_is_available_without_finalizing(self, client, make_user):
        user = make_user("free")
        _, script_id = _board(client, user)

        r = client.get(f"/scripts/{script_id}/review", headers=user["headers"])
        assert r.status_code == 200
        assert set(r.json()) >= {"ready", "findings", "counts", "statistics"}

    def test_review_respects_ownership(self, client, make_user):
        owner = make_user("free")
        intruder = make_user("free")
        _, script_id = _board(client, owner)

        assert client.get(f"/scripts/{script_id}/review",
                          headers=intruder["headers"]).status_code == 404

    def test_review_costs_no_ai_call(self, client, make_user, monkeypatch):
        """It must run on every tier and on every finalize, so it cannot bill."""
        import script_engine

        def explode(*a, **k):
            raise AssertionError("the review must not call a model")

        monkeypatch.setattr(script_engine, "_call_llm", explode)
        user = make_user("free")
        _, script_id = _board(client, user)

        assert client.get(f"/scripts/{script_id}/review",
                          headers=user["headers"]).status_code == 200
