import json
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, Depends
from models import (
    GenerateStructureRequest, GenerateSceneRequest,
    ImproveSceneRequest, SuggestRequest, ScriptSave, AddSceneRequest,
    RecommendRequest,
)
from database import supabase, get_project_by_id, get_scenes_by_script
from auth import (
    get_current_user, require_script_access, require_project_access,
    require_paid_tier, is_paid_tier,
)
import script_engine
import linter
import screenplay
import fingerprint
import benchmark
import rag

router = APIRouter(prefix="/scripts", tags=["scripts"])


@contextmanager
def ai_unavailable_as_503():
    """Convert a provider failure into 503.

    `script_engine` raises RuntimeError for anything the upstream model did
    wrong — network, auth, unparseable JSON. Callers need a clean status, not
    a stack trace, so every AI-backed endpoint routes through here.
    """
    try:
        yield
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/generate-structure")
def generate_structure(req: GenerateStructureRequest, project_id: str, user_id: str = Depends(get_current_user)):
    """Generate the three-act structure as a PREVIEW. No scenes are saved —
    the suggestion set is stored on the script row (suggestions_json) so the
    user can add scenes one at a time (POST /scripts/add-scene) and revisit
    un-added suggestions later without regenerating."""
    require_project_access(project_id, user_id)
    with ai_unavailable_as_503():
        # Freemium split: free tier gets a RAG-grounded skeleton (no Claude
        # call, zero AI cost); Pro/Studio get full Claude generation.
        if is_paid_tier(user_id):
            structure = script_engine.generate_structure(
                req.genre, req.tone, req.duration_minutes, req.language, req.target_audience
            )
        else:
            structure = script_engine.rag_only_structure(
                req.genre, req.tone, req.duration_minutes, req.language, req.target_audience
            )

    script_result = supabase.table("scripts").insert({
        "project_id": project_id, "content": "", "status": "draft",
        "suggestions_json": json.dumps(structure),
    }).execute()
    script_id = script_result.data[0]["id"]

    return {"script_id": script_id, "structure": structure}


@router.post("/add-scene")
def add_scene(req: AddSceneRequest, user_id: str = Depends(get_current_user)):
    """Save ONE scene from the structure preview into the scenes table."""
    require_script_access(req.script_id, user_id)
    result = supabase.table("scenes").insert({
        "script_id": req.script_id,
        "act_number": req.act_number,
        "scene_type": req.scene_type,
        "title": req.title,
        "description": req.description,
        "time_allocation": req.time_allocation,
        "order_index": req.order_index,
    }).execute()
    return result.data[0]


RECOMMENDATION_COUNT = 3


@router.post("/recommendations")
def recommendations(req: RecommendRequest, user_id: str = Depends(get_current_user)):
    """Craft recommendations while writing — EVERY tier, no Claude call.

    Diagnosis first, similarity second. The library embeds each entry's
    *problem* ("my dialogue is on the nose"), so querying it with raw
    screenplay prose compares two different kinds of text and what survives is
    surface topic — a tea-shop scene pulls entries that mention tea. Linting
    first gives a query in the same register as the corpus.

    Better still, a linter flag already names the technique that fixes it,
    because every rule was derived from a craft entry's `warning_sign`. Those
    come back by exact lookup; embeddings only fill the remaining slots.
    """
    text = req.scene_text or ""
    flags = linter.lint(text)

    # 1. Exact: techniques the linter positively identified, worst first.
    ranked = sorted(flags, key=lambda f: {"high": 0, "medium": 1, "low": 2}.get(f["severity"], 3))
    diagnosed = rag.get_patterns_by_technique([f["technique"] for f in ranked])[:RECOMMENDATION_COUNT]

    # 2. Semantic: fill the rest, querying with the symptom language the
    #    corpus is embedded on rather than with the draft itself.
    patterns = list(diagnosed)
    if len(patterns) < RECOMMENDATION_COUNT:
        if flags:
            query = " ".join(f["message"] for f in ranked[:3])
        else:
            query = text[-1500:] or "starting a new scene"
        already = {p["technique"] for p in patterns}
        for p in script_engine.retrieve_relevant_patterns(
            req.genre, req.tone, query, top_k=RECOMMENDATION_COUNT + len(patterns)
        ):
            if p["technique"] not in already:
                patterns.append(p)
                already.add(p["technique"])
            if len(patterns) == RECOMMENDATION_COUNT:
                break

    return {
        "patterns": patterns,
        # Lets the UI say "because line 12 states an emotion" instead of
        # presenting three tips with no stated reason.
        "diagnosed": [
            {"technique": f["technique"], "rule": f["rule"],
             "line": f["line"], "message": f["message"]}
            for f in ranked[:RECOMMENDATION_COUNT]
        ],
        "source": "diagnosis" if diagnosed else "similarity",
    }


@router.post("/lint")
def lint_draft(req: RecommendRequest, user_id: str = Depends(get_current_user)):
    """Deterministic craft diagnostics on the draft, plus shape statistics.

    Every tier, like /recommendations: pure Python, no Claude call, no
    marginal cost. Each flag names the craft technique that fixes it, so the
    editor can pull the full how_to_apply / worked_example from the library.
    """
    text = req.scene_text or ""
    flags = linter.lint(text)

    # Writers reconciling notes group them by story element — structure,
    # character, dialogue — before deciding what to act on. `craft_level` is
    # already that taxonomy, so hand the grouping over instead of making them
    # redo it against a flat list.
    levels = {p["technique"]: p.get("craft_level")
              for p in rag.get_patterns_by_technique([f["technique"] for f in flags])}
    by_level: dict = {}
    for f in flags:
        f = {**f, "craft_level": levels.get(f["technique"])}
        by_level.setdefault(f["craft_level"] or "other", []).append(f)

    return {
        "flags": flags,
        "by_craft_level": by_level,
        "statistics": screenplay.statistics(text),
        "counts": {
            "high": sum(1 for f in flags if f["severity"] == "high"),
            "medium": sum(1 for f in flags if f["severity"] == "medium"),
            "low": sum(1 for f in flags if f["severity"] == "low"),
        },
    }


# A benchmark needs a draft with enough shape to measure. Gate on what the
# parser can see rather than on the writer declaring themselves finished —
# nobody clicks "I'm done", and a comparison drawn from four scenes is noise.
BENCHMARK_MIN_SCENES = 8
BENCHMARK_MIN_DIALOGUE_LINES = 25


@router.post("/benchmark")
def benchmark_draft(req: RecommendRequest, user_id: str = Depends(get_current_user)):
    """Compare the draft's shape against the analysed script corpus.

    Every tier: pure measurement, no Claude call. Returns `ready: false` with
    what is still missing when the draft is too thin to say anything honest
    about — that message is the feature, not an error.
    """
    text = req.scene_text or ""
    mine = fingerprint.fingerprint(text, genre=req.genre or "")

    if (mine["scene_count"] < BENCHMARK_MIN_SCENES
            or mine["dialogue_lines"] < BENCHMARK_MIN_DIALOGUE_LINES):
        return {
            "ready": False,
            "reason": "Benchmarking compares a full draft's shape, so it opens once "
                      "there's enough script to measure.",
            "progress": {
                "scenes": mine["scene_count"], "scenes_needed": BENCHMARK_MIN_SCENES,
                "dialogue_lines": mine["dialogue_lines"],
                "dialogue_lines_needed": BENCHMARK_MIN_DIALOGUE_LINES,
            },
            "statistics": mine,
        }

    return {
        "ready": True,
        "statistics": mine,
        "benchmark": benchmark.compare(mine, benchmark.load_corpus(), genre=req.genre or ""),
    }


@router.post("/generate-scene")
def generate_scene(req: GenerateSceneRequest, user_id: str = Depends(require_paid_tier)):
    with ai_unavailable_as_503():
        text = script_engine.generate_scene(
            req.scene_description, req.genre, req.tone, req.language, req.character_names
        )
    return {"scene_text": text}


@router.post("/improve")
def improve(req: ImproveSceneRequest, user_id: str = Depends(require_paid_tier)):
    with ai_unavailable_as_503():
        text = script_engine.improve_scene(req.scene_text, req.instruction, req.language)
    return {"improved_text": text}


@router.post("/suggest")
def suggest(req: SuggestRequest, user_id: str = Depends(require_paid_tier)):
    with ai_unavailable_as_503():
        suggestions = script_engine.suggest_continuations(req.scene_text, req.genre, req.tone)
    return {"suggestions": suggestions}


@router.get("/project/{project_id}")
def get_script_for_project(project_id: str, user_id: str = Depends(get_current_user)):
    """Return the project's script, creating an empty one if none exists yet
    (lets the dashboard open any project directly in the editor)."""
    require_project_access(project_id, user_id)

    existing = supabase.table("scripts").select("*").eq("project_id", project_id).execute()
    if existing.data:
        return existing.data[0]

    created = supabase.table("scripts").insert({
        "project_id": project_id, "content": "", "status": "draft",
    }).execute()
    return created.data[0]


@router.get("/{script_id}")
def get_script(script_id: str, user_id: str = Depends(get_current_user)):
    script = require_script_access(script_id, user_id)
    scenes = get_scenes_by_script(script_id)
    # Embed the parent project so the editor can title itself and drive AI
    # calls from the project's real genre/tone instead of guessing.
    project = get_project_by_id(script.get("project_id")) or {}
    return {
        **script,
        "scenes": scenes,
        "project": {
            "title": project.get("title"),
            "genre": project.get("genre"),
            "tone": project.get("tone"),
            "language": project.get("language"),
            "duration_minutes": project.get("duration_minutes"),
        },
    }


@router.put("/{script_id}")
def save_script(script_id: str, data: ScriptSave, user_id: str = Depends(get_current_user)):
    script = require_script_access(script_id, user_id)

    supabase.table("versions").insert({
        "script_id": script_id, "user_id": user_id,
        "content": script["content"], "label": "Auto save",
    }).execute()

    result = supabase.table("scripts").update({"content": data.content}).eq("id", script_id).execute()
    return result.data[0]


@router.post("/{script_id}/finalize")
def finalize_script(script_id: str, user_id: str = Depends(get_current_user)):
    require_script_access(script_id, user_id)
    result = supabase.table("scripts").update({"status": "finalized"}).eq("id", script_id).execute()
    return result.data[0]
