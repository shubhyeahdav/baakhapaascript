from fastapi import APIRouter, HTTPException, Depends
from models import CommentCreate
from database import supabase, get_user_by_id
import membership
from auth import get_current_user, require_script_access

router = APIRouter(prefix="/collaboration", tags=["collaboration"])


@router.post("/comments")
def add_comment(comment: CommentCreate, user_id: str = Depends(get_current_user)):
    """Leave a note on a script.

    Viewer is enough, and deliberately so: giving notes is the whole reason a
    reader is on someone else's script. A commenting role that cannot comment
    would make the viewer role useless for the one job it exists for.
    """
    require_script_access(comment.script_id, user_id, minimum=membership.VIEWER)
    result = supabase.table("comments").insert({
        "script_id": comment.script_id, "user_id": user_id,
        "content": comment.content, "line_number": comment.line_number,
    }).execute()
    return _with_author(result.data[0])


def _with_author(comment: dict) -> dict:
    """Attach who wrote it.

    Comments only ever carried a `user_id`, so a shared script showed several
    people's notes with no way to tell whose was whose — which is most of what
    makes notes usable.
    """
    author = get_user_by_id(comment.get("user_id")) or {}
    return {**comment, "author_name": author.get("name"), "author_email": author.get("email")}


@router.get("/comments/{script_id}")
def get_comments(script_id: str, user_id: str = Depends(get_current_user)):
    require_script_access(script_id, user_id, minimum=membership.VIEWER)
    result = supabase.table("comments").select("*").eq("script_id", script_id).execute()
    comments = [_with_author(c) for c in result.data]
    # Oldest first, and un-anchored notes last: a thread reads in the order it
    # was written, but notes pinned to a line read in page order.
    return sorted(comments, key=lambda c: (c.get("line_number") or 10**9, c.get("created_at") or ""))


@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: str, user_id: str = Depends(get_current_user)):
    """Delete your own comment, or any comment if you administer the project."""
    comment = supabase.table("comments").select("*").eq("id", comment_id).execute()
    if not comment.data:
        raise HTTPException(status_code=404, detail="Comment not found")

    row = comment.data[0]
    if row["user_id"] != user_id:
        # Not yours: only a project admin may clear someone else's note, and
        # require_script_access raises 404/403 for anyone without that standing.
        require_script_access(row["script_id"], user_id, minimum=membership.ADMIN)

    supabase.table("comments").delete().eq("id", comment_id).execute()
    return {"success": True}
