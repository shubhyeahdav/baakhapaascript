import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

import auth
import deploy_checks
import projects
import scripts
import storyboard
import versions
import collaboration
import export
import subscription
import learn
from rate_limit import limiter
from security_headers import SecurityHeadersMiddleware

app = FastAPI(title="Baakhapaa API", version="1.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Refuses the boot when APP_ENV=production and something documented-but-unset
# would be wrong in production (CORS, DEMO_SEED, SQLite, the Devanagari font).
# Prints and continues otherwise, so local development is unaffected.
deploy_checks.run()

# The embedding model takes about a second to load and five milliseconds to use
# after that, so somebody pays for it — and without this it is the first person
# to open the Patterns tab. `RAG_WARM_MODEL=false` turns it off; the test suite
# sets exactly that, because 55 test files each paying a second to load a model
# they never call is a minute of nothing.
if os.getenv("RAG_WARM_MODEL", "true").lower() not in ("false", "0", "no"):
    import threading

    import rag as _rag

    threading.Thread(target=_rag.warm_model, daemon=True, name="rag-warm").start()

# Production: set CORS_ORIGINS to a comma-separated allowlist, e.g.
#   CORS_ORIGINS=https://baakhapaa.com,https://www.baakhapaa.com
# Falling back to the localhost regex in production would let any page served
# from a localhost port on a victim's machine call the API with credentials.
# (Unset in production is now a boot failure, not a silent fallback.)
_cors_origins = deploy_checks.cors_origins()

if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    print(f"CORS: restricted to {_cors_origins}")
else:
    app.add_middleware(
        CORSMiddleware,
        # Local dev only, and only reachable at all when CORS_ORIGINS is unset
        # — in production an unset CORS_ORIGINS is a boot error, not a fallback
        # (see deploy_checks.collect), so widening this cannot widen anything
        # deployed.
        #
        # Private LAN addresses are here so the app can be opened on a phone on
        # the same WiFi, which is the only way to test the mobile layout on a
        # real device: the browser then sends an origin like
        # http://192.168.1.85:3000, which the localhost pattern rejects. The
        # three ranges are the RFC 1918 private blocks and nothing else — a
        # public address still fails.
        allow_origin_regex=(
            r"http://("
            r"localhost|127\.0\.0\.1"
            r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
            r"|192\.168\.\d{1,3}\.\d{1,3}"
            r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
            r"):\d+"
        ),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    print("WARNING: CORS allows any localhost port (dev default). Set CORS_ORIGINS before deploying.")

# Added AFTER the CORS middleware on purpose. Starlette's `add_middleware`
# inserts at the front of the list and the list is applied outside-in, so the
# LAST one added is the OUTERMOST — and outermost is what this needs to be.
# CORSMiddleware answers a rejected preflight itself without calling the app
# beneath it, so a middleware added before it would never see that response:
# `400 Disallowed CORS origin` would go out bare. Same for the rate limiter's
# 429. Those are the replies an attacker probing this API sees most often, and
# they are exactly the ones that should not be the unprotected ones.
app.add_middleware(SecurityHeadersMiddleware)

# What an invitation link is for, readable without an account — the recipient
# has to be able to see what they are being asked to join BEFORE deciding to
# register. Returns the project title and role only: never the script, never
# anything identifying other members.
@app.get("/invites/{token}", tags=["invites"])
def describe_invite(token: str):
    import invites
    return invites.describe(token)


app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(scripts.router)
app.include_router(storyboard.router)
app.include_router(versions.router)
app.include_router(collaboration.router)
app.include_router(export.router)
app.include_router(subscription.router)
app.include_router(learn.router)


@app.get("/health")
def health_check():
    """Liveness, plus the one fact a caller cannot otherwise discover: whether
    this backend is writing to a real database or to the local SQLite mock.

    `demo` was added because `scripts/responsive-audit.mjs` registers a
    throwaway account to reach the protected routes, and nothing told it where
    that account would land. Run against this machine it created real users in
    the production Supabase project — which is what `purge_test_accounts.py`
    exists to clean up after. A script that writes should be able to ask first.

    Nothing sensitive is exposed: no keys, no hostnames, no counts. It reports
    which of two documented modes the process booted in — the boot log already
    prints it and `deploy_checks.py` already enforces it.
    """
    import database
    import script_engine

    return {
        "status": "ok",
        "app": "Baakhapaa",
        "version": "1.0",
        "env": os.getenv("APP_ENV", "development"),
        "demo": bool(database.use_mock),
        "ai_provider": script_engine.PROVIDER,
    }


@app.get("/")
def root():
    return {"message": "Welcome to Baakhapaa API. Visit /docs for API documentation."}
