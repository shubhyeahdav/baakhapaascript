"""Registration, login, and token handling."""
import time

import pytest

from conftest import GOOD_PASSWORD, _unique_email
from rate_limit import limiter


@pytest.mark.parametrize(
    "password,missing",
    [
        ("Short1!", "at least 8 characters"),
        ("kathmandu!2026", "an uppercase letter"),
        ("KATHMANDU!2026", "a lowercase letter"),
        ("KathmanduCity!", "a number"),
        ("Kathmandu2026", "a special character"),
    ],
)
def test_register_rejects_weak_passwords(client, password, missing):
    """The client-side rules are a UX affordance; the API is the real gate."""
    r = client.post(
        "/auth/register",
        json={"email": _unique_email(), "password": password, "name": "X"},
    )
    assert r.status_code == 400
    assert missing in r.json()["detail"]


def test_register_accepts_a_strong_password(client):
    r = client.post(
        "/auth/register",
        json={"email": _unique_email(), "password": GOOD_PASSWORD, "name": "X"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["subscription_tier"] == "free"
    assert "password" not in body and "password_hash" not in body


def test_register_rejects_duplicate_email(client, make_user):
    user = make_user()
    r = client.post(
        "/auth/register",
        json={"email": user["email"], "password": GOOD_PASSWORD, "name": "X"},
    )
    assert r.status_code == 400


def test_login_succeeds_with_correct_credentials(client, make_user):
    user = make_user()
    r = client.post(
        "/auth/login", json={"email": user["email"], "password": user["password"]}
    )
    assert r.status_code == 200
    assert r.json()["token"]


def test_login_rejects_wrong_password(client, make_user):
    user = make_user()
    r = client.post(
        "/auth/login", json={"email": user["email"], "password": "Wrong!2026x"}
    )
    assert r.status_code == 401


def test_login_gives_identical_response_for_unknown_email(client, make_user):
    """Wrong password and unknown email must be indistinguishable, or the
    login endpoint becomes an account-enumeration oracle."""
    user = make_user()
    wrong_pw = client.post(
        "/auth/login", json={"email": user["email"], "password": "Wrong!2026x"}
    )
    unknown = client.post(
        "/auth/login", json={"email": _unique_email("ghost"), "password": "Wrong!2026x"}
    )
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json()["detail"] == unknown.json()["detail"]


def test_login_timing_does_not_leak_account_existence(client, make_user):
    """Unknown email must still pay the bcrypt cost. Without the equalizer the
    unknown-email path returns in ~1ms against ~250ms for a real verify."""
    user = make_user()

    def _time(email):
        start = time.perf_counter()
        client.post("/auth/login", json={"email": email, "password": "Wrong!2026x"})
        return time.perf_counter() - start

    _time(user["email"])  # warm the lazily-built dummy hash

    known = min(_time(user["email"]) for _ in range(3))
    unknown = min(_time(_unique_email("ghost")) for _ in range(3))

    # Generous bound: catches the 1ms-vs-250ms short circuit without being
    # flaky about normal scheduling noise.
    assert unknown > known * 0.5, f"known={known:.4f}s unknown={unknown:.4f}s"


def test_me_requires_a_token(client):
    assert client.get("/auth/me").status_code == 401


def test_me_returns_the_current_user(client, make_user):
    user = make_user()
    r = client.get("/auth/me", headers=user["headers"])
    assert r.status_code == 200
    assert r.json()["email"] == user["email"]


def test_tampered_token_is_rejected(client, make_user):
    user = make_user()
    bad = user["token"][:-4] + "aaaa"
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {bad}"})
    assert r.status_code == 401


def test_login_is_rate_limited(client, make_user):
    """Enable the limiter for this test only; it is off suite-wide because the
    bucket is per-process and would leak into unrelated tests."""
    user = make_user()
    limiter.reset()
    limiter.enabled = True
    try:
        codes = [
            client.post(
                "/auth/login",
                json={"email": user["email"], "password": "Wrong!2026x"},
            ).status_code
            for _ in range(8)
        ]
    finally:
        limiter.enabled = False
        limiter.reset()

    assert 429 in codes, f"no request was rate limited: {codes}"


# ---------------------------------------------------------------------------
# The address has to survive the trip from sign-up to sign-in
#
# Lookup is an exact string match, so case and whitespace were significant: a
# writer who registered as `Mira@studio.com` and later typed `mira@studio.com`
# got "Invalid email or password" for their own account. Phone keyboards
# capitalise the first letter by default, which aimed this squarely at the
# users least equipped to work out what happened — and the same gap let one
# address hold two accounts, because the duplicate check is that same match.
# ---------------------------------------------------------------------------
def test_login_ignores_the_capitalisation_used_at_sign_up(client):
    email = _unique_email()
    reg = client.post(
        "/auth/register",
        json={"email": email, "password": GOOD_PASSWORD, "name": "Mira Rai"},
    )
    assert reg.status_code == 200

    r = client.post(
        "/auth/login",
        json={"email": email.upper(), "password": GOOD_PASSWORD},
    )
    assert r.status_code == 200, "a capitalised address must reach the same account"
    assert r.json()["user"]["email"] == email.lower()


def test_login_ignores_surrounding_whitespace(client):
    """Pasted addresses and phone autocomplete both carry trailing spaces."""
    email = _unique_email()
    client.post(
        "/auth/register",
        json={"email": email, "password": GOOD_PASSWORD, "name": "Mira"},
    )

    r = client.post(
        "/auth/login",
        json={"email": f"  {email}  ", "password": GOOD_PASSWORD},
    )
    assert r.status_code == 200


def test_the_same_address_cannot_register_twice_under_different_casing(client):
    email = _unique_email()
    first = client.post(
        "/auth/register",
        json={"email": email, "password": GOOD_PASSWORD, "name": "Mira"},
    )
    assert first.status_code == 200

    second = client.post(
        "/auth/register",
        json={"email": email.upper(), "password": GOOD_PASSWORD, "name": "Someone Else"},
    )
    assert second.status_code == 400
    assert "already registered" in second.json()["detail"].lower()


def test_the_stored_address_is_the_normalised_one(client):
    email = _unique_email()
    r = client.post(
        "/auth/register",
        json={"email": f"  {email.upper()} ", "password": GOOD_PASSWORD, "name": "Mira"},
    )
    assert r.status_code == 200
    assert r.json()["email"] == email.lower()


@pytest.mark.parametrize("bad", ["not-an-email", "missing@domain", "@nolocal.com", "two@@at.com", ""])
def test_register_rejects_an_address_that_cannot_receive_mail(client, bad):
    """`email` was a bare `str`, so the API accepted anything the browser's
    own type="email" check happened not to see."""
    r = client.post(
        "/auth/register",
        json={"email": bad, "password": GOOD_PASSWORD, "name": "Mira"},
    )
    assert r.status_code == 422


def test_register_rejects_a_blank_name(client):
    """A whitespace-only name reached the database and then rendered as an
    empty account menu."""
    r = client.post(
        "/auth/register",
        json={"email": _unique_email(), "password": GOOD_PASSWORD, "name": "   "},
    )
    assert r.status_code == 422


def test_a_name_keeps_its_internal_spacing_but_loses_the_edges(client):
    r = client.post(
        "/auth/register",
        json={"email": _unique_email(), "password": GOOD_PASSWORD, "name": "  Mira  Rai  "},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Mira  Rai"
