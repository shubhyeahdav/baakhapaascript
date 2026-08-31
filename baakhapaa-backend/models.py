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


# An address has to survive the round trip from the sign-up form to the login
# form. Everything else here is a consequence of that one requirement.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalise_email(value: str) -> str:
    """Fold an address to the single form the account is stored under.

    Case and surrounding whitespace were significant, and that locked people out
    of their own accounts: registering as `Mira@studio.com` and later typing
    `mira@studio.com` returned "Invalid email or password", because the lookup
    is an exact string match. Phone keyboards capitalise the first letter by
    default, so this fired on the writers least able to diagnose it — and the
    same gap let one address register twice under different casing, since the
    duplicate check is that same exact match.

    Lowercasing the whole address is the pragmatic choice. The local part is
    formally case-sensitive per RFC 5321, but no mainstream provider treats it
    that way, and honouring the letter of the spec here would mean choosing
    correctness nobody wants over accounts people can actually log back into.
    """
    return (value or "").strip().lower()


class _EmailMixin(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def _clean_email(cls, v: str) -> str:
        v = normalise_email(v)
        if not _EMAIL_RE.match(v):
            raise ValueError("Enter a valid email address.")
        return v


class UserCreate(_EmailMixin):
    password: str
    name: str

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Enter your name.")
        return v


class UserLogin(_EmailMixin):
    password: str


class GoogleCredential(BaseModel):
    """The ID token minted by Google Identity Services in the browser.

    Carries an email and a name, and none of it is trusted here — the token is
    signature-checked in `google_auth` before a single claim is read.
    """
    credential: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str = "editor"
    subscription_tier: str = "free"
    # NULL for a free plan or a Stripe subscription (Stripe owns the renewal).
    # Set for Khalti/eSewa, which sell one month at a time.
    subscription_expires_at: Optional[str] = None
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
    # Optional, and the server loads the bible itself from it rather than
    # trusting the client to send one. The bible is what tells the model what a
    # character wants versus what they need — the single most useful thing you
    # can give a scene generator, and it reached no prompt until now.
    script_id: Optional[str] = None


class ImproveSceneRequest(BaseModel):
    scene_text: str
    instruction: str
    language: str = "English"
    script_id: Optional[str] = None

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
    # None means "whichever gateway this deployment has keys for" — see
    # payments.default_provider(). Named explicitly by the pricing page.
    provider: Optional[str] = None


class VerifyPaymentRequest(BaseModel):
    provider: str
    # Whatever the gateway put on the return URL: pidx for Khalti, the base64
    # `data` blob for eSewa, session_id for Stripe. Passed through untrusted —
    # it selects a payment to check, it does not assert anything about it.
    params: dict = {}

class RecommendRequest(BaseModel):
    scene_text: str = ""
    genre: str = "Drama"
    tone: str = "Emotional"
    # The symptom the writer is asking about ("my dialogue is on the nose"),
    # separate from the draft. These MUST stay separate: the editor's focus
    # chips used to be sent as `scene_text`, so the linter diagnosed the
    # complaint sentence and the UI reported the result as "found in your
    # draft, line 1" — a line in a string the writer never wrote. Diagnosis
    # always reads scene_text; `focus` only steers semantic retrieval.
    focus: str = ""

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


# A structure preview can name a large ensemble; a single scene cannot usefully
# have one. Cap it so an oversized list can't be posted into a scene row.
MAX_SCENE_CHARACTERS = 12


class AddSceneRequest(BaseModel):
    script_id: str
    title: str
    description: str = ""
    act_number: int = 1
    scene_type: str = "minor"
    time_allocation: float = 0
    order_index: int = 0
    # Produced per scene by `generate_structure` and, until now, accepted
    # nowhere — so the storyboard engine read `location`/`emotional_beat` back
    # out of the row and always found them empty.
    location: str = ""
    emotional_beat: str = ""
    characters: List[str] = []

    @field_validator("characters")
    @classmethod
    def _characters(cls, v):
        return [c.strip() for c in v if c and c.strip()][:MAX_SCENE_CHARACTERS]


# --- project members (FR12) -------------------------------------------------

ROLE_VALUES = ("admin", "editor", "viewer")


class MemberCreate(BaseModel):
    email: str
    role: str = "editor"

    @field_validator("role")
    @classmethod
    def _role(cls, v):
        v = (v or "").strip().lower()
        if v not in ROLE_VALUES:
            raise ValueError(f"must be one of: {', '.join(ROLE_VALUES)}")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        v = (v or "").strip().lower()
        if "@" not in v or len(v) < 5:
            raise ValueError("must be an email address")
        return v


class MemberRoleUpdate(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def _role(cls, v):
        v = (v or "").strip().lower()
        if v not in ROLE_VALUES:
            raise ValueError(f"must be one of: {', '.join(ROLE_VALUES)}")
        return v
