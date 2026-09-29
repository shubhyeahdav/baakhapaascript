"""One source of truth for the speaking rate.

The status line shows written runtime live, which is words over a speaking
rate. The backend owns that constant. Copying it into the client gives two
numbers that agree until somebody edits one -- and the client's copy would be
the one nobody remembers.
"""
import videoscript


def test_speaking_wpm_values_are_positive():
    """The rates for each language are set and positive."""
    assert videoscript.SPEAKING_WPM["english"] > 0
    assert videoscript.SPEAKING_WPM["nepali"] > 0
    assert videoscript.SPEAKING_WPM["bilingual"] > 0


def test_bilingual_is_the_minimum(client, make_user, make_script):
    """Bilingual rate is deliberately the slower of the two."""
    # The bilingual rate is the minimum, because an estimate that runs long
    # costs a trim and an estimate that runs short costs a reshoot.
    assert videoscript.SPEAKING_WPM["bilingual"] == min(
        videoscript.SPEAKING_WPM["english"],
        videoscript.SPEAKING_WPM["nepali"],
    )


def test_the_payload_carries_the_rate_for_bilingual(client, make_user, make_script):
    """The script GET response includes the speaking rate for the project."""
    user = make_user("free")
    _, script_id = make_script(user)

    res = client.get(f"/scripts/{script_id}", headers=user["headers"])

    assert res.status_code == 200, res.text
    payload = res.json()
    assert "speaking_wpm" in payload, "Response missing 'speaking_wpm' key"
    # make_script creates a Bilingual project by default
    assert payload["speaking_wpm"] == videoscript.SPEAKING_WPM["bilingual"]


def test_the_payload_carries_the_rate_for_english(client, make_user):
    """The script GET response includes the correct rate for English projects."""
    user = make_user("free")

    # Create a project with English language
    proj = client.post(
        "/projects/",
        json={
            "title": "English Script",
            "genre": "Drama",
            "tone": "Dramatic",
            "language": "English",
            "duration_minutes": 10,
            "target_audience": "Adults",
        },
        headers=user["headers"],
    )
    assert proj.status_code == 200, proj.text
    project_id = proj.json()["id"]

    # Get the script
    script_res = client.get(f"/scripts/project/{project_id}", headers=user["headers"])
    assert script_res.status_code == 200, script_res.text
    script_id = script_res.json()["id"]

    # Verify the speaking rate in the payload
    res = client.get(f"/scripts/{script_id}", headers=user["headers"])

    assert res.status_code == 200, res.text
    payload = res.json()
    assert "speaking_wpm" in payload, "Response missing 'speaking_wpm' key"
    assert payload["speaking_wpm"] == videoscript.SPEAKING_WPM["english"]


def test_the_payload_carries_the_rate_for_nepali(client, make_user):
    """The script GET response includes the correct rate for Nepali projects."""
    user = make_user("free")

    # Create a project with Nepali language
    proj = client.post(
        "/projects/",
        json={
            "title": "Nepali Script",
            "genre": "Drama",
            "tone": "Dramatic",
            "language": "Nepali",
            "duration_minutes": 10,
            "target_audience": "Adults",
        },
        headers=user["headers"],
    )
    assert proj.status_code == 200, proj.text
    project_id = proj.json()["id"]

    # Get the script
    script_res = client.get(f"/scripts/project/{project_id}", headers=user["headers"])
    assert script_res.status_code == 200, script_res.text
    script_id = script_res.json()["id"]

    # Verify the speaking rate in the payload
    res = client.get(f"/scripts/{script_id}", headers=user["headers"])

    assert res.status_code == 200, res.text
    payload = res.json()
    assert "speaking_wpm" in payload, "Response missing 'speaking_wpm' key"
    assert payload["speaking_wpm"] == videoscript.SPEAKING_WPM["nepali"]
