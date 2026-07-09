from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import auth
import projects
import scripts
import storyboard
import versions
import collaboration
import export
import subscription

app = FastAPI(title="Baakhapaa API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    # Local testing: allow any localhost port (CRA/preview servers pick varying
    # ports). Before deploying, replace this with an explicit prod-domain allowlist.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
