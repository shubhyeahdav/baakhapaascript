import hashlib
import os
from urllib.parse import quote

from openai import OpenAI
from dotenv import load_dotenv

import scene_sync

load_dotenv()

_api_key = os.getenv("OPENAI_API_KEY")
# Demo mode: no real key configured — use placeholder frame images instead of DALL-E
MOCK_AI = not _api_key or _api_key.startswith("your-")
openai_client = None if MOCK_AI else OpenAI(api_key=_api_key)

# Fallback image provider used only when there is no OpenAI key.
#   placeholder  (default) — flat coloured card, fully offline
#   pollinations           — real generated art, no API key, no signup
#
# Pollinations is opt-in rather than default because it sends the scene
# description to a third party. That is harmless for demo content and is a
# disclosure you owe real users, so it must be a deliberate choice.
STORYBOARD_PROVIDER = os.getenv("STORYBOARD_PROVIDER", "placeholder").lower()

if MOCK_AI:
    if STORYBOARD_PROVIDER == "pollinations":
        print("WARNING: No OPENAI_API_KEY. Storyboards use Pollinations "
              "(free, keyless, third-party — scene text leaves your machine).")
    else:
        print("WARNING: Running with Mock Storyboard AI (no OPENAI_API_KEY set).")


def _pollinations_url(prompt: str, width: int = 1280, height: int = 720) -> str:
    """Build a Pollinations image URL.

    The image is generated when the URL is first fetched, so this costs the
    backend nothing and adds no latency — the browser does the waiting.

    `seed` is derived from the prompt so a frame renders identically on every
    reload. Without it each page view produces different art and the storyboard
    stops being a stable reference for a shoot.
    """
    seed = int(hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:8], 16)
    return (
        f"https://image.pollinations.ai/prompt/{quote(prompt)}"
        f"?width={width}&height={height}&seed={seed}&nologo=true"
    )


def assign_shot_type(scene_type, scene_index, total_scenes, act_number):
    if scene_index == 0:
        return "Wide Shot"
    if scene_index == total_scenes - 1:
        return "Wide Shot"
    if act_number == 2 and scene_index == total_scenes - 1:
        return "Close Up"
    if scene_type == "major" and act_number == 2:
        return "Medium Close Up"
    if scene_type == "major":
        return "Medium Shot"
    return "Medium Wide Shot"


# --- camera notes ----------------------------------------------------------
#
# FR08 asks for a frame per scene "with shot type AND camera notes". The shot
# type was assigned; the note was written as "" on every frame ever generated,
# which is why the storyboard grid renders no note and the shot list had an
# empty Camera line.
#
# These are derived, not generated: a note is a function of the shot, where the
# scene sits in the sequence, and what the scene already knows about itself. So
# it costs no API call, works on every tier, and — like the craft linter — is
# the same on every run, which matters for a document a crew reloads on set.

_MOVEMENT = {
    "Wide Shot": "Locked off. Let the space read before anyone moves.",
    "Medium Wide Shot": "Slow drift with the action; keep both figures in frame.",
    "Medium Shot": "Static, eye level. Reframe on the turn rather than cutting.",
    "Medium Close Up": "Slow push in as the scene commits.",
    "Close Up": "Push in and hold. Cut out on the reaction, not the line.",
}

_LIGHT = {
    "DAWN": "Low sun, long shadows; expose for the sky.",
    "MORNING": "Soft directional daylight from frame left.",
    "DAY": "Available light; watch the window blowing out.",
    "DUSK": "Losing the light; shoot this first.",
    "NIGHT": "Practicals in shot; keep the fill low.",
}


def camera_note(shot_type: str, visual: dict, index: int, total: int) -> str:
    """A first-pass camera note a DP can argue with.

    Deliberately short and concrete. A note nobody can act on is worse than no
    note, because it still has to be read.
    """
    parts = [_MOVEMENT.get(shot_type, "Static, eye level.")]

    if index == 0:
        parts.append("Establishes the location.")
    elif index == total - 1 and total > 1:
        parts.append("Final beat: pull back to end on the space.")

    cast = [c for c in (visual.get("characters") or []) if c]
    if len(cast) == 1:
        parts.append(f"Favour {cast[0]}.")
    elif len(cast) >= 2:
        parts.append(f"Two-shot: {cast[0]} and {cast[1]}.")

    when = (visual.get("time_of_day") or "").strip().upper()
    if when in _LIGHT:
        parts.append(_LIGHT[when])

    beat = (visual.get("emotional_beat") or "").strip()
    if beat:
        parts.append(f"Play the {beat}.")

    return " ".join(parts)


# Image generation sends the scene description to a third party (OpenAI, or
# Pollinations if that is switched on). Since scene rows started tracking the
# written draft, that description is the writer's own action lines rather than a
# generated beat summary — a better picture, but measurably more of the user's
# unpublished work leaving the building.
#
# Setting this to false draws frames from the structure beat instead, so nothing
# the writer typed is transmitted for image generation. The board is more
# generic; the script stays in.
STORYBOARD_USES_DRAFT_TEXT = os.getenv("STORYBOARD_USES_DRAFT_TEXT", "true").lower() != "false"


def scene_visual(scene: dict) -> dict:
    """What to draw for a scene: the written page if there is one, the planned
    beat if there is not.

    A scene that has been written is the authority on its own image. The beat
    description was a plan, and the plan is routinely not what ends up on the
    page — illustrating it produces a board that does not match the script.
    """
    draft = scene_sync.read_draft(scene)
    summary = (draft.get("summary") or "").strip() if STORYBOARD_USES_DRAFT_TEXT else ""
    return {
        "description": summary or scene.get("description") or scene.get("title") or "",
        # `location` is written by sync from the slugline and by add-scene from
        # the structure, so it is populated either way; the heading is the last
        # resort for a row that predates both.
        "location": scene.get("location") or draft.get("heading") or "",
        "time_of_day": draft.get("time_of_day") or "",
        # Who is actually on the page beats who was planned to be.
        "characters": draft.get("characters") or scene_sync.read_characters(scene),
        "emotional_beat": scene.get("emotional_beat") or "",
        "from_draft": bool(summary),
    }


def generate_frame(scene_description, shot_type, genre, location="", emotional_beat="",
                   time_of_day="", characters=()):
    # Time of day is a lighting instruction and the cast is a blocking one. Both
    # were being dropped: the structure generator produces them, and until now
    # nothing carried them this far.
    who = f"{', '.join(characters)} in frame. " if characters else ""
    when = f"{time_of_day} light. " if time_of_day else ""
    prompt = (
        f"{shot_type} cinematic storyboard frame. {location}. {scene_description}. "
        f"{who}{when}{emotional_beat} mood. {genre} film aesthetic. "
        f"Professional cinematography. Dramatic lighting. No text or subtitles in image."
    )

    if MOCK_AI:
        if STORYBOARD_PROVIDER == "pollinations":
            return _pollinations_url(prompt)
        label = shot_type.replace(" ", "+")
        # `/png` matters: without an explicit format placehold.co serves SVG,
        # which ReportLab cannot embed — so every demo-mode production
        # package printed "frame image not embedded" on every frame.
        return f"https://placehold.co/1792x1024/141A29/6366F1/png?text={label}+%28demo%29"

    try:
        response = openai_client.images.generate(
            model="dall-e-3", prompt=prompt, size="1792x1024", quality="standard", n=1,
        )
        return response.data[0].url
    except Exception as e:
        print(f"DALL-E generation error: {e}")
        return None


def generate_storyboard(script_id, scenes, supabase_client, genre="drama"):
    frames = []
    total = len(scenes)
    for idx, scene in enumerate(scenes):
        visual = scene_visual(scene)
        shot_type = assign_shot_type(
            scene.get("scene_type") or "minor", idx, total, scene.get("act_number") or 1
        )
        image_url = generate_frame(
            visual["description"], shot_type, genre,
            visual["location"], visual["emotional_beat"],
            visual["time_of_day"], visual["characters"],
        )
        frame_result = supabase_client.table("storyboard_frames").insert({
            "scene_id": scene["id"], "image_url": image_url,
            "shot_type": shot_type,
            "camera_notes": camera_note(shot_type, visual, idx, total),
            "order_index": idx,
        }).execute()
        frames.append(frame_result.data[0])
    return frames


def regenerate_frame(frame_id, new_description, new_shot_type, supabase_client,
                     visual=None, previous_note="", previous_shot=""):
    """Redraw a frame, keeping everything the scene knows about itself.

    Regeneration used to throw away the location, cast, time of day and mood the
    first pass had, so asking for a different shot type quietly produced a worse
    image than the one it replaced.
    """
    visual = visual or {}
    image_url = generate_frame(
        new_description, new_shot_type, visual.get("genre") or "drama",
        visual.get("location", ""), visual.get("emotional_beat", ""),
        visual.get("time_of_day", ""), visual.get("characters", ()),
    )

    updates = {"image_url": image_url, "shot_type": new_shot_type}

    # A stale note is bad; deleting someone's own note is worse. Refresh it only
    # while it is still the note this module wrote — the moment a user edits it,
    # it is theirs and regeneration leaves it alone.
    auto_before = camera_note(previous_shot or new_shot_type, visual, 0, 1)
    if not (previous_note or "").strip() or previous_note.strip() == auto_before:
        updates["camera_notes"] = camera_note(new_shot_type, visual, 0, 1)

    result = supabase_client.table("storyboard_frames").update(updates).eq("id", frame_id).execute()
    return result.data[0]
