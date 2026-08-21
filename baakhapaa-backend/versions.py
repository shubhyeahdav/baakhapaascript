import difflib

from fastapi import APIRouter, HTTPException, Depends
from database import supabase, get_versions_by_script
import membership
from auth import get_current_user, require_script_access

router = APIRouter(prefix="/versions", tags=["versions"])


@router.post("/")
def save_version(script_id: str, content: str, label: str = "Manual save", user_id: str = Depends(get_current_user)):
    require_script_access(script_id, user_id)
    result = supabase.table("versions").insert({
        "script_id": script_id, "user_id": user_id, "content": content, "label": label,
    }).execute()
    return result.data[0]


@router.get("/{script_id}")
def get_versions(script_id: str, user_id: str = Depends(get_current_user)):
    require_script_access(script_id, user_id, minimum=membership.VIEWER)
    return get_versions_by_script(script_id)


@router.post("/{version_id}/restore")
def restore_version(version_id: str, user_id: str = Depends(get_current_user)):
    version = supabase.table("versions").select("*").eq("id", version_id).execute()
    if not version.data:
        raise HTTPException(status_code=404, detail="Version not found")
    v = version.data[0]
    require_script_access(v["script_id"], user_id)
    result = supabase.table("scripts").update({"content": v["content"]}).eq("id", v["script_id"]).execute()
    return result.data[0]


# Lines of unchanged context kept either side of a change, so a hunk reads as
# part of a scene rather than as a floating fragment.
DIFF_CONTEXT = 2


def _diff_hunks(before: str, after: str) -> list:
    """An ordered, line-by-line diff, grouped into hunks with context.

    The previous implementation compared two **sets** of lines. On a screenplay
    that is close to useless: blank lines and repeated character cues collapse to
    one entry, a line moved from act 1 to act 3 shows as no change at all because
    it is present in both sets, and nothing has a line number. `difflib` gives
    position, order and duplicates — the things a writer is actually looking for
    when they ask what changed.
    """
    a = (before or "").split("\n")
    b = (after or "").split("\n")
    matcher = difflib.SequenceMatcher(None, a, b, autojunk=False)

    rows = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            rows.extend(
                {"type": "equal", "line": j + 1, "text": b[j]} for j in range(j1, j2)
            )
        else:
            if tag in ("replace", "delete"):
                rows.extend(
                    {"type": "remove", "line": i + 1, "text": a[i]} for i in range(i1, i2)
                )
            if tag in ("replace", "insert"):
                rows.extend(
                    {"type": "add", "line": j + 1, "text": b[j]} for j in range(j1, j2)
                )

    changed = [i for i, r in enumerate(rows) if r["type"] != "equal"]
    if not changed:
        return []

    # Group changes that sit within twice the context of each other, so adjacent
    # edits read as one hunk instead of several nearly-identical ones.
    keep = set()
    for i in changed:
        keep.update(range(max(0, i - DIFF_CONTEXT), min(len(rows), i + DIFF_CONTEXT + 1)))

    hunks, current, previous = [], [], None
    for i in sorted(keep):
        if previous is not None and i > previous + 1:
            hunks.append(current)
            current = []
        current.append(rows[i])
        previous = i
    if current:
        hunks.append(current)
    return hunks


@router.get("/diff/compare")
def get_diff(version_id_a: str, version_id_b: str, user_id: str = Depends(get_current_user)):
    """Compare two snapshots of the same script (proposal FR11).

    `a` is the older side. Both must belong to the same script — comparing across
    scripts would be a way to read a line of someone else's draft through a
    version id, and it is meaningless anyway.
    """
    ra = supabase.table("versions").select("*").eq("id", version_id_a).execute()
    rb = supabase.table("versions").select("*").eq("id", version_id_b).execute()
    if not ra.data or not rb.data:
        raise HTTPException(status_code=404, detail="Version not found")

    va, vb = ra.data[0], rb.data[0]
    if va["script_id"] != vb["script_id"]:
        raise HTTPException(status_code=400, detail="Those versions belong to different scripts.")

    require_script_access(va["script_id"], user_id, minimum=membership.VIEWER)

    hunks = _diff_hunks(va["content"] or "", vb["content"] or "")
    added = sum(1 for h in hunks for r in h if r["type"] == "add")
    removed = sum(1 for h in hunks for r in h if r["type"] == "remove")

    return {
        "hunks": hunks,
        "added": added,
        "removed": removed,
        "summary": (
            "No changes between these versions."
            if not hunks else
            f"{added} line{'s' if added != 1 else ''} added, "
            f"{removed} removed, across {len(hunks)} place{'s' if len(hunks) != 1 else ''}."
        ),
    }
