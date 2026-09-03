"""Script confidentiality: what leaves the server, and what deletion means.

An unproduced screenplay is the most valuable and most private thing this
product's users own. Two failures matter more here than anywhere else in the
system — content going somewhere the user did not agree to, and content staying
after the user asked for it to be gone. These tests pin both.
"""
import pytest

import export_service
import script_engine
from database import supabase

PROJECT = {
    "title": "Seto Bagh", "genre": "Drama", "tone": "Emotional",
    "language": "English", "duration_minutes": 15, "target_audience": "Youth",
}

SECRET = "INT. CHIYA PASAL - MORNING\n\nUNPUBLISHED AND CONFIDENTIAL SCREENPLAY TEXT.\n"


def _project_with_history(client, user):
    """A project carrying every kind of row that holds script text."""
    project_id = client.post("/projects/", json=PROJECT, headers=user["headers"]).json()["id"]
    script_id = client.get(f"/scripts/project/{project_id}", headers=user["headers"]).json()["id"]

    # Two saves so a version snapshot exists, plus scenes, a board and a comment.
    client.put(f"/scripts/{script_id}", json={"content": SECRET}, headers=user["headers"])
    client.put(f"/scripts/{script_id}", json={"content": SECRET + "\nMore secrets.\n"},
               headers=user["headers"])
    client.post(f"/storyboard/generate/{script_id}", headers=user["headers"])
    client.post("/collaboration/comments",
                json={"script_id": script_id, "content": "note", "line_number": 1},
                headers=user["headers"])
    return project_id, script_id


def _rows_containing(needle: str) -> dict:
    """Every table still holding the text, by table name."""
    found = {}
    for table in ("scripts", "versions", "scenes", "comments", "storyboard_frames",
                  "projects", "project_members", "users"):
        rows = supabase.table(table).select("*").execute().data or []
        hits = [r for r in rows if needle in str(r)]
        if hits:
            found[table] = len(hits)
    return found


class TestErasure:
    """Deleting must delete the content, not just the row that points at it.

    Postgres cascades through the schema's foreign keys. The local store has no
    relationships, so this used to leave the full script and every snapshot
    behind — the mode every developer and every test actually runs in.
    """

    def test_deleting_a_project_removes_the_script_text(self, client, make_user):
        user = make_user("pro")
        project_id, _ = _project_with_history(client, user)
        assert _rows_containing("UNPUBLISHED AND CONFIDENTIAL"), "precondition: text is stored"

        assert client.delete(f"/projects/{project_id}",
                             headers=user["headers"]).status_code == 200

        assert _rows_containing("UNPUBLISHED AND CONFIDENTIAL") == {}

    def test_deleting_a_project_removes_its_version_history(self, client, make_user):
        """A snapshot is a full copy of the draft. Missing these leaves the whole
        script behind under a different table name."""
        user = make_user("pro")
        project_id, script_id = _project_with_history(client, user)
        assert supabase.table("versions").select("*").eq(
            "script_id", script_id).execute().data, "precondition: a snapshot exists"

        client.delete(f"/projects/{project_id}", headers=user["headers"])

        assert supabase.table("versions").select("*").eq(
            "script_id", script_id).execute().data == []

    def test_deleting_a_project_removes_scenes_frames_and_comments(self, client, make_user):
        user = make_user("pro")
        project_id, _script_id = _project_with_history(client, user)

        removed = client.delete(f"/projects/{project_id}",
                                headers=user["headers"]).json()["removed"]
        for table in ("scripts", "scenes", "versions", "comments", "storyboard_frames"):
            assert removed.get(table), f"{table} should have been purged"

    def test_a_user_can_erase_their_whole_account(self, client, make_user):
        """"Stop storing my script" must be an action, not a support request."""
        user = make_user("pro")
        _project_with_history(client, user)

        r = client.delete("/auth/me", params={"confirm_email": user["email"]},
                          headers=user["headers"])
        assert r.status_code == 200, r.text
        assert _rows_containing("UNPUBLISHED AND CONFIDENTIAL") == {}

    def test_the_account_itself_is_gone_afterwards(self, client, make_user):
        user = make_user("free")
        client.delete("/auth/me", params={"confirm_email": user["email"]},
                      headers=user["headers"])

        # The token stays cryptographically valid for the rest of its week — a
        # signature only proves we issued it. Authentication now also checks the
        # account still exists, so the token stops identifying anyone: 401 at the
        # door rather than 404 from a route it should never have reached.
        assert client.get("/auth/me", headers=user["headers"]).status_code == 401
        assert client.post("/auth/login",
                           json={"email": user["email"], "password": user["password"]}
                           ).status_code == 401

    def test_erasure_needs_the_email_typed_back(self, client, make_user):
        """There is no undo, so it cannot fire on a stray click."""
        user = make_user("free")
        _project_with_history(client, user)

        r = client.delete("/auth/me", params={"confirm_email": "wrong@example.com"},
                          headers=user["headers"])
        assert r.status_code == 400
        assert client.get("/auth/me", headers=user["headers"]).status_code == 200

    def test_erasure_does_not_touch_someone_elses_project(self, client, make_user):
        """A shared project belongs to its owner. Leaving takes the membership,
        not their work."""
        owner = make_user("pro")
        project_id, script_id = _project_with_history(client, owner)

        guest = make_user("free")
        client.post(f"/projects/{project_id}/members",
                    json={"email": guest["email"], "role": "editor"}, headers=owner["headers"])

        client.delete("/auth/me", params={"confirm_email": guest["email"]},
                      headers=guest["headers"])

        assert client.get(f"/scripts/{script_id}", headers=owner["headers"]).status_code == 200
        assert _rows_containing("UNPUBLISHED AND CONFIDENTIAL"), "the owner's script must survive"


class TestOutboundFetch:
    """The production package fetches storyboard images server-side. That is the
    one place this server can be aimed at a URL, so it is the one place worth
    treating as hostile."""

    @pytest.mark.parametrize("url", [
        "http://169.254.169.254/latest/meta-data/",   # cloud instance metadata
        "http://127.0.0.1:8000/health",               # loopback
        "http://localhost:8000/health",               # loopback by name
        "http://10.0.0.5/internal",                   # private range
        "http://192.168.1.1/admin",                   # home/router range
        "http://[::1]/",                              # IPv6 loopback
    ])
    def test_internal_addresses_are_refused(self, url):
        assert export_service._fetch_image(url, float("inf")) is None

    @pytest.mark.parametrize("url", ["", "file:///etc/passwd", "gopher://x/", "ftp://x/y.png"])
    def test_non_http_schemes_are_refused(self, url):
        assert export_service._fetch_image(url, float("inf")) is None

    def test_redirects_are_not_followed(self):
        """Checking the host and then following a redirect checks nothing — the
        redirect target is chosen after the check."""
        assert export_service._NoRedirects().redirect_request(
            None, None, 302, "Found", {}, "http://169.254.169.254/"
        ) is None

    def test_clients_cannot_set_a_frames_image_url(self, client, make_user):
        """The server writes this field. A client-writable URL plus a
        server-side fetch is server-side request forgery."""
        import storyboard

        assert "image_url" not in storyboard.FRAME_UPDATE_FIELDS

        user = make_user("pro")
        _, script_id = _project_with_history(client, user)
        frame = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()[0]
        original = frame["image_url"]

        client.put(f"/storyboard/{frame['id']}",
                   json={"image_url": "http://169.254.169.254/latest/meta-data/"},
                   headers=user["headers"])

        after = client.get(f"/storyboard/{script_id}", headers=user["headers"]).json()[0]
        assert after["image_url"] == original


class TestProviderRouting:
    """Which company receives a user's unpublished draft must never be decided
    by a missing environment variable."""

    def test_no_keys_means_nothing_is_sent_anywhere(self):
        assert script_engine.PROVIDER == "mock"
        assert script_engine.MOCK_AI is True

    def test_a_third_party_provider_requires_an_explicit_opt_in(self, monkeypatch):
        """A fumbled Anthropic key used to silently reroute every script to Groq."""
        import importlib

        # SET to a placeholder rather than deleted. `script_engine` calls
        # load_dotenv() at import, and load_dotenv does not overwrite a variable
        # that is already set but DOES fill in one that is missing — so deleting
        # the key invites the real one straight back out of `.env`, and this
        # test passed only on a machine that had no real key. `_usable()` treats
        # a "your-" placeholder as absent, which is the state being tested.
        monkeypatch.setenv("GROQ_API_KEY", "gsk_not_a_real_key")
        monkeypatch.setenv("ANTHROPIC_API_KEY", "your-anthropic-key-not-a-real-key")
        monkeypatch.setenv("LLM_PROVIDER", "")

        reloaded = importlib.reload(script_engine)
        try:
            assert reloaded.PROVIDER == "mock", (
                "a present GROQ_API_KEY must not be enough to start sending "
                "user scripts to Groq"
            )
        finally:
            monkeypatch.undo()
            importlib.reload(script_engine)

    def test_the_free_tier_craft_features_send_nothing_outbound(self, client, make_user, monkeypatch):
        """Linting, benchmarking and pattern retrieval all run in-process with
        local embeddings. That is a real privacy property and worth keeping."""
        def explode(*a, **k):
            raise AssertionError("a craft feature must not call a model provider")

        monkeypatch.setattr(script_engine, "_call_llm", explode)
        user = make_user("free")

        for path in ("/scripts/lint", "/scripts/benchmark", "/scripts/recommendations"):
            r = client.post(path, json={"scene_text": SECRET, "genre": "Drama", "tone": "Tense"},
                            headers=user["headers"])
            assert r.status_code == 200, f"{path}: {r.text}"


class TestStoryboardTextEgress:
    """Image generation transmits the scene description to a third party. Since
    scene rows started tracking the draft, that description is the writer's own
    action lines — so there has to be a way to stop sending them."""

    def test_by_default_the_draft_informs_the_frame(self, client, make_user, monkeypatch):
        import storyboard_engine

        monkeypatch.setattr(storyboard_engine, "STORYBOARD_USES_DRAFT_TEXT", True)
        scene = {"description": "The planned beat.",
                 "draft_json": '{"summary": "UNPUBLISHED AND CONFIDENTIAL action line."}'}
        assert "CONFIDENTIAL" in storyboard_engine.scene_visual(scene)["description"]

    def test_it_can_be_switched_to_the_plan_only(self, monkeypatch):
        import storyboard_engine

        monkeypatch.setattr(storyboard_engine, "STORYBOARD_USES_DRAFT_TEXT", False)
        scene = {"description": "The planned beat.",
                 "draft_json": '{"summary": "UNPUBLISHED AND CONFIDENTIAL action line."}'}
        visual = storyboard_engine.scene_visual(scene)
        assert visual["description"] == "The planned beat."
        assert "CONFIDENTIAL" not in str(visual)
        assert visual["from_draft"] is False


class TestSessionRevocation:
    """A JWT cannot be called back once issued. For a product holding
    unpublished screenplays, a week is too long to be unable to end a session."""

    def test_sign_out_everywhere_invalidates_existing_tokens(self, client, make_user):
        user = make_user("free")
        assert client.get("/auth/me", headers=user["headers"]).status_code == 200

        assert client.post("/auth/sign-out-everywhere",
                           headers=user["headers"]).status_code == 200

        r = client.get("/auth/me", headers=user["headers"])
        assert r.status_code == 401
        assert "signed out" in r.json()["detail"].lower()

    def test_signing_in_again_works_afterwards(self, client, make_user):
        """Revocation ends sessions, not the account."""
        user = make_user("free")
        client.post("/auth/sign-out-everywhere", headers=user["headers"])

        again = client.post("/auth/login",
                            json={"email": user["email"], "password": user["password"]})
        assert again.status_code == 200
        fresh = {"Authorization": f"Bearer {again.json()['token']}"}
        assert client.get("/auth/me", headers=fresh).status_code == 200

    def test_one_users_revocation_does_not_touch_another(self, client, make_user):
        a = make_user("free")
        b = make_user("free")
        client.post("/auth/sign-out-everywhere", headers=a["headers"])

        assert client.get("/auth/me", headers=a["headers"]).status_code == 401
        assert client.get("/auth/me", headers=b["headers"]).status_code == 200
