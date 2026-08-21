from fastapi import APIRouter, HTTPException, Depends
import os

from database import (
    supabase, get_frames_by_script, get_frame_script_id, get_project_by_id,
    get_scenes_by_script,
)
import membership
from auth import get_current_user, require_script_access, require_tier
from updates import apply_whitelist
import scene_sync
import storyboard_engine

# Only these frame fields may be changed from the client.
#
# `image_url` is deliberately NOT here. The server is the only thing that should
# ever write it (from DALL-E, or the demo placeholder), and the production-package
# export fetches that URL server-side to embed the frame. A client-writable URL
# plus a server-side fetch is a server-side request forgery: an editor could point
# a frame at http://169.254.169.254/ (cloud metadata), or at a service reachable
# only from inside the network, and make the export request it on their behalf.
# Nothing in the UI ever set this field, so removing it costs nothing.
FRAME_UPDATE_FIELDS = {"shot_type", "camera_notes", "order_index"}

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
    script = require_script_access(script_id, user_id)

    # Reconcile the scene rows with the draft BEFORE spending anything. Without
    # this, a board generated after a rewrite illustrates the beat description
    # the scene started life as, and a hand-typed screenplay has no rows to
    # generate from at all — which is how "Finalize & Storyboard" used to lead
    # to a page whose only button returned 404.
    scenes = scene_sync.sync_from_draft(script_id, script.get("content") or "")
    if not scenes:
        raise HTTPException(
            status_code=404,
            detail="Nothing to storyboard yet. Write a scene heading (INT./EXT.) "
                   "in the script, or add a scene from the structure panel.",
        )

    project = get_project_by_id(script.get("project_id")) or {}

    capped = scenes[:MAX_FRAMES_PER_STORYBOARD]
    frames = storyboard_engine.generate_storyboard(
        script_id, capped, supabase, genre=project.get("genre") or "drama"
    )
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
def regenerate(frame_id: str, description: str = "", shot_type: str = "",
               user_id: str = Depends(get_current_user)):
    """Redraw one frame (FR09).

    Both arguments are optional now. Asking the caller to supply the scene
    description made the board re-send text it had to look up first, and a UI
    that guesses wrong redraws the wrong scene. The scene rows already track
    the draft, so the description comes from there unless the caller overrides
    it; the shot type falls back to whatever the frame already carries.
    """
    require_tier(user_id, "Regenerating a storyboard frame")
    script_id = require_frame_access(frame_id, user_id)

    existing = supabase.table("storyboard_frames").select("*").eq("id", frame_id).execute()
    frame = existing.data[0] if existing.data else {}
    scene = next(
        (s for s in get_scenes_by_script(script_id) if s["id"] == frame.get("scene_id")), {}
    )
    visual = storyboard_engine.scene_visual(scene)

    shot = shot_type or frame.get("shot_type") or "Medium Shot"
    project = get_project_by_id(
        (supabase.table("scripts").select("*").eq("id", script_id).execute().data or [{}])[0]
        .get("project_id")
    ) or {}
    visual["genre"] = project.get("genre") or "drama"

    return storyboard_engine.regenerate_frame(
        frame_id, description or visual["description"], shot, supabase,
        visual=visual,
        previous_note=frame.get("camera_notes") or "",
        previous_shot=frame.get("shot_type") or "",
    )


# Shot types the board offers as an override (FR09). A fixed vocabulary rather
# than free text, because the shot list and the image prompt both read it.
SHOT_TYPES = [
    "Wide Shot", "Medium Wide Shot", "Medium Shot",
    "Medium Close Up", "Close Up", "Extreme Close Up",
    "Over The Shoulder", "Point Of View", "Insert",
]


@router.get("/shot-types")
def shot_types():
    return {"shot_types": SHOT_TYPES}


@router.get("/{script_id}")
def get_frames(script_id: str, user_id: str = Depends(get_current_user)):
    """Frames, each carrying the scene it illustrates.

    The raw rows know only a `scene_id`, so a board could show "Frame 3 — Close
    Up" and nothing about which scene that is. Reordering or regenerating a
    frame you cannot identify is guesswork, and a board a crew cannot match to
    the script is not a pre-viz document.
    """
    require_script_access(script_id, user_id, minimum=membership.VIEWER)
    scenes = {s["id"]: s for s in get_scenes_by_script(script_id)}

    frames = []
    for frame in get_frames_by_script(script_id):
        scene = scenes.get(frame.get("scene_id")) or {}
        draft = scene_sync.read_draft(scene)
        frames.append({
            **frame,
            "scene": {
                "id": scene.get("id"),
                "title": scene.get("title"),
                "slugline": draft.get("heading") or "",
                "location": scene.get("location") or "",
                "time_of_day": draft.get("time_of_day") or "",
                "act_number": scene.get("act_number"),
                "characters": draft.get("characters") or scene_sync.read_characters(scene),
                # What a regenerate should be seeded with: the page if it is
                # written, the planned beat if it is not.
                "description": (draft.get("summary") or scene.get("description") or "").strip(),
            },
        })
    return sorted(frames, key=lambda f: f.get("order_index") or 0)


@router.put("/{frame_id}")
def update_frame(frame_id: str, updates: dict, user_id: str = Depends(get_current_user)):
    require_frame_access(frame_id, user_id)
    safe_updates = apply_whitelist(updates, FRAME_UPDATE_FIELDS)
    result = supabase.table("storyboard_frames").update(safe_updates).eq("id", frame_id).execute()
    return result.data[0]
