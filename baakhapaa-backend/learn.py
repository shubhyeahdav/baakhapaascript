"""Learning module endpoints.

Progress lives in the user's `preferences_json` blob rather than a new table:
it is a list of completed lesson ids, it is small, and it is read on every
`/auth/me` anyway. A migration for fourteen booleans would not earn itself.
"""
import json

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from database import supabase, get_user_by_id
from models import LessonSubmission
import lessons

router = APIRouter(prefix="/learn", tags=["learn"])

PROGRESS_KEY = "completed_lessons"


def _progress(user_id: str) -> list:
    user = get_user_by_id(user_id) or {}
    try:
        prefs = json.loads(user.get("preferences_json") or "{}")
    except (TypeError, ValueError):
        prefs = {}
    done = prefs.get(PROGRESS_KEY)
    return done if isinstance(done, list) else []


def _save_progress(user_id: str, completed: list):
    user = get_user_by_id(user_id) or {}
    try:
        prefs = json.loads(user.get("preferences_json") or "{}")
    except (TypeError, ValueError):
        prefs = {}
    prefs[PROGRESS_KEY] = completed
    supabase.table("users").update(
        {"preferences_json": json.dumps(prefs)}
    ).eq("id", user_id).execute()


@router.get("/lessons")
def list_lessons(user_id: str = Depends(get_current_user)):
    """The whole curriculum plus this user's progress. Free on every tier —
    the exercises are graded by the linter, which costs nothing to run."""
    done = _progress(user_id)
    items = lessons.curriculum(done)
    return {
        "lessons": items,
        "completed": done,
        "total": len(items),
        "modules": list(dict.fromkeys(l["module"] for l in items)),
    }


@router.get("/lessons/{lesson_id}")
def get_lesson(lesson_id: str, user_id: str = Depends(get_current_user)):
    lesson = lessons.LESSONS_BY_ID.get(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lessons.public_lesson(lesson, _progress(user_id))


@router.post("/lessons/{lesson_id}/submit")
def submit_lesson(lesson_id: str, body: LessonSubmission,
                  user_id: str = Depends(get_current_user)):
    """Grade a submission with the craft linter.

    Deterministic on purpose: the same submission always gets the same verdict,
    and the verdict is about the writing rather than about clicking Next.
    """
    result = lessons.grade(lesson_id, body.content)
    if result is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    if result["passed"]:
        done = _progress(user_id)
        if lesson_id not in done:
            done.append(lesson_id)
            _save_progress(user_id, done)
        result["completed_count"] = len(done)

    return result


@router.get("/for-rule/{rule}")
def lesson_for_rule(rule: str, user_id: str = Depends(get_current_user)):
    """Which lesson teaches the fix for a linter rule.

    Lets a flag in the editor offer "learn this" instead of only naming the
    technique — the flag becomes an entry point to the course rather than a
    dead end.
    """
    lesson_id = lessons.RULE_TO_LESSON.get(rule)
    if not lesson_id:
        raise HTTPException(status_code=404, detail="No lesson covers that rule")
    return lessons.public_lesson(lessons.LESSONS_BY_ID[lesson_id], _progress(user_id))
