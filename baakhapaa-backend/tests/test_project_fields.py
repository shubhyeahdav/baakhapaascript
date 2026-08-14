"""Project creation fields: format, runtime, and free-text categories.

The wizard is where a project's shape is decided, and three of these were
either missing or silently dropped: format was never asked, target_audience was
accepted and then not written, and runtime was capped below feature length.
"""
import pytest

BASE = {
    "title": "Sapana",
    "genre": "Drama",
    "tone": "Emotional",
    "language": "Bilingual",
    "duration_minutes": 15,
    "target_audience": "Youth",
}


def create(client, user, **overrides):
    return client.post("/projects/", json={**BASE, **overrides}, headers=user["headers"])


class TestFormat:
    def test_defaults_to_short(self, client, make_user):
        r = create(client, make_user("pro"))
        assert r.status_code == 200
        assert r.json()["format"] == "short"

    @pytest.mark.parametrize("fmt", ["short", "film", "web_series"])
    def test_accepts_every_supported_format(self, client, make_user, fmt):
        r = create(client, make_user("pro"), format=fmt)
        assert r.status_code == 200, r.text
        assert r.json()["format"] == fmt

    def test_rejects_unknown_format(self, client, make_user):
        assert create(client, make_user("pro"), format="stage_play").status_code == 422

    def test_episode_count_persists_for_a_series(self, client, make_user):
        r = create(client, make_user("pro"), format="web_series",
                   duration_minutes=22, episode_count=8)
        body = r.json()
        # duration is ONE episode; the season is duration * episodes.
        assert body["duration_minutes"] == 22 and body["episode_count"] == 8


class TestRuntime:
    def test_feature_length_is_accepted(self, client, make_user):
        """Regression: the wizard's slider capped at 120, so a normal feature
        could not be entered at all."""
        r = create(client, make_user("pro"), format="film", duration_minutes=165)
        assert r.status_code == 200
        assert r.json()["duration_minutes"] == 165

    @pytest.mark.parametrize("bad", [0, -5, 601, 100000])
    def test_out_of_range_runtime_is_rejected(self, client, make_user, bad):
        """Generous, but not unbounded -- act splits and per-beat allocation
        scale with duration, so an arbitrary integer is a denial of service."""
        assert create(client, make_user("pro"), duration_minutes=bad).status_code == 422

    def test_episode_count_upper_bound(self, client, make_user):
        assert create(client, make_user("pro"), format="web_series",
                      episode_count=5000).status_code == 422


class TestFreeTextCategories:
    def test_custom_genre_is_accepted(self, client, make_user):
        """Genre feeds prompts and retrieval, not an enum. A writer working on
        something the dropdown does not list must not have to mislabel it."""
        r = create(client, make_user("pro"), genre="Nepali Social Realism")
        assert r.status_code == 200
        assert r.json()["genre"] == "Nepali Social Realism"

    def test_custom_tone_and_audience_are_accepted(self, client, make_user):
        r = create(client, make_user("pro"), tone="Wry but tender",
                   target_audience="Festival programmers")
        assert r.json()["tone"] == "Wry but tender"
        assert r.json()["target_audience"] == "Festival programmers"

    @pytest.mark.parametrize("field", ["genre", "tone", "target_audience"])
    def test_blank_is_rejected(self, client, make_user, field):
        """Custom values yes, empty ones no -- a blank genre silently degrades
        every prompt and retrieval query built from it."""
        assert create(client, make_user("pro"), **{field: "   "}).status_code == 422

    def test_overlong_value_is_rejected(self, client, make_user):
        assert create(client, make_user("pro"), genre="x" * 200).status_code == 422

    def test_blank_title_is_rejected(self, client, make_user):
        assert create(client, make_user("pro"), title="  ").status_code == 422


class TestPersistence:
    def test_target_audience_is_actually_written(self, client, make_user):
        """Regression: target_audience was accepted by the request model and
        whitelisted for update, but create() never wrote it."""
        r = create(client, make_user("pro"), target_audience="Festival")
        assert r.json()["target_audience"] == "Festival"

    def test_new_fields_survive_a_reload(self, client, make_user):
        user = make_user("pro")
        pid = create(client, user, format="web_series", episode_count=6,
                     duration_minutes=24, genre="Anthology").json()["id"]

        fetched = client.get(f"/projects/{pid}", headers=user["headers"]).json()
        assert fetched["format"] == "web_series"
        assert fetched["episode_count"] == 6
        assert fetched["genre"] == "Anthology"

    def test_editor_sees_format_on_the_embedded_project(self, client, make_user):
        """The editor drives AI calls from the embedded project. Without format
        it cannot tell a feature from one episode of a series."""
        user = make_user("pro")
        pid = create(client, user, format="film", duration_minutes=110).json()["id"]

        script = client.get(f"/scripts/project/{pid}", headers=user["headers"]).json()
        full = client.get(f"/scripts/{script['id']}", headers=user["headers"]).json()
        assert full["project"]["format"] == "film"
        assert full["project"]["duration_minutes"] == 110

    def test_format_is_updatable(self, client, make_user):
        user = make_user("pro")
        pid = create(client, user).json()["id"]
        r = client.put(f"/projects/{pid}", json={"format": "film", "episode_count": 1},
                       headers=user["headers"])
        assert r.status_code == 200
        assert r.json()["format"] == "film"
