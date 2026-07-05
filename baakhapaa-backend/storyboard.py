from fastapi import APIRouter, HTTPException, Depends
from database import supabase, get_scenes_by_script, get_frames_by_script, get_frame_script_id
from auth import get_current_user, require_script_access
import storyboard_engine

# Only these frame fields may be changed from the client
FRAME_UPDATE_FIELDS = {"image_url", "shot_type", "camera_notes", "order_index"}

router = APIRouter(prefix="/storyboard", tags=["storyboard"])


@router.post("/generate/{script_id}")
def generate(script_id: str, user_id: str = Depends(get_current_user)):
    require_script_access(script_id, user_id)
    scenes = get_scenes_by_script(script_id)
    if not scenes:
        raise HTTPException(status_code=404, detail="No scenes found for this script")
    frames = storyboard_engine.generate_storyboard(script_id, scenes, supabase)
    return {"frames": frames}


@router.post("/regenerate/{frame_id}")
def regenerate(frame_id: str, description: str, shot_type: str, user_id: str = Depends(get_current_user)):
    script_id = get_frame_script_id(frame_id)
    if not script_id:
        raise HTTPException(status_code=404, detail="Frame not found")
    require_script_access(script_id, user_id)
    frame = storyboard_engine.regenerate_frame(frame_id, description, shot_type, supabase)
    return frame


@router.get("/{script_id}")
def get_frames(script_id: str, user_id: str = Depends(get_current_user)):
    require_script_access(script_id, user_id)
    return get_frames_by_script(script_id)


@router.put("/{frame_id}")
def update_frame(frame_id: str, updates: dict, user_id: str = Depends(get_current_user)):
    script_id = get_frame_script_id(frame_id)
    if not script_id:
        raise HTTPException(status_code=404, detail="Frame not found")
    require_script_access(script_id, user_id)
    safe_updates = {k: v for k, v in updates.items() if k in FRAME_UPDATE_FIELDS}
    if not safe_updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    result = supabase.table("storyboard_frames").update(safe_updates).eq("id", frame_id).execute()
    return result.data[0]
