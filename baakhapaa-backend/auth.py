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
    purge_user,
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


def token_version(user: dict) -> int:
    """The generation number a user's valid tokens must carry.

    JWTs are self-contained: once issued, nothing can call one back before it
    expires. For a product holding unpublished screenplays that is too long a
    window — a token pasted into the wrong place, or left on a shared machine,
    stays good for a week. Stamping the generation into the token and checking it
    on every request turns "sign out everywhere" into a single increment.
    """
    return int((user or {}).get("token_version") or 0)


def create_token(user_id: str, email: str, version: int = 0) -> str:
    # Timezone-aware: `utcnow()` is deprecated, and python-jose encodes an
    # aware datetime to the same numeric `exp` claim, so tokens are unchanged.
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {"sub": user_id, "email": email, "exp": expire, "ver": version}
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
    except JWTError:
        # `from None`: the JWT library's internals add nothing a caller can act
        # on, and suppressing the chain keeps them out of logs.
        raise HTTPException(status_code=401, detail="Invalid or expired token") from None

    # The signature only proves we issued this. It does not prove the account
    # still exists, or that the session was not revoked since — a deleted user's
    # token stays cryptographically valid for the rest of its week otherwise.
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if int(payload.get("ver") or 0) != token_version(user):
        raise HTTPException(
            status_code=401,
            detail="This session was signed out. Please sign in again.",
        )
    return user_id


# The plans that unlock paid features. One definition — callers ask
# `is_paid_tier`, never re-spell the tuple.
PAID_TIERS = ("pro", "studio")


def get_user_tier(user_id: str) -> str:
    """The tier the user has *right now*.

    Khalti and eSewa sell one month at a time — they have no subscription
    primitive — so a paid tier bought through them carries an expiry, and a
    lapsed one has to read as free everywhere the tier is checked. Routing it
    through `payments.effective_tier` means every gate gets that for free
    instead of each one remembering to look at a second column.
    """
    import payments  # deferred: payments -> database -> auth would cycle
    return payments.effective_tier(get_user_by_id(user_id))


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


def require_script_access(script_id: str, user_id: str, minimum: str = "editor"):
    """Return the script if the caller may act on it at `minimum` role.

    Access is resolved through the parent project, so a collaborator reaches a
    script the same way the owner does. 404 when the caller has no access at all
    (a 403 would confirm the id exists to someone probing for it); 403 when they
    are a member who simply lacks the rank.

    `minimum` defaults to **editor** on purpose. Every one of these calls is a
    write unless it says otherwise, so forgetting to mark a route costs a viewer
    a read they should have had — never a write they should not.
    """
    import membership

    # Only the script is needed now: authorisation resolves through the parent
    # project's membership, not through direct ownership.
    _owner, script = get_script_owner(script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    project = get_project_by_id(script.get("project_id"))
    if not project:
        # An orphaned script: no project means nobody can be authorised for it.
        raise HTTPException(status_code=404, detail="Script not found")

    try:
        membership.require_role(project, user_id, minimum)
    except HTTPException as e:
        # Keep the script-shaped wording; the caller asked about a script.
        if e.status_code == 404:
            raise HTTPException(status_code=404, detail="Script not found") from None
        raise
    return script


def require_project_access(project_id: str, user_id: str, minimum: str = "editor"):
    """Return the project if the caller may act on it at `minimum` role.

    The script-side twin of `require_script_access`, with the same 404/403 rule
    and the same editor-by-default.
    """
    import membership

    project = get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    membership.require_role(project, user_id, minimum)
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
        raise HTTPException(
            status_code=400, detail="Could not create account. Try a different email."
        ) from None

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
        "token": create_token(user["id"], user["email"], token_version(user)),
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
    import payments  # deferred for the same import cycle as get_user_tier

    return UserResponse(
        id=user["id"], email=user["email"], name=user["name"],
        role=user["role"],
        # The effective tier, not the stored one: an expired Khalti month must
        # not keep rendering as Pro in the UI while every route returns 403.
        subscription_tier=payments.effective_tier(user),
        subscription_expires_at=user.get("subscription_expires_at"),
        preferences=_read_preferences(user),
    )


@router.get("/me", response_model=UserResponse)
def get_me(user_id: str = Depends(get_current_user)):
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_response(user)


@router.post("/sign-out-everywhere")
def sign_out_everywhere(user_id: str = Depends(get_current_user)):
    """Invalidate every token issued for this account, including this one.

    The counterpart to `token_version`: bump the generation and every JWT in
    circulation stops verifying on its next request. This is what a writer needs
    after losing a laptop, and it is what a password change should trigger.
    """
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    supabase.table("users").update(
        {"token_version": token_version(user) + 1}
    ).eq("id", user_id).execute()
    return {"signed_out": True}


@router.delete("/me")
def delete_account(confirm_email: str, user_id: str = Depends(get_current_user)):
    """Erase this account and everything it owns.

    A screenwriting tool holds unproduced work, which is the most valuable and
    most private thing its users have. "You can stop storing my script" has to be
    an action they can take themselves, not a support request — and the proposal's
    own open question on retention after account deletion has no answer while
    there is no way to delete an account at all.

    The caller must retype their email: this destroys every project, draft,
    version and storyboard they own, and there is no undo.
    """
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if (confirm_email or "").strip().lower() != (user["email"] or "").lower():
        raise HTTPException(
            status_code=400,
            detail="Type your email address exactly to confirm. This cannot be undone.",
        )

    removed = purge_user(user_id)
    return {"deleted": True, "removed": removed}


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
