import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

import auth
import projects
import scripts
import storyboard
import versions
import collaboration
import export
import subscription
from rate_limit import limiter

app = FastAPI(title="Baakhapaa API", version="1.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Production: set CORS_ORIGINS to a comma-separated allowlist, e.g.
#   CORS_ORIGINS=https://baakhapaa.com,https://www.baakhapaa.com
# Falling back to the localhost regex in production would let any page served
# from a localhost port on a victim's machine call the API with credentials.
_cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

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
        # Local dev only: CRA and the preview server pick varying ports.
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    print("WARNING: CORS allows any localhost port (dev default). Set CORS_ORIGINS before deploying.")

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(scripts.router)
app.include_router(storyboard.router)
app.include_router(versions.router)
app.include_router(collaboration.router)
app.include_router(export.router)
app.include_router(subscription.router)


@app.get("/health")
def health_check():
    return {"status": "ok", "app": "Baakhapaa", "version": "1.0"}


@app.get("/")
def root():
    return {"message": "Welcome to Baakhapaa API. Visit /docs for API documentation."}
