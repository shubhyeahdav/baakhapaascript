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
    """Return only the allowed keys of `updates`, or 400 if none survive.

    The 400 names the fields it WOULD have accepted. "No valid fields to
    update" describes the server's conclusion and leaves the caller to guess
    what it wanted, which is the same guess that produced the failed request.
    """
    safe = {k: v for k, v in (updates or {}).items() if k in allowed}
    if not safe:
        # The keys came from the caller, so they are echoed back filtered and
        # capped rather than raw: anything that is not a plain identifier is
        # dropped, and only the first five are named. Field names are not
        # secret and saying them is the whole point, but an error message is
        # not a mirror.
        sent = [k for k in sorted(updates or {})
                if isinstance(k, str) and k.isidentifier()][:5]
        raise HTTPException(
            status_code=400,
            detail=(
                "Nothing in that request can be updated here. "
                + (f"Sent: {', '.join(sent)}. " if sent else "")
                + f"This accepts: {', '.join(sorted(allowed))}."
            ),
        )
    return safe
