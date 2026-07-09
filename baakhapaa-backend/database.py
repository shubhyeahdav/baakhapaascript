import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Check if we should use a mock database client
use_mock = not SUPABASE_URL or "your-supabase" in SUPABASE_URL or not SUPABASE_URL.startswith("http")

if use_mock:
    import uuid
    import datetime
    import sqlite3
    import json
    import threading

    LOCAL_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "baakhapaa_local.db")

    class LocalStore:
        """SQLite-backed persistence for local testing: each record is stored
        as a JSON blob keyed by (table, id), so data survives restarts."""

        def __init__(self, path):
            self.conn = sqlite3.connect(path, check_same_thread=False)
            self.lock = threading.Lock()
            self.conn.execute(
                "CREATE TABLE IF NOT EXISTS records (tbl TEXT, id TEXT, data TEXT, PRIMARY KEY (tbl, id))"
            )
            self.conn.commit()

        def load_all(self):
            store = {}
            for tbl, data in self.conn.execute("SELECT tbl, data FROM records"):
                store.setdefault(tbl, []).append(json.loads(data))
            return store

        def save_table(self, tbl, records):
            with self.lock:
                self.conn.execute("DELETE FROM records WHERE tbl = ?", (tbl,))
                self.conn.executemany(
                    "INSERT INTO records VALUES (?, ?, ?)",
                    [(tbl, str(r.get("id", "")), json.dumps(r)) for r in records],
                )
                self.conn.commit()

    class MockResponse:
        def __init__(self, data):
            self.data = data

    class MockQueryBuilder:
        def __init__(self, table_name, data_store, local_store=None):
            self.table_name = table_name
            self.data_store = data_store
            self.local_store = local_store
            self.records = data_store.setdefault(table_name, [])
            self.filtered_records = list(self.records)
            self.order_specs = []

        def _persist(self):
            if self.local_store:
                self.local_store.save_table(self.table_name, self.records)

        def select(self, *args, **kwargs):
            return self

        def eq(self, field, value):
            self.filtered_records = [r for r in self.filtered_records if r.get(field) == value]
            return self

        def in_(self, field, values):
            self.filtered_records = [r for r in self.filtered_records if r.get(field) in values]
            return self

        def order(self, field, desc=False):
            # Accumulate ordering keys and apply them together at execute() time.
            # Real Supabase treats chained .order() calls as a compound sort
            # (first call = primary key); applying each immediately here would let
            # the last call override the first, scrambling multi-key ordering
            # (e.g. scenes sorted by order_index only, ignoring act_number).
            self.order_specs.append((field, desc))
            return self

        def insert(self, data):
            new_data = dict(data)
            if "id" not in new_data:
                new_data["id"] = str(uuid.uuid4())
            if "created_at" not in new_data:
                new_data["created_at"] = datetime.datetime.now().isoformat()
            self.records.append(new_data)
            self.filtered_records = [new_data]
            self._persist()
            return self

        def update(self, updates):
            for r in self.filtered_records:
                r.update(updates)
            # Find in main records and update them too
            for r in self.records:
                if r.get("id") in [fr.get("id") for fr in self.filtered_records if fr.get("id")]:
                    r.update(updates)
            self._persist()
            return self

        def delete(self):
            ids_to_delete = {r["id"] for r in self.filtered_records if "id" in r}
            self.records[:] = [r for r in self.records if r.get("id") not in ids_to_delete]
            self.data_store[self.table_name] = self.records
            self._persist()
            return self

        def execute(self):
            records = self.filtered_records
            # Apply accumulated ordering as a stable compound sort. Sort from the
            # least-significant key to the most-significant (first .order() wins),
            # so Python's stable sort yields the intended multi-key ordering.
            for field, desc in reversed(self.order_specs):
                records = sorted(
                    records,
                    key=lambda r, f=field: (r.get(f) is not None, r.get(f)),
                    reverse=desc,
                )
            return MockResponse(records)

    class MockSupabaseClient:
        def __init__(self):
            self.local_store = LocalStore(LOCAL_DB_PATH)
            self.data_store = self.local_store.load_all()
            # Seed the demo test user only on a fresh database
            # email: test@example.com / password: password
            if not self.data_store.get("users"):
                self.data_store["users"] = [
                    {
                        "id": "test-user-id",
                        "email": "test@example.com",
                        "name": "Test User",
                        "password_hash": "$2b$12$zUjPcSMtMoocoiMm2q5cq.bW2lzJZI0f0..KjMaOc523W5uQgUTVO",  # bcrypt hash of 'password'
                        "role": "editor",
                        "subscription_tier": "pro",
                        "created_at": datetime.datetime.now().isoformat()
                    }
                ]
                self.local_store.save_table("users", self.data_store["users"])

        def table(self, name):
            return MockQueryBuilder(name, self.data_store, self.local_store)

    supabase = MockSupabaseClient()
    print(f"WARNING: Running with local SQLite database at {LOCAL_DB_PATH} (no Supabase keys set). Data persists across restarts.")
else:
    from supabase import create_client, Client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_user_by_email(email: str):
    result = supabase.table("users").select("*").eq("email", email).execute()
    return result.data[0] if result.data else None


def get_user_by_id(user_id: str):
    result = supabase.table("users").select("*").eq("id", user_id).execute()
    return result.data[0] if result.data else None


def get_project_by_id(project_id: str):
    result = supabase.table("projects").select("*").eq("id", project_id).execute()
    return result.data[0] if result.data else None


def get_script_by_id(script_id: str):
    result = supabase.table("scripts").select("*").eq("id", script_id).execute()
    return result.data[0] if result.data else None


def get_scenes_by_script(script_id: str):
    result = (
        supabase.table("scenes")
        .select("*")
        .eq("script_id", script_id)
        .order("act_number")
        .order("order_index")
        .execute()
    )
    return result.data


def get_frames_by_script(script_id: str):
    scenes = get_scenes_by_script(script_id)
    scene_ids = [s["id"] for s in scenes]
    if not scene_ids:
        return []
    result = supabase.table("storyboard_frames").select("*").in_("scene_id", scene_ids).execute()
    return result.data


def get_versions_by_script(script_id: str):
    result = (
        supabase.table("versions")
        .select("*")
        .eq("script_id", script_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


def get_script_owner(script_id: str):
    """Return (owner_user_id, script) for a script, or (None, None) if missing."""
    script = get_script_by_id(script_id)
    if not script:
        return None, None
    project = get_project_by_id(script.get("project_id"))
    return (project.get("user_id") if project else None), script


def get_frame_script_id(frame_id: str):
    """Resolve a storyboard frame to its script id (or None)."""
    frame = supabase.table("storyboard_frames").select("*").eq("id", frame_id).execute()
    if not frame.data:
        return None
    scene = supabase.table("scenes").select("*").eq("id", frame.data[0]["scene_id"]).execute()
    return scene.data[0]["script_id"] if scene.data else None


def check_user_subscription(user_id: str) -> str:
    user = get_user_by_id(user_id)
    return user.get("subscription_tier", "free") if user else "free"
