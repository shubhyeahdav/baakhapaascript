import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from fastapi.responses import StreamingResponse
from models import (
    GenerateStructureRequest, GenerateSceneRequest,
    ImproveSceneRequest, SuggestRequest, ScriptSave, AddSceneRequest,
    RecommendRequest, StoryBible, ActDurations,
)
from database import (
    supabase, get_project_by_id, get_versions_by_script,
)
import membership
from auth import (
    get_current_user, require_script_access, require_project_access,
    require_paid_tier, is_paid_tier,
)
import script_engine
import linter
import screenplay
import scene_sync
import review
import fingerprint
import benchmark
import rag
import lessons
import script_import
import coverage as coverage_report
import audit

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
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.post("/generate-structure")
def generate_structure(req: GenerateStructureRequest, project_id: str, user_id: str = Depends(get_current_user)):
    """Generate the three-act structure as a PREVIEW. No scenes are saved —
    the suggestion set is stored on the script row (suggestions_json) so the
    user can add scenes one at a time (POST /scripts/add-scene) and revisit
    un-added suggestions later without regenerating."""
    require_project_access(project_id, user_id)
    with ai_unavailable_as_503():
        # Short-form has its own beat spine (hook -> escalation -> payoff ->
        # twist -> CTA). Running it through a three-act split would produce
        # advice about act breaks for a 30-second video.
        if req.format == "short_form":
            structure = script_engine.shorts_structure(
                req.genre, req.tone, req.duration_seconds, req.language,
                req.target_audience, req.hook_type, req.short_form_category,
            )
        # Freemium split: free tier gets a RAG-grounded skeleton (no Claude
        # call, zero AI cost); Pro/Studio get full Claude generation.
        elif is_paid_tier(user_id):
            structure = script_engine.generate_structure(
                req.genre, req.tone, req.duration_minutes, req.language, req.target_audience
            )
        else:
            structure = script_engine.rag_only_structure(
                req.genre, req.tone, req.duration_minutes, req.language, req.target_audience
            )

    # One script row per project. Inserting unconditionally meant a second
    # structure generation created a script that nothing could reach again:
    # `GET /scripts/project/{id}` returns the FIRST row, so the new one was
    # orphaned along with any suggestions in it. Updating in place also leaves
    # `content` alone — regenerating a structure must never discard a draft.
    existing = supabase.table("scripts").select("*").eq("project_id", project_id).execute()
    if existing.data:
        script_id = existing.data[0]["id"]
        supabase.table("scripts").update(
            {"suggestions_json": json.dumps(structure)}
        ).eq("id", script_id).execute()
    else:
        script_result = supabase.table("scripts").insert({
            "project_id": project_id, "content": "", "status": "draft",
            "suggestions_json": json.dumps(structure),
        }).execute()
        script_id = script_result.data[0]["id"]

    return {"script_id": script_id, "structure": structure}


@router.put("/{script_id}/acts")
def set_act_durations(script_id: str, req: ActDurations, user_id: str = Depends(get_current_user)):
    """Change how long each act is planned to run.

    The three-act split is a default, not a law — a short with a long second
    act is a choice, and until now the only way to alter it was to regenerate
    the whole structure and lose every suggestion in it.

    Percentages are recomputed rather than stored twice. They were derived from
    the durations when the structure was generated, so keeping a separate copy
    would mean two numbers that disagree the moment one is edited.
    """
    script = require_script_access(script_id, user_id)
    try:
        structure = json.loads(script.get("suggestions_json") or "{}")
    except (ValueError, TypeError):
        structure = {}
    acts = structure.get("acts") or []
    if not acts:
        raise HTTPException(status_code=400, detail="This script has no structure to adjust.")

    by_num = {int(k): v for k, v in req.durations.items()}
    for act in acts:
        minutes = by_num.get(act.get("act_number"))
        if minutes is not None:
            act["duration_minutes"] = round(float(minutes), 2)

    total = sum(float(a.get("duration_minutes") or 0) for a in acts)
    for act in acts:
        act["percentage"] = (
            round(float(act.get("duration_minutes") or 0) / total * 100) if total else 0
        )

    structure["acts"] = acts
    supabase.table("scripts").update(
        {"suggestions_json": json.dumps(structure)}
    ).eq("id", script_id).execute()
    return {"structure": structure}


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
        # The structure generator produces all three of these per scene, and
        # every one of them used to be dropped here — while the storyboard
        # engine read `location` and `emotional_beat` back out and therefore
        # always got "". A frame prompt with no place, no cast and no mood is
        # the whole reason early boards looked generic.
        "location": req.location,
        "emotional_beat": req.emotional_beat,
        "characters_json": json.dumps(req.characters),
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

    `focus` and `scene_text` are different things and the distinction is
    load-bearing. Diagnosis is always run against the DRAFT. A focus phrase
    only redirects the semantic half. When the editor sent its focus chips as
    `scene_text`, this endpoint dutifully linted the complaint itself and
    returned a flag on line 1 of it, which the editor then displayed under the
    heading "found in your draft".
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
        if req.focus:
            # The writer named the problem. That is better evidence than
            # anything inferred, and it is already in the corpus's register.
            query = req.focus
        elif flags:
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
        # `lesson_id` turns a flag into a way into the course rather than a
        # dead end. Resolved here rather than by a per-flag request from the
        # client, which would be one round trip per problem found.
        f = {**f,
             "craft_level": levels.get(f["technique"]),
             "lesson_id": lessons.RULE_TO_LESSON.get(f["rule"])}
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


def _bible_for(script_id, user_id) -> dict:
    """The story bible for a script the caller may write to, or {}.

    Loaded server-side from the id rather than accepted from the client: the
    bible is the writer's own material and the server already has it, so there
    is no reason to let a request carry a forged one.
    """
    if not script_id:
        return {}
    return _read_bible(require_script_access(script_id, user_id))


def _craft_for(query: str, genre: str, tone: str, scene_text: str = "") -> list:
    """Craft patterns to ground a generation, diagnosis first.

    Same order of preference as `/recommendations`, and for the same reason: if
    the linter can already name what is wrong with this scene, the technique
    that fixes it beats anything embedding distance will find. Only when nothing
    is flagged does this fall back to semantic search on the instruction.

    The craft library used to ground `generate_structure` alone — so it shaped
    the outline and then vanished at exactly the point the writer was actually
    writing.
    """
    patterns = []
    if scene_text:
        flags = linter.lint(scene_text)
        ranked = sorted(flags, key=lambda f: {"high": 0, "medium": 1, "low": 2}.get(f["severity"], 3))
        patterns = rag.get_patterns_by_technique([f["technique"] for f in ranked])[:2]

    if len(patterns) < 2:
        already = {p["technique"] for p in patterns}
        for p in script_engine.retrieve_relevant_patterns(genre, tone, query or "writing a scene", top_k=3):
            if p["technique"] not in already:
                patterns.append(p)
                already.add(p["technique"])
            if len(patterns) == 2:
                break
    return patterns


@router.post("/generate-scene")
def generate_scene(req: GenerateSceneRequest, user_id: str = Depends(require_paid_tier)):
    bible = _bible_for(req.script_id, user_id)
    patterns = _craft_for(req.scene_description, req.genre, req.tone)
    with ai_unavailable_as_503():
        text = script_engine.generate_scene(
            req.scene_description, req.genre, req.tone, req.language, req.character_names,
            bible=bible, patterns=patterns,
        )
    return {"scene_text": text}


def _sse(generator):
    """Wrap a text generator as Server-Sent Events.

    Errors are the awkward part. Once the first byte is out the status code is
    already 200, so a provider failure cannot become a 503 the way it does on
    every other route here — it has to arrive as a message the client
    understands. Hence an explicit `error` event rather than simply cutting the
    connection, which a browser cannot tell apart from a network drop.
    """
    def events():
        try:
            for piece in generator:
                if piece:
                    yield f"data: {json.dumps({'text': piece})}\n\n"
        except RuntimeError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: {\"done\": true}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        # Without this a proxy will happily buffer the whole stream and hand it
        # over in one piece, which is precisely the behaviour being removed.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/generate-scene/stream")
def generate_scene_stream(req: GenerateSceneRequest, user_id: str = Depends(require_paid_tier)):
    """The same scene as POST /generate-scene, arriving as it is written.

    A blocking call meant a writer asked for a scene and watched a spinner
    while two thousand tokens were composed somewhere else, then received all
    of it at once. This product's whole claim is keeping a writer in flow.
    """
    bible = _bible_for(req.script_id, user_id)
    patterns = _craft_for(req.scene_description, req.genre, req.tone)
    return _sse(script_engine.stream_scene(
        scene_description=req.scene_description, genre=req.genre, tone=req.tone,
        language=req.language, character_names=req.character_names,
        bible=bible, patterns=patterns,
    ))


@router.post("/improve")
def improve(req: ImproveSceneRequest, user_id: str = Depends(require_paid_tier)):
    bible = _bible_for(req.script_id, user_id)
    # The scene itself is the best source of what to fix, so lint it and let the
    # flagged technique lead. "Make this less on-the-nose" then arrives with the
    # craft entry that answers exactly that, worked example included.
    project = {}
    if req.script_id:
        script = require_script_access(req.script_id, user_id)
        project = get_project_by_id(script.get("project_id")) or {}
    patterns = _craft_for(
        req.instruction,
        project.get("genre") or "Drama",
        project.get("tone") or "Emotional",
        scene_text=req.scene_text,
    )
    with ai_unavailable_as_503():
        text = script_engine.improve_scene(
            req.scene_text, req.instruction, req.language, bible=bible, patterns=patterns,
        )
    return {"improved_text": text}


@router.post("/improve/stream")
def improve_stream(req: ImproveSceneRequest, user_id: str = Depends(require_paid_tier)):
    """The same rewrite as POST /improve, arriving as it is written.

    This one matters more than the scene stream, because the writer is watching
    their OWN words being replaced. Seeing the rewrite land line by line lets
    them stop it when it goes somewhere they did not want; a spinner followed by
    a wall of replaced text does not.
    """
    bible = _bible_for(req.script_id, user_id)
    project = {}
    if req.script_id:
        script = require_script_access(req.script_id, user_id)
        project = get_project_by_id(script.get("project_id")) or {}
    patterns = _craft_for(
        req.instruction,
        project.get("genre") or "Drama",
        project.get("tone") or "Emotional",
        scene_text=req.scene_text,
    )
    return _sse(script_engine.stream_improvement(
        scene_text=req.scene_text, instruction=req.instruction,
        language=req.language, bible=bible, patterns=patterns,
    ))


@router.post("/suggest")
def suggest(req: SuggestRequest, user_id: str = Depends(require_paid_tier)):
    with ai_unavailable_as_503():
        suggestions = script_engine.suggest_continuations(req.scene_text, req.genre, req.tone)
    return {"suggestions": suggestions}


@router.get("/project/{project_id}")
def get_script_for_project(project_id: str, user_id: str = Depends(get_current_user)):
    """Return the project's script, creating an empty one if none exists yet
    (lets the dashboard open any project directly in the editor)."""
    # Editor: this creates a row when none exists, which a viewer must not do.
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
    script = require_script_access(script_id, user_id, minimum=membership.VIEWER)
    # With sharing live, an unpublished screenplay can be opened by other
    # people and the writer had no way to find out. Owner reads are not events,
    # so this is silent for the person who wrote it.
    project_owner = (get_project_by_id(script.get("project_id")) or {}).get("user_id")
    audit.record(script_id, user_id, audit.OPENED, owner_id=project_owner)
    # Reconcile on load, not only on save. Sync ran on save, on storyboard and
    # on review — so a writer who opened a script they had typed by hand met an
    # empty scene index, a dead timeline and an empty corkboard, and the only
    # way to populate them was to make an edit. Everything downstream of the
    # scene rows was invisible until the draft was touched.
    scenes = scene_sync.sync_from_draft(script_id, script.get("content") or "")
    # Embed the parent project so the editor can title itself and drive AI
    # calls from the project's real genre/tone instead of guessing.
    project = get_project_by_id(script.get("project_id")) or {}
    return {
        **script,
        "scenes": scenes,
        # Parsed so the editor gets it in the same call that loads the draft —
        # the type-ahead needs character names before the first keystroke.
        "bible": _read_bible(script),
        "project": {
            "title": project.get("title"),
            "genre": project.get("genre"),
            "tone": project.get("tone"),
            "language": project.get("language"),
            "duration_minutes": project.get("duration_minutes"),
            # Without these the editor cannot tell a 90-minute feature from one
            # episode of a series, and every AI call it makes guesses.
            "target_audience": project.get("target_audience"),
            "format": project.get("format"),
            "episode_count": project.get("episode_count"),
            # Short-form runs on seconds and a chosen hook, not on minutes and
            # acts. Without these the editor cannot render its beat sheet.
            "duration_seconds": project.get("duration_seconds"),
            "hook_type": project.get("hook_type"),
            "short_form_category": project.get("short_form_category"),
        },
        # Pagination, so the editor can tell a writer where they are. Computed
        # with the same rule the PDF export lays out with, which is the only
        # reason "page 6" can mean one thing across the product.
        "pagination": {
            "page_lines": screenplay.PAGE_LINES,
            "page_count": screenplay.page_count(script.get("content") or ""),
        },
    }


def _read_bible(script: dict) -> dict:
    """Stored as a JSON string so the scripts table needs one nullable column
    rather than a migration per new field. Same shape as suggestions_json."""
    raw = script.get("bible_json")
    if not raw:
        return StoryBible().model_dump()
    try:
        return StoryBible(**json.loads(raw)).model_dump()
    except (TypeError, ValueError):
        # A malformed blob must not make the script unopenable.
        return StoryBible().model_dump()


@router.get("/{script_id}/bible")
def get_bible(script_id: str, user_id: str = Depends(get_current_user)):
    return _read_bible(require_script_access(script_id, user_id, minimum=membership.VIEWER))


@router.put("/{script_id}/bible")
def save_bible(script_id: str, bible: StoryBible, user_id: str = Depends(get_current_user)):
    """Save the story bible. Whole-object replace — the editor holds the full
    document, so a partial merge would silently drop fields it didn't send."""
    require_script_access(script_id, user_id)
    supabase.table("scripts").update(
        {"bible_json": json.dumps(bible.model_dump())}
    ).eq("id", script_id).execute()
    return bible.model_dump()


# One auto-save snapshot per window, rather than one per typing pause.
#
# The editor saves a few seconds after the last keystroke, and every save used
# to insert a version row holding the entire previous draft. A morning's writing
# therefore produced dozens of rows all labelled "Auto save" — so version
# history became unreadable exactly as it started to matter, and storage grew by
# a full copy of the script per pause. A window preserves the useful property
# (the state at the start of each window is recoverable) at a fraction of the
# rows.
AUTOSAVE_SNAPSHOT_WINDOW_SECONDS = int(os.getenv("AUTOSAVE_SNAPSHOT_WINDOW_SECONDS", "300"))
AUTOSAVE_LABEL = "Auto save"


def _age_seconds(created_at) -> float:
    """Seconds since an ISO timestamp.

    Handles both storage modes: the local store writes a naive local timestamp,
    real Supabase an aware one. Anything unparseable reads as ancient, so a
    surprise timestamp format costs an extra snapshot rather than silently
    dropping the writer's history.
    """
    if not created_at:
        return float("inf")
    try:
        ts = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
    except ValueError:
        return float("inf")
    now = datetime.now(timezone.utc) if ts.tzinfo else datetime.now()
    return (now - ts).total_seconds()


def _should_snapshot(script: dict, new_content: str) -> bool:
    """Whether this save deserves a version row."""
    previous = script.get("content") or ""
    if previous == (new_content or ""):
        return False  # nothing changed — the snapshot would record no edit
    if not previous.strip():
        return False  # first real save; the prior state is an empty page

    versions = get_versions_by_script(script["id"])
    if not versions:
        return True
    latest = versions[0]
    # A manual save or a restore is a real boundary in the writer's own terms,
    # so never coalesce across one.
    if latest.get("label") != AUTOSAVE_LABEL:
        return True
    return _age_seconds(latest.get("created_at")) >= AUTOSAVE_SNAPSHOT_WINDOW_SECONDS


@router.put("/{script_id}")
def save_script(script_id: str, data: ScriptSave, user_id: str = Depends(get_current_user)):
    script = require_script_access(script_id, user_id)

    if _should_snapshot(script, data.content):
        supabase.table("versions").insert({
            "script_id": script_id, "user_id": user_id,
            "content": script["content"], "label": AUTOSAVE_LABEL,
        }).execute()

    result = supabase.table("scripts").update({"content": data.content}).eq("id", script_id).execute()

    # Keep the scene rows in step with the page. The editor's index cards read
    # these rows while its jump-to-scene counts sluglines in the text, so left to
    # drift, clicking card 3 lands you in scene 4. Returned with the save so the
    # editor can refresh the cards without a second round trip.
    scenes = scene_sync.sync_from_draft(script_id, data.content or "")
    return {
        **result.data[0],
        "scenes": scenes,
        # The page count moves as the draft grows, so it rides back with the
        # save rather than making the editor ask again to redraw its rules.
        "pagination": {
            "page_lines": screenplay.PAGE_LINES,
            "page_count": screenplay.page_count(data.content or ""),
        },
    }


@router.post("/{script_id}/import")
async def import_script(
    script_id: str,
    file: UploadFile = File(...),
    replace: bool = True,
    user_id: str = Depends(get_current_user),
):
    """Bring an existing screenplay in from .fdx, Fountain, plain text or PDF.

    There was no way to do this at all, and it gated the things this product is
    actually good at: a writer arriving with a finished script had to retype it
    before the linter, the benchmark or the structural review would say a word
    about it.

    `replace` because that is what importing means to almost everyone. Appending
    is offered for the case of assembling a feature out of separately written
    sequences, which is a real workflow and a rare one.

    The previous draft is snapshotted first, unconditionally. Import is the most
    destructive action in the product — it overwrites everything — and the undo
    for it has to exist before the overwrite, not after somebody asks for it.
    """
    script = require_script_access(script_id, user_id)

    data = await file.read()
    try:
        imported = script_import.import_screenplay(file.filename or "", data)
    except script_import.ImportError_ as exc:
        # 422: the request was well-formed, the file was not usable. The message
        # is written for the writer, not for a log.
        raise HTTPException(status_code=422, detail=str(exc)) from None

    existing = script.get("content") or ""
    content = imported["content"] if replace else (existing + "\n\n" + imported["content"])

    if existing.strip():
        supabase.table("versions").insert({
            "script_id": script_id, "user_id": user_id,
            "content": existing, "label": "Before import",
        }).execute()

    result = supabase.table("scripts").update({"content": content}).eq("id", script_id).execute()
    scenes = scene_sync.sync_from_draft(script_id, content)

    # Replacing somebody else's draft is the loudest thing a collaborator can
    # do to a script, so it is logged even though the snapshot already exists.
    project_owner = (get_project_by_id(script.get("project_id")) or {}).get("user_id")
    audit.record(script_id, user_id, audit.IMPORTED, owner_id=project_owner)

    return {
        **result.data[0],
        "scenes": scenes,
        "imported": {
            "source": imported["source"],
            "scenes": imported["scenes"],
            "characters": imported["characters"],
            "replaced": bool(existing.strip()) and replace,
        },
        "pagination": {
            "page_lines": screenplay.PAGE_LINES,
            "page_count": screenplay.page_count(content),
        },
    }


@router.get("/{script_id}/coverage")
def script_coverage(script_id: str, user_id: str = Depends(get_current_user)):
    """The reader's report on a draft.

    Free on every tier and costs no AI call, because every number in it is
    measured rather than generated. That is what lets it run on a half-written
    draft and say the same thing twice about the same script.

    A viewer can read it — coverage is what you hand someone to get notes, and
    refusing it to the person giving the notes would be backwards.
    """
    script = require_script_access(script_id, user_id, minimum="viewer")
    text = script.get("content") or ""
    scenes = scene_sync.sync_from_draft(script_id, text)
    project = get_project_by_id(script.get("project_id")) or {}
    return coverage_report.coverage(text, scenes, project, _read_bible(script))


@router.get("/{script_id}/access")
def script_access_log(script_id: str, user_id: str = Depends(get_current_user)):
    """Who has been in this script.

    Admin only, and that is the whole point: a log of who read a draft is
    itself sensitive, and showing every collaborator who else has been looking
    would turn a safeguard into surveillance. The person entitled to it is the
    one whose work is being read.
    """
    require_script_access(script_id, user_id, minimum=membership.ADMIN)
    return {"entries": audit.history(script_id)}


def _review_for(script: dict) -> dict:
    """Run the pre-finalization checks against a script row."""
    scenes = scene_sync.sync_from_draft(script["id"], script.get("content") or "")
    project = get_project_by_id(script.get("project_id")) or {}
    return review.review(script.get("content") or "", scenes, project)


@router.get("/{script_id}/review")
def review_script(script_id: str, user_id: str = Depends(get_current_user)):
    """Timing, character-name consistency and act balance (proposal FR07).

    Deterministic and free, like `/lint` — so the editor can show it while the
    writer is still working rather than only at the moment they finalize.
    """
    return _review_for(require_script_access(script_id, user_id, minimum=membership.VIEWER))


@router.post("/{script_id}/finalize")
def finalize_script(script_id: str, user_id: str = Depends(get_current_user)):
    """Finalize, and return what the review found.

    FR07 puts a review "before finalization". It does not block: a writer may
    finalize a script this tool disagrees with. What it must not do is let them
    do it without being told — which is what happened for as long as
    `review_script()` sat in `script_engine` wired to nothing.
    """
    script = require_script_access(script_id, user_id)
    verdict = _review_for(script)
    result = supabase.table("scripts").update({"status": "finalized"}).eq("id", script_id).execute()
    return {**result.data[0], "review": verdict}
