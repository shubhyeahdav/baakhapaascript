from fastapi import APIRouter, HTTPException, Depends
from models import ProjectCreate
from database import supabase, get_project_by_id
from auth import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("/")
def create_project(project: ProjectCreate, user_id: str = Depends(get_current_user)):
    result = supabase.table("projects").insert({
        "user_id": user_id,
        "title": project.title,
        "genre": project.genre,
        "tone": project.tone,
        "language": project.language,
        "duration_minutes": project.duration_minutes,
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
    project = get_project_by_id(project_id)
    if not project or project["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}")
def update_project(project_id: str, updates: dict, user_id: str = Depends(get_current_user)):
    project = get_project_by_id(project_id)
    if not project or project["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Project not found")
    result = supabase.table("projects").update(updates).eq("id", project_id).execute()
    return result.data[0]


@router.delete("/{project_id}")
def delete_project(project_id: str, user_id: str = Depends(get_current_user)):
    project = get_project_by_id(project_id)
    if not project or project["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Project not found")
    supabase.table("projects").delete().eq("id", project_id).execute()
    return {"success": True}
