from fastapi import APIRouter, HTTPException, Depends
from models import (
    GenerateStructureRequest, GenerateSceneRequest,
    ImproveSceneRequest, SuggestRequest, ScriptSave,
)
from database import supabase, get_script_by_id
from auth import get_current_user
import script_engine

router = APIRouter(prefix="/scripts", tags=["scripts"])


@router.post("/generate-structure")
def generate_structure(req: GenerateStructureRequest, project_id: str, user_id: str = Depends(get_current_user)):
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

    for act in structure["acts"]:
        for idx, scene in enumerate(act["scenes"]):
            supabase.table("scenes").insert({
                "script_id": script_id,
                "act_number": act["act_number"],
                "scene_type": scene["scene_type"],
                "title": scene["title"],
                "description": scene["description"],
                "time_allocation": scene["time_allocation"],
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


@router.get("/{script_id}")
def get_script(script_id: str, user_id: str = Depends(get_current_user)):
    script = get_script_by_id(script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    from database import get_scenes_by_script
    scenes = get_scenes_by_script(script_id)
    return {**script, "scenes": scenes}


@router.put("/{script_id}")
def save_script(script_id: str, data: ScriptSave, user_id: str = Depends(get_current_user)):
    script = get_script_by_id(script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    supabase.table("versions").insert({
        "script_id": script_id, "user_id": user_id,
        "content": script["content"], "label": "Auto save",
    }).execute()

    result = supabase.table("scripts").update({"content": data.content}).eq("id", script_id).execute()
    return result.data[0]


@router.post("/{script_id}/finalize")
def finalize_script(script_id: str, user_id: str = Depends(get_current_user)):
    result = supabase.table("scripts").update({"status": "finalized"}).eq("id", script_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Script not found")
    return result.data[0]
