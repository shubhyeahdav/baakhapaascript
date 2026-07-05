import os
import json
import anthropic
from dotenv import load_dotenv

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL = "claude-sonnet-5"

BAAKHAPAA_STYLE = """You are writing for Baakhapaa, a Nepali storytelling platform for young audiences.
Style: emotional, authentic, youth focused.
Characters: relatable young Nepali adults aged 18 to 30 facing real decisions.
Dialogue: conversational, natural Nepali and English mix as spoken in urban Kathmandu.
Themes: personal growth, relationships, family expectations, ambition, modern Nepal.
Avoid: melodrama, cliche resolutions, overly formal language.
For bilingual output: dialogue in Nepali (Devanagari script), action lines in English."""


def _call_claude(system_prompt: str, user_prompt: str, max_tokens: int = 3000) -> str:
    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return message.content[0].text
    except Exception as e:
        raise RuntimeError(f"Claude API error: {str(e)}")


def generate_structure(genre, tone, duration_minutes, language, target_audience):
    act1 = round(duration_minutes * 0.33, 1)
    act2 = round(duration_minutes * 0.33, 1)
    act3 = round(duration_minutes - act1 - act2, 1)

    prompt = f"""Create a three act screenplay structure.
Genre: {genre}
Tone: {tone}
Total duration: {duration_minutes} minutes
Target audience: {target_audience}
Language: {language}

Act 1 (Setup): {act1} minutes
Act 2 (Confrontation): {act2} minutes
Act 3 (Resolution): {act3} minutes

For each act, provide 2-4 scenes. Mark each scene as "major" (turning point) or "minor" (transition).
Respond ONLY with valid JSON in this exact format, no other text:
{{
  "acts": [
    {{
      "act_number": 1,
      "name": "Setup",
      "duration_minutes": {act1},
      "percentage": 33,
      "scenes": [
        {{"scene_number": 1, "title": "string", "scene_type": "major or minor",
          "description": "string", "time_allocation": 0.0,
          "characters": ["string"], "location": "string", "emotional_beat": "string"}}
      ]
    }}
  ],
  "total_characters": ["string"],
  "suggested_locations": ["string"]
}}"""

    raw = _call_claude(BAAKHAPAA_STYLE, prompt, max_tokens=3000)
    try:
        cleaned = raw.strip().strip("```json").strip("```").strip()
        return json.loads(cleaned)
    except json.JSONDecodeError:
        raise RuntimeError("AI response could not be parsed as JSON. Try again.")


def generate_scene(scene_description, genre, tone, language, character_names, act_number=1):
    chars = ", ".join(character_names) if character_names else "characters as needed"
    prompt = f"""Write a full screenplay scene.
Genre: {genre} | Tone: {tone} | Language: {language} | Act: {act_number}
Characters: {chars}
Scene description: {scene_description}

Format correctly:
- INT./EXT. LOCATION - DAY/NIGHT as scene heading (uppercase)
- Action lines in plain text
- CHARACTER NAME centered/uppercase above dialogue
- Dialogue below character name
{"- Dialogue in Nepali Devanagari script, action lines in English" if language.lower() in ["nepali", "bilingual"] else ""}"""

    return _call_claude(BAAKHAPAA_STYLE, prompt, max_tokens=2000)


def improve_scene(scene_text, instruction, language="English"):
    prompt = f"""Here is a screenplay scene:

{scene_text}

Instruction: {instruction}
Language: {language}

Rewrite the scene following the instruction exactly. Keep the same characters, location, and core story beat. Return only the rewritten scene."""

    return _call_claude(BAAKHAPAA_STYLE, prompt, max_tokens=2000)


def suggest_continuations(scene_text, genre, tone):
    prompt = f"""Here is an incomplete screenplay scene:

{scene_text}

Genre: {genre} | Tone: {tone}

Provide exactly 3 different ways to continue this scene, each 3-5 sentences.
Respond ONLY with valid JSON: {{"suggestions": ["option 1", "option 2", "option 3"]}}"""

    raw = _call_claude(BAAKHAPAA_STYLE, prompt, max_tokens=1000)
    try:
        cleaned = raw.strip().strip("```json").strip("```").strip()
        data = json.loads(cleaned)
        return data.get("suggestions", [])
    except json.JSONDecodeError:
        return [raw]


def review_script(script_content):
    prompt = f"""Review this screenplay for issues:

{script_content}

Check for: character name inconsistencies, missing scene headings, unfinished dialogue, act balance.
Respond ONLY with valid JSON: {{"issues": [{{"line": 0, "issue": "string", "severity": "high/medium/low"}}]}}"""

    raw = _call_claude(BAAKHAPAA_STYLE, prompt, max_tokens=1000)
    try:
        cleaned = raw.strip().strip("```json").strip("```").strip()
        data = json.loads(cleaned)
        return data.get("issues", [])
    except json.JSONDecodeError:
        return []
