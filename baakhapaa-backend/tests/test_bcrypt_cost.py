"""The bcrypt cost factor, and the reason it is safe to lower it here.

The test suite runs bcrypt at cost factor 4 rather than the production 12.
Measured on a Windows dev box at 12: 0.212s to hash and 0.196s to verify,
against 754 `make_user` call sites — roughly five minutes of a twenty-minute
run spent demonstrating that bcrypt is deliberately slow. That is a property of
bcrypt rather than of this codebase, and no test in this suite asserts it.

The danger is obvious and is the whole reason this file exists: cost factor 4
is about 256x cheaper to attack than 12, and a test-only setting reaching
production is the classic way a security parameter gets quietly downgraded —
copied out of a config nobody re-read, or exported into a shell that later ran
a deploy. So it is defended twice, and both halves are pinned here:

  * the DEFAULT is 12, so an environment that says nothing gets the safe value;
  * `deploy_checks.py` REFUSES THE BOOT under APP_ENV=production if the value
    is below the minimum, rather than warning — a warning scrolls past in a
    deploy log and this is not a thing to discover from a breach.

If a future reader wants to raise the production factor, change
`MIN_PRODUCTION_BCRYPT_ROUNDS` and this file follows, because it reads the
constant rather than repeating the number.
"""
import importlib
import os

import auth
import deploy_checks


def _errors(env="production"):
    return deploy_checks.collect(env)[0]


# --- the value actually in force -------------------------------------------

def test_the_suite_runs_at_the_cheap_cost_factor():
    """conftest sets this before any application import. If it stops working,
    the suite silently gets five minutes slower rather than failing, which is
    exactly the kind of regression nobody attributes correctly."""
    assert auth.BCRYPT_ROUNDS == 4, (
        "tests/conftest.py should pin BCRYPT_ROUNDS=4; the suite is paying "
        "production-grade bcrypt for no assertion"
    )


def test_hashes_made_here_really_carry_that_cost():
    """Asserted against the hash itself, not the constant — passlib silently
    ignores an unknown keyword, so a renamed `bcrypt__rounds` would leave the
    constant right and the behaviour unchanged."""
    digest = auth.pwd_context.hash("a-password-for-the-test")

    assert digest.split("$")[2] == "04", f"cost factor is not 4: {digest[:7]}"


def test_the_default_is_the_production_value(monkeypatch):
    """An environment that says nothing must get 12. This is the half that
    protects every deployment nobody thought about."""
    monkeypatch.delenv("BCRYPT_ROUNDS", raising=False)

    reloaded = importlib.reload(auth)
    try:
        assert reloaded.BCRYPT_ROUNDS == reloaded.MIN_PRODUCTION_BCRYPT_ROUNDS == 12
    finally:
        # Restore the module for every test that follows, or the rest of the
        # suite pays production bcrypt and this "speed-up" costs more than it
        # saves.
        os.environ["BCRYPT_ROUNDS"] = "4"
        importlib.reload(auth)


def test_an_empty_value_falls_back_rather_than_crashing(monkeypatch):
    """`BCRYPT_ROUNDS=` in a .env file reads as the empty string, and int("")
    raises at import — which would be a boot failure in the auth module."""
    monkeypatch.setenv("BCRYPT_ROUNDS", "")

    reloaded = importlib.reload(auth)
    try:
        assert reloaded.BCRYPT_ROUNDS == 12
    finally:
        os.environ["BCRYPT_ROUNDS"] = "4"
        importlib.reload(auth)


# --- the guard that stops it reaching production ---------------------------

def test_production_refuses_to_boot_at_the_test_cost_factor(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://example.test")
    monkeypatch.setattr(auth, "BCRYPT_ROUNDS", 4)

    joined = " ".join(_errors("production"))

    assert "BCRYPT_ROUNDS" in joined
    assert "4" in joined


def test_production_is_satisfied_by_the_real_cost_factor(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://example.test")
    monkeypatch.setattr(auth, "BCRYPT_ROUNDS", 12)

    assert not [e for e in _errors("production") if "BCRYPT_ROUNDS" in e]


def test_a_stronger_cost_factor_is_not_refused(monkeypatch):
    """Raising it is always allowed. A check that blocked 14 would be a check
    that punished someone for being careful."""
    monkeypatch.setenv("CORS_ORIGINS", "https://example.test")
    monkeypatch.setattr(auth, "BCRYPT_ROUNDS", 14)

    assert not [e for e in _errors("production") if "BCRYPT_ROUNDS" in e]


def test_development_is_never_blocked_by_this(monkeypatch):
    """Local dev runs at 4 by way of conftest and must stay unaffected — a
    check that fires locally is a check somebody disables."""
    monkeypatch.setattr(auth, "BCRYPT_ROUNDS", 4)

    assert not [e for e in _errors("development") if "BCRYPT_ROUNDS" in e]


# --- the property none of the above may break ------------------------------

def test_a_password_still_verifies_and_a_wrong_one_still_fails():
    """The point of the cost factor is speed, not behaviour. If lowering it
    changed either answer, the speed-up would be worthless."""
    digest = auth.pwd_context.hash("Chiya!Pasal7Kathmandu")

    assert auth.pwd_context.verify("Chiya!Pasal7Kathmandu", digest)
    assert not auth.pwd_context.verify("chiya!pasal7kathmandu", digest)


def test_two_hashes_of_the_same_password_differ():
    """bcrypt salts per hash. A cheap cost factor must not become a fixed salt,
    which would make the stored hashes a lookup table."""
    a = auth.pwd_context.hash("same-password")
    b = auth.pwd_context.hash("same-password")

    assert a != b
