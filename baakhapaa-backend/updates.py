"""Field whitelisting for client-supplied update payloads.

Every `PUT` that takes a raw dict from the client needs the same two steps:
drop anything not on the allowed list, then reject the request if that left
nothing. Writing it inline twice invites a third copy that forgets the second
step — and a whitelist that silently passes an empty update is a whitelist
someone will eventually route `id` or `user_id` around.
"""
from typing import Iterable

from fastapi import HTTPException


def apply_whitelist(updates: dict, allowed: Iterable[str]) -> dict:
    """Return only the allowed keys of `updates`, or 400 if none survive."""
    safe = {k: v for k, v in (updates or {}).items() if k in allowed}
    if not safe:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    return safe
