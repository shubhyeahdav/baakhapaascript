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

app = FastAPI(title="Baakhapaa API", version="1.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Refuses the boot when APP_ENV=production and something documented-but-unset
# would be wrong in production (CORS, DEMO_SEED, SQLite, the Devanagari font).
# Prints and continues otherwise, so local development is unaffected.
deploy_checks.run()

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
    return {"status": "ok", "app": "Baakhapaa", "version": "1.0"}


@app.get("/")
def root():
    return {"message": "Welcome to Baakhapaa API. Visit /docs for API documentation."}
