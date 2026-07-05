from fastapi import APIRouter, HTTPException, Depends
from database import supabase, get_versions_by_script
from auth import get_current_user

router = APIRouter(prefix="/versions", tags=["versions"])


@router.post("/")
def save_version(script_id: str, content: str, label: str = "Manual save", user_id: str = Depends(get_current_user)):
    result = supabase.table("versions").insert({
        "script_id": script_id, "user_id": user_id, "content": content, "label": label,
    }).execute()
    return result.data[0]


@router.get("/{script_id}")
def get_versions(script_id: str, user_id: str = Depends(get_current_user)):
    return get_versions_by_script(script_id)


@router.post("/{version_id}/restore")
def restore_version(version_id: str, user_id: str = Depends(get_current_user)):
    version = supabase.table("versions").select("*").eq("id", version_id).execute()
    if not version.data:
        raise HTTPException(status_code=404, detail="Version not found")
    v = version.data[0]
    result = supabase.table("scripts").update({"content": v["content"]}).eq("id", v["script_id"]).execute()
    return result.data[0]


@router.get("/diff/compare")
def get_diff(version_id_a: str, version_id_b: str, user_id: str = Depends(get_current_user)):
    va = supabase.table("versions").select("*").eq("id", version_id_a).execute().data[0]
    vb = supabase.table("versions").select("*").eq("id", version_id_b).execute().data[0]
    lines_a = set(va["content"].split("\n"))
    lines_b = set(vb["content"].split("\n"))
    return {
        "added": list(lines_b - lines_a),
        "removed": list(lines_a - lines_b),
        "summary": f"{len(lines_b - lines_a)} lines added, {len(lines_a - lines_b)} lines removed",
    }
