"""The dev CORS fallback lets a phone on the same WiFi reach the API.

Testing the mobile layout on a real device is the only way to find what an
emulated viewport does not: a thumb is not a mouse, and a phone browser's
address bar collapses in ways a resized window never will. That needs the
laptop's dev servers reachable from the phone, and the phone then sends an
origin like `http://192.168.1.85:3000`, which the old localhost-only pattern
rejected.

The property that makes this safe is not in this file but in
`deploy_checks.collect`: in production an unset `CORS_ORIGINS` is a boot ERROR,
not a fallback to this regex. So this pattern is unreachable in production no
matter how wide it is. The test for that lives in `test_deploy_checks.py`; the
one below just makes sure the two facts stay connected.
"""
import re

import main


def _regex():
    for mw in main.app.user_middleware:
        pattern = mw.kwargs.get("allow_origin_regex")
        if pattern:
            return re.compile(pattern)
    raise AssertionError("no CORS origin regex is configured")


def test_localhost_still_works():
    """Everything that worked before has to keep working — this is the origin
    every developer and every test uses."""
    rx = _regex()

    assert rx.fullmatch("http://localhost:3000")
    assert rx.fullmatch("http://127.0.0.1:8000")


def test_a_phone_on_the_same_wifi_is_allowed():
    rx = _regex()

    assert rx.fullmatch("http://192.168.1.85:3000")
    assert rx.fullmatch("http://10.0.0.4:3000")
    assert rx.fullmatch("http://172.20.10.2:3000")


def test_a_public_address_is_still_refused():
    """Only the RFC 1918 private blocks. If this ever matches a routable
    address, any site on the internet could call a developer's API."""
    rx = _regex()

    assert not rx.fullmatch("http://203.0.113.9:3000")
    assert not rx.fullmatch("http://8.8.8.8:3000")
    # 172.32 is outside the private block, which is the boundary most
    # hand-written versions of this regex get wrong.
    assert not rx.fullmatch("http://172.32.0.1:3000")
    assert not rx.fullmatch("http://172.15.0.1:3000")


def test_an_attacker_cannot_prefix_a_private_address_onto_their_own_host():
    """`http://192.168.1.85.evil.com` contains a private address as a prefix.
    Anchoring is what stops it, and `fullmatch` is what Starlette uses."""
    rx = _regex()

    assert not rx.fullmatch("http://192.168.1.85.evil.com")
    assert not rx.fullmatch("http://localhost.evil.com:3000")


def test_https_is_not_matched_by_the_dev_pattern():
    """Nothing local is served over TLS, and a match here would mean a public
    HTTPS origin only had to embed a private-looking host to pass."""
    rx = _regex()

    assert not rx.fullmatch("https://192.168.1.85:3000")


def test_production_never_reaches_this_pattern():
    """The whole safety argument in one assertion: with APP_ENV=production and
    no CORS_ORIGINS, the app refuses to boot rather than falling back here."""
    import deploy_checks

    errors, _warnings = deploy_checks.collect(env="production")

    assert any("CORS_ORIGINS" in e for e in errors)
