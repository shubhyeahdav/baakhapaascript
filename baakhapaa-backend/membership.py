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


# Collaborators a project may carry, by the OWNER's plan.
#
# This is what Studio buys. Until 2026-08-26 `PAID_TIERS = ("pro", "studio")`
# and nothing anywhere branched on studio, so it cost Rs 1,500/month more than
# Pro for exactly nothing — while its pricing copy promised real-time
# collaboration that had been descoped and a ten-seat cap that no code
# enforced. A tier has to mean something or it should not be sold.
#
# Seats are the honest differentiator because they are the axis on which a
# production company genuinely differs from a writer: the work is the same, the
# number of people around it is not. The cap counts collaborators, not the
# owner — a solo writer is never blocked by it, on any plan.
SEAT_LIMITS = {"free": 2, "pro": 5, "studio": None}  # None = unlimited


def seat_limit(tier: str):
    """Collaborators allowed on a project owned by someone on `tier`."""
    return SEAT_LIMITS.get(tier, SEAT_LIMITS["free"])


def enforce_seat_limit(project: dict, pending: int = 0):
    """Raise 402 when a project is already at its owner's collaborator cap.

    Charged against the OWNER's plan, not the caller's: the project is the
    owner's, and an admin they invited should not be able to spend seats the
    owner is not paying for.

    `pending` counts invitations sent to people who have not registered yet.
    They occupy a seat from the moment they are sent — otherwise a free project
    could invite fifty people and only meet the cap as they arrived one by one,
    which is a cap that does nothing at the moment it is being exceeded.
    """
    from payments import effective_tier
    from database import get_user_by_id

    owner = get_user_by_id(project.get("user_id")) or {}
    limit = seat_limit(effective_tier(owner))
    if limit is None:
        return

    current = len(list_members(project)) - 1 + pending  # the owner takes no seat
    if current >= limit:
        raise HTTPException(
            status_code=402,
            detail=(
                f"This project is at its limit of {limit} collaborators. "
                "Studio removes the cap — see /pricing."
            ),
        )


def add_member(project: dict, email: str, role: str) -> dict:
    from database import get_user_by_email

    if role not in ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(ROLES)}.")

    enforce_seat_limit(project)

    user = get_user_by_email((email or "").strip().lower())
    if not user:
        # Not an error any more. An address with no account becomes a pending
        # invitation and a link the inviter passes on themselves — see
        # `invites.py` for why no mail is sent. Imported here rather than at
        # module scope because `invites` imports this module back.
        import invites

        invite = invites.create(project, email, role, invited_by=project.get("user_id"))
        return {
            "pending": True,
            "invite_id": invite["id"],
            "email": invite["email"],
            "role": invite["role"],
            "token": invite["token"],
            "owner": False,
        }
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
