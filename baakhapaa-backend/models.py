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

# What is being written. This drives beat grammar and how duration is read:
# for a series `duration_minutes` is ONE episode, not the whole season.
#
# `short` is a short FILM (minutes). `short_form` is vertical social video
# (seconds) — a genuinely different craft with its own beat spine, not a very
# short film. Keeping them as one format would force 15-second content through
# a three-act split, which is the fastest way to make the tool useless for it.
PROJECT_FORMATS = ("short_form", "short", "film", "web_series")

# Formats measured in seconds rather than minutes.
SECOND_SCALE_FORMATS = ("short_form",)

# The hook is the highest-leverage choice in short-form: it decides whether
# anything after it is seen at all. Pick one and commit — a hook trying to be
# two things is a hook doing neither.
HOOK_TYPES = (
    "pattern_interrupt",   # break the expected visual/audio rhythm
    "bold_claim",          # state something contestable as fact
    "question",            # pose the gap directly
    "visual_shock",        # an image that stops the thumb
    "relatable_pain",      # name a specific frustration the viewer owns
    "curiosity_gap",       # promise a payoff whose shape is withheld
)

# Category shapes the middle and the ending, per the structure playbook.
SHORT_FORM_CATEGORIES = ("educational", "storytime", "transformation", "comedy_skit")

MIN_DURATION_SECONDS = 5
MAX_DURATION_SECONDS = 180

# Duration bounds. Generous rather than "unlimited" — an unbounded integer is
# a denial-of-service on structure generation (act splits and per-beat
# allocations scale with it) and nothing real runs past ten hours in one piece.
# Deliberately wide enough for a 3.5-hour epic, which the old 120-minute
# slider ceiling made impossible to even enter.
MIN_DURATION_MINUTES = 1
MAX_DURATION_MINUTES = 600
MAX_EPISODE_COUNT = 200


def _validated_duration(v: int) -> int:
    if not MIN_DURATION_MINUTES <= v <= MAX_DURATION_MINUTES:
        raise ValueError(
            f"duration_minutes must be between {MIN_DURATION_MINUTES} and "
            f"{MAX_DURATION_MINUTES} (for a series this is one episode)"
        )
    return v


class ProjectBase(BaseModel):
    """Fields shared by project creation and structure generation.

    genre / tone / target_audience are deliberately free text. They are prompt
    and retrieval inputs, not enumerations — the UI offers suggestions, but a
    writer working on a Nepali social-realist docudrama should not have to
    pick "Drama" because that is the closest item on someone else's list.
    """
    genre: str = "Drama"
    tone: str = "Emotional"
    language: str = "English"
    duration_minutes: int = 15
    target_audience: str = "General"
    format: str = "short"
    # Series only. Ignored for film/short, kept so switching format back and
    # forth in the wizard does not silently lose the number.
    episode_count: int = 1
    # Short-form only. Seconds, because minutes cannot express a 30-second reel
    # and rounding it to 0.5 loses the precision the format lives on.
    duration_seconds: int = 45
    hook_type: str = "relatable_pain"
    short_form_category: str = "storytime"

    @field_validator("format")
    @classmethod
    def _format(cls, v):
        if v not in PROJECT_FORMATS:
            raise ValueError(f"format must be one of {PROJECT_FORMATS}")
        return v

    @field_validator("duration_seconds")
    @classmethod
    def _duration_seconds(cls, v):
        if not MIN_DURATION_SECONDS <= v <= MAX_DURATION_SECONDS:
            raise ValueError(
                f"duration_seconds must be between {MIN_DURATION_SECONDS} and {MAX_DURATION_SECONDS}"
            )
        return v

    @field_validator("hook_type")
    @classmethod
    def _hook(cls, v):
        if v not in HOOK_TYPES:
            raise ValueError(f"hook_type must be one of {HOOK_TYPES}")
        return v

    @field_validator("short_form_category")
    @classmethod
    def _category(cls, v):
        if v not in SHORT_FORM_CATEGORIES:
            raise ValueError(f"short_form_category must be one of {SHORT_FORM_CATEGORIES}")
        return v

    @field_validator("duration_minutes")
    @classmethod
    def _duration(cls, v):
        return _validated_duration(v)

    @field_validator("episode_count")
    @classmethod
    def _episodes(cls, v):
        if not 1 <= v <= MAX_EPISODE_COUNT:
            raise ValueError(f"episode_count must be between 1 and {MAX_EPISODE_COUNT}")
        return v

    @field_validator("genre", "tone", "target_audience", "language")
    @classmethod
    def _non_empty_text(cls, v):
        """Custom values are welcome; blank ones are not — an empty genre
        silently degrades every prompt and retrieval query built from it."""
        v = (v or "").strip()
        if not v:
            raise ValueError("must not be empty")
        if len(v) > 60:
            raise ValueError("must be 60 characters or fewer")
        return v


class ProjectCreate(ProjectBase):
    title: str

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("title must not be empty")
        if len(v) > 200:
            raise ValueError("title must be 200 characters or fewer")
        return v


class GenerateStructureRequest(ProjectBase):
    pass

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

class LessonSubmission(BaseModel):
    content: str = ""


# --- story bible ----------------------------------------------------------
#
# The material a script needs to exist but that never appears on the page:
# who these people are, what they want, what the story is actually about.
# Writers keep it in a separate document anyway — keeping it beside the draft
# means the editor can use it (character names feed the type-ahead) instead of
# it being a notes file the app knows nothing about.

MAX_BIBLE_CHARACTERS = 40
MAX_BIBLE_LOCATIONS = 60


class BibleCharacter(BaseModel):
    name: str = ""
    age: str = ""
    # Want is what they chase; need is what would actually help. Stories work
    # when those are not the same thing, so they are separate fields.
    want: str = ""
    need: str = ""
    wound: str = ""
    voice: str = ""
    notes: str = ""


class StoryBible(BaseModel):
    logline: str = ""
    # The question the script poses in act one and answers at the end.
    dramatic_question: str = ""
    theme: str = ""
    characters: List[BibleCharacter] = []
    locations: List[str] = []
    notes: str = ""

    @field_validator("characters")
    @classmethod
    def _characters(cls, v):
        if len(v) > MAX_BIBLE_CHARACTERS:
            raise ValueError(f"at most {MAX_BIBLE_CHARACTERS} characters")
        return v

    @field_validator("locations")
    @classmethod
    def _locations(cls, v):
        if len(v) > MAX_BIBLE_LOCATIONS:
            raise ValueError(f"at most {MAX_BIBLE_LOCATIONS} locations")
        return [loc.strip() for loc in v if loc and loc.strip()]


class AddSceneRequest(BaseModel):
    script_id: str
    title: str
    description: str = ""
    act_number: int = 1
    scene_type: str = "minor"
    time_allocation: float = 0
    order_index: int = 0
