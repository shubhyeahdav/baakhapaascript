"""Test environment.

Every environment variable is set BEFORE the app is imported, because
`database.py` and `auth.py` read configuration at import time. `load_dotenv()`
does not override variables that already exist, so these win over `.env`.
"""
import os
import tempfile
import uuid

# --- must precede any application import -----------------------------------
os.environ["LOCAL_DB_PATH"] = os.path.join(
    tempfile.gettempdir(), f"baakhapaa_test_{uuid.uuid4().hex}.db"
)
os.environ["JWT_SECRET"] = "test-secret-" + "x" * 48
os.environ["RATE_LIMITS_ENABLED"] = "false"  # per-process buckets would leak between tests
os.environ["DEMO_SEED"] = "false"            # no known-credential account in tests
os.environ.pop("SUPABASE_URL", None)         # force the local mock database
os.environ.pop("SUPABASE_KEY", None)
# ---------------------------------------------------------------------------

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from database import supabase  # noqa: E402

GOOD_PASSWORD = "Kathmandu!2026"


@pytest.fixture
def client():
    return TestClient(app)


def _unique_email(prefix="user"):
    return f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture
def make_user(client):
    """Register a user and return {email, password, token, id, headers}."""

    def _make(tier: str = "free", password: str = GOOD_PASSWORD):
        email = _unique_email(tier)
        reg = client.post(
            "/auth/register",
            json={"email": email, "password": password, "name": "Test Person"},
        )
        assert reg.status_code == 200, reg.text
        user_id = reg.json()["id"]

        if tier != "free":
            supabase.table("users").update({"subscription_tier": tier}).eq(
                "id", user_id
            ).execute()

        login = client.post("/auth/login", json={"email": email, "password": password})
        assert login.status_code == 200, login.text
        token = login.json()["token"]

        return {
            "email": email,
            "password": password,
            "id": user_id,
            "token": token,
            "headers": {"Authorization": f"Bearer {token}"},
        }

    return _make


@pytest.fixture
def make_script(client):
    """Create a project and return its get-or-create script id."""

    def _make(user):
        proj = client.post(
            "/projects/",
            json={
                "title": "Sapana",
                "genre": "Drama",
                "tone": "Emotional",
                "language": "Bilingual",
                "duration_minutes": 15,
                "target_audience": "Youth",
            },
            headers=user["headers"],
        )
        assert proj.status_code == 200, proj.text
        project_id = proj.json()["id"]

        script = client.get(f"/scripts/project/{project_id}", headers=user["headers"])
        assert script.status_code == 200, script.text
        return project_id, script.json()["id"]

    return _make
