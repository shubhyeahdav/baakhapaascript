"""Project membership and roles (proposal FR12).

FR12 asks for "Admin, Editor, and Viewer roles with defined permissions across
all system features". What existed was a `role` column on `users`, written as
`"editor"` for every account at registration and read by nothing — while the nav
bar linked to a Team tab that said invites were not available.

Roles are meaningless without something to share, so this adds the missing half:
a project has members, and a member has a role on that project.

    admin   the owner, plus anyone they promote. Everything an editor can do,
            plus managing members and deleting the project.
    editor  writes: the draft, scenes, structure, storyboards, exports.
    viewer  reads. Can open a project and read the script, comments and board,
            and cannot change any of it.

Deliberately per-project rather than global: a person is usually a writer on
their own work and a reader on someone else's, and one global role cannot say
that. It also keeps the existing ownership model intact — `projects.user_id` is
still the owner, and the owner is always an admin without needing a row.
"""
from fastapi import HTTPException

ADMIN, EDITOR, VIEWER = "admin", "editor", "viewer"
ROLES = (ADMIN, EDITOR, VIEWER)

# Higher number = more permission. Comparing ranks keeps every check a single
# `>=` instead of a set of role names repeated at each call site.
_RANK = {VIEWER: 1, EDITOR: 2, ADMIN: 3}


def rank(role: str) -> int:
    return _RANK.get((role or "").lower(), 0)


def _members_table():
    from database import supabase
    return supabase.table("project_members")


def get_membership(project_id: str, user_id: str) -> dict | None:
    rows = _members_table().select("*").eq("project_id", project_id).eq(
        "user_id", user_id
    ).execute().data
    return rows[0] if rows else None


def role_for(project: dict, user_id: str) -> str | None:
    """The caller's role on a project, or None if they have no access at all.

    The owner is an admin by definition. Making that implicit rather than
    seeding a row means existing projects — every project created before this
    module existed — keep working with no migration of data.
    """
    if not project:
        return None
    if project.get("user_id") == user_id:
        return ADMIN
    membership = get_membership(project["id"], user_id)
    return (membership or {}).get("role")


def require_role(project: dict, user_id: str, minimum: str) -> str:
    """Authorise an action on a project, or raise.

    404 for no access at all, matching `require_project_access`: a 403 would
    confirm the project exists to someone probing ids. 403 for a real member who
    simply lacks the rank — they already know it exists, and a 404 there would
    read as data loss.
    """
    role = role_for(project, user_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if rank(role) < rank(minimum):
        raise HTTPException(
            status_code=403,
            detail=f"This needs {minimum} access on this project; you have {role}.",
        )
    return role


def list_members(project: dict) -> list:
    """Everyone with access, owner first."""
    from database import get_user_by_id

    owner = get_user_by_id(project.get("user_id")) or {}
    members = [{
        "user_id": project.get("user_id"),
        "email": owner.get("email"),
        "name": owner.get("name"),
        "role": ADMIN,
        "owner": True,
    }]

    for row in _members_table().select("*").eq("project_id", project["id"]).execute().data or []:
        user = get_user_by_id(row.get("user_id")) or {}
        members.append({
            "user_id": row.get("user_id"),
            "email": user.get("email"),
            "name": user.get("name"),
            "role": row.get("role"),
            "owner": False,
            "id": row.get("id"),
        })
    return members


def add_member(project: dict, email: str, role: str) -> dict:
    from database import get_user_by_email

    if role not in ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(ROLES)}.")

    user = get_user_by_email((email or "").strip().lower())
    if not user:
        # No invitation email exists yet, so be explicit rather than silently
        # creating a membership pointing at nobody.
        raise HTTPException(
            status_code=404,
            detail="No account with that email. They need to register first — "
                   "invitations by email aren't built yet.",
        )
    if user["id"] == project.get("user_id"):
        raise HTTPException(status_code=400, detail="The owner already has full access.")
    if get_membership(project["id"], user["id"]):
        raise HTTPException(status_code=400, detail="They are already on this project.")

    row = _members_table().insert({
        "project_id": project["id"], "user_id": user["id"], "role": role,
    }).execute().data[0]

    return {
        "user_id": user["id"], "email": user["email"], "name": user["name"],
        "role": role, "owner": False, "id": row.get("id"),
    }


def set_role(project: dict, user_id: str, role: str) -> dict:
    from database import supabase

    if role not in ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(ROLES)}.")
    if user_id == project.get("user_id"):
        raise HTTPException(status_code=400, detail="The owner's role cannot be changed.")

    membership = get_membership(project["id"], user_id)
    if not membership:
        raise HTTPException(status_code=404, detail="They are not on this project.")

    supabase.table("project_members").update({"role": role}).eq(
        "id", membership["id"]
    ).execute()
    return {**membership, "role": role}


def remove_member(project: dict, user_id: str) -> None:
    from database import supabase

    if user_id == project.get("user_id"):
        raise HTTPException(
            status_code=400,
            detail="The owner cannot be removed. Delete the project instead.",
        )
    membership = get_membership(project["id"], user_id)
    if not membership:
        raise HTTPException(status_code=404, detail="They are not on this project.")
    supabase.table("project_members").delete().eq("id", membership["id"]).execute()
