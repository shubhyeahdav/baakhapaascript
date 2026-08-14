from fastapi import APIRouter, HTTPException, Depends
from models import ProjectCreate
from database import supabase
from auth import get_current_user, is_paid_tier, require_project_access
from updates import apply_whitelist

router = APIRouter(prefix="/projects", tags=["projects"])

# Free plan allowance, matching the pricing page ("1 active project").
FREE_PROJECT_LIMIT = 1


def enforce_project_limit(user_id: str):
    """Block a free user from creating more than FREE_PROJECT_LIMIT projects.
    402 rather than 403: the request is well-formed and the fix is to upgrade."""
    if is_paid_tier(user_id):
        return
    existing = supabase.table("projects").select("*").eq("user_id", user_id).execute()
    if len(existing.data or []) >= FREE_PROJECT_LIMIT:
        raise HTTPException(
            status_code=402,
            detail=(
                f"The free plan includes {FREE_PROJECT_LIMIT} active project. "
                "Upgrade at /pricing to create more."
            ),
        )


@router.post("/")
def create_project(project: ProjectCreate, user_id: str = Depends(get_current_user)):
    enforce_project_limit(user_id)
    result = supabase.table("projects").insert({
        "user_id": user_id,
        "title": project.title,
        "genre": project.genre,
        "tone": project.tone,
        "language": project.language,
        "duration_minutes": project.duration_minutes,
        # Previously dropped on the floor: both were accepted by the request
        # model and whitelisted for update, but never written on create.
        "target_audience": project.target_audience,
        "format": project.format,
        "episode_count": project.episode_count,
        "duration_seconds": project.duration_seconds,
        "hook_type": project.hook_type,
        "short_form_category": project.short_form_category,
        "status": "draft",
    }).execute()
    return result.data[0]


@router.get("/")
def list_projects(user_id: str = Depends(get_current_user)):
    result = (
        supabase.table("projects")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/{project_id}")
def get_project(project_id: str, user_id: str = Depends(get_current_user)):
    return require_project_access(project_id, user_id)


# Only these project fields may be changed from the client (never id/user_id)
PROJECT_UPDATE_FIELDS = {
    "title", "genre", "tone", "language", "duration_minutes", "status",
    "target_audience", "format", "episode_count",
    "duration_seconds", "hook_type", "short_form_category",
}


@router.put("/{project_id}")
def update_project(project_id: str, updates: dict, user_id: str = Depends(get_current_user)):
    require_project_access(project_id, user_id)
    safe_updates = apply_whitelist(updates, PROJECT_UPDATE_FIELDS)
    result = supabase.table("projects").update(safe_updates).eq("id", project_id).execute()
    return result.data[0]


@router.delete("/{project_id}")
def delete_project(project_id: str, user_id: str = Depends(get_current_user)):
    require_project_access(project_id, user_id)
    supabase.table("projects").delete().eq("id", project_id).execute()
    return {"success": True}
