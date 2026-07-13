import os
import json
import anthropic
from dotenv import load_dotenv

# RAG: semantic retrieval over analyzed structural patterns (works in demo
# mode too — embeddings are local). Exposed here so callers can use
# script_engine.retrieve_relevant_patterns(genre, tone, theme, top_k=3).
from rag import retrieve_relevant_patterns, format_patterns_for_prompt

load_dotenv()

_api_key = os.getenv("ANTHROPIC_API_KEY")
# Demo mode: no real key configured — return sample content instead of calling the API
MOCK_AI = not _api_key or _api_key.startswith("your-")
client = None if MOCK_AI else anthropic.Anthropic(api_key=_api_key)
MODEL = "claude-sonnet-5"
if MOCK_AI:
    print("WARNING: Running with Mock AI (no ANTHROPIC_API_KEY set).")

BAAKHAPAA_STYLE = """You are writing for Baakhapaa, a Nepali storytelling platform for young audiences.
Style: emotional, authentic, youth focused.
Characters: relatable young Nepali adults aged 18 to 30 facing real decisions.
Dialogue: conversational, natural Nepali and English mix as spoken in urban Kathmandu.
Themes: personal growth, relationships, family expectations, ambition, modern Nepal.
Avoid: melodrama, cliche resolutions, overly formal language.
For bilingual output: dialogue in Nepali (Devanagari script), action lines in English."""


_DEMO_SCENE = """INT. CHIYA PASAL, PATAN - MORNING

Steam rises from glasses of chiya. RAAJA (24) sits by the window,
phone face-down on the table. SANJANA (23) slides into the seat
across from him.

                      SANJANA
          Timro result aayo?

                      RAAJA
              (not looking up)
          Aayo. Pass bhaye. Tara baba lai
          kasari bhanne... maile job chodera
          film banauna khojeko.

Sanjana pushes her chiya toward him. Outside, a school bus
rattles past, children shouting.

                      SANJANA
          Sapana dekhna paisa lagdaina, Raaja.
          Tara bachna chai lagcha.
"""


def _demo_structure(duration_minutes):
    a1 = round(duration_minutes * 0.33, 1)
    a2 = round(duration_minutes * 0.33, 1)
    a3 = round(duration_minutes - a1 - a2, 1)
    return {
        "acts": [
            {"act_number": 1, "name": "Setup", "duration_minutes": a1, "percentage": 33, "scenes": [
                {"scene_number": 1, "title": "Morning at the Chiya Pasal", "scene_type": "major",
                 "description": "Raaja gets his exam result but hides his real dream from his family.",
                 "time_allocation": round(a1 * 0.6, 1), "characters": ["Raaja", "Sanjana"],
                 "location": "Chiya pasal, Patan", "emotional_beat": "quiet anxiety"},
                {"scene_number": 2, "title": "Dinner Expectations", "scene_type": "minor",
                 "description": "At home, Raaja's father plans his son's 'stable' future.",
                 "time_allocation": round(a1 * 0.4, 1), "characters": ["Raaja", "Baba"],
                 "location": "Family kitchen", "emotional_beat": "pressure"}]},
            {"act_number": 2, "name": "Confrontation", "duration_minutes": a2, "percentage": 33, "scenes": [
                {"scene_number": 3, "title": "The Secret Project", "scene_type": "major",
                 "description": "Raaja secretly shoots a short film with borrowed gear; it goes wrong.",
                 "time_allocation": round(a2 * 0.5, 1), "characters": ["Raaja", "Sanjana", "Kanchha"],
                 "location": "Rooftop, Kathmandu", "emotional_beat": "hope then panic"},
                {"scene_number": 4, "title": "Found Out", "scene_type": "major",
                 "description": "Baba discovers the truth. The family confrontation everyone avoided.",
                 "time_allocation": round(a2 * 0.5, 1), "characters": ["Raaja", "Baba", "Aama"],
                 "location": "Family kitchen", "emotional_beat": "rupture"}]},
            {"act_number": 3, "name": "Resolution", "duration_minutes": a3, "percentage": 34, "scenes": [
                {"scene_number": 5, "title": "The Screening", "scene_type": "major",
                 "description": "Raaja's film screens at a local festival. A familiar face in the crowd.",
                 "time_allocation": a3, "characters": ["Raaja", "Baba", "Sanjana"],
                 "location": "Community hall", "emotional_beat": "earned understanding"}]},
        ],
        "total_characters": ["Raaja", "Sanjana", "Baba", "Aama", "Kanchha"],
        "suggested_locations": ["Chiya pasal, Patan", "Family kitchen", "Rooftop, Kathmandu", "Community hall"],
    }


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


def rag_only_structure(genre, tone, duration_minutes, language, target_audience):
    """Free-tier structure: no Claude call. A standard five-beat three-act
    skeleton whose scene descriptions carry guidance from the retrieved
    structural patterns, so free users still get grounded, useful direction."""
    patterns = retrieve_relevant_patterns(
        genre, tone, f"{target_audience} audience, {language} language", top_k=3
    )
    tips = [p["one_line_takeaway"] for p in patterns]
    while len(tips) < 3:
        tips.append("Make every beat change something: the world, a relationship, or what a character knows.")

    a1 = round(duration_minutes * 0.33, 1)
    a2 = round(duration_minutes * 0.33, 1)
    a3 = round(duration_minutes - a1 - a2, 1)

    def beat(n, title, sc_type, desc, alloc):
        return {"scene_number": n, "title": title, "scene_type": sc_type,
                "description": desc, "time_allocation": alloc,
                "characters": [], "location": "", "emotional_beat": ""}

    return {
        "rag_only": True,
        "acts": [
            {"act_number": 1, "name": "Setup", "duration_minutes": a1, "percentage": 33, "scenes": [
                beat(1, "Opening — establish the ordinary world", "minor",
                     f"Introduce your protagonist and what they want. Pattern guidance: {tips[0]}",
                     round(a1 * 0.5, 1)),
                beat(2, "Inciting incident", "major",
                     f"The event that makes the story unavoidable. Pattern guidance: {tips[1]}",
                     round(a1 * 0.5, 1))]},
            {"act_number": 2, "name": "Confrontation", "duration_minutes": a2, "percentage": 33, "scenes": [
                beat(3, "Rising tension", "minor",
                     "Complications compound; every small win should raise the cost of failure.",
                     round(a2 * 0.5, 1)),
                beat(4, "Crisis", "major",
                     f"The lowest point — the protagonist's plan collapses. Pattern guidance: {tips[2]}",
                     round(a2 * 0.5, 1))]},
            {"act_number": 3, "name": "Resolution", "duration_minutes": a3, "percentage": 34, "scenes": [
                beat(5, "Resolution", "major",
                     "Answer the dramatic question posed in Act 1 — aim for earned understanding, not total triumph.",
                     a3)]},
        ],
        "total_characters": [],
        "suggested_locations": [],
        "pattern_sources": [
            {"takeaway": p["one_line_takeaway"], "tradition": p["origin_tradition"]}
            for p in patterns
        ],
    }


def generate_structure(genre, tone, duration_minutes, language, target_audience):
    # Semantic retrieval replaces pure genre/tone tag matching: the request is
    # embedded and matched against analyzed patterns, so a "sports underdog"
    # request can pull a boxing drama's structure even with no shared tag.
    patterns = retrieve_relevant_patterns(
        genre, tone, f"{target_audience} audience, {language} language", top_k=3
    )
    if patterns:
        print("RAG patterns for structure:",
              [f"{p['title_ref']} ({p['similarity']})" for p in patterns])

    if MOCK_AI:
        return _demo_structure(duration_minutes)
    act1 = round(duration_minutes * 0.33, 1)
    act2 = round(duration_minutes * 0.33, 1)
    act3 = round(duration_minutes - act1 - act2, 1)

    prompt = f"""Create a three act screenplay structure.
Genre: {genre}
Tone: {tone}
Total duration: {duration_minutes} minutes
Target audience: {target_audience}
Language: {language}
{format_patterns_for_prompt(patterns)}

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
    if MOCK_AI:
        return _DEMO_SCENE
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
    if MOCK_AI:
        return scene_text.rstrip() + "\n\n[Demo mode: showing your scene unchanged. Add a real ANTHROPIC_API_KEY to .env for AI rewrites following: \"" + instruction + "\"]"
    prompt = f"""Here is a screenplay scene:

{scene_text}

Instruction: {instruction}
Language: {language}

Rewrite the scene following the instruction exactly. Keep the same characters, location, and core story beat. Return only the rewritten scene."""

    return _call_claude(BAAKHAPAA_STYLE, prompt, max_tokens=2000)


def suggest_continuations(scene_text, genre, tone):
    if MOCK_AI:
        return [
            "Sanjana reveals she already submitted Raaja's film to the festival without telling him — the deadline he thought he missed has passed, and they got in.",
            "Baba arrives at the chiya pasal unexpectedly. He sits at the next table, and Raaja must choose: keep pretending, or say it out loud, here, now.",
            "A phone call interrupts: the borrowed camera was reported missing by the rental shop. Kanchha never actually had permission to lend it.",
        ]
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
    if MOCK_AI:
        return []
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
