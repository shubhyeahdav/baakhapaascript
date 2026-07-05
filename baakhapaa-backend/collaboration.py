from fastapi import APIRouter, HTTPException, Depends
from models import CommentCreate
from database import supabase
from auth import get_current_user

router = APIRouter(prefix="/collaboration", tags=["collaboration"])


@router.post("/comments")
def add_comment(comment: CommentCreate, user_id: str = Depends(get_current_user)):
    result = supabase.table("comments").insert({
        "script_id": comment.script_id, "user_id": user_id,
        "content": comment.content, "line_number": comment.line_number,
    }).execute()
    return result.data[0]


@router.get("/comments/{script_id}")
def get_comments(script_id: str, user_id: str = Depends(get_current_user)):
    result = supabase.table("comments").select("*").eq("script_id", script_id).execute()
    return result.data


@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: str, user_id: str = Depends(get_current_user)):
    comment = supabase.table("comments").select("*").eq("id", comment_id).execute()
    if not comment.data or comment.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Cannot delete this comment")
    supabase.table("comments").delete().eq("id", comment_id).execute()
    return {"success": True}
