"""Inviting someone who does not have an account yet.

Sharing worked only between people who had both already found the product and
registered. `add_member` refused an unknown address outright — "they need to
register first" — which meant collaboration could never *start* with a person
who had not heard of Baakhapaa. That is precisely how collaboration usually
starts, and it made the Studio tier's whole proposition (team seats) unsellable.

**No email is sent, and that is deliberate.** There is no SMTP account
configured, and `renewals.py` already demonstrates the failure mode of
pretending otherwise — a product that says "invitation sent" and sends nothing
is worse than one that never offered. Instead an invite produces a link the
inviter passes on themselves, through whatever they already use. In this market
that is very likely WhatsApp or Viber rather than email, so a link beats a
mail-merge even once SMTP exists.

The invite is claimed by EMAIL, not by the link. The link is a convenience that
tells the recipient what they are being asked to join; the membership is granted
when someone registers with the invited address. That ordering matters: a link
that grants access on its own is a bearer token in a WhatsApp forward, and
whoever it is forwarded to would land inside somebody's unproduced screenplay.
"""
import datetime
import secrets

from fastapi import HTTPException

import membership
from database import supabase

TABLE = "project_invites"

# Long enough that guessing is pointless, short enough to paste into a chat
# message without wrapping.
TOKEN_BYTES = 24


def _now() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


def _table():
    return supabase.table(TABLE)


def normalise(email: str) -> str:
    """Invites match on a normalised address, the same way login does.

    `Mira@Studio.com` and `mira@studio.com` are one person. The users table
    learned this in the email-normalisation migration; an invite that did not
    would silently never be claimed.
    """
    return (email or "").strip().lower()


def pending_for_project(project_id: str) -> list:
    rows = _table().select("*").eq("project_id", project_id).execute().data or []
    return [r for r in rows if not r.get("claimed_at")]


def pending_for_email(email: str) -> list:
    rows = _table().select("*").eq("email", normalise(email)).execute().data or []
    return [r for r in rows if not r.get("claimed_at")]


def create(project: dict, email: str, role: str, invited_by: str) -> dict:
    """Record an invitation for an address that has no account yet."""
    if role not in membership.ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Role must be one of: {', '.join(membership.ROLES)}.",
        )

    address = normalise(email)
    if not address:
        raise HTTPException(status_code=400, detail="An email address is required.")

    # A pending invite occupies a seat. Otherwise a free project could invite
    # fifty people and let the cap apply only as they arrived, which is a cap
    # that does nothing at the moment it is being exceeded.
    membership.enforce_seat_limit(project, pending=len(pending_for_project(project["id"])))

    existing = [i for i in pending_for_project(project["id"])
                if i.get("email") == address]
    if existing:
        # Re-inviting is not an error — it is what someone does when the first
        # message was missed. Hand back the same invite so the link stays valid.
        return existing[0]

    row = {
        "project_id": project["id"],
        "email": address,
        "role": role,
        "token": secrets.token_urlsafe(TOKEN_BYTES),
        "invited_by": invited_by,
        "created_at": _now(),
        "claimed_at": None,
        "claimed_by": None,
    }
    return _table().insert(row).execute().data[0]


def revoke(project_id: str, invite_id: str) -> None:
    rows = _table().select("*").eq("id", invite_id).execute().data or []
    if not rows or rows[0].get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="No such invitation.")
    _table().delete().eq("id", invite_id).execute()


def describe(token: str) -> dict:
    """What an invitation is for, without granting anything.

    Lets the link show "Mira invited you to Sapana as an editor" before the
    recipient decides to sign up. Returns the project title and role only —
    never the script, and never anything that identifies other members.
    """
    rows = _table().select("*").eq("token", token).execute().data or []
    if not rows or rows[0].get("claimed_at"):
        raise HTTPException(status_code=404, detail="This invitation is no longer valid.")

    invite = rows[0]
    project = (supabase.table("projects").select("*")
               .eq("id", invite["project_id"]).execute().data or [{}])[0]
    return {
        "project_title": project.get("title") or "a project",
        "role": invite["role"],
        "email": invite["email"],
    }


def claim_for_user(user: dict) -> list:
    """Turn every pending invite for this address into a real membership.

    Called once, when an account is created. Failures here must never break
    registration: somebody who has just chosen a password should not be told
    their account could not be made because a project they were invited to has
    since been deleted.
    """
    granted = []
    for invite in pending_for_email(user.get("email")):
        try:
            project = (supabase.table("projects").select("*")
                       .eq("id", invite["project_id"]).execute().data or [None])[0]
            if not project:
                continue  # the project was deleted while the invite sat unclaimed
            if project.get("user_id") == user["id"]:
                continue  # they are the owner; nothing to grant
            if not membership.get_membership(project["id"], user["id"]):
                supabase.table("project_members").insert({
                    "project_id": project["id"],
                    "user_id": user["id"],
                    "role": invite["role"],
                }).execute()
            _table().update(
                {"claimed_at": _now(), "claimed_by": user["id"]}
            ).eq("id", invite["id"]).execute()
            granted.append(project["id"])
        except Exception as e:  # noqa: BLE001 - registration must not fail here
            print(f"WARNING: could not claim invite {invite.get('id')!r}: {e}")
    return granted
