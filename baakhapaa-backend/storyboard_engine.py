import hashlib
import os
from urllib.parse import quote

from openai import OpenAI
from dotenv import load_dotenv

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


def generate_frame(scene_description, shot_type, genre, location="", emotional_beat=""):
    prompt = (
        f"{shot_type} cinematic storyboard frame. {location}. {scene_description}. "
        f"{emotional_beat} mood. {genre} film aesthetic. Professional cinematography. "
        f"Dramatic lighting. No text or subtitles in image."
    )

    if MOCK_AI:
        if STORYBOARD_PROVIDER == "pollinations":
            return _pollinations_url(prompt)
        label = shot_type.replace(" ", "+")
        return f"https://placehold.co/1792x1024/141A29/6366F1?text={label}+%28demo%29"

    try:
        response = openai_client.images.generate(
            model="dall-e-3", prompt=prompt, size="1792x1024", quality="standard", n=1,
        )
        return response.data[0].url
    except Exception as e:
        print(f"DALL-E generation error: {e}")
        return None


def generate_storyboard(script_id, scenes, supabase_client):
    frames = []
    total = len(scenes)
    for idx, scene in enumerate(scenes):
        shot_type = assign_shot_type(scene["scene_type"], idx, total, scene["act_number"])
        image_url = generate_frame(
            scene["description"], shot_type, "drama",
            scene.get("location", ""), scene.get("emotional_beat", ""),
        )
        frame_result = supabase_client.table("storyboard_frames").insert({
            "scene_id": scene["id"], "image_url": image_url,
            "shot_type": shot_type, "camera_notes": "", "order_index": idx,
        }).execute()
        frames.append(frame_result.data[0])
    return frames


def regenerate_frame(frame_id, new_description, new_shot_type, supabase_client):
    image_url = generate_frame(new_description, new_shot_type, "drama")
    result = supabase_client.table("storyboard_frames").update({
        "image_url": image_url, "shot_type": new_shot_type,
    }).eq("id", frame_id).execute()
    return result.data[0]
