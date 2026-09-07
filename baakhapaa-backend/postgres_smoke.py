"""The first run against a real Postgres, as one command.

    ./venv/Scripts/python postgres_smoke.py

Every environment this product has ever run in is `MockSupabaseClient` — a
SQLite store that creates columns on demand and enforces no constraints. That is
why `pgvector_script_patterns.sql` was able to drift into describing a table the
loader could not write to, undetected, until somebody read it by hand.

So the first boot against real Postgres is the highest-risk moment in the
project, and it is exactly the moment when checking things by hand goes worst:
ten steps, each of which fails in a way that looks like the step before it. This
runs them in order, stops at the first real failure, and says what differed.

It refuses to run against the mock. A green result here that came from SQLite
would be worse than no result at all.

What it does NOT do is write to a database that already has people in it. It
creates one throwaway account with a random address, uses it, and deletes
everything it made. Run it against a fresh project first anyway.
"""
import os
import sys
import traceback
import uuid

from dotenv import load_dotenv

# Before anything reads the environment. `database.py` calls this on import,
# but the guard below runs BEFORE that import on purpose — it must decide
# whether to talk to Postgres before connecting to anything — so without this
# the guard read an empty environment and refused a correctly configured .env.
load_dotenv()

FAILURES = []
NOTES = []


def _step(name):
    def wrap(fn):
        fn._step_name = name
        return fn
    return wrap


def _ok(msg):
    print(f"  [ok]   {msg}")


def _bad(msg):
    print(f"  [FAIL] {msg}")
    FAILURES.append(msg)


def _note(msg):
    print(f"  [note] {msg}")
    NOTES.append(msg)


# --- 0. refuse to prove anything about the mock -----------------------------

def require_real_postgres():
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_KEY", "").strip()
    if not url or not key or url.startswith("your-"):
        sys.exit(
            "SUPABASE_URL and SUPABASE_KEY are not set, so this would run "
            "against the SQLite mock and prove nothing.\n\n"
            "Create the project at supabase.com, then put the URL and the "
            "service role key in baakhapaa-backend/.env and run this again."
        )

    from database import supabase
    kind = type(supabase).__name__
    if kind == "MockSupabaseClient":
        sys.exit(
            f"Keys are set but the client is still {kind}. Something in "
            "database.py rejected them — read its startup warning."
        )
    _ok(f"talking to real Postgres ({kind})")


# --- 0b. every table the schema file defines ---------------------------------

EXPECTED_TABLES = [
    "users", "projects", "scripts", "scenes", "storyboard_frames", "versions",
    "comments", "subscriptions", "project_members", "project_invites",
    "payments", "access_log", "craft_recommendations", "ai_usage",
    "script_patterns",
]


@_step("tables")
def tables_exist():
    """Check every table before touching any of them.

    A paste into the SQL editor that hits an error stops there, leaving a
    database that looks fine — the early tables exist — until the first request
    reaches a late one. `project_invites` sits at line 199 of the schema file,
    which is exactly the sort of place a half-finished run ends.

    The mock creates tables on demand, so this class of problem cannot happen
    locally and no test can catch it.
    """
    from database import supabase

    missing = []
    for name in EXPECTED_TABLES:
        try:
            supabase.table(name).select("*").limit(1).execute()
        except Exception as e:
            if "PGRST205" in str(e) or "Could not find the table" in str(e):
                missing.append(name)
            else:
                _note(f"{name}: {str(e)[:80]}")

    if missing:
        _bad(f"missing from Postgres: {', '.join(missing)}. Re-run the SQL that "
             f"creates them — a paste that errors part way stops there. "
             f"script_patterns lives in pgvector_script_patterns.sql, "
             f"everything else in supabase_schema.sql.")
        return False
    _ok(f"all {len(EXPECTED_TABLES)} tables exist")
    return True


# --- 1. the deploy gate -----------------------------------------------------

@_step("deploy checks")
def deploy_gate():
    """`deploy_checks` is the difference between a documented deploy setting and
    an enforced one. Read every complaint and fix the cause, never the check."""
    import deploy_checks

    errors, warnings = deploy_checks.collect()
    for w in warnings:
        _note(f"warning: {w}")
    for e in errors:
        _bad(f"deploy check: {e}")
    if not errors:
        _ok(f"no blocking complaints ({len(warnings)} warnings)")

    prod_errors, _ = deploy_checks.collect(env="production")
    if prod_errors:
        _note(f"{len(prod_errors)} of these would BLOCK a production boot — "
              f"fix before deploying: {prod_errors[0]}")


# --- 2. a row actually lands in Postgres ------------------------------------

@_step("register an account")
def register(client):
    email = f"smoke-{uuid.uuid4().hex[:10]}@example.com"
    r = client.post("/auth/register", json={
        "name": "Smoke Test", "email": email, "password": "Sm0ke!Test!2026",
    })
    if r.status_code != 200:
        _bad(f"register returned {r.status_code}: {r.text[:200]}")
        return None

    from database import supabase
    rows = supabase.table("users").select("*").eq("email", email).execute().data or []
    if len(rows) != 1:
        _bad(f"registered, but {len(rows)} rows came back from Postgres for that email")
        return None

    _ok(f"account row is in Postgres ({email})")

    # `/auth/register` returns a UserResponse, not a token — registering and
    # signing in are separate steps, which is what the frontend does too.
    signin = client.post("/auth/login", json={
        "email": email, "password": "Sm0ke!Test!2026",
    })
    if signin.status_code != 200:
        _bad(f"registered but could not log in: {signin.status_code} "
             f"{signin.text[:160]}")
        return None
    _ok("logged in with the account just created")

    return {"email": email, "id": rows[0]["id"],
            "headers": {"Authorization": f"Bearer {signin.json()['token']}"}}


# --- 3. a draft reconciles into scene rows ----------------------------------

DRAFT = """INT. CHIYA PASAL - MORNING

Steam rises. RAAJA sits by the window.

                      RAAJA
          Timro result aayo?

EXT. ROOFTOP - LATER

Raaja frames a shot with his hands.
"""


@_step("save a draft")
def draft(client, user):
    proj = client.post("/projects/", json={
        "title": "Postgres smoke", "genre": "Drama", "tone": "Emotional",
        "language": "Bilingual", "duration_minutes": 15, "target_audience": "Youth",
    }, headers=user["headers"])
    if proj.status_code != 200:
        _bad(f"create project returned {proj.status_code}: {proj.text[:200]}")
        return None
    project_id = proj.json()["id"]

    got = client.get(f"/scripts/project/{project_id}", headers=user["headers"])
    if got.status_code != 200:
        _bad(f"get-or-create script returned {got.status_code}: {got.text[:200]}")
        return None
    script_id = got.json()["id"]

    saved = client.put(f"/scripts/{script_id}", json={"content": DRAFT},
                       headers=user["headers"])
    if saved.status_code != 200:
        _bad(f"save returned {saved.status_code}: {saved.text[:200]}")
        return None

    from database import supabase
    scenes = (supabase.table("scenes").select("*")
              .eq("script_id", script_id).execute().data or [])
    if len(scenes) < 2:
        _bad(f"scene_sync wrote {len(scenes)} scene rows for a two-scene draft")
    else:
        _ok(f"scene_sync wrote {len(scenes)} scene rows")

    return {"project_id": project_id, "script_id": script_id}


# --- 4. the craft library -----------------------------------------------------

@_step("craft library")
def craft_library():
    import json

    from database import supabase
    import rag

    rows = supabase.table(rag.TABLE).select("*").execute().data or []
    expected = len(json.load(open("knowledge_base.json", encoding="utf-8")))

    if not rows:
        _bad("script_patterns is EMPTY. Run `python load_knowledge_base.py`, "
             "then restart the backend — the mock cached at startup and the "
             "real client will not.")
        return False
    if len(rows) != expected:
        _bad(f"script_patterns holds {len(rows)} rows; knowledge_base.json has "
             f"{expected}. Re-run the loader.")
        return False

    embedding = rows[0].get("embedding")
    if isinstance(embedding, str):
        _note("Postgres returns the vector column as a STRING, where the mock "
              "returns a list — rag._cosine parses it, and this is the single "
              "most likely place for a real-vs-mock difference to bite.")
        embedding = json.loads(embedding)
    if not embedding or len(embedding) != 384:
        _bad(f"stored embedding is {len(embedding) if embedding else 0}-dim, "
             f"expected 384")
        return False

    _ok(f"script_patterns holds {len(rows)} rows, embeddings are 384-dim")
    return True


@_step("retrieval")
def retrieval(client, user, script_id):
    """The Patterns tab, through the route the editor actually calls."""
    r = client.post("/scripts/recommendations", json={
        "scene_text": DRAFT, "script_id": script_id,
        "focus": "my dialogue is on the nose and says exactly what they feel",
    }, headers=user["headers"])
    if r.status_code != 200:
        _bad(f"recommendations returned {r.status_code}: {r.text[:200]}")
        return
    patterns = r.json().get("patterns") or []
    if not patterns:
        _bad("retrieval returned nothing against Postgres. It works against "
             "the mock, so this is a real-vs-mock difference — look at how the "
             "embedding column came back.")
        return
    _ok(f"retrieval returned {len(patterns)} patterns "
        f"(first: {patterns[0].get('technique', '?')[:48]})")


@_step("the pgvector RPC")
def rpc():
    """Optional: only meaningful once the corpus is past the threshold, but a
    missing function is worth knowing about before it matters."""
    from database import supabase
    import rag

    if not hasattr(supabase, "rpc"):
        _note("client exposes no rpc(); retrieval will always rank in Python")
        return
    try:
        supabase.rpc(rag.RPC_NAME, {
            "query_embedding": [0.0] * 384, "match_count": 1,
        }).execute()
        _ok(f"{rag.RPC_NAME} exists and answers")
    except Exception as e:
        _note(f"{rag.RPC_NAME} unavailable ({str(e)[:90]}). Retrieval falls "
              f"back to exact ranking in Python, which is correct but slower "
              f"past ~500 entries. Run pgvector_script_patterns.sql.")


# --- 5. clean up after ourselves ---------------------------------------------

def cleanup(client, user, made):
    if not user:
        return
    try:
        if made:
            client.delete(f"/projects/{made['project_id']}", headers=user["headers"])
        from database import supabase
        supabase.table("users").delete().eq("id", user["id"]).execute()
        _ok("removed the throwaway account and its project")
    except Exception as e:
        _note(f"could not fully clean up ({e}); remove {user['email']} by hand")


def main():
    print("\nFirst run against real Postgres\n" + "=" * 52)
    require_real_postgres()

    from fastapi.testclient import TestClient
    import main as app_module

    client = TestClient(app_module.app)
    user = made = None
    try:
        print("\ntables");        tables_exist()
        print("\ndeploy checks"); deploy_gate()
        print("\naccounts");      user = register(client)
        if user:
            print("\ndraft and scenes"); made = draft(client, user)
        print("\ncraft library");  loaded = craft_library()
        if user and made and loaded:
            print("\nretrieval");  retrieval(client, user, made["script_id"])
        print("\npgvector");       rpc()
    except Exception:
        traceback.print_exc()
        FAILURES.append("an unhandled exception — see the traceback above")
    finally:
        print("\ncleanup"); cleanup(client, user, made)

    print("\n" + "=" * 52)
    if FAILURES:
        print(f"{len(FAILURES)} FAILED:")
        for f in FAILURES:
            print(f"  - {f}")
        print("\nFix the cause rather than the check, and commit each fix with "
              "the real-vs-mock difference described in the message.")
        sys.exit(1)

    print("Everything passed against real Postgres.")
    if NOTES:
        print(f"\n{len(NOTES)} things worth reading:")
        for n in NOTES:
            print(f"  - {n}")
    print("\nNext: run the backend suite and record the number, then deploy.")


if __name__ == "__main__":
    main()
