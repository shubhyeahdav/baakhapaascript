"""Shared rate limiter.

Lives in its own module so `auth.py` can decorate routes without importing
`main.py` (which imports `auth`) — a circular import otherwise.

Limits are per client IP. Behind a proxy (Railway, Vercel) the real client IP
arrives in `X-Forwarded-For`; slowapi's `get_remote_address` reads
`request.client.host`, so set `--proxy-headers` on uvicorn in production or
every request will share one bucket.
"""
import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# Disabled in the test suite: rate limits are shared per-process, so a run of
# login tests would otherwise trip the limiter and fail unrelated assertions.
RATE_LIMITS_ENABLED = os.getenv("RATE_LIMITS_ENABLED", "true").lower() != "false"

limiter = Limiter(
    key_func=get_remote_address,
    enabled=RATE_LIMITS_ENABLED,
    # Applies to every route that doesn't set its own; auth routes tighten it.
    default_limits=["300/minute"],
)

# Credential endpoints. Tight enough to make online guessing impractical,
# loose enough that a person mistyping a password three times is unaffected.
LOGIN_LIMIT = os.getenv("LOGIN_RATE_LIMIT", "5/minute")
REGISTER_LIMIT = os.getenv("REGISTER_RATE_LIMIT", "5/minute")
