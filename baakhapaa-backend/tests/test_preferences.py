"""Onboarding preferences."""


def test_new_user_has_no_preferences(client, make_user):
    """The absence of preferences is what routes a new user to onboarding."""
    user = make_user()
    r = client.get("/auth/me", headers=user["headers"])
    assert r.status_code == 200
    assert r.json()["preferences"] is None


def test_saving_preferences_round_trips(client, make_user):
    user = make_user()
    payload = {
        "experience": "first_time",
        "format": "short",
        "language": "Bilingual",
        "genre": "Drama",
        "tone": "Emotional",
        "onboarded": True,
    }
    r = client.put("/auth/preferences", json=payload, headers=user["headers"])
    assert r.status_code == 200
    assert r.json()["preferences"] == payload

    again = client.get("/auth/me", headers=user["headers"])
    assert again.json()["preferences"]["format"] == "short"


def test_preferences_persist_through_login(client, make_user):
    user = make_user()
    client.put(
        "/auth/preferences",
        json={"experience": "experienced", "format": "film", "language": "Nepali"},
        headers=user["headers"],
    )
    login = client.post(
        "/auth/login", json={"email": user["email"], "password": user["password"]}
    )
    assert login.json()["user"]["preferences"]["format"] == "film"


def test_defaults_fill_omitted_answers(client, make_user):
    """Skipping sends almost nothing; the rest must still be usable values."""
    user = make_user()
    r = client.put("/auth/preferences", json={"onboarded": True}, headers=user["headers"])
    prefs = r.json()["preferences"]
    assert prefs["onboarded"] is True
    assert prefs["experience"] == "first_time"
    assert prefs["language"] == "Bilingual"


def test_invalid_values_are_rejected(client, make_user):
    user = make_user()
    for bad in (
        {"experience": "guru"},
        {"format": "novel"},
        {"language": "Klingon"},
    ):
        r = client.put("/auth/preferences", json=bad, headers=user["headers"])
        assert r.status_code == 422, f"{bad} was accepted"


def test_preferences_require_authentication(client):
    assert client.put("/auth/preferences", json={"format": "short"}).status_code == 401


def test_preferences_are_per_user(client, make_user):
    """Regression: the mock DB applied update() eagerly, before .eq() filtered,
    so writing one user's row wrote every row in the table."""
    a = make_user()
    b = make_user()
    client.put("/auth/preferences", json={"genre": "Thriller"}, headers=a["headers"])
    assert client.get("/auth/me", headers=b["headers"]).json()["preferences"] is None


def test_updating_one_users_tier_does_not_change_another(client, make_user):
    """The same eager-update bug meant upgrading one account to Pro upgraded
    everybody — the whole paywall, bypassed by one unrelated checkout."""
    free_user = make_user("free")
    make_user("pro")  # promoting this one must not touch the first
    r = client.get("/auth/me", headers=free_user["headers"])
    assert r.json()["subscription_tier"] == "free"
