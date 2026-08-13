from fastapi import APIRouter, HTTPException, Depends
import os

from database import supabase, get_scenes_by_script, get_frames_by_script, get_frame_script_id
from auth import get_current_user, require_script_access, require_tier
from updates import apply_whitelist
import storyboard_engine

# Only these frame fields may be changed from the client
FRAME_UPDATE_FIELDS = {"image_url", "shot_type", "camera_notes", "order_index"}

# Hard ceiling on frames per generation.
#
# This is a spend limit, not a design preference. Generation bills per image,
# and the loop previously ran once per scene with no upper bound — a 60-scene
# script was 60 billed images from one click, repeatable. A cap turns the worst
# case from "unbounded" into a number you can multiply by your image price.
MAX_FRAMES_PER_STORYBOARD = int(os.getenv("MAX_STORYBOARD_FRAMES", "24"))

router = APIRouter(prefix="/storyboard", tags=["storyboard"])


def require_frame_access(frame_id: str, user_id: str) -> str:
    """Resolve a frame to its script and confirm the caller owns it.

    Frames are only reachable through their script, so authorisation has to
    hop: frame -> script_id -> owner. Returns the script_id for the update.
    """
    script_id = get_frame_script_id(frame_id)
    if not script_id:
        raise HTTPException(status_code=404, detail="Frame not found")
    require_script_access(script_id, user_id)
    return script_id


@router.post("/generate/{script_id}")
def generate(script_id: str, user_id: str = Depends(get_current_user)):
    # Every frame is a paid image generation. This was previously open to any
    # authenticated user, which meant a free account could bill an unbounded
    # number of images — the same gap C1 closed for Word/package export.
    require_tier(user_id, "Storyboard generation")
    require_script_access(script_id, user_id)
    scenes = get_scenes_by_script(script_id)
    if not scenes:
        raise HTTPException(status_code=404, detail="No scenes found for this script")

    capped = scenes[:MAX_FRAMES_PER_STORYBOARD]
    frames = storyboard_engine.generate_storyboard(script_id, capped, supabase)
    return {
        "frames": frames,
        "scene_count": len(scenes),
        "frames_generated": len(frames),
        # Tell the caller when the board is partial rather than letting the UI
        # silently imply the whole script was covered.
        "truncated": len(scenes) > len(capped),
        "frame_limit": MAX_FRAMES_PER_STORYBOARD,
    }


@router.post("/regenerate/{frame_id}")
def regenerate(frame_id: str, description: str, shot_type: str, user_id: str = Depends(get_current_user)):
    require_tier(user_id, "Regenerating a storyboard frame")
    require_frame_access(frame_id, user_id)
    frame = storyboard_engine.regenerate_frame(frame_id, description, shot_type, supabase)
    return frame


@router.get("/{script_id}")
def get_frames(script_id: str, user_id: str = Depends(get_current_user)):
    require_script_access(script_id, user_id)
    return get_frames_by_script(script_id)


@router.put("/{frame_id}")
def update_frame(frame_id: str, updates: dict, user_id: str = Depends(get_current_user)):
    require_frame_access(frame_id, user_id)
    safe_updates = apply_whitelist(updates, FRAME_UPDATE_FIELDS)
    result = supabase.table("storyboard_frames").update(safe_updates).eq("id", frame_id).execute()
    return result.data[0]
