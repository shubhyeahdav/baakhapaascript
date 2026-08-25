"""Google sign-in.

The browser hands us a signed ID token and we open an account from it, so every
test here is really about one question: what happens when the token, or the
account it points at, is not what it appears to be. The signature check itself
belongs to `google-auth` and is stubbed; what is exercised is everything this
codebase decided around it — linking, matching order, and the doors that have
to stay shut.
"""
import pytest

import auth as auth_module
import google_auth
from conftest import GOOD_PASSWORD, _unique_email


@pytest.fixture
def google(monkeypatch):
    """Pretend a client id is configured, and let each test dictate the claims
    a given token verifies to."""
    monkeypatch.setattr(
        google_auth, "GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com"
    )

    state = {}

    def fake_verify(credential):
        if credential in state:
            return state[credential]
        raise google_auth.GoogleAuthError("Could not verify that Google sign-in.")

    monkeypatch.setattr(auth_module.google_auth, "verify_id_token", fake_verify)
    monkeypatch.setattr(auth_module.google_auth, "is_configured", lambda: True)
    return state


def _token(state, sub, email, name="Mira Rai"):
    key = "token-for-" + sub
    state[key] = {"sub": sub, "email": email, "name": name}
    return key


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------
def test_providers_reports_google_off_when_no_client_id(client, monkeypatch):
    """The sign-in page asks before drawing the button, so an unconfigured
    deployment shows no Google option rather than one that fails on click."""
    monkeypatch.setattr(auth_module.google_auth, "is_configured", lambda: False)
    body = client.get("/auth/providers").json()
    assert body["google"] is False
    assert body["password"] is True


def test_google_route_refuses_when_unconfigured(client, monkeypatch):
    monkeypatch.setattr(auth_module.google_auth, "is_configured", lambda: False)
    r = client.post("/auth/google", json={"credential": "anything"})
    assert r.status_code == 503


# ---------------------------------------------------------------------------
# Opening an account
# ---------------------------------------------------------------------------
def test_a_first_google_sign_in_creates_the_account(client, google):
    email = _unique_email()
    tok = _token(google, "google-sub-1", email)

    r = client.post("/auth/google", json={"credential": tok})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == email
    assert r.json()["token"]


def test_signing_in_again_reuses_the_same_account(client, google):
    email = _unique_email()
    tok = _token(google, "google-sub-2", email)

    first = client.post("/auth/google", json={"credential": tok}).json()
    second = client.post("/auth/google", json={"credential": tok}).json()
    assert first["user"]["id"] == second["user"]["id"]


def test_a_changed_google_address_still_opens_the_same_account(client, google):
    """`sub` is matched before the email precisely so this does not silently
    create a second account for the same person."""
    original = _unique_email()
    tok = _token(google, "google-sub-3", original)
    first = client.post("/auth/google", json={"credential": tok}).json()

    moved = _unique_email()
    google[tok] = {"sub": "google-sub-3", "email": moved, "name": "Mira Rai"}
    second = client.post("/auth/google", json={"credential": tok}).json()

    assert second["user"]["id"] == first["user"]["id"]
    assert second["user"]["email"] == moved


# ---------------------------------------------------------------------------
# Linking to an account that already has a password
# ---------------------------------------------------------------------------
def test_google_links_to_an_existing_password_account(client, google):
    """Same person, same verified address. A second account would split their
    projects across two logins."""
    email = _unique_email()
    registered = client.post(
        "/auth/register",
        json={"email": email, "password": GOOD_PASSWORD, "name": "Mira"},
    ).json()

    tok = _token(google, "google-sub-4", email)
    linked = client.post("/auth/google", json={"credential": tok}).json()

    assert linked["user"]["id"] == registered["id"]


def test_linking_does_not_take_away_the_password(client, google):
    """A linked account must still open the way it always did."""
    email = _unique_email()
    client.post(
        "/auth/register",
        json={"email": email, "password": GOOD_PASSWORD, "name": "Mira"},
    )
    client.post(
        "/auth/google", json={"credential": _token(google, "google-sub-5", email)}
    )

    r = client.post("/auth/login", json={"email": email, "password": GOOD_PASSWORD})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# The doors that stay shut
# ---------------------------------------------------------------------------
def test_an_unverifiable_token_is_refused(client, google):
    r = client.post("/auth/google", json={"credential": "forged"})
    assert r.status_code == 401


def test_an_unverified_google_address_cannot_sign_in(monkeypatch):
    """The claim that governs linking. A Workspace admin can create an account
    for an address they have not proven they control, so an unverified one must
    never open — or attach itself to — an account here."""
    monkeypatch.setattr(google_auth, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(
        google_auth.google_id_token,
        "verify_oauth2_token",
        lambda *a, **k: {
            "iss": "https://accounts.google.com",
            "sub": "x",
            "email": "someone@corp.com",
            "email_verified": False,
        },
    )
    with pytest.raises(google_auth.GoogleAuthError, match="not verified"):
        google_auth.verify_id_token("token")


def test_the_client_id_is_passed_as_the_expected_audience(monkeypatch):
    """Without an audience, any validly-signed Google token minted for any
    other application would open an account here."""
    monkeypatch.setattr(google_auth, "GOOGLE_CLIENT_ID", "our-client-id")
    seen = {}

    def fake_verify(credential, request, audience, **kwargs):
        seen["audience"] = audience
        raise ValueError("Token has wrong audience")

    monkeypatch.setattr(google_auth.google_id_token, "verify_oauth2_token", fake_verify)
    with pytest.raises(google_auth.GoogleAuthError):
        google_auth.verify_id_token("token")
    assert seen["audience"] == "our-client-id"


def test_a_token_not_issued_by_google_is_refused(monkeypatch):
    monkeypatch.setattr(google_auth, "GOOGLE_CLIENT_ID", "our-client-id")
    monkeypatch.setattr(
        google_auth.google_id_token,
        "verify_oauth2_token",
        lambda *a, **k: {
            "iss": "https://evil.example.com",
            "sub": "x",
            "email": "a@b.co",
            "email_verified": True,
        },
    )
    with pytest.raises(google_auth.GoogleAuthError):
        google_auth.verify_id_token("token")


def test_a_failed_signature_yields_nothing_at_all(monkeypatch):
    """The whole basis of the feature: an ID token is a JWT anyone can mint the
    shape of, so a token that does not verify must produce no claims."""

    def explode(*a, **k):
        raise ValueError("Invalid signature")

    monkeypatch.setattr(google_auth, "GOOGLE_CLIENT_ID", "our-client-id")
    monkeypatch.setattr(google_auth.google_id_token, "verify_oauth2_token", explode)
    with pytest.raises(google_auth.GoogleAuthError):
        google_auth.verify_id_token("forged.but.well-formed")


def test_password_login_on_a_google_only_account_names_the_right_door(client, google):
    """Otherwise the writer is guessing a password that was never set."""
    email = _unique_email()
    client.post(
        "/auth/google", json={"credential": _token(google, "google-sub-6", email)}
    )

    r = client.post("/auth/login", json={"email": email, "password": GOOD_PASSWORD})
    assert r.status_code == 401
    assert "google" in r.json()["detail"].lower()
