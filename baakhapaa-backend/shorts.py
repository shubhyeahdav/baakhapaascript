"""Short-form outliers and results (Month 4, Days 9 and 10).

Two things a creator brings to a short, both kept as NUMBERS ONLY:

  * an OUTLIER — somebody else's video that beat its own channel. Pasted as a
    transcript, measured by `outlier.py`, and shown beside the draft.
  * a RESULT — what the creator's own short did after posting, stored against
    the shape of the draft that produced it. This is the loop no course can
    imitate: a course cannot see what happened after you posted.

THE RULE, same as `outlier.py` and the screenplay corpus: no transcript text
and no draft text reaches a row. Not the hook, not a sample line. The video is
kept as a platform and an id — enough to recognise it, nothing that is anyone's
creative work. `tests/test_shorts.py` reads every stored row and fails if a
phrase of the transcript or the draft is in it.

Both kinds live in one table, `short_measurements`, which needs the migration
in `supabase_schema.sql` on a real database. A write that fails says so with a
503; it never touches the draft, which none of these routes read-modify-write.
"""
import re
import statistics
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import outlier
import rhythm
import videoscript
from auth import get_current_user, require_script_access

router = APIRouter(prefix="/shorts", tags=["shorts"])

TABLE = "short_measurements"

# The floor below which a comparison says NOTHING. Decided, not tuned: five
# results on each side of a split is the least at which a median is more than
# one video's luck, and it is still small — so even above it the panel shows
# the sample size beside every number and calls it a comparison, not a
# finding. Raise it before lowering it.
MIN_PER_GROUP = 5

# The fixed sentence for a measurement that could not be made. A constant, so
# a failure can never carry a fragment of what was pasted back into a row.
MISSING_NO_TIMINGS = "The transcript carried no timings, so nothing was measured."

# Measured keys, in a fixed order, so a failed measurement has the same shape
# as a successful one with every value None.
MEASURE_KEYS = tuple(outlier.measure([], 0).keys())


# --- what a video is, without its words -------------------------------------

_REFS = (
    ("youtube", re.compile(r"(?:youtube\.com/(?:shorts/|watch\?v=|embed/)|youtu\.be/)([\w-]{6,})")),
    ("tiktok", re.compile(r"tiktok\.com/@[\w.]+/video/(\d+)")),
    ("instagram", re.compile(r"instagram\.com/(?:reel|reels|p)/([\w-]+)")),
    ("facebook", re.compile(r"facebook\.com/(?:reel|watch/\?v=)/?(\d+)")),
)


def video_ref(url: str) -> dict:
    """Platform and id from a pasted URL. Unknown hosts keep no id at all
    rather than the URL, which could carry a title in its slug."""
    for platform, rx in _REFS:
        m = rx.search(url or "")
        if m:
            return {"platform": platform, "video_id": m.group(1)}
    return {"platform": "other" if (url or "").strip() else None, "video_id": None}


# --- requests ----------------------------------------------------------------

class OutlierRequest(BaseModel):
    url: str = Field("", max_length=500)
    # Measured and discarded. Never stored, never echoed.
    transcript: str = Field("", max_length=60_000)
    duration_seconds: Optional[float] = Field(None, ge=0, le=60 * 60)
    views: Optional[int] = Field(None, ge=0)
    channel_median_views: Optional[float] = Field(None, ge=0)


class ResultRequest(BaseModel):
    url: str = Field("", max_length=500)
    views: int = Field(..., ge=0)
    channel_median_views: Optional[float] = Field(None, ge=0)
    # As the platform reports it: average percentage viewed.
    retention_percent: Optional[float] = Field(None, ge=0, le=100)


# --- storage -----------------------------------------------------------------

def _store(row: dict) -> dict:
    from database import supabase
    try:
        return supabase.table(TABLE).insert(row).execute().data[0]
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail="Measured, but it could not be saved. Your draft is untouched. "
                   f"({type(e).__name__})",
        ) from e


def _rows(**eq) -> list:
    from database import supabase
    try:
        q = supabase.table(TABLE).select("*")
        for k, v in eq.items():
            q = q.eq(k, v)
        return q.execute().data or []
    except Exception:
        # Reading history is never worth an error page: an empty list is the
        # honest answer to "what can be shown".
        return []


def _now():
    return datetime.now(timezone.utc).isoformat()


# --- Day 9: paste an outlier ------------------------------------------------

@router.post("/{script_id}/outliers")
def add_outlier(script_id: str, req: OutlierRequest, user_id: str = Depends(get_current_user)):
    """Measure a pasted outlier and keep its numbers beside this draft.

    A transcript with no timings is not an error: the row is written with the
    SAME keys, every value None, and a fixed reason — so the panel can say a
    measurement is missing instead of showing a zero, and nothing downstream
    has to handle a second shape.
    """
    require_script_access(script_id, user_id)
    segments = outlier.parse_transcript(req.transcript, req.duration_seconds)
    duration = req.duration_seconds or (segments[-1].end if segments else None)
    if segments:
        measured = outlier.measure(segments, duration or 0, req.views, req.channel_median_views)
        status, reason = "measured", None
    else:
        measured = dict.fromkeys(MEASURE_KEYS)
        # A ratio needs no transcript; keep it if the creator gave the numbers.
        measured["outlier_ratio"] = outlier.outlier_ratio(req.views, req.channel_median_views)
        status, reason = "missing", MISSING_NO_TIMINGS
    row = {
        "user_id": user_id, "script_id": script_id, "kind": "outlier",
        **video_ref(req.url),
        "numbers": {"status": status, "reason": reason, **measured},
        "created_at": _now(),
    }
    return _store(row)


@router.get("/{script_id}/outliers")
def list_outliers(script_id: str, user_id: str = Depends(get_current_user)):
    require_script_access(script_id, user_id, minimum="viewer")
    rows = [r for r in _rows(script_id=script_id) if r.get("kind") == "outlier"]
    return {"outliers": sorted(rows, key=lambda r: r.get("created_at") or "", reverse=True)}


# --- Day 10: the loop that compounds ----------------------------------------

def _hook_shape(content: str, language: Optional[str]) -> dict:
    """The draft's opening, as numbers, at the moment the result is logged."""
    m = rhythm.meter(content or "", videoscript.wpm_for(language))
    devices = m.get("attention_devices") or []
    return {
        "opens_on_question": m.get("opens_on_question"),
        "sentence_length_sigma": m.get("sentence_length_sigma"),
        "first_device_seconds": devices[0] if devices else None,
        "estimated_seconds": m.get("estimated_seconds"),
        "word_count": m.get("word_count"),
    }


@router.post("/{script_id}/results")
def add_result(script_id: str, req: ResultRequest, user_id: str = Depends(get_current_user)):
    """Log what a posted short did, against the draft that produced it."""
    from database import get_project_by_id

    script = require_script_access(script_id, user_id)
    project = get_project_by_id(script.get("project_id")) or {}
    row = {
        "user_id": user_id, "script_id": script_id, "kind": "result",
        **video_ref(req.url),
        "numbers": {
            "views": req.views,
            "channel_median_views": req.channel_median_views,
            "outlier_ratio": outlier.outlier_ratio(req.views, req.channel_median_views),
            "retention_percent": req.retention_percent,
            "hook": _hook_shape(script.get("content"), project.get("language")),
        },
        "created_at": _now(),
    }
    return _store(row)


# Each split is a yes/no question about the hook, answered from the stored
# shape. Named so the panel can say what was compared.
SPLITS = (
    ("opens_on_question", "Opens on a question",
     lambda h: h.get("opens_on_question")),
    ("rehooks_by_8s", "Turns or asks again within 8 seconds",
     lambda h: None if h.get("estimated_seconds") is None
     else (h.get("first_device_seconds") is not None and h["first_device_seconds"] <= 8)),
)


def compare(results: list) -> dict:
    """Hook shape against outcome, across one creator's own results.

    Outcome is the outlier ratio — views against their own channel median —
    because raw views would mostly measure which week they posted. A result
    with no median is counted but cannot enter a comparison.

    Below MIN_PER_GROUP on either side, a split is not reported AT ALL: no
    number, no "early signs", no hint. When it is reported, both sample sizes
    travel with it, always.
    """
    usable = [r["numbers"] for r in results
              if (r.get("numbers") or {}).get("outlier_ratio") is not None]
    comparisons = []
    for key, label, test in SPLITS:
        yes = [n["outlier_ratio"] for n in usable if test(n.get("hook") or {}) is True]
        no = [n["outlier_ratio"] for n in usable if test(n.get("hook") or {}) is False]
        if len(yes) < MIN_PER_GROUP or len(no) < MIN_PER_GROUP:
            continue
        comparisons.append({
            "split": key, "label": label,
            "with": {"n": len(yes), "median_ratio": round(statistics.median(yes), 2)},
            "without": {"n": len(no), "median_ratio": round(statistics.median(no), 2)},
        })
    return {
        "results_logged": len(results),
        "results_comparable": len(usable),
        "min_per_group": MIN_PER_GROUP,
        "comparisons": comparisons,
    }


@router.get("/results")
def my_results(user_id: str = Depends(get_current_user)):
    """Every result this creator has logged, and what can honestly be said
    about them — which, below the floor, is nothing."""
    rows = [r for r in _rows(user_id=user_id) if r.get("kind") == "result"]
    return compare(rows)
