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

    class MockResponse:
        def __init__(self, data):
            self.data = data

    class MockQueryBuilder:
        def __init__(self, table_name, data_store):
            self.table_name = table_name
            self.data_store = data_store
            self.records = data_store.setdefault(table_name, [])
            self.filtered_records = list(self.records)

        def select(self, *args, **kwargs):
            return self

        def eq(self, field, value):
            self.filtered_records = [r for r in self.filtered_records if r.get(field) == value]
            return self

        def in_(self, field, values):
            self.filtered_records = [r for r in self.filtered_records if r.get(field) in values]
            return self

        def order(self, field, desc=False):
            # Sort helper that handles potentially missing values
            def get_sort_key(r):
                val = r.get(field)
                return (val is not None, val)
            self.filtered_records.sort(key=get_sort_key, reverse=desc)
            return self

        def insert(self, data):
            new_data = dict(data)
            if "id" not in new_data:
                new_data["id"] = str(uuid.uuid4())
            if "created_at" not in new_data:
                new_data["created_at"] = datetime.datetime.now().isoformat()
            self.records.append(new_data)
            self.filtered_records = [new_data]
            return self

        def update(self, updates):
            for r in self.filtered_records:
                r.update(updates)
            # Find in main records and update them too
            for r in self.records:
                if r.get("id") in [fr.get("id") for fr in self.filtered_records if fr.get("id")]:
                    r.update(updates)
            return self

        def delete(self):
            ids_to_delete = {r["id"] for r in self.filtered_records if "id" in r}
            self.records[:] = [r for r in self.records if r.get("id") not in ids_to_delete]
            self.data_store[self.table_name] = self.records
            return self

        def execute(self):
            return MockResponse(self.filtered_records)

    class MockSupabaseClient:
        def __init__(self):
            self.data_store = {}
            # Prepopulate a test user
            # email: test@example.com
            # password: password
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

        def table(self, name):
            return MockQueryBuilder(name, self.data_store)

    supabase = MockSupabaseClient()
    print("WARNING: Running with Mock Supabase Database Client.")
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
