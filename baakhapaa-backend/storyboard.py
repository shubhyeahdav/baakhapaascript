from fastapi import APIRouter, HTTPException, Depends
from database import supabase, get_scenes_by_script, get_frames_by_script
from auth import get_current_user
import storyboard_engine

router = APIRouter(prefix="/storyboard", tags=["storyboard"])


@router.post("/generate/{script_id}")
def generate(script_id: str, user_id: str = Depends(get_current_user)):
    scenes = get_scenes_by_script(script_id)
    if not scenes:
        raise HTTPException(status_code=404, detail="No scenes found for this script")
    frames = storyboard_engine.generate_storyboard(script_id, scenes, supabase)
    return {"frames": frames}


@router.post("/regenerate/{frame_id}")
def regenerate(frame_id: str, description: str, shot_type: str, user_id: str = Depends(get_current_user)):
    frame = storyboard_engine.regenerate_frame(frame_id, description, shot_type, supabase)
    return frame


@router.get("/{script_id}")
def get_frames(script_id: str, user_id: str = Depends(get_current_user)):
    return get_frames_by_script(script_id)


@router.put("/{frame_id}")
def update_frame(frame_id: str, updates: dict, user_id: str = Depends(get_current_user)):
    result = supabase.table("storyboard_frames").update(updates).eq("id", frame_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Frame not found")
    return result.data[0]
