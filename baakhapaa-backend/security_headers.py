"""The response headers the frontend has had all along and the API has not.

`baakhapaa-frontend/vercel.json` has carried a header block since the deploy
artefacts landed, so every static asset is served with nosniff, DENY,
strict-origin-when-cross-origin and a Permissions-Policy. Checked against the
deployed API on 2026-09-17, every route answered with **none of them**:

    /health            0 of 5
    /auth/providers    0 of 5
    /docs              0 of 5

`/docs` is the one that matters most and is the easiest to overlook. It is an
interactive API console served from the same origin as the session cookie-less
but token-bearing API, and with no `X-Frame-Options` it can be framed by any
page on the internet.

**Pure ASGI, not `BaseHTTPMiddleware`.** Starlette's convenience base class
reads the response through an anyio stream, which is a problem for this app in
particular: `/scripts/generate-scene/stream` and `/scripts/improve/stream` are
the two endpoints a writer watches token by token, and the whole point of them
is that the first words arrive before the last ones exist. Mutating the
`http.response.start` message leaves the body untouched, so a stream stays a
stream.

**No Content-Security-Policy here, deliberately.** `/docs` is Swagger UI and
pulls its own JavaScript and CSS from a CDN, so any policy strict enough to be
worth setting would blank the API documentation — a real cost against a header
that protects an API returning JSON, which is not a script-execution surface in
the way an HTML app is. If `/docs` is ever self-hosted or disabled in
production, this is the note that says a CSP became cheap.
"""
import os

# Sent on every response. Values match `vercel.json` exactly, so the two halves
# of the product answer the same way and a reader comparing them finds no
# difference to explain.
BASE_HEADERS = {
    b"x-content-type-options": b"nosniff",
    b"x-frame-options": b"DENY",
    b"referrer-policy": b"strict-origin-when-cross-origin",
    b"permissions-policy": b"camera=(), microphone=(), geolocation=()",
}

# Two years with preload, matching what Vercel already sends for the frontend.
HSTS = b"max-age=63072000; includeSubDomains; preload"


def _hsts_enabled() -> bool:
    """HSTS only in production.

    A browser ignores the header over plain http, so sending it locally is
    merely useless — but `APP_ENV` already distinguishes the two environments
    and a header that means "never speak http to this host again" is not one to
    attach to a developer's localhost by accident.
    """
    return (os.getenv("APP_ENV") or "development").lower() == "production"


class SecurityHeadersMiddleware:
    """Add the headers to every response, without touching the body."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                # Starlette gives us a list of (name, value) byte pairs. Names
                # are compared lowercased because a route is free to set its
                # own casing, and a duplicated header is worse than no header:
                # browsers presented with two conflicting X-Frame-Options have
                # historically resolved it by ignoring both.
                headers = message.setdefault("headers", [])
                present = {name.lower() for name, _ in headers}

                for name, value in BASE_HEADERS.items():
                    if name not in present:
                        headers.append((name, value))

                if _hsts_enabled() and b"strict-transport-security" not in present:
                    headers.append((b"strict-transport-security", HSTS))

            await send(message)

        await self.app(scope, receive, send_with_headers)
