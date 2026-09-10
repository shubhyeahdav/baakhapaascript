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
os.environ["RAG_CACHE_TTL"] = "0"            # the RAG suite reseeds script_patterns per test
os.environ["DEMO_SEED"] = "false"            # no known-credential account in tests
# SET, do not pop — the same trap the AI keys are guarded against below, and it
# was left open here. `load_dotenv()` declines to overwrite a variable that
# already exists but DOES fill in one that is missing, so popping these let the
# real `.env` refill them on the next import. From the day Supabase keys were
# added to `.env`, the entire suite silently ran against the PRODUCTION
# database: 853 tests creating and deleting rows in the live project.
#
# It surfaced only because the key in use at the time was the anon key, which
# row-level security refuses to write with, so the tests failed instead of
# succeeding destructively. With a service_role key they would have passed, and
# deleted real data doing it.
#
# `database.py` treats a URL containing "your-supabase" as absent, which is the
# documented placeholder shape.
os.environ["SUPABASE_URL"] = "https://your-supabase-project.example"
os.environ["SUPABASE_KEY"] = "your-supabase-key-tests-never-connect-out"
# eSewa publishes UAT credentials, so payments default to its real sandbox host.
# A unit test must not depend on a third party being reachable, so the suite
# pins the offline simulation instead. Tests that care about the sandbox set
# this themselves.
os.environ["PAYMENT_SANDBOX"] = "false"
# Same reasoning, for the AI providers. `script_engine` picks its provider at
# import time from whether a real key is present, so the day a developer put
# real keys in `.env` the suite silently started making live, billed calls —
# and hung, because the SDK retries a failure before giving up. A unit test
# must not spend money or depend on Anthropic being reachable. Tests that
# exercise the real-provider branch set these themselves.
# SET, do not pop. `load_dotenv()` only declines to overwrite a variable that
# already exists, so popping these just lets the real .env refill them on the
# next import — which is the trap this guard exists to close. The value is the
# placeholder shape `script_engine._usable()` rejects.
os.environ["ANTHROPIC_API_KEY"] = "your-anthropic-key-tests-never-call-out"
os.environ["OPENAI_API_KEY"] = "your-openai-key-tests-never-call-out"
os.environ["GROQ_API_KEY"] = "your-groq-key-tests-never-call-out"
# The OpenAI-compatible transport reads its OWN pair, and this guard did not
# cover them when that transport landed. With `LLM_PROVIDER=tokenrouter` and a
# real `LLM_API_KEY` in `.env`, every AI test made a live billed call to a
# reasoning model that spends its whole token budget thinking and returns an
# empty answer — so the suite did not fail, it hung. Fifty minutes with no
# output is what that looks like from outside.
#
# `LLM_PROVIDER` is pinned too, not just the key. Leaving the provider set and
# only breaking the key turns every one of those tests into a boot-time
# RuntimeError from `script_engine`, which is a different lie about what the
# product does. Unset provider is the documented default and the state the
# suite is written against. Tests that exercise a provider set both themselves
# and reload the module — see `tests/test_llm_provider.py`.
os.environ["LLM_PROVIDER"] = ""
os.environ["LLM_API_KEY"] = "your-llm-key-tests-never-call-out"
os.environ["LLM_BASE_URL"] = ""
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
