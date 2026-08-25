"""Who has read this script.

Sharing, roles and per-project membership all work, which means a writer's
unpublished screenplay can now be opened by other people — and there was no way
for them to find out that it had been. "Who read my draft" had no answer.

The design question is what to record, because the obvious answer ruins it.
Logging every request writes an entry per autosave, and a page of the owner's
own saves is not a log anyone will read twice; the one interesting line drowns.
So this records only the events that answer the actual question:

  opened     somebody loaded the script
  exported   somebody took a copy out of the product
  imported   somebody replaced the draft

and only when the actor is **not** the project owner, because the owner reading
their own work is not an event. Entries are coalesced per person per action, so
a collaborator with the script open in a tab all afternoon is one line, not
forty. That coalescing is what makes the log readable, and readability is the
whole feature — an audit trail nobody opens has audited nothing.

The log is itself personal data. It holds who and when, never what: no draft
text, no scene names, nothing about the content of the visit. And it is deleted
with the project it belongs to, so erasing a project does not leave behind a
record of who used to look at it.
"""
import datetime
import os

from database import supabase

# Repeat visits inside this window are one entry. An hour is long enough that a
# working session collapses to a line and short enough that coming back the
# next morning shows as a separate visit.
ACCESS_LOG_WINDOW_SECONDS = int(os.getenv("ACCESS_LOG_WINDOW_SECONDS", "3600"))

OPENED, EXPORTED, IMPORTED = "opened", "exported", "imported"

# How many entries a script keeps. Beyond this the oldest go: this is a "who
# has been in here lately" record, not an archive, and an unbounded log on a
# shared script grows without anyone choosing it.
MAX_ENTRIES_PER_SCRIPT = 200


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _parse(value):
    try:
        return datetime.datetime.fromisoformat((value or "").replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def record(script_id: str, user_id: str, action: str, owner_id: str = "") -> bool:
    """Note that `user_id` did `action` to `script_id`. Returns whether it wrote.

    Never raises. An audit entry failing to save must not be the thing that
    stops a writer opening their script — the log is there to inform, and
    breaking the product to protect it would be the wrong trade.
    """
    if not script_id or not user_id or action not in (OPENED, EXPORTED, IMPORTED):
        return False
    # The owner reading their own work is not an event.
    if owner_id and user_id == owner_id:
        return False

    try:
        recent = supabase.table("access_log").select("*").eq(
            "script_id", script_id
        ).execute().data or []

        cutoff = _now() - datetime.timedelta(seconds=ACCESS_LOG_WINDOW_SECONDS)
        for row in recent:
            if row.get("user_id") != user_id or row.get("action") != action:
                continue
            at = _parse(row.get("created_at"))
            if at and at > cutoff:
                # Already logged this person doing this thing recently. Bump the
                # time rather than adding a line, so the entry reads as "last
                # seen" instead of the log filling with one afternoon.
                supabase.table("access_log").update(
                    {"created_at": _now().isoformat()}
                ).eq("id", row["id"]).execute()
                return False

        supabase.table("access_log").insert({
            "script_id": script_id,
            "user_id": user_id,
            "action": action,
            "created_at": _now().isoformat(),
        }).execute()

        _trim(script_id)
        return True
    except Exception:
        return False


def _trim(script_id: str) -> None:
    rows = supabase.table("access_log").select("*").eq(
        "script_id", script_id
    ).execute().data or []
    if len(rows) <= MAX_ENTRIES_PER_SCRIPT:
        return
    oldest = sorted(rows, key=lambda r: r.get("created_at") or "")[: len(rows) - MAX_ENTRIES_PER_SCRIPT]
    for row in oldest:
        supabase.table("access_log").delete().eq("id", row["id"]).execute()


def history(script_id: str) -> list:
    """Who has been in this script, most recent first.

    Names are resolved here rather than stored on the row: a log holding a copy
    of somebody's name would go stale the moment they changed it, and would be
    a second place their personal data lives.
    """
    rows = supabase.table("access_log").select("*").eq(
        "script_id", script_id
    ).execute().data or []
    if not rows:
        return []

    users = supabase.table("users").select("*").in_(
        "id", list({r.get("user_id") for r in rows if r.get("user_id")})
    ).execute().data or []
    by_id = {u["id"]: u for u in users}

    out = []
    for row in sorted(rows, key=lambda r: r.get("created_at") or "", reverse=True):
        user = by_id.get(row.get("user_id")) or {}
        out.append({
            "action": row.get("action"),
            "at": row.get("created_at"),
            "name": user.get("name") or "Someone",
            "email": user.get("email") or "",
        })
    return out
