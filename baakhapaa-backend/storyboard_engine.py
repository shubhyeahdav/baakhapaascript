import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


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
