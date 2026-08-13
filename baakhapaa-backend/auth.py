import json
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends, Header, Request
from jose import jwt, JWTError
from passlib.context import CryptContext
from dotenv import load_dotenv

from models import (
    UserCreate, UserLogin, UserResponse, UserPreferences, password_policy_errors,
)
from database import (
    supabase, get_user_by_email, get_user_by_id, get_script_owner, get_project_by_id,
)
from rate_limit import limiter, LOGIN_LIMIT, REGISTER_LIMIT

load_dotenv()

# Fail fast: a guessable or missing JWT secret lets anyone forge tokens for
# any user. No fallback — the server refuses to boot without a real secret.
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET or len(JWT_SECRET) < 32 or JWT_SECRET.startswith("baakhapaa-secr"):
    raise RuntimeError(
        "JWT_SECRET missing or insecure. Set a strong random value in "
        "baakhapaa-backend/.env, e.g.:  python -c \"import secrets; print(secrets.token_urlsafe(48))\""
    )
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(prefix="/auth", tags=["auth"])


_DUMMY_HASH = None


def _timing_equalizer_hash() -> str:
    """A real bcrypt hash to verify against when the email is unknown, so the
    failure path costs the same as a wrong password. Computed on first use
    rather than at import so boot stays fast."""
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = pwd_context.hash("timing-equalizer-not-a-real-password")
    return _DUMMY_HASH


def create_token(user_id: str, email: str) -> str:
    # Timezone-aware: `utcnow()` is deprecated, and python-jose encodes an
    # aware datetime to the same numeric `exp` claim, so tokens are unchanged.
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {"sub": user_id, "email": email, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# The plans that unlock paid features. One definition — callers ask
# `is_paid_tier`, never re-spell the tuple.
PAID_TIERS = ("pro", "studio")


def get_user_tier(user_id: str) -> str:
    user = get_user_by_id(user_id)
    return (user or {}).get("subscription_tier", "free")


def is_paid_tier(user_id: str) -> bool:
    return get_user_tier(user_id) in PAID_TIERS


def require_paid_tier(user_id: str = Depends(get_current_user)) -> str:
    """Dependency for Claude-powered endpoints. Free tier gets RAG pattern
    recommendations only (zero marginal cost); Claude generation is Pro/Studio."""
    if not is_paid_tier(user_id):
        raise HTTPException(
            status_code=403,
            detail="AI generation requires a Pro or Studio plan. Your free plan "
                   "includes structural pattern recommendations in the editor — "
                   "upgrade at /pricing for full AI writing.",
        )
    return user_id


def require_tier(user_id: str, feature: str) -> str:
    """Raise 403 unless the user is on a paid plan. Used by non-AI paid
    features (exports) where `require_paid_tier`'s wording wouldn't fit."""
    if not is_paid_tier(user_id):
        raise HTTPException(
            status_code=403,
            detail=f"{feature} requires a Pro or Studio plan. Upgrade at /pricing.",
        )
    return user_id


def require_script_access(script_id: str, user_id: str):
    """Return the script if it belongs to the user; 404 otherwise
    (404 rather than 403 so script ids can't be probed)."""
    owner, script = get_script_owner(script_id)
    if not script or owner != user_id:
        raise HTTPException(status_code=404, detail="Script not found")
    return script


def require_project_access(project_id: str, user_id: str):
    """Return the project if it belongs to the user; 404 otherwise.

    The script-side twin of `require_script_access`, and 404 for the same
    reason: a 403 would confirm the id exists to someone probing for it.
    """
    project = get_project_by_id(project_id)
    if not project or project["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/register", response_model=UserResponse)
@limiter.limit(REGISTER_LIMIT)
def register(request: Request, user: UserCreate):
    missing = password_policy_errors(user.password)
    if missing:
        raise HTTPException(
            status_code=400,
            detail="Password must contain " + ", ".join(missing) + ".",
        )

    existing = get_user_by_email(user.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed = pwd_context.hash(user.password)
    try:
        result = supabase.table("users").insert({
            "email": user.email,
            "name": user.name,
            "password_hash": hashed,
            "role": "editor",
            "subscription_tier": "free",
        }).execute()
    except Exception:
        # e.g. unique-email race against the DB constraint
        raise HTTPException(status_code=400, detail="Could not create account. Try a different email.")

    return _user_response(result.data[0])


@router.post("/login")
@limiter.limit(LOGIN_LIMIT)
def login(request: Request, credentials: UserLogin):
    user = get_user_by_email(credentials.email)

    # Unknown email and wrong password must cost the same wall-clock time.
    # Short-circuiting on `not user` skips bcrypt entirely, and that ~250ms
    # difference is enough to enumerate which emails have accounts.
    if not user:
        pwd_context.verify(credentials.password, _timing_equalizer_hash())
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not pwd_context.verify(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "token": create_token(user["id"], user["email"]),
        "user": _user_response(user),
    }


def _read_preferences(user: dict):
    """Preferences are stored as a JSON string so the users table needs one
    nullable column rather than a migration per new question."""
    raw = user.get("preferences_json")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def _user_response(user: dict) -> UserResponse:
    return UserResponse(
        id=user["id"], email=user["email"], name=user["name"],
        role=user["role"], subscription_tier=user["subscription_tier"],
        preferences=_read_preferences(user),
    )


@router.get("/me", response_model=UserResponse)
def get_me(user_id: str = Depends(get_current_user)):
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_response(user)


@router.put("/preferences", response_model=UserResponse)
def set_preferences(prefs: UserPreferences, user_id: str = Depends(get_current_user)):
    """Save onboarding answers. Idempotent — the settings page reuses it."""
    supabase.table("users").update(
        {"preferences_json": json.dumps(prefs.model_dump())}
    ).eq("id", user_id).execute()

    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_response(user)
