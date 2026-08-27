from fastapi import APIRouter, HTTPException, Depends
from models import ProjectCreate, MemberCreate, MemberRoleUpdate
from database import supabase, purge_projects
import invites
import membership
from auth import get_current_user, is_paid_tier, require_project_access
from updates import apply_whitelist

router = APIRouter(prefix="/projects", tags=["projects"])

# Free plan allowance.
#
# Raised from 1 to 3 on 2026-08-26, because 1 collided with the product's own
# course. The course ends by asking the writer to produce a complete short — so
# a free account that finished it had spent its entire allowance and could
# never start the thing it had just been taught to write. That is the moment a
# writer is most persuaded and least able to act, which is the worst possible
# place to put a wall.
#
# Three is deliberate rather than generous: a finished script, a work in
# progress, and somewhere to try something. Still obviously bounded against
# Pro's unlimited.
FREE_PROJECT_LIMIT = 3


def enforce_project_limit(user_id: str):
    """Block a free user from creating more than FREE_PROJECT_LIMIT projects.
    402 rather than 403: the request is well-formed and the fix is to upgrade."""
    if is_paid_tier(user_id):
        return
    existing = supabase.table("projects").select("*").eq("user_id", user_id).execute()
    if len(existing.data or []) >= FREE_PROJECT_LIMIT:
        raise HTTPException(
            status_code=402,
            detail=(
                f"The free plan includes {FREE_PROJECT_LIMIT} active projects. "
                "Upgrade at /pricing to create more."
            ),
        )


@router.post("/")
def create_project(project: ProjectCreate, user_id: str = Depends(get_current_user)):
    enforce_project_limit(user_id)
    result = supabase.table("projects").insert({
        "user_id": user_id,
        "title": project.title,
        "genre": project.genre,
        "tone": project.tone,
        "language": project.language,
        "duration_minutes": project.duration_minutes,
        # Previously dropped on the floor: both were accepted by the request
        # model and whitelisted for update, but never written on create.
        "target_audience": project.target_audience,
        "format": project.format,
        "episode_count": project.episode_count,
        "duration_seconds": project.duration_seconds,
        "hook_type": project.hook_type,
        "short_form_category": project.short_form_category,
        "status": "draft",
    }).execute()
    return result.data[0]


@router.get("/")
def list_projects(user_id: str = Depends(get_current_user)):
    """Projects the caller owns, plus every project shared with them.

    Each carries `your_role`, so the dashboard can show a viewer a read-only
    tile instead of controls that will 403 when pressed.
    """
    owned = (
        supabase.table("projects")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    ).data or []
    projects = [{**p, "your_role": membership.ADMIN, "owner": True} for p in owned]

    seen = {p["id"] for p in owned}
    memberships = (
        supabase.table("project_members").select("*").eq("user_id", user_id).execute()
    ).data or []
    for row in memberships:
        if row.get("project_id") in seen:
            continue
        shared = supabase.table("projects").select("*").eq("id", row["project_id"]).execute().data
        if shared:
            projects.append({**shared[0], "your_role": row.get("role"), "owner": False})

    return sorted(projects, key=lambda p: p.get("created_at") or "", reverse=True)


@router.get("/{project_id}")
def get_project(project_id: str, user_id: str = Depends(get_current_user)):
    project = require_project_access(project_id, user_id, minimum=membership.VIEWER)
    return {**project, "your_role": membership.role_for(project, user_id)}


# Only these project fields may be changed from the client (never id/user_id)
PROJECT_UPDATE_FIELDS = {
    "title", "genre", "tone", "language", "duration_minutes", "status",
    "target_audience", "format", "episode_count",
    "duration_seconds", "hook_type", "short_form_category",
}


@router.put("/{project_id}")
def update_project(project_id: str, updates: dict, user_id: str = Depends(get_current_user)):
    require_project_access(project_id, user_id)
    safe_updates = apply_whitelist(updates, PROJECT_UPDATE_FIELDS)
    result = supabase.table("projects").update(safe_updates).eq("id", project_id).execute()
    return result.data[0]


@router.delete("/{project_id}")
def delete_project(project_id: str, user_id: str = Depends(get_current_user)):
    # Admin only: deleting takes the script, scenes, board and history with it.
    require_project_access(project_id, user_id, minimum=membership.ADMIN)
    # Delete the CONTENT, not just the row. Postgres cascades via the schema's
    # foreign keys; the local mock has no relationships, so deleting only the
    # project row left the whole script and every version snapshot behind.
    removed = purge_projects([project_id])
    return {"success": True, "removed": removed}


# --- members (FR12) ---------------------------------------------------------
#
# Roles only mean something once a project can be shared, so these routes are
# the other half of `membership.py`. Reading the member list needs viewer —
# knowing who else is on a script you are working on is not privileged — while
# every change to it needs admin.


@router.get("/{project_id}/members")
def list_members(project_id: str, user_id: str = Depends(get_current_user)):
    project = require_project_access(project_id, user_id, minimum=membership.VIEWER)
    return {
        "members": membership.list_members(project),
        "your_role": membership.role_for(project, user_id),
        "roles": list(membership.ROLES),
    }


@router.post("/{project_id}/members")
def add_member(project_id: str, req: MemberCreate, user_id: str = Depends(get_current_user)):
    project = require_project_access(project_id, user_id, minimum=membership.ADMIN)
    return membership.add_member(project, req.email, req.role)


@router.put("/{project_id}/members/{member_user_id}")
def set_member_role(project_id: str, member_user_id: str, req: MemberRoleUpdate,
                    user_id: str = Depends(get_current_user)):
    project = require_project_access(project_id, user_id, minimum=membership.ADMIN)
    return membership.set_role(project, member_user_id, req.role)


@router.get("/{project_id}/invites")
def list_invites(project_id: str, user_id: str = Depends(get_current_user)):
    """Invitations sent to people who have not registered yet.

    Viewer-readable, like the member list: knowing who else has been asked onto
    a script you are working on is not privileged.
    """
    require_project_access(project_id, user_id, minimum=membership.VIEWER)
    return {"invites": [
        {k: v for k, v in i.items() if k != "invited_by"}
        for i in invites.pending_for_project(project_id)
    ]}


@router.delete("/{project_id}/invites/{invite_id}")
def revoke_invite(project_id: str, invite_id: str,
                  user_id: str = Depends(get_current_user)):
    require_project_access(project_id, user_id, minimum=membership.ADMIN)
    invites.revoke(project_id, invite_id)
    return {"success": True}


@router.delete("/{project_id}/members/{member_user_id}")
def remove_member(project_id: str, member_user_id: str,
                  user_id: str = Depends(get_current_user)):
    project = require_project_access(project_id, user_id, minimum=membership.ADMIN)
    membership.remove_member(project, member_user_id)
    return {"success": True}
