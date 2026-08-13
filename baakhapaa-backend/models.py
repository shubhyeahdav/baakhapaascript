import re
from pydantic import BaseModel, field_validator
from typing import List, Optional

# Server-side mirror of the sign-up form's rules (frontend src/utils/password.js).
# The client list is a UX affordance; this is the one that actually protects the
# account, because anything can POST /auth/register directly.
PASSWORD_RULES = [
    ("at least 8 characters", lambda p: len(p) >= 8),
    ("an uppercase letter", lambda p: bool(re.search(r"[A-Z]", p))),
    ("a lowercase letter", lambda p: bool(re.search(r"[a-z]", p))),
    ("a number", lambda p: bool(re.search(r"[0-9]", p))),
    ("a special character", lambda p: bool(re.search(r"[^A-Za-z0-9]", p))),
]


def password_policy_errors(password: str) -> List[str]:
    """Return the list of unmet rules ([] means the password is acceptable)."""
    return [label for label, test in PASSWORD_RULES if not test(password or "")]


class UserCreate(BaseModel):
    email: str
    password: str
    name: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str = "editor"
    subscription_tier: str = "free"
    preferences: Optional[dict] = None


# Onboarding answers. Each one changes something concrete: the format picks
# which beat grammar guidance follows, experience sets how much craft help is
# shown, and the rest prefill new projects so the wizard is mostly pre-answered.
EXPERIENCE_LEVELS = ("first_time", "some", "experienced")
FORMATS = ("short", "web_series", "film")
LANGUAGES = ("English", "Nepali", "Bilingual")


class UserPreferences(BaseModel):
    experience: str = "first_time"
    format: str = "short"
    language: str = "Bilingual"
    genre: str = "Drama"
    tone: str = "Emotional"
    onboarded: bool = True

    @field_validator("experience")
    @classmethod
    def _experience(cls, v):
        if v not in EXPERIENCE_LEVELS:
            raise ValueError(f"experience must be one of {EXPERIENCE_LEVELS}")
        return v

    @field_validator("format")
    @classmethod
    def _format(cls, v):
        if v not in FORMATS:
            raise ValueError(f"format must be one of {FORMATS}")
        return v

    @field_validator("language")
    @classmethod
    def _language(cls, v):
        if v not in LANGUAGES:
            raise ValueError(f"language must be one of {LANGUAGES}")
        return v

class ProjectCreate(BaseModel):
    title: str
    genre: str
    tone: str
    language: str = "English"
    duration_minutes: int
    target_audience: str = "General"

class GenerateStructureRequest(BaseModel):
    genre: str
    tone: str
    duration_minutes: int
    language: str = "English"
    target_audience: str = "General"

class GenerateSceneRequest(BaseModel):
    scene_description: str
    genre: str
    tone: str
    language: str = "English"
    character_names: List[str] = []

class ImproveSceneRequest(BaseModel):
    scene_text: str
    instruction: str
    language: str = "English"

class SuggestRequest(BaseModel):
    scene_text: str
    genre: str
    tone: str

class ScriptSave(BaseModel):
    content: str

class CommentCreate(BaseModel):
    script_id: str
    content: str
    line_number: int

class CheckoutRequest(BaseModel):
    tier: str

class RecommendRequest(BaseModel):
    scene_text: str = ""
    genre: str = "Drama"
    tone: str = "Emotional"

class AddSceneRequest(BaseModel):
    script_id: str
    title: str
    description: str = ""
    act_number: int = 1
    scene_type: str = "minor"
    time_allocation: float = 0
    order_index: int = 0
