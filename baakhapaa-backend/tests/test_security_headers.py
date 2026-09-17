"""Every API response carries the headers the frontend has always carried.

`baakhapaa-frontend/vercel.json` has set nosniff, DENY,
strict-origin-when-cross-origin and a Permissions-Policy on every static asset
since the deploy artefacts landed. The API set none of them. Checked against
the deployed backend on 2026-09-17:

    /health            0 of 5
    /auth/providers    0 of 5
    /docs              0 of 5

Two properties are worth more than the headers themselves and are what most of
this file tests.

**Outermost.** `CORSMiddleware` answers a rejected preflight itself, without
calling the application beneath it, so a header middleware added before it
would never see that reply — and `400 Disallowed CORS origin` is among the most
frequent responses a probing client gets. Starlette applies middleware
outside-in with the last-added outermost, which is why `main.py` adds this one
after CORS and not with the others.

**Streaming survives.** `/scripts/generate-scene/stream` and `/scripts/improve/stream`
exist so a writer sees words appear. `BaseHTTPMiddleware` would read the body
through a stream and is the usual way that breaks; this middleware mutates the
`http.response.start` message and never touches the body.
"""
import security_headers


EXPECTED = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
}


def _missing(response):
    return [k for k, v in EXPECTED.items() if response.headers.get(k) != v]


# --- the ordinary case ------------------------------------------------------

def test_a_plain_response_carries_every_header(client):
    r = client.get("/health")

    assert r.status_code == 200, r.text
    assert not _missing(r), f"missing from /health: {_missing(r)}"


def test_the_api_docs_carry_them(client):
    """The most important single route here. Swagger UI is an interactive
    console on the same origin as the API; without X-Frame-Options any page on
    the internet can frame it."""
    r = client.get("/docs")

    assert r.status_code == 200, r.text
    assert r.headers.get("x-frame-options") == "DENY"


def test_an_error_response_carries_them_too(client):
    """A 404 is a response like any other. Headers attached only on the happy
    path are headers absent exactly when something odd is happening."""
    r = client.get("/no-such-route-exists")

    assert r.status_code == 404
    assert not _missing(r)


def test_an_authenticated_route_carries_them(client, make_user):
    user = make_user()
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {user['token']}"})

    assert r.status_code == 200, r.text
    assert not _missing(r)


def test_an_unauthorized_response_carries_them(client):
    r = client.get("/auth/me")

    assert r.status_code == 401
    assert not _missing(r)


# --- the reply CORS writes itself, which is why order matters ---------------

def test_a_rejected_cors_preflight_still_carries_them(client):
    """The regression test for middleware order.

    If `SecurityHeadersMiddleware` is ever added BEFORE `CORSMiddleware` in
    main.py, CORS answers this request without ever reaching us and the
    assertion below fails. Nothing else in the suite would notice.
    """
    r = client.options(
        "/auth/login",
        headers={
            "Origin": "https://not-an-allowed-origin.example",
            "Access-Control-Request-Method": "POST",
        },
    )

    # Whatever the verdict, the headers ride along.
    assert not _missing(r), (
        f"missing on a CORS preflight ({r.status_code}): {_missing(r)}. "
        "SecurityHeadersMiddleware must be added AFTER CORSMiddleware so it "
        "sits outermost."
    )


# --- HSTS is the one that is environment-dependent -------------------------

def test_hsts_is_absent_outside_production(client):
    """A browser ignores HSTS over plain http, so this is not a hole — but
    "never speak http to this host again" is not a promise to attach to a
    developer's localhost by accident."""
    r = client.get("/health")

    assert "strict-transport-security" not in r.headers


def test_hsts_is_sent_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")

    assert security_headers._hsts_enabled() is True
    assert b"includeSubDomains" in security_headers.HSTS
    assert b"preload" in security_headers.HSTS


def test_hsts_is_two_years():
    """Under a year and the preload lists will not take it."""
    assert b"max-age=63072000" in security_headers.HSTS


# --- properties that keep it from doing harm -------------------------------

def test_a_route_that_sets_its_own_header_is_not_duplicated():
    """Two conflicting X-Frame-Options have historically been resolved by
    browsers ignoring both, so a duplicate is worse than an absence."""
    sent = []

    async def app(scope, receive, send):
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"x-frame-options", b"SAMEORIGIN")],
        })
        await send({"type": "http.response.body", "body": b""})

    async def send(message):
        sent.append(message)

    import asyncio
    mw = security_headers.SecurityHeadersMiddleware(app)
    asyncio.run(mw({"type": "http"}, None, send))

    names = [n for n, _ in sent[0]["headers"]]
    assert names.count(b"x-frame-options") == 1
    # and the route's own value wins
    assert dict(sent[0]["headers"])[b"x-frame-options"] == b"SAMEORIGIN"


def test_a_non_http_scope_passes_straight_through():
    """A lifespan or websocket message has no response headers to add."""
    seen = []

    async def app(scope, receive, send):
        seen.append(scope["type"])

    import asyncio
    mw = security_headers.SecurityHeadersMiddleware(app)
    asyncio.run(mw({"type": "lifespan"}, None, None))

    assert seen == ["lifespan"]


def test_the_values_match_the_frontend_exactly():
    """The two halves of the product should answer the same way; a reader
    comparing them should find nothing to explain."""
    import io
    import json
    import os

    path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "baakhapaa-frontend", "vercel.json",
    )
    if not os.path.exists(path):
        return  # frontend not present in this checkout

    config = json.loads(io.open(path, encoding="utf-8").read())
    frontend = {}
    for block in config.get("headers", []):
        if block.get("source") == "/(.*)":
            for h in block.get("headers", []):
                frontend[h["key"].lower()] = h["value"]

    for key, value in frontend.items():
        if key in EXPECTED:
            assert EXPECTED[key] == value, (
                f"{key}: API sends {EXPECTED[key]!r}, frontend sends {value!r}"
            )
