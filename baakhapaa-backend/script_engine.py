import os
import json
import re
import anthropic
from dotenv import load_dotenv

# RAG: semantic retrieval over analyzed structural patterns (works in demo
# mode too — embeddings are local). Exposed here so callers can use
# script_engine.retrieve_relevant_patterns(genre, tone, theme, top_k=3).
from rag import retrieve_relevant_patterns, format_patterns_for_prompt

load_dotenv()

def _usable(key):
    """A key that is absent or still the .env placeholder is not a key."""
    return bool(key) and not key.startswith("your-")


_api_key = os.getenv("ANTHROPIC_API_KEY")
_groq_key = os.getenv("GROQ_API_KEY")

# Which company receives our users' unpublished screenplays.
#
# This used to fall through to Groq automatically whenever ANTHROPIC_API_KEY was
# missing. That is a one-typo privacy incident: a deploy with a fumbled Anthropic
# key would keep working, silently, while sending every writer's draft to a
# different provider than the one named in the privacy policy — and the only
# signal was a line in the startup log nobody reads.
#
# Routing user content to a third party is now an explicit decision:
# LLM_PROVIDER=groq has to be set on purpose. Anything else falls back to canned
# demo content, which sends nothing anywhere.
_requested = (os.getenv("LLM_PROVIDER") or "").strip().lower()

if _requested == "groq":
    if not _usable(_groq_key):
        raise RuntimeError("LLM_PROVIDER=groq but GROQ_API_KEY is missing or a placeholder.")
    PROVIDER = "groq"
elif _requested in ("anthropic", "claude"):
    if not _usable(_api_key):
        raise RuntimeError("LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing or a placeholder.")
    PROVIDER = "anthropic"
elif _usable(_api_key):
    PROVIDER = "anthropic"
else:
    PROVIDER = "mock"

MOCK_AI = PROVIDER == "mock"

MODEL = "claude-sonnet-5"
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

client = anthropic.Anthropic(api_key=_api_key) if PROVIDER == "anthropic" else None

_groq_client = None
if PROVIDER == "groq":
    from openai import OpenAI  # already a dependency (DALL-E); Groq is OpenAI-compatible

    _groq_client = OpenAI(api_key=_groq_key, base_url=GROQ_BASE_URL)

if PROVIDER == "mock":
    print("WARNING: Running with Mock AI (no ANTHROPIC_API_KEY set).")
elif PROVIDER == "groq":
    print(f"WARNING: LLM_PROVIDER=groq — user script text is being sent to Groq "
          f"({GROQ_MODEL}), not Anthropic. Development only; the product ships on "
          "Claude, and the privacy policy must name whoever actually receives it.")

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


def _act_split(duration_minutes):
    """Split a runtime into the 33/33/34 three-act shape.

    Act 3 takes the remainder rather than its own rounded 34% so the three
    always sum back to the runtime the user asked for — rounding each act
    independently can drift by a tenth of a minute.
    """
    act1 = round(duration_minutes * 0.33, 1)
    act2 = round(duration_minutes * 0.33, 1)
    return act1, act2, round(duration_minutes - act1 - act2, 1)


def _demo_structure(duration_minutes):
    a1, a2, a3 = _act_split(duration_minutes)
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


def _call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 3000) -> str:
    """Single choke point for every text generation call."""
    if PROVIDER == "groq":
        try:
            resp = _groq_client.chat.completions.create(
                model=GROQ_MODEL,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return resp.choices[0].message.content or ""
        except Exception as e:
            raise RuntimeError(f"Groq API error: {str(e)}") from e

    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        # Filter by type rather than indexing [0]: with thinking enabled a
        # thinking block comes first and content[0].text would raise.
        return next((b.text for b in message.content if b.type == "text"), "")
    except Exception as e:
        raise RuntimeError(f"Claude API error: {str(e)}") from e


# Back-compat alias from when Claude was the only provider. Call sites all use
# `_call_llm`; this stays so nothing importing the old name breaks.
_call_claude = _call_llm


def _stream_llm(system_prompt: str, user_prompt: str, max_tokens: int = 3000):
    """Yield the model's answer in pieces, as it is written.

    Why this exists: `_call_llm` blocks until the whole response is composed, so
    a writer who asks for a scene watches a spinner for as long as it takes to
    generate two thousand tokens, then the text appears at once. In a tool whose
    entire promise is keeping a writer in flow, that is the wrong shape — and it
    is also the shape most likely to hit an HTTP timeout, which is why the SDK
    asks for streaming above a certain `max_tokens` anyway.

    The mock path streams too, deliberately. If demo mode returned its canned
    scene in one lump, every bit of plumbing between here and the browser would
    be untested until the day someone put a real key in — which is exactly the
    class of bug this project has been finding all week.
    """
    if MOCK_AI:
        demo = _DEMO_SCENE if max_tokens >= 2000 else "Demo mode: no model was called."
        for chunk in _in_chunks(demo):
            yield chunk
        return

    if PROVIDER == "groq":
        # Groq's client is OpenAI-shaped, not Anthropic-shaped.
        try:
            stream = _groq_client.chat.completions.create(
                model=GROQ_MODEL, max_tokens=max_tokens, stream=True,
                messages=[{"role": "system", "content": system_prompt},
                          {"role": "user", "content": user_prompt}],
            )
            for event in stream:
                piece = event.choices[0].delta.content
                if piece:
                    yield piece
        except Exception as e:
            raise RuntimeError(f"Groq API error: {str(e)}") from e
        return

    try:
        with client.messages.stream(
            model=MODEL,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        ) as stream:
            yield from stream.text_stream
    except Exception as e:
        raise RuntimeError(f"Claude API error: {str(e)}") from e


def _in_chunks(text: str, words: int = 4):
    """Break text on whitespace the way a model emits it — never mid-word.

    Splitting on a fixed character count would cut through words and, worse,
    through Devanagari grapheme clusters, so a Nepali scene would arrive as
    visible mojibake before the next chunk repaired it.
    """
    parts, buf = text.split(" "), []
    for i, w in enumerate(parts, 1):
        buf.append(w)
        if i % words == 0:
            yield " ".join(buf) + " "
            buf = []
    if buf:
        yield " ".join(buf)


def _extract_json(raw: str):
    """Parse a JSON object out of a model response.

    The previous cleaning handled bare and fenced JSON but failed whenever the
    model wrote anything around it — measured:

        bare {"a": 1}                     PARSES
        ```json fenced```                 PARSES
        "Here it is:" + fenced            FAILS
        {"a": 1} + "Let me know!"         FAILS

    Preamble and sign-off are exactly what open-weight models produce most, so
    this matters more on the Groq path, but it is a real failure mode on the
    Claude path too — see plan item A3.

    (It also used `str.strip("```json")`, which strips *characters* rather than
    a substring. That is fragile, but harmless in practice: JSON starts with
    `{` and ends with `}`, so no real content was ever removed.)
    """
    text = (raw or "").strip()

    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Last resort: the outermost {...} span in the response.
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    raise RuntimeError("AI response could not be parsed as JSON. Try again.")


def rag_only_structure(genre, tone, duration_minutes, language, target_audience):
    """Free-tier structure: no Claude call. A standard five-beat three-act
    skeleton whose scene descriptions carry guidance from the retrieved
    structural patterns, so free users still get grounded, useful direction."""
    # Each beat queries the craft library for the problem THAT beat has to
    # solve, so the guidance attached to it is actually about that beat.
    BEAT_PROBLEMS = {
        "opening": "my character introduction is static and described rather than shown in action",
        "inciting": "the inciting incident feels passive, things just happen to the protagonist",
        "rising": "the middle sags, complications do not compound, tension resets each scene",
        "crisis": "my confrontation is on the nose and melodramatic, characters state their feelings",
        "resolution": "the ending feels unearned and the emotional payoff does not land",
    }
    FALLBACK = "Make this beat change something: the world, a relationship, or what a character knows."

    def tip(key):
        hit = retrieve_relevant_patterns(genre, tone, BEAT_PROBLEMS[key], top_k=1)
        if not hit:
            return FALLBACK
        p = hit[0]
        return f"{p.get('technique')} — {p.get('how_to_apply', '')}"

    tips = {k: tip(k) for k in BEAT_PROBLEMS}
    patterns = retrieve_relevant_patterns(
        genre, tone, f"{target_audience} audience, {language} language", top_k=3
    )

    a1, a2, a3 = _act_split(duration_minutes)

    def beat(n, title, sc_type, desc, alloc):
        return {"scene_number": n, "title": title, "scene_type": sc_type,
                "description": desc, "time_allocation": alloc,
                "characters": [], "location": "", "emotional_beat": ""}

    return {
        "rag_only": True,
        "acts": [
            {"act_number": 1, "name": "Setup", "duration_minutes": a1, "percentage": 33, "scenes": [
                beat(1, "Opening — establish the ordinary world", "minor",
                     f"Introduce your protagonist and what they want. Craft: {tips['opening']}",
                     round(a1 * 0.5, 1)),
                beat(2, "Inciting incident", "major",
                     f"The event that makes the story unavoidable. Craft: {tips['inciting']}",
                     round(a1 * 0.5, 1))]},
            {"act_number": 2, "name": "Confrontation", "duration_minutes": a2, "percentage": 33, "scenes": [
                beat(3, "Rising tension", "minor",
                     f"Complications compound; every small win should raise the cost of failure. Craft: {tips['rising']}",
                     round(a2 * 0.5, 1)),
                beat(4, "Crisis", "major",
                     f"The lowest point — the protagonist's plan collapses. Craft: {tips['crisis']}",
                     round(a2 * 0.5, 1))]},
            {"act_number": 3, "name": "Resolution", "duration_minutes": a3, "percentage": 34, "scenes": [
                beat(5, "Resolution", "major",
                     f"Answer the dramatic question posed in Act 1 — aim for earned understanding, not total triumph. Craft: {tips['resolution']}",
                     a3)]},
        ],
        "total_characters": [],
        "suggested_locations": [],
        "pattern_sources": [
            {"takeaway": p.get("technique") or p.get("one_line_takeaway"), "tradition": p["origin_tradition"]}
            for p in patterns
        ],
    }


# --- short-form -----------------------------------------------------------
#
# Vertical social video is not a compressed film. Three acts do not apply:
# the spine is hook -> escalation -> payoff -> (twist) -> soft CTA, and every
# beat carries a retention function. A second without one is where viewers
# leave, which is the only metric this format actually has.

# Proportion of total runtime per beat. The hook is capped in absolute seconds
# rather than by share, because the window where a viewer decides to stay is
# about three seconds whether the video runs 20 seconds or 90.
HOOK_MAX_SECONDS = 3

SHORT_FORM_BEATS = [
    ("Hook", "stop_scroll", 0.0),
    ("Escalation", "open_loop", 0.45),
    ("Core payoff", "payoff", 0.30),
    ("Twist", "rewatch_trigger", 0.15),
    ("Soft CTA", "share_trigger", 0.10),
]

# What the middle and ending owe, per category.
CATEGORY_SHAPE = {
    "educational": (
        "State the counterintuitive claim as fact. No preamble.",
        "Say why it matters to this viewer, then give exactly ONE concrete mechanism.",
        "Call back to the opening claim so the loop closes.",
    ),
    "storytime": (
        "Cold-open at the crisis moment, mid-story. No setup first.",
        "Rewind and compress the setup, escalating back toward the opening moment.",
        "Pay off past what the opening implied — the twist lands before the CTA.",
    ),
    "transformation": (
        "Flash the after-state in the first frame as proof.",
        "Compress the process into visible incremental wins.",
        "Side-by-side comparison, then one takeaway they can act on.",
    ),
    "comedy_skit": (
        "Put the absurd premise inside the FIRST line of dialogue.",
        "Rule of three: escalate the same joke 3x, each beat shorter than the last.",
        "The third escalation breaks the pattern. No CTA — the rewatch is the CTA.",
    ),
}

HOOK_GUIDANCE = {
    "pattern_interrupt": "Break the expected rhythm in frame one — an unexpected cut, sound, or position.",
    "bold_claim": "Open on a contestable statement delivered as settled fact.",
    "question": "Ask the gap directly, in the viewer's own words.",
    "visual_shock": "Lead with the image. Let it arrive before any speech.",
    "relatable_pain": "Name one hyper-specific frustration the viewer already owns.",
    "curiosity_gap": "Promise a payoff while withholding its shape.",
}


def shorts_structure(genre, tone, duration_seconds, language, target_audience,
                     hook_type="relatable_pain", category="storytime"):
    """Beat spine for vertical short-form. No Claude call — this is grammar,
    not generation, so it costs nothing and works on every tier."""
    opening, middle, ending = CATEGORY_SHAPE.get(category, CATEGORY_SHAPE["storytime"])

    hook_seconds = min(HOOK_MAX_SECONDS, max(1, round(duration_seconds * 0.12)))
    remaining = max(1, duration_seconds - hook_seconds)

    beats, elapsed = [], 0
    for i, (name, retention, share) in enumerate(SHORT_FORM_BEATS):
        secs = hook_seconds if name == "Hook" else round(remaining * share)
        # Last beat absorbs rounding so the beats sum to the runtime asked for.
        if i == len(SHORT_FORM_BEATS) - 1:
            secs = max(1, duration_seconds - elapsed)
        secs = max(1, secs)

        if name == "Hook":
            guidance = f"{HOOK_GUIDANCE.get(hook_type, '')} {opening}".strip()
        elif name == "Escalation":
            guidance = middle
        elif name == "Core payoff":
            guidance = ending
        elif name == "Twist":
            guidance = "Optional. Subvert what the payoff implied — this is what earns a rewatch."
        else:
            guidance = "One line, low pressure. A hard ask here costs more reach than it gains."

        beats.append({
            "beat_number": i + 1,
            "name": name,
            "retention_function": retention,
            "start_second": elapsed,
            "duration_seconds": secs,
            "description": guidance,
        })
        elapsed += secs

    return {
        "short_form": True,
        "hook_type": hook_type,
        "category": category,
        "total_seconds": elapsed,
        "beats": beats,
        "pattern_sources": [
            {"takeaway": p.get("technique") or p.get("one_line_takeaway"),
             "tradition": p["origin_tradition"]}
            for p in retrieve_relevant_patterns(
                genre, tone, "my short-form video loses viewers before the payoff", top_k=2
            )
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
    act1, act2, act3 = _act_split(duration_minutes)

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

    raw = _call_llm(BAAKHAPAA_STYLE, prompt, max_tokens=3000)
    return _extract_json(raw)


def format_bible_for_prompt(bible) -> str:
    """The story bible as prompt context.

    The editor has always collected a logline, a dramatic question, a theme, and
    per character a want, a need, a wound and a voice — and none of it ever
    reached a model. A writer filled in the most useful thing you can possibly
    give a generator (what this person wants versus what would actually help
    them, and how they sound) and it was dropped on the floor.

    Want and need are stated as a pair on purpose: a scene plays when the
    character pursues the want and the need goes unmet, and saying so in the
    prompt is the difference between dialogue that argues and dialogue that
    explains.
    """
    if not bible:
        return ""

    lines = []
    if bible.get("logline"):
        lines.append(f"Logline: {bible['logline']}")
    if bible.get("dramatic_question"):
        lines.append(f"The question the story is asking: {bible['dramatic_question']}")
    if bible.get("theme"):
        lines.append(f"Theme (never state it aloud in dialogue): {bible['theme']}")

    for c in (bible.get("characters") or []):
        name = (c.get("name") or "").strip()
        if not name:
            continue
        bits = []
        if c.get("age"):
            bits.append(f"age {c['age']}")
        if c.get("want"):
            bits.append(f"wants {c['want']}")
        if c.get("need"):
            bits.append(f"actually needs {c['need']}")
        if c.get("wound"):
            bits.append(f"carries {c['wound']}")
        if c.get("voice"):
            bits.append(f"speaks: {c['voice']}")
        if bits:
            lines.append(f"{name.upper()} — " + "; ".join(bits))

    if bible.get("notes"):
        lines.append(f"Notes: {bible['notes']}")

    if not lines:
        return ""
    return "\nWhat this story already knows about itself:\n" + "\n".join(lines) + "\n"


def _format_language_rule(language: str) -> str:
    if (language or "").lower() in ("nepali", "bilingual"):
        return "- Dialogue in Nepali (Devanagari script), action lines in English"
    return ""


def generate_scene(scene_description, genre, tone, language, character_names,
                   act_number=1, bible=None, patterns=None):
    if MOCK_AI:
        return _DEMO_SCENE

    # Character names come from the bible when the caller did not name any —
    # the editor never sent this field, so it was always "characters as needed".
    if not character_names and bible:
        character_names = [
            (c.get("name") or "").strip()
            for c in (bible.get("characters") or [])
            if (c.get("name") or "").strip()
        ]
    chars = ", ".join(character_names) if character_names else "characters as needed"

    prompt = f"""Write a full screenplay scene.
Genre: {genre} | Tone: {tone} | Language: {language} | Act: {act_number}
Characters: {chars}
Scene description: {scene_description}
{format_bible_for_prompt(bible)}{format_patterns_for_prompt(patterns)}
Format correctly:
- INT./EXT. LOCATION - DAY/NIGHT as scene heading (uppercase)
- Action lines in plain text
- CHARACTER NAME centered/uppercase above dialogue
- Dialogue below character name
{_format_language_rule(language)}"""

    return _call_llm(BAAKHAPAA_STYLE, prompt, max_tokens=2000)


# The prompt builders below exist so the streaming and blocking paths cannot
# drift. A streamed scene that was written to a slightly different prompt than
# the one the tests pin would be a very quiet bug: the output still looks like
# a scene, so nothing fails until someone compares them line by line.

def scene_prompt(scene_description, genre, tone, language, character_names,
                 act_number=1, bible=None, patterns=None):
    if not character_names and bible:
        character_names = [
            (c.get("name") or "").strip()
            for c in (bible.get("characters") or [])
            if (c.get("name") or "").strip()
        ]
    chars = ", ".join(character_names) if character_names else "characters as needed"
    return f"""Write a full screenplay scene.
Genre: {genre} | Tone: {tone} | Language: {language} | Act: {act_number}
Characters: {chars}
Scene description: {scene_description}
{format_bible_for_prompt(bible)}{format_patterns_for_prompt(patterns)}
Format correctly:
- INT./EXT. LOCATION - DAY/NIGHT as scene heading (uppercase)
- Action lines in plain text
- CHARACTER NAME centered/uppercase above dialogue
- Dialogue below character name
{_format_language_rule(language)}"""


def improve_prompt(scene_text, instruction, language="English", bible=None, patterns=None):
    return f"""Here is a screenplay scene:

{scene_text}

Instruction: {instruction}
Language: {language}
{format_bible_for_prompt(bible)}{format_patterns_for_prompt(patterns)}
Rewrite the scene following the instruction exactly. Keep the same characters, location, and core story beat. Return only the rewritten scene."""


def stream_scene(**kw):
    """Stream a generated scene. Same prompt as `generate_scene`."""
    return _stream_llm(BAAKHAPAA_STYLE, scene_prompt(**kw), max_tokens=2000)


def stream_improvement(**kw):
    """Stream a rewrite. Same prompt as `improve_scene`."""
    return _stream_llm(BAAKHAPAA_STYLE, improve_prompt(**kw), max_tokens=2000)


def improve_scene(scene_text, instruction, language="English", bible=None, patterns=None):
    if MOCK_AI:
        return scene_text.rstrip() + "\n\n[Demo mode: showing your scene unchanged. Add a real ANTHROPIC_API_KEY to .env for AI rewrites following: \"" + instruction + "\"]"

    prompt = f"""Here is a screenplay scene:

{scene_text}

Instruction: {instruction}
Language: {language}
{format_bible_for_prompt(bible)}{format_patterns_for_prompt(patterns)}
Rewrite the scene following the instruction exactly. Keep the same characters, location, and core story beat. Return only the rewritten scene."""

    return _call_llm(BAAKHAPAA_STYLE, prompt, max_tokens=2000)


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

    raw = _call_llm(BAAKHAPAA_STYLE, prompt, max_tokens=1000)
    try:
        return _extract_json(raw).get("suggestions", [])
    except RuntimeError:
        return [raw]
