from fastapi import APIRouter, HTTPException, Depends
from models import (
    GenerateStructureRequest, GenerateSceneRequest,
    ImproveSceneRequest, SuggestRequest, ScriptSave,
)
from database import supabase, get_project_by_id
from auth import get_current_user, require_script_access
import script_engine

router = APIRouter(prefix="/scripts", tags=["scripts"])


@router.post("/generate-structure")
def generate_structure(req: GenerateStructureRequest, project_id: str, user_id: str = Depends(get_current_user)):
    project = get_project_by_id(project_id)
    if not project or project["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        structure = script_engine.generate_structure(
            req.genre, req.tone, req.duration_minutes, req.language, req.target_audience
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    script_result = supabase.table("scripts").insert({
        "project_id": project_id, "content": "", "status": "draft",
    }).execute()
    script_id = script_result.data[0]["id"]

    # AI output may omit keys — use defaults so one malformed scene can't 500 the request
    for act in structure.get("acts", []):
        for idx, scene in enumerate(act.get("scenes", [])):
            supabase.table("scenes").insert({
                "script_id": script_id,
                "act_number": act.get("act_number", 1),
                "scene_type": scene.get("scene_type", "minor"),
                "title": scene.get("title", "Untitled scene"),
                "description": scene.get("description", ""),
                "time_allocation": scene.get("time_allocation", 0),
                "order_index": idx,
            }).execute()

    return {"script_id": script_id, "structure": structure}


@router.post("/generate-scene")
def generate_scene(req: GenerateSceneRequest, user_id: str = Depends(get_current_user)):
    try:
        text = script_engine.generate_scene(
            req.scene_description, req.genre, req.tone, req.language, req.character_names
        )
        return {"scene_text": text}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/improve")
def improve(req: ImproveSceneRequest, user_id: str = Depends(get_current_user)):
    try:
        text = script_engine.improve_scene(req.scene_text, req.instruction, req.language)
        return {"improved_text": text}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/suggest")
def suggest(req: SuggestRequest, user_id: str = Depends(get_current_user)):
    try:
        suggestions = script_engine.suggest_continuations(req.scene_text, req.genre, req.tone)
        return {"suggestions": suggestions}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/project/{project_id}")
def get_script_for_project(project_id: str, user_id: str = Depends(get_current_user)):
    """Return the project's script, creating an empty one if none exists yet
    (lets the dashboard open any project directly in the editor)."""
    from database import get_project_by_id
    project = get_project_by_id(project_id)
    if not project or project["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Project not found")

    existing = supabase.table("scripts").select("*").eq("project_id", project_id).execute()
    if existing.data:
        return existing.data[0]

    created = supabase.table("scripts").insert({
        "project_id": project_id, "content": "", "status": "draft",
    }).execute()
    return created.data[0]


@router.get("/{script_id}")
def get_script(script_id: str, user_id: str = Depends(get_current_user)):
    script = require_script_access(script_id, user_id)
    from database import get_scenes_by_script
    scenes = get_scenes_by_script(script_id)
    return {**script, "scenes": scenes}


@router.put("/{script_id}")
def save_script(script_id: str, data: ScriptSave, user_id: str = Depends(get_current_user)):
    script = require_script_access(script_id, user_id)

    supabase.table("versions").insert({
        "script_id": script_id, "user_id": user_id,
        "content": script["content"], "label": "Auto save",
    }).execute()

    result = supabase.table("scripts").update({"content": data.content}).eq("id", script_id).execute()
    return result.data[0]


@router.post("/{script_id}/finalize")
def finalize_script(script_id: str, user_id: str = Depends(get_current_user)):
    require_script_access(script_id, user_id)
    result = supabase.table("scripts").update({"status": "finalized"}).eq("id", script_id).execute()
    return result.data[0]
