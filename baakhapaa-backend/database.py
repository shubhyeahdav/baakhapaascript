import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

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


def check_user_subscription(user_id: str) -> str:
    user = get_user_by_id(user_id)
    return user.get("subscription_tier", "free") if user else "free"
