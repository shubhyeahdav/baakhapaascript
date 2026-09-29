# Long-Form Writing Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the editor behave like a long-form video tool instead of a screenplay tool, in both of the format's modes — video essay and course lesson.

**Architecture:** A second keymap factory beside the screenplay one (never a flag inside it), a deterministic scaffold expanded from the project's runtime, a caret-aware status readout, and prose typography on the existing `<textarea>`. The essay/course split is one mode switch keyed off `video_category`, threaded from the project into the parser without breaking the "both parsers expose the same interface" property that lets `scene_sync` serve both formats from one call site.

**Tech Stack:** FastAPI + Pydantic (backend), React 18 + Vite + Tailwind (frontend), pytest, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-29-long-form-writing-surface-design.md`

## Global Constraints

- **Never a flag inside `screenplayKeymap.js`.** A second format gets a second factory. The screenplay path must stay untouched so its tests keep meaning what they meant.
- **No column arithmetic in video mode.** No 22-space cue column, no 10-space dialogue indent. The absence is the feature.
- **Report, never block.** No warning, badge, or gate when a section runs over its target, in either mode. `review.py`, `benchmark.py` and `RetentionShape` all follow this.
- **Unknown section headings resolve to `segment`.** A writer inventing a section name is writing, not erring.
- **An unknown `video_category` falls back to essay mode.** Never raise, never blank the index.
- **Course mode emits no target durations.** The `- M:SS` suffix stays available and is never offered.
- **One source of truth for the speaking rate.** The backend owns `SPEAKING_WPM_EN` / `SPEAKING_WPM_NE`; the client must never hold a copy.
- **`## PROOF` guide copy states a rule, not a prompt**: a measurement, never a quotation.
- Backend tests: `./venv/Scripts/python -m pytest` from `baakhapaa-backend`. Frontend: `npm run test:ci` from `baakhapaa-frontend`. Lint: `python -m ruff check .` and `npm run lint`.

---

## File Structure

**Backend**
| File | Responsibility |
|---|---|
| `baakhapaa-backend/videoscript.py` (modify) | Mode-aware section kinds and synonyms; `sections`/`scene_summaries` take a `category` |
| `baakhapaa-backend/scene_sync.py` (modify, ~L39-48, L208) | Bind the project's `video_category` to the video parser without changing the parser interface |
| `baakhapaa-backend/models.py` (modify, L177) | `course` as a sixth `video_category` |
| `baakhapaa-backend/check_schema.py` (modify) | No change needed — `video_category` column already watched |
| `baakhapaa-backend/review.py` (modify) | Mandatory-section finding for course drafts |
| `baakhapaa-backend/scripts.py` (modify) | `speaking_wpm` in the script payload; optional `section_kind` on recommendations |

**Frontend**
| File | Responsibility |
|---|---|
| `baakhapaa-frontend/src/utils/videoFormat.js` (create) | Element detection, `enterText`, `tabCycle`, `sectionAt` — pure, no React |
| `baakhapaa-frontend/src/editor/videoKeymap.js` (create) | `createVideoKeyHandler` — same call shape as the screenplay factory |
| `baakhapaa-frontend/src/lib/videoScaffold.js` (create) | `scaffold(durationMinutes, mode)` — pure |
| `baakhapaa-frontend/src/pages/ScriptEditor.jsx` (modify, ~L1290) | Choose the handler by format; pass scaffold inputs down |
| `baakhapaa-frontend/src/components/FormatShortcuts.jsx` (modify) | Video completions |
| `baakhapaa-frontend/src/components/PenPrompt.jsx` (modify, ~L63) | Insert the scaffold instead of one line |
| `baakhapaa-frontend/src/components/ScriptPage.jsx` (modify, ~L98) | Pacing readout in the status line; `.video-page` class |
| `baakhapaa-frontend/src/components/OutlineView.jsx` (modify, ~L46) | Suppress the retention overlay in course mode |
| `baakhapaa-frontend/src/index.css` (modify) | `.video-page` |
| `baakhapaa-frontend/scripts/page-layout-check.mjs` (modify) | Geometry case for the video page |

---

## Task 1: Mode-aware section kinds

**Files:**
- Modify: `baakhapaa-backend/videoscript.py:51` (`SECTION_KINDS`), `:96-100` (`_kind_of`), `:124` (`sections`), `:180` (`scene_summaries`)
- Test: `baakhapaa-backend/tests/test_videoscript_modes.py` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `videoscript.SECTION_KINDS_BY_MODE: dict[str, tuple[str, ...]]`, `videoscript.mode_for(video_category: str | None) -> str`, `videoscript._kind_of(name: str, mode: str = "essay") -> str`, `videoscript.sections(text: str, mode: str = "essay") -> list[Section]`, `videoscript.scene_summaries(text: str, language: str = "English", mode: str = "essay") -> list[dict]`.

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-backend/tests/test_videoscript_modes.py`:

```python
"""Section vocabulary is per MODE, not global.

`SECTION_KINDS` was a flat tuple, so `_kind_of` matched the first word against
one list for every project. Two consequences this pins: the five course
sections all fell through to `segment`, and `## OUTRO` / `## CALL TO ACTION`
did too, because neither is in the essay list either.
"""
import videoscript as v


def test_essay_kinds_resolve_in_essay_mode():
    assert v._kind_of("HOOK", "essay") == "hook"
    assert v._kind_of("PAYOFF", "essay") == "payoff"


def test_course_kinds_resolve_in_course_mode():
    assert v._kind_of("OBJECTIVE", "course") == "objective"
    assert v._kind_of("EXERCISE", "course") == "exercise"
    assert v._kind_of("CHECK", "course") == "check"


def test_vocabularies_do_not_leak():
    # A course writer typing HOOK is writing a section called Hook, not
    # invoking the essay grammar -- and vice versa.
    assert v._kind_of("HOOK", "course") == "segment"
    assert v._kind_of("EXERCISE", "essay") == "segment"


def test_synonyms_resolve_within_their_mode():
    assert v._kind_of("OUTRO", "essay") == "cta"
    assert v._kind_of("CALL TO ACTION", "essay") == "cta"
    assert v._kind_of("INTRO", "essay") == "hook"
    assert v._kind_of("OUTRO", "course") == "segment"


def test_unknown_heading_is_still_a_segment():
    # A writer inventing a section name is writing, not erring.
    assert v._kind_of("WHY NOBODY FINISHES", "essay") == "segment"
    assert v._kind_of("", "essay") == "segment"


def test_mode_for_maps_every_category():
    assert v.mode_for("course") == "course"
    assert v.mode_for("essay") == "essay"
    assert v.mode_for("tutorial") == "essay"
    # A stored value nobody recognises is far more likely to be an essay.
    assert v.mode_for("podcast") == "essay"
    assert v.mode_for(None) == "essay"


def test_sections_carry_the_mode_through():
    text = "## OBJECTIVE\n\nYou will be able to cut a scene on the turn.\n"
    assert v.sections(text, mode="course")[0].kind == "objective"
    assert v.sections(text, mode="essay")[0].kind == "segment"


def test_scene_summaries_carry_the_mode_through():
    text = "## CHECK\n\nRead it aloud and time it.\n"
    assert v.scene_summaries(text, mode="course")[0]["section_kind"] == "check"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd baakhapaa-backend && ./venv/Scripts/python -m pytest tests/test_videoscript_modes.py -v`
Expected: FAIL — `_kind_of() takes 1 positional argument but 2 were given`, and `AttributeError: module 'videoscript' has no attribute 'mode_for'`.

- [ ] **Step 3: Write minimal implementation**

In `videoscript.py`, replace the `SECTION_KINDS` block at L51 and `_kind_of` at L96:

```python
# The section kinds the format knows, PER MODE.
#
# This was a flat tuple until 2026-09-29, which is why every course section
# and every essay synonym fell through to `segment`: one vocabulary cannot
# serve two crafts. A video essay is written for purchased attention and a
# course lesson for committed attention -- see
# docs/superpowers/specs/2026-09-16-long-form-writing-framework.md.
SECTION_KINDS_BY_MODE = {
    "essay": ("hook", "promise", "segment", "payoff", "cta"),
    "course": ("objective", "concept", "proof", "exercise", "check"),
}

# Names writers actually type for a kind the list already holds. Per mode, so
# `## OUTRO` means CTA in an essay without meaning anything in a course.
# Matched on the WHOLE heading, unlike kinds, which match the first word --
# "CALL TO ACTION" has no single word that identifies it.
SECTION_SYNONYMS_BY_MODE = {
    "essay": {
        "intro": "hook", "introduction": "hook", "cold open": "hook",
        "outro": "cta", "call to action": "cta", "wrap up": "cta",
        "conclusion": "payoff", "takeaway": "payoff",
    },
    "course": {
        "goal": "objective", "outcome": "objective",
        "idea": "concept", "theory": "concept",
        "evidence": "proof", "measurement": "proof",
        "practice": "exercise", "task": "exercise",
        "review": "check", "feedback": "check",
    },
}

# Kept for consumers that predate modes. Essay is the default mode, so this is
# the same tuple those consumers already saw.
SECTION_KINDS = SECTION_KINDS_BY_MODE["essay"]

DEFAULT_MODE = "essay"


def mode_for(video_category) -> str:
    """Which section vocabulary a project uses.

    Only `course` differs. Everything else -- essay, tutorial, documentary,
    commentary, vlog, and any value written by a future version -- is an essay,
    because an unrecognised stored value is far more likely to be one than to
    be a course, and guessing course would draw the wrong instrument.
    """
    return "course" if video_category == "course" else DEFAULT_MODE


def _kind_of(name: str, mode: str = DEFAULT_MODE) -> str:
    kinds = SECTION_KINDS_BY_MODE.get(mode, SECTION_KINDS_BY_MODE[DEFAULT_MODE])
    synonyms = SECTION_SYNONYMS_BY_MODE.get(mode, {})
    cleaned = (name or "").strip().lower()
    if cleaned in synonyms:
        return synonyms[cleaned]
    words = cleaned.split()
    if words and words[0] in kinds:
        return words[0]
    return "segment"
```

Then thread `mode` through the two callers. In `sections`:

```python
def sections(text: str, mode: str = DEFAULT_MODE) -> List[Section]:
```

and at the `Section(...)` construction inside it, pass `mode` to `_kind_of`:

```python
                kind=_kind_of(name, mode),
```

In `scene_summaries`:

```python
def scene_summaries(text: str, language: str = "English",
                    mode: str = DEFAULT_MODE) -> List[dict]:
```

and change its loop header to `for index, sec in enumerate(sections(text, mode)):`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd baakhapaa-backend && ./venv/Scripts/python -m pytest tests/test_videoscript_modes.py -v`
Expected: PASS, 8 tests.

Then confirm nothing that used the old flat tuple broke:
Run: `./venv/Scripts/python -m pytest tests/ -k "video or section or sync" -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add baakhapaa-backend/videoscript.py baakhapaa-backend/tests/test_videoscript_modes.py
git commit -m "Give section kinds a mode, so two crafts stop sharing one vocabulary"
```

---

## Task 2: Bind the project's category to the parser

**Files:**
- Modify: `baakhapaa-backend/scene_sync.py:42-48` (`parser_for`), `:208` (the call site)
- Test: `baakhapaa-backend/tests/test_scene_sync_modes.py` (create)

**Interfaces:**
- Consumes: `videoscript.mode_for`, `videoscript.scene_summaries(text, language, mode)` from Task 1.
- Produces: `scene_sync.parser_for(project_format, video_category=None)` — returns an object exposing `scene_summaries(text, language="English")`.

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-backend/tests/test_scene_sync_modes.py`:

```python
"""The project's category has to reach the parser without widening the
interface both parsers share.

`parser_for` returns something with `scene_summaries(text)`, and ONE call site
uses it. That sameness is what lets one sync function serve two formats with no
special case, so the mode is BOUND rather than added as a parameter every
caller would have to know about.
"""
import scene_sync


def test_a_screenplay_still_gets_the_screenplay_parser():
    import screenplay
    assert scene_sync.parser_for("film") is screenplay
    assert scene_sync.parser_for(None) is screenplay


def test_a_course_project_parses_course_sections():
    parser = scene_sync.parser_for("long_form", "course")
    out = parser.scene_summaries("## EXERCISE\n\nWrite one scene heading.\n")
    assert out[0]["section_kind"] == "exercise"


def test_an_essay_project_parses_essay_sections():
    parser = scene_sync.parser_for("long_form", "essay")
    out = parser.scene_summaries("## HOOK - 0:15\n\nNobody finishes it.\n")
    assert out[0]["section_kind"] == "hook"


def test_no_category_is_an_essay():
    parser = scene_sync.parser_for("long_form")
    out = parser.scene_summaries("## HOOK\n\nWords.\n")
    assert out[0]["section_kind"] == "hook"


def test_the_bound_parser_still_takes_a_language():
    # The interface is `scene_summaries(text, language)`. Binding the mode must
    # not remove the argument the contract already has.
    parser = scene_sync.parser_for("long_form", "course")
    out = parser.scene_summaries("## CHECK\n\nRead it aloud.\n", "Nepali")
    assert out[0]["section_kind"] == "check"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd baakhapaa-backend && ./venv/Scripts/python -m pytest tests/test_scene_sync_modes.py -v`
Expected: FAIL — `parser_for() takes 1 positional argument but 2 were given`.

- [ ] **Step 3: Write minimal implementation**

In `scene_sync.py`, add the import and replace `parser_for`:

```python
from types import SimpleNamespace


def parser_for(project_format, video_category=None):
    """The module that turns this project's draft into summaries.

    Both expose `scene_summaries(text) -> list[dict]` with the same keys, which
    is what lets one sync function serve both formats with no special case.

    Long-form video has two MODES (essay and course) with different section
    vocabularies, and the mode lives on the project rather than in the text. It
    is BOUND here rather than added as a third parameter, because the value of
    this seam is that the call site does not know which parser it holds -- and
    a parameter only one of them accepts would end that.
    """
    mod = _PARSERS.get(project_format or "", screenplay)
    if mod is not videoscript:
        return mod
    mode = videoscript.mode_for(video_category)
    return SimpleNamespace(
        scene_summaries=lambda text, language="English": videoscript.scene_summaries(
            text, language, mode=mode
        )
    )
```

Then at L208, pass the category. The surrounding function already has the
project row; use its `video_category`:

```python
    summaries = parser_for(fmt, (project or {}).get("video_category")).scene_summaries(content or "")
```

If the local variable holding the project row is not named `project` at that
point, read the name from the enclosing function signature and use it — do not
introduce a second lookup.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd baakhapaa-backend && ./venv/Scripts/python -m pytest tests/test_scene_sync_modes.py -v`
Expected: PASS, 5 tests.

Run: `./venv/Scripts/python -m pytest tests/ -k "sync" -q`
Expected: PASS — the existing sync tests are the regression gate here.

- [ ] **Step 5: Commit**

```bash
git add baakhapaa-backend/scene_sync.py baakhapaa-backend/tests/test_scene_sync_modes.py
git commit -m "Bind the project's video category to the parser, not to the call site"
```

---

## Task 3: `course` as a sixth video category

**Files:**
- Modify: `baakhapaa-backend/models.py:177`
- Test: `baakhapaa-backend/tests/test_course_category.py` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `models.VIDEO_CATEGORIES` including `"course"`.

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-backend/tests/test_course_category.py`:

```python
"""`course` is a sixth category, not a use of `tutorial`.

A tutorial is watched; a course is practised. That distinction is exactly what
`## EXERCISE` and `## CHECK` exist to hold, so collapsing the two would remove
the only structural rule the course mode has.
"""
import pytest
from pydantic import ValidationError

import models


def test_course_is_a_category():
    assert "course" in models.VIDEO_CATEGORIES


def test_the_five_existing_categories_survive():
    for name in ("essay", "tutorial", "documentary", "commentary", "vlog"):
        assert name in models.VIDEO_CATEGORIES


def test_a_project_can_be_created_as_a_course():
    p = models.ProjectCreate(title="Cut on the turn", video_category="course")
    assert p.video_category == "course"


def test_an_unknown_category_is_still_rejected():
    # Widening the list must not turn the validator off.
    with pytest.raises(ValidationError):
        models.ProjectCreate(title="X", video_category="webinar")
```

Note: if `ProjectCreate` requires more fields than `title`, add the minimum the
existing `tests/` already pass for a project — copy the construction from
whichever existing test builds one.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd baakhapaa-backend && ./venv/Scripts/python -m pytest tests/test_course_category.py -v`
Expected: FAIL on `test_course_is_a_category`.

- [ ] **Step 3: Write minimal implementation**

In `models.py:177`:

```python
# `course` is a SIXTH category rather than a use of `tutorial`: a tutorial is
# watched and a course is practised, which is the whole distinction the
# mandatory `## EXERCISE` and `## CHECK` sections exist to hold.
VIDEO_CATEGORIES = ("essay", "tutorial", "documentary", "commentary", "vlog", "course")
```

No database change is needed: `projects.video_category` is an existing TEXT
column with no CHECK constraint, and `check_schema.py` already watches it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd baakhapaa-backend && ./venv/Scripts/python -m pytest tests/test_course_category.py -v`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add baakhapaa-backend/models.py baakhapaa-backend/tests/test_course_category.py
git commit -m "Add course as a sixth video category"
```

---

## Task 4: The mandatory-section finding for course drafts

**Files:**
- Modify: `baakhapaa-backend/review.py`
- Test: `baakhapaa-backend/tests/test_course_review.py` (create)

**Interfaces:**
- Consumes: `videoscript.sections`, `videoscript.mode_for` from Task 1.
- Produces: `review.course_section_findings(content: str, video_category: str | None) -> list[dict]` — each finding is the existing `_finding(rule, severity, message, detail)` shape.

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-backend/tests/test_course_review.py`:

```python
"""The one genuinely checkable structural rule in either long-form mode.

From `lessons.py`, quoting SCRIPT_CORPUS_PLAN section 4: every lesson ends with
the user writing something the app can immediately respond to. A course script
with no `## EXERCISE` cannot be practised and one with no `## CHECK` cannot be
graded -- the module has no way to present either.

It REPORTS. Nothing here blocks a save, in line with the rest of review.py.
"""
import review

FULL = (
    "## OBJECTIVE\n\nCut a scene on the turn.\n\n"
    "## CONCEPT\n\nA scene ends when the charge changes.\n\n"
    "## PROOF\n\nMedian scene length in the corpus is 1.8 pages.\n\n"
    "## EXERCISE\n\nCut your longest scene at the turn.\n\n"
    "## CHECK\n\nRead both versions aloud.\n"
)


def test_a_complete_course_script_reports_nothing():
    assert review.course_section_findings(FULL, "course") == []


def test_a_missing_exercise_is_reported():
    text = FULL.replace("## EXERCISE\n\nCut your longest scene at the turn.\n\n", "")
    rules = [f["rule"] for f in review.course_section_findings(text, "course")]
    assert "course_missing_exercise" in rules


def test_a_missing_check_is_reported():
    text = FULL.replace("## CHECK\n\nRead both versions aloud.\n", "")
    rules = [f["rule"] for f in review.course_section_findings(text, "course")]
    assert "course_missing_check" in rules


def test_both_missing_are_reported_separately():
    rules = [f["rule"] for f in review.course_section_findings("## CONCEPT\n\nX.\n", "course")]
    assert rules == ["course_missing_exercise", "course_missing_check"]


def test_an_essay_is_not_held_to_the_course_rule():
    # Every section in the video framework is a convention. This rule is the
    # only one that is not, and it belongs to course mode alone.
    assert review.course_section_findings("## HOOK - 0:15\n\nWords.\n", "essay") == []
    assert review.course_section_findings(FULL, None) == []


def test_an_empty_draft_reports_nothing():
    # A writer who has typed nothing has not omitted anything.
    assert review.course_section_findings("", "course") == []
    assert review.course_section_findings("   \n", "course") == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd baakhapaa-backend && ./venv/Scripts/python -m pytest tests/test_course_review.py -v`
Expected: FAIL — `AttributeError: module 'review' has no attribute 'course_section_findings'`.

- [ ] **Step 3: Write minimal implementation**

Add to `review.py` (it already has `_finding(rule, severity, message, detail="")`):

```python
import videoscript

# The two sections a course lesson cannot do without, and why. `lessons.py`
# enforces the same rule inside the module: a course that only presents
# information does not get finished by anyone, and a course whose feedback is
# "well done!" teaches nothing.
COURSE_REQUIRED = (
    ("exercise", "course_missing_exercise",
     "This lesson has no exercise, so there is nothing for the learner to do.",
     "Add a `## EXERCISE` section with the task and a starter they can begin from."),
    ("check", "course_missing_check",
     "This lesson has no check, so neither of you can tell whether it landed.",
     "Add a `## CHECK` section describing how the learner knows they have it."),
)


def course_section_findings(content: str, video_category=None) -> list:
    """The one structural rule that is a rule rather than a convention.

    Course mode only. Every section in the video-essay framework is a
    convention a writer may break knowingly; these two are not, because the
    courses module has no way to present a lesson that lacks them.

    Reports. Nothing here blocks a save.
    """
    if videoscript.mode_for(video_category) != "course":
        return []
    if not (content or "").strip():
        return []
    present = {s.kind for s in videoscript.sections(content, mode="course")}
    return [
        _finding(rule, "medium", message, detail)
        for kind, rule, message, detail in COURSE_REQUIRED
        if kind not in present
    ]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd baakhapaa-backend && ./venv/Scripts/python -m pytest tests/test_course_review.py -v`
Expected: PASS, 6 tests.

Run: `./venv/Scripts/python -m ruff check .`
Expected: `All checks passed!`

- [ ] **Step 5: Commit**

```bash
git add baakhapaa-backend/review.py baakhapaa-backend/tests/test_course_review.py
git commit -m "Report a course lesson that cannot be practised or graded"
```

---

## Task 5: The speaking rate reaches the client

**Files:**
- Modify: `baakhapaa-backend/scripts.py` (the script GET response)
- Test: `baakhapaa-backend/tests/test_speaking_rate_payload.py` (create)

**Interfaces:**
- Consumes: `videoscript.SPEAKING_WPM_EN` / `SPEAKING_WPM_NE`.
- Produces: `speaking_wpm` (int) on the script payload the editor loads.

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-backend/tests/test_speaking_rate_payload.py`:

```python
"""One source of truth for the speaking rate.

The status line shows written runtime live, which is words over a speaking
rate. The backend owns that constant. Copying it into the client gives two
numbers that agree until somebody edits one -- and the client's copy would be
the one nobody remembers.
"""
import videoscript


def test_the_rate_is_a_positive_number():
    assert videoscript.SPEAKING_WPM_EN > 0
    assert videoscript.SPEAKING_WPM_NE > 0


def test_the_payload_carries_the_rate(client, auth_headers, long_form_script_id):
    res = client.get(f"/scripts/{long_form_script_id}", headers=auth_headers)

    assert res.status_code == 200
    assert res.json()["speaking_wpm"] == videoscript.SPEAKING_WPM_EN
```

Note: reuse the fixtures the existing script tests use. If there is no
`long_form_script_id` fixture, create the project inside the test the same way
the nearest existing script test does, with `format="long_form"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd baakhapaa-backend && ./venv/Scripts/python -m pytest tests/test_speaking_rate_payload.py -v`
Expected: FAIL — `KeyError: 'speaking_wpm'`.

- [ ] **Step 3: Write minimal implementation**

In the script GET handler in `scripts.py`, add to the response dict:

```python
        # Sent rather than duplicated in the client. The editor's status line
        # computes written runtime live, and two copies of this number would
        # agree only until one of them was edited.
        "speaking_wpm": (videoscript.SPEAKING_WPM_NE
                         if (project or {}).get("language") == "Nepali"
                         else videoscript.SPEAKING_WPM_EN),
```

Add `import videoscript` at the top of `scripts.py` if it is not already there.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd baakhapaa-backend && ./venv/Scripts/python -m pytest tests/test_speaking_rate_payload.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add baakhapaa-backend/scripts.py baakhapaa-backend/tests/test_speaking_rate_payload.py
git commit -m "Send the speaking rate instead of copying it into the client"
```

---

## Task 6: `videoFormat.js` — the video grammar as pure functions

**Files:**
- Create: `baakhapaa-frontend/src/utils/videoFormat.js`
- Test: `baakhapaa-frontend/src/utils/videoFormat.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ELEMENTS = { NARRATION: "narration", BROLL: "broll", ON_SCREEN: "on_screen", HEADING: "section_heading" }`
  - `elementOf(line: string) -> string`
  - `enterText(currentLine: string) -> string`
  - `tabCycle(currentLine: string) -> { text: string, caretOffset: number }`
  - `sectionAt(content: string, caretLine: number) -> { name, kind, targetSeconds, wordsBefore } | null`

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-frontend/src/utils/videoFormat.test.js`:

```js
import {
  ELEMENTS, elementOf, enterText, tabCycle, sectionAt,
} from "./videoFormat";

/**
 * The video grammar, as pure functions.
 *
 * Deliberately the same shape the backend parser uses, so the editor and
 * `videoscript.py` cannot disagree about what a line is -- a line the editor
 * treats as a cue but the parser reads as narration would corrupt every
 * runtime estimate in the format.
 */

describe("what a line is", () => {
  it("reads a section heading", () => {
    expect(elementOf("## HOOK - 0:15")).toBe(ELEMENTS.HEADING);
    expect(elementOf("## OBJECTIVE")).toBe(ELEMENTS.HEADING);
  });

  it("reads the two cue kinds apart", () => {
    expect(elementOf("[B-ROLL: empty hall]")).toBe(ELEMENTS.BROLL);
    expect(elementOf("[ON SCREEN: 72%]")).toBe(ELEMENTS.ON_SCREEN);
  });

  it("reads everything else as narration", () => {
    expect(elementOf("Nobody finishes a Nepali web series.")).toBe(ELEMENTS.NARRATION);
    // No column arithmetic in this format: an indented line is still narration.
    expect(elementOf("        Nobody finishes it.")).toBe(ELEMENTS.NARRATION);
    // An all-caps line is NOT a character cue here. There are no cues.
    expect(elementOf("SUNITA")).toBe(ELEMENTS.NARRATION);
  });
});

describe("what Enter does", () => {
  it("leaves a blank line after a heading", () => {
    expect(enterText("## HOOK - 0:15")).toBe("\n\n");
  });

  it("closes a cue and returns to narration", () => {
    expect(enterText("[B-ROLL: empty hall]")).toBe("\n\n");
  });

  it("is a plain newline inside narration", () => {
    expect(enterText("Nobody finishes it.")).toBe("\n");
  });
});

describe("what Tab does", () => {
  it("turns narration into a b-roll cue with the caret inside", () => {
    const { text, caretOffset } = tabCycle("");
    expect(text).toBe("[B-ROLL: ]");
    expect(caretOffset).toBe("[B-ROLL: ".length);
  });

  it("cycles b-roll to on-screen", () => {
    expect(tabCycle("[B-ROLL: ]").text).toBe("[ON SCREEN: ]");
  });

  it("cycles on-screen back to narration", () => {
    expect(tabCycle("[ON SCREEN: ]").text).toBe("");
  });

  it("leaves a heading alone", () => {
    // Tab does not produce headings; the scaffold and completions do.
    expect(tabCycle("## HOOK - 0:15").text).toBe("## HOOK - 0:15");
  });
});

describe("which section the caret is in", () => {
  const DRAFT = [
    "## HOOK - 0:15",            // line 1
    "",                          // 2
    "Nobody finishes it.",       // 3
    "",                          // 4
    "## PROMISE - 0:20",         // 5
    "",                          // 6
    "Three things kill it.",     // 7
  ].join("\n");

  it("finds the section the caret sits in", () => {
    expect(sectionAt(DRAFT, 3).name).toBe("HOOK");
    expect(sectionAt(DRAFT, 7).name).toBe("PROMISE");
  });

  it("reads the target off the heading", () => {
    expect(sectionAt(DRAFT, 3).targetSeconds).toBe(15);
    expect(sectionAt(DRAFT, 7).targetSeconds).toBe(20);
  });

  it("has no target when the heading gives none", () => {
    expect(sectionAt("## OBJECTIVE\n\nDo the thing.", 3).targetSeconds).toBeNull();
  });

  it("counts only the words that are spoken", () => {
    // Headings and bracketed cues are not read aloud. Nobody says
    // "[B-ROLL: empty hall]".
    const d = "## HOOK\n\nOne two three.\n\n[B-ROLL: a hall]\n";
    expect(sectionAt(d, 3).wordsBefore).toBe(3);
  });

  it("returns null on an empty draft rather than a zeroed readout", () => {
    expect(sectionAt("", 1)).toBeNull();
    expect(sectionAt("   \n", 1)).toBeNull();
  });

  it("names the untitled opening when the caret is above the first heading", () => {
    const d = "Some stray narration.\n\n## HOOK\n\nWords.";
    expect(sectionAt(d, 1).name).toBe("(untitled opening)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd baakhapaa-frontend && npx vitest run src/utils/videoFormat.test.js`
Expected: FAIL — cannot resolve `./videoFormat`.

- [ ] **Step 3: Write minimal implementation**

Create `baakhapaa-frontend/src/utils/videoFormat.js`:

```js
/**
 * What the keys do, in long-form video terms.
 *
 * Parallel to `screenplayFormat.js` and deliberately NOT a mode inside it:
 * this format has no column arithmetic at all. There is no cue column, no
 * dialogue indent, and an all-caps line is narration rather than a speaker.
 * Sharing the module would put every screenplay regression one branch away
 * from a video edit.
 *
 * The patterns match `videoscript.py`'s so the editor and the parser cannot
 * disagree about what a line is.
 */
const SECTION_RE = /^\s*##\s+([^\n\-—]+?)(?:\s*[-—]\s*(\d+):(\d{1,2}))?\s*$/;
const CUE_RE = /^\s*\[([A-Z][A-Z\s-]*?):\s*(.*?)\]\s*$/;

export const ELEMENTS = {
  NARRATION: "narration",
  BROLL: "broll",
  ON_SCREEN: "on_screen",
  HEADING: "section_heading",
};

export const UNTITLED_SECTION = "(untitled opening)";

const BROLL_OPEN = "[B-ROLL: ";
const ON_SCREEN_OPEN = "[ON SCREEN: ";

export function elementOf(line) {
  const trimmed = (line || "").trim();
  if (SECTION_RE.test(trimmed)) return ELEMENTS.HEADING;
  const cue = CUE_RE.exec(trimmed);
  if (cue) {
    return cue[1].trim().toUpperCase().startsWith("ON SCREEN")
      ? ELEMENTS.ON_SCREEN
      : ELEMENTS.BROLL;
  }
  return ELEMENTS.NARRATION;
}

/**
 * A heading and a cue both END something, so both get a blank line after them.
 * Narration is continuous prose and gets a single newline.
 */
export function enterText(currentLine) {
  const el = elementOf(currentLine);
  return el === ELEMENTS.NARRATION ? "\n" : "\n\n";
}

/**
 * narration -> b-roll -> on-screen -> narration.
 *
 * Three of the four element types; the fourth is the section heading, which
 * Tab does not produce. Headings come from the scaffold and the completions,
 * because inventing one silently would put a structural boundary in a draft
 * the writer did not ask for.
 */
export function tabCycle(currentLine) {
  const el = elementOf(currentLine);
  if (el === ELEMENTS.HEADING) return { text: currentLine, caretOffset: currentLine.length };
  if (el === ELEMENTS.NARRATION) {
    return { text: `${BROLL_OPEN}]`, caretOffset: BROLL_OPEN.length };
  }
  if (el === ELEMENTS.BROLL) {
    return { text: `${ON_SCREEN_OPEN}]`, caretOffset: ON_SCREEN_OPEN.length };
  }
  return { text: "", caretOffset: 0 };
}

const WORDS = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/**
 * Which section the caret is in, and how much has been SAID in it.
 *
 * Only narration counts toward the word total. Nobody reads a heading or a
 * bracketed cue aloud, and counting them would inflate every runtime the
 * status line shows -- the same rule `videoscript.runtime_seconds` follows.
 */
export function sectionAt(content, caretLine) {
  const lines = (content || "").split("\n");
  if (!(content || "").trim()) return null;

  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const m = SECTION_RE.exec(lines[i].trim());
    if (m) {
      const next = {
        name: (m[1] || "").trim(),
        kind: null,
        targetSeconds: m[2] === undefined ? null : Number(m[2]) * 60 + Number(m[3]),
        wordsBefore: 0,
      };
      if (lineNo > caretLine && current) break;
      current = next;
      continue;
    }
    if (lineNo > caretLine) break;
    if (!current) {
      current = { name: UNTITLED_SECTION, kind: null, targetSeconds: null, wordsBefore: 0 };
    }
    if (elementOf(lines[i]) === ELEMENTS.NARRATION) {
      current.wordsBefore += WORDS(lines[i]);
    }
  }
  return current;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd baakhapaa-frontend && npx vitest run src/utils/videoFormat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add baakhapaa-frontend/src/utils/videoFormat.js baakhapaa-frontend/src/utils/videoFormat.test.js
git commit -m "Add the video grammar as pure functions, beside the screenplay one"
```

---

## Task 7: `videoKeymap.js` and the handler switch

**Files:**
- Create: `baakhapaa-frontend/src/editor/videoKeymap.js`
- Modify: `baakhapaa-frontend/src/pages/ScriptEditor.jsx:13` (import), `:1290` (handler selection)
- Test: `baakhapaa-frontend/src/editor/videoKeymap.test.js` (create)

**Interfaces:**
- Consumes: `videoFormat.enterText`, `videoFormat.tabCycle` from Task 6.
- Produces: `createVideoKeyHandler(options) -> (event) => void`, taking the **same** option object as `createScreenplayKeyHandler`: `{ nepaliMode, transliterateBehindCaret, replaceRange, suggest, dismissed, setDismissed, applySuggestion, suggestIndex, setSuggestIndex, scrollCaretIntoView, typewriter, zenMode }`.

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-frontend/src/editor/videoKeymap.test.js`:

```js
import { createVideoKeyHandler } from "./videoKeymap";

/**
 * The second factory `screenplayKeymap.js` asks for in its own header.
 *
 * It takes the SAME option object, so `ScriptEditor` chooses between the two
 * with one expression and neither knows the other exists.
 */
function harness(value, caret) {
  const replaceRange = vi.fn();
  const el = { value, selectionStart: caret, selectionEnd: caret };
  const handler = createVideoKeyHandler({
    nepaliMode: false,
    transliterateBehindCaret: vi.fn(),
    replaceRange,
    suggest: null,
    dismissed: [],
    setDismissed: vi.fn(),
    applySuggestion: vi.fn(),
    suggestIndex: 0,
    setSuggestIndex: vi.fn(),
    scrollCaretIntoView: vi.fn(),
    typewriter: false,
    zenMode: false,
  });
  return { handler, replaceRange, el };
}

const key = (k, el) => ({
  key: k, currentTarget: el, target: el,
  preventDefault: vi.fn(), shiftKey: false,
});

it("Enter after a heading leaves a blank line", () => {
  const draft = "## HOOK - 0:15";
  const { handler, replaceRange, el } = harness(draft, draft.length);

  handler(key("Enter", el));

  expect(replaceRange).toHaveBeenCalledWith(draft.length, draft.length, "\n\n");
});

it("Enter inside narration is a plain newline", () => {
  const draft = "Nobody finishes it.";
  const { handler, replaceRange, el } = harness(draft, draft.length);

  handler(key("Enter", el));

  expect(replaceRange).toHaveBeenCalledWith(draft.length, draft.length, "\n");
});

it("Tab turns an empty line into a b-roll cue", () => {
  const { handler, replaceRange, el } = harness("", 0);

  handler(key("Tab", el));

  expect(replaceRange).toHaveBeenCalledWith(0, 0, "[B-ROLL: ]");
});

it("lands the caret inside the cue it just opened", () => {
  const { handler, el } = harness("", 0);
  el.setSelectionRange = vi.fn();

  handler(key("Tab", el));

  // `[B-ROLL: ` is 9 characters; the caret belongs after them, not after `]`.
  expect(el.setSelectionRange).toHaveBeenCalledWith(9, 9);
});

it("never indents to a character column, because there are no cues", () => {
  const draft = "SUNITA";
  const { handler, replaceRange, el } = harness(draft, draft.length);

  handler(key("Enter", el));

  // The screenplay keymap would give this a dialogue indent.
  expect(replaceRange).toHaveBeenCalledWith(draft.length, draft.length, "\n");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd baakhapaa-frontend && npx vitest run src/editor/videoKeymap.test.js`
Expected: FAIL — cannot resolve `./videoKeymap`.

- [ ] **Step 3: Write minimal implementation**

Create `baakhapaa-frontend/src/editor/videoKeymap.js`:

```js
/**
 * Keyboard rules for long-form video.
 *
 * The second factory `screenplayKeymap.js` asks for in its own header:
 *
 *   "A second format needs a second factory beside this one, not a flag
 *    inside it."
 *
 * Same option object as the screenplay factory, so `ScriptEditor` picks one
 * with a single expression. The Nepali transliteration and danda rules are
 * repeated here rather than shared, because they are four lines and the
 * alternative is a module both factories depend on -- which is the coupling
 * this file exists to avoid.
 */
import { enterText, tabCycle } from "../utils/videoFormat";
import { DANDA } from "../utils/nepaliTransliterate";

export const WORD_BOUNDARY_KEYS = [" ", "Enter", ".", ",", "?", "!", ";", ":"];

const lineBounds = (value, caret) => {
  const start = value.lastIndexOf("\n", caret - 1) + 1;
  const end = value.indexOf("\n", caret);
  return { start, end: end === -1 ? value.length : end };
};

export function createVideoKeyHandler({
  nepaliMode,
  transliterateBehindCaret,
  replaceRange,
  scrollCaretIntoView,
  typewriter,
  zenMode,
}) {
  return (e) => {
    if (nepaliMode && WORD_BOUNDARY_KEYS.includes(e.key)) {
      transliterateBehindCaret(e.currentTarget);
    }
    if (nepaliMode && e.key === "|") {
      e.preventDefault();
      const ta = e.currentTarget;
      replaceRange(ta.selectionStart, ta.selectionEnd, DANDA);
      return;
    }

    const ta = e.currentTarget;
    const caret = ta.selectionStart;
    const { start, end } = lineBounds(ta.value, caret);
    const line = ta.value.slice(start, end);

    if (e.key === "Enter") {
      e.preventDefault();
      replaceRange(caret, caret, enterText(line));
      scrollCaretIntoView(typewriter || zenMode);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      // `caretOffset` is why this is not just a text swap: a cue is inserted
      // with its bracket already closed, so the caret has to land INSIDE it or
      // the writer's next keystroke goes after the `]`.
      const { text, caretOffset } = tabCycle(line);
      replaceRange(start, end, text);
      const landing = start + caretOffset;
      requestAnimationFrame(() => {
        ta.setSelectionRange(landing, landing);
        scrollCaretIntoView(typewriter || zenMode);
      });
    }
  };
}
```

Then in `ScriptEditor.jsx`, add the import beside the existing one at L13:

```js
import { createVideoKeyHandler } from "../editor/videoKeymap";
```

and at L1290 replace the direct call:

```js
  // The keyboard rules live in `editor/*Keymap.js` so they can be tested.
  // Which factory is a property of the FORMAT, decided once here -- neither
  // factory knows the other exists.
  const makeKeyHandler = format === "long_form"
    ? createVideoKeyHandler
    : createScreenplayKeyHandler;
  const handleKeyDown = makeKeyHandler({
```

`format` is already available in this component as
`script?.project?.format || script?.format` (the same expression `ScriptPage`
uses at L116). If it is not already a local, add it above the handler as
`const format = script?.project?.format || script?.format;`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd baakhapaa-frontend && npx vitest run src/editor/videoKeymap.test.js src/editor/screenplayKeymap.test.js`
Expected: PASS — the screenplay keymap tests are the regression gate.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add baakhapaa-frontend/src/editor/videoKeymap.js baakhapaa-frontend/src/editor/videoKeymap.test.js baakhapaa-frontend/src/pages/ScriptEditor.jsx
git commit -m "Give long-form video its own keymap, chosen by format"
```

---

## Task 8: Video completions

**Files:**
- Modify: `baakhapaa-frontend/src/components/FormatShortcuts.jsx`
- Test: `baakhapaa-frontend/src/components/FormatShortcuts.video.test.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `videoSuggestFor(line: string, caret: number, mode: string) -> { fragment: string, options: string[] } | null`, exported from `FormatShortcuts.jsx`.

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-frontend/src/components/FormatShortcuts.video.test.js`:

```js
import { videoSuggestFor } from "./FormatShortcuts";

/**
 * The completions a video writer needs, and NOT the screenplay ones. Offering
 * INT./EXT. in this format is offering a grammar the parser does not have.
 */
it("completes essay section headings", () => {
  const { options } = videoSuggestFor("## H", 4, "essay");
  expect(options).toContain("## HOOK");
});

it("completes course section headings", () => {
  const { options } = videoSuggestFor("## E", 4, "course");
  expect(options).toContain("## EXERCISE");
});

it("keeps the two vocabularies apart", () => {
  expect(videoSuggestFor("## H", 4, "course").options).not.toContain("## HOOK");
  expect(videoSuggestFor("## E", 4, "essay").options).not.toContain("## EXERCISE");
});

it("completes both cue kinds in either mode", () => {
  expect(videoSuggestFor("[B", 2, "essay").options).toContain("[B-ROLL: ");
  expect(videoSuggestFor("[O", 2, "course").options).toContain("[ON SCREEN: ");
});

it("offers nothing mid-narration", () => {
  expect(videoSuggestFor("Nobody finishes it", 18, "essay")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd baakhapaa-frontend && npx vitest run src/components/FormatShortcuts.video.test.js`
Expected: FAIL — `videoSuggestFor is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `FormatShortcuts.jsx`:

```js
// Section headings a writer is likely to type, per mode. Same split as
// `videoscript.SECTION_KINDS_BY_MODE` -- offering a course writer `## HOOK`
// would be offering a grammar their parser does not have.
const VIDEO_HEADINGS = {
  essay: ["## HOOK", "## PROMISE", "## SEGMENT", "## PAYOFF", "## CTA"],
  course: ["## OBJECTIVE", "## CONCEPT", "## PROOF", "## EXERCISE", "## CHECK"],
};

const VIDEO_CUES = ["[B-ROLL: ", "[ON SCREEN: "];

export function videoSuggestFor(line, caret, mode = "essay") {
  const upTo = (line || "").slice(0, caret);
  const headings = VIDEO_HEADINGS[mode] || VIDEO_HEADINGS.essay;

  if (/^\s*#{0,2}\s*[A-Za-z]*$/.test(upTo) && upTo.trim().startsWith("#")) {
    const fragment = upTo.trim();
    const options = headings.filter((h) => h.toLowerCase().startsWith(fragment.toLowerCase()));
    return options.length ? { fragment, options } : null;
  }

  if (/^\s*\[[A-Za-z-]*$/.test(upTo)) {
    const fragment = upTo.trim();
    const options = VIDEO_CUES.filter((c) => c.toLowerCase().startsWith(fragment.toLowerCase()));
    return options.length ? { fragment, options } : null;
  }

  return null;
}
```

Then, wherever the component currently calls `suggestFor(...)` to build its
option list, branch on format:

```js
  const suggestion = format === "long_form"
    ? videoSuggestFor(line, caret, mode)
    : suggestFor(line, caret, vocab);
```

`FormatShortcuts` needs `format` and `mode` props; thread them from
`ScriptEditor` the same way `vocab` is threaded today.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd baakhapaa-frontend && npx vitest run src/components/FormatShortcuts.video.test.js src/components/FormatShortcuts.test.js src/components/FormatShortcuts.completions.test.js`
Expected: PASS — the two existing files are the regression gate.

- [ ] **Step 5: Commit**

```bash
git add baakhapaa-frontend/src/components/FormatShortcuts.jsx baakhapaa-frontend/src/components/FormatShortcuts.video.test.js
git commit -m "Complete video sections and cues instead of sluglines and character cues"
```

---

## Task 9: The scaffold

**Files:**
- Create: `baakhapaa-frontend/src/lib/videoScaffold.js`
- Modify: `baakhapaa-frontend/src/components/PenPrompt.jsx:63`, `baakhapaa-frontend/src/components/ScriptPage.jsx:116`
- Test: `baakhapaa-frontend/src/lib/videoScaffold.test.js` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `scaffold(durationMinutes: number, mode: string) -> string`.

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-frontend/src/lib/videoScaffold.test.js`:

```js
import { scaffold } from "./videoScaffold";

/**
 * Deterministic, from the runtime the writer already set. Free, instant, works
 * offline, and gives the same answer twice -- which an AI structure could not.
 */
describe("an essay scaffold", () => {
  it("opens with a hook and ends with a CTA", () => {
    const lines = scaffold(12, "essay").trim().split("\n").filter(Boolean);
    expect(lines[0]).toMatch(/^## HOOK - \d+:\d{2}$/);
    expect(lines[lines.length - 1]).toMatch(/^## CTA - \d+:\d{2}$/);
  });

  it("gives every section a target", () => {
    for (const line of scaffold(12, "essay").trim().split("\n").filter(Boolean)) {
      expect(line).toMatch(/ - \d+:\d{2}$/);
    }
  });

  it("numbers its segments", () => {
    expect(scaffold(12, "essay")).toContain("## SEGMENT 1 - ");
    expect(scaffold(12, "essay")).toContain("## SEGMENT 2 - ");
  });

  it("gives a longer video more segments than a shorter one", () => {
    const count = (s) => (s.match(/## SEGMENT/g) || []).length;
    expect(count(scaffold(25, "essay"))).toBeGreaterThan(count(scaffold(8, "essay")));
  });

  it("spends the whole runtime, within a second", () => {
    const seconds = [...scaffold(12, "essay").matchAll(/ - (\d+):(\d{2})$/gm)]
      .reduce((t, m) => t + Number(m[1]) * 60 + Number(m[2]), 0);
    expect(Math.abs(seconds - 12 * 60)).toBeLessThanOrEqual(1);
  });

  it("still produces a usable shape at the format's floor", () => {
    expect((scaffold(8, "essay").match(/## SEGMENT/g) || []).length).toBeGreaterThanOrEqual(1);
  });
});

describe("a course scaffold", () => {
  it("writes the five sections in order", () => {
    expect(scaffold(12, "course").trim().split("\n").filter(Boolean)).toEqual([
      "## OBJECTIVE", "## CONCEPT", "## PROOF", "## EXERCISE", "## CHECK",
    ]);
  });

  it("offers no durations at all", () => {
    // A suggested duration on a teaching script is an invitation to pad, or to
    // cut the practice. A lesson is as long as the demonstration takes.
    expect(scaffold(12, "course")).not.toMatch(/\d+:\d{2}/);
  });

  it("ignores the runtime entirely", () => {
    expect(scaffold(8, "course")).toBe(scaffold(25, "course"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd baakhapaa-frontend && npx vitest run src/lib/videoScaffold.test.js`
Expected: FAIL — cannot resolve `./videoScaffold`.

- [ ] **Step 3: Write minimal implementation**

Create `baakhapaa-frontend/src/lib/videoScaffold.js`:

```js
/**
 * The structure, laid in rather than typed from memory.
 *
 * Deterministic and derived from the runtime the writer already set when
 * creating the project. An AI-generated structure was rejected for this: it is
 * billed, it answers differently every time, and the free tier could not have
 * it -- so the blank page would stay blank for exactly the writers who most
 * need it not to be.
 */

// Absolute, not proportional. A hook is fifteen seconds whether the video runs
// eight minutes or twenty-five; scaling it would make a long video's hook
// three times too long, which is the format's most common failure.
const FIXED = { hook: 15, promise: 20, payoff: 40, cta: 20 };

const mmss = (total) => {
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const COURSE_SECTIONS = ["OBJECTIVE", "CONCEPT", "PROOF", "EXERCISE", "CHECK"];

export function scaffold(durationMinutes, mode = "essay") {
  if (mode === "course") {
    // No targets. See the writing framework: a lesson is as long as the
    // demonstration takes, and there is no target to drift from.
    return `${COURSE_SECTIONS.map((s) => `## ${s}`).join("\n\n")}\n`;
  }

  const total = Math.max(1, Math.round(durationMinutes || 12)) * 60;
  const fixed = FIXED.hook + FIXED.promise + FIXED.payoff + FIXED.cta;
  const body = Math.max(60, total - fixed);

  // Roughly three minutes of body per segment, never fewer than two and never
  // so many that each is too short to develop anything.
  const count = Math.min(8, Math.max(2, Math.round(body / 180)));
  const per = Math.floor(body / count);
  const remainder = body - per * count;

  const lines = [
    `## HOOK - ${mmss(FIXED.hook)}`,
    `## PROMISE - ${mmss(FIXED.promise)}`,
  ];
  for (let i = 0; i < count; i += 1) {
    // The rounding remainder lands on the first segment rather than being
    // dropped, so the targets sum to the runtime the writer actually chose.
    lines.push(`## SEGMENT ${i + 1} - ${mmss(per + (i === 0 ? remainder : 0))}`);
  }
  lines.push(`## PAYOFF - ${mmss(FIXED.payoff)}`);
  lines.push(`## CTA - ${mmss(FIXED.cta)}`);

  return `${lines.join("\n\n")}\n`;
}
```

Then in `PenPrompt.jsx`, replace the single-line `long_form` entry at L63 with
the scaffold. `PenPrompt` currently receives `format`; add `duration` and
`videoCategory` props and compute the inserted text:

```js
// Was the single line `## HOOK - 0:15`. A new long-form project opens
// genuinely empty, and one heading is not a structure -- it is the first
// ninth of one.
long_form: scaffold(duration, videoCategory === "course" ? "course" : "essay"),
```

Thread both props from `ScriptPage.jsx:116`, which already passes `format`:

```js
            format={script?.project?.format || script?.format}
            duration={script?.project?.duration_minutes}
            videoCategory={script?.project?.video_category}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd baakhapaa-frontend && npx vitest run src/lib/videoScaffold.test.js src/components/PenPrompt.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add baakhapaa-frontend/src/lib/videoScaffold.js baakhapaa-frontend/src/lib/videoScaffold.test.js baakhapaa-frontend/src/components/PenPrompt.jsx baakhapaa-frontend/src/components/ScriptPage.jsx
git commit -m "Lay the structure in instead of asking the writer to remember it"
```

---

## Task 10: The pacing readout

**Files:**
- Modify: `baakhapaa-frontend/src/components/ScriptPage.jsx:98` (the status line)
- Test: `baakhapaa-frontend/src/components/ScriptPage.pacing.test.jsx` (create)

**Interfaces:**
- Consumes: `videoFormat.sectionAt` from Task 6; `speaking_wpm` from Task 5.
- Produces: no new exports — the readout renders inside the existing status line.

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-frontend/src/components/ScriptPage.pacing.test.jsx`:

```jsx
import React from "react";
import { render, screen } from "@testing-library/react";
import ScriptPage from "./ScriptPage";

/**
 * The status line is the one piece of chrome that survives focus mode, because
 * "is my work saved" is what breaks focus fastest. The pacing readout joins it
 * rather than getting a surface of its own.
 */
const DRAFT = "## HOOK - 0:15\n\n" + "word ".repeat(60).trim() + "\n";

function page(overrides = {}) {
  return render(
    <ScriptPage
      content={DRAFT}
      setContent={() => {}}
      textareaRef={{ current: null }}
      caretLine={3}
      format="long_form"
      speakingWpm={150}
      view="script"
      {...overrides}
    />,
  );
}

it("shows the section and its target", () => {
  page();
  // 60 words at 150 wpm is 24 seconds, against a 15-second target.
  expect(screen.getByText(/HOOK/)).toBeInTheDocument();
  expect(screen.getByText(/0:24 \/ 0:15/)).toBeInTheDocument();
});

it("shows no target in course mode, because there is none to drift from", () => {
  page({ content: "## OBJECTIVE\n\n" + "word ".repeat(60).trim(), videoCategory: "course" });

  expect(screen.getByText(/OBJECTIVE/)).toBeInTheDocument();
  expect(screen.queryByText(/\//)).not.toBeInTheDocument();
});

it("says nothing at all on a screenplay", () => {
  page({ format: "film", content: "INT. PASAL - DAY\n\nSteam rises." });

  expect(screen.queryByText(/HOOK/)).not.toBeInTheDocument();
});

it("says nothing on an empty draft rather than showing 0:00", () => {
  page({ content: "" });

  expect(screen.queryByText(/0:00/)).not.toBeInTheDocument();
});

it("never renders a warning when a section is over target", () => {
  // Report, never block -- the rule review.py, benchmark.py and RetentionShape
  // all follow. Over target is a measurement, not a fault.
  const { container } = page();

  expect(container.textContent).not.toMatch(/over|too long|warning/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd baakhapaa-frontend && npx vitest run src/components/ScriptPage.pacing.test.jsx`
Expected: FAIL — the readout is not rendered.

- [ ] **Step 3: Write minimal implementation**

In `ScriptPage.jsx`, accept `speakingWpm` and `videoCategory` props, and inside
the status line block at L98 add:

```jsx
        {/* Pacing, for the section the caret is in.
            It joins the status line rather than getting a surface of its own,
            because this line is already the one thing that survives focus
            mode and a writer in focus should not have to leave it to find
            out how long their hook is running. */}
        {format === "long_form" && (() => {
          const sec = sectionAt(content, caretLine);
          if (!sec) return null;
          const written = Math.round((sec.wordsBefore / (speakingWpm || 150)) * 60);
          const course = videoCategory === "course";
          return (
            <span className="font-mono text-[10px] uppercase tracking-wider text-inkMuted">
              {sec.name} {clock(written)}
              {!course && sec.targetSeconds != null && ` / ${clock(sec.targetSeconds)}`}
            </span>
          );
        })()}
```

Add the import and a small formatter beside the component:

```js
import { sectionAt } from "../utils/videoFormat";

/** m:ss, the way a writer says a duration. */
const clock = (total) =>
  `${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")}`;
```

Thread `speakingWpm={script?.speaking_wpm}` and
`videoCategory={script?.project?.video_category}` from `ScriptEditor.jsx` where
`ScriptPage` is rendered.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd baakhapaa-frontend && npx vitest run src/components/ScriptPage.pacing.test.jsx src/components/ScriptPage.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add baakhapaa-frontend/src/components/ScriptPage.jsx baakhapaa-frontend/src/components/ScriptPage.pacing.test.jsx baakhapaa-frontend/src/pages/ScriptEditor.jsx
git commit -m "Show the caret's section against its target, in the status line"
```

---

## Task 11: Section-kind craft

**Files:**
- Modify: `baakhapaa-backend/scripts.py:330` (`RecommendRequest` and the handler)
- Test: `baakhapaa-backend/tests/test_section_kind_craft.py` (create)

**Interfaces:**
- Consumes: `videoscript.mode_for` from Task 1.
- Produces: `RecommendRequest.section_kind: str | None`.

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-backend/tests/test_section_kind_craft.py`:

```python
"""Retrieval seeded by WHERE THE CARET IS, not by a typed complaint.

The six long-form video entries are already in the corpus and already filtered
by `craft_for_format`. What was missing is a way to ask for the craft of a
section kind without the writer describing a problem first -- which is the
whole point of surfacing it while they write.
"""
SEED = {
    "hook": "my hook does not earn the next ten seconds",
    "promise": "the viewer does not know what they are staying for",
    "segment": "this middle section sags and viewers drop off",
    "payoff": "my ending does not deliver what the opening promised",
    "cta": "nobody acts at the end of my video",
}


def test_every_essay_kind_has_a_seed():
    import scripts
    for kind in ("hook", "promise", "segment", "payoff", "cta"):
        assert kind in scripts.SECTION_KIND_SEED
        assert scripts.SECTION_KIND_SEED[kind].strip()


def test_the_request_accepts_a_section_kind():
    from scripts import RecommendRequest
    req = RecommendRequest(scene_text="", focus="", section_kind="hook")
    assert req.section_kind == "hook"


def test_section_kind_is_optional():
    from scripts import RecommendRequest
    assert RecommendRequest(scene_text="", focus="").section_kind is None


def test_an_unknown_kind_is_ignored_rather_than_raising():
    # A section named by a writer who invented it parses as `segment`, but a
    # client could still send anything. Falling back is correct: the request
    # still returns patterns, just not kind-seeded ones.
    import scripts
    assert scripts.seed_for_kind("nonsense") == ""
    assert scripts.seed_for_kind(None) == ""
    assert scripts.seed_for_kind("hook") == SEED["hook"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd baakhapaa-backend && ./venv/Scripts/python -m pytest tests/test_section_kind_craft.py -v`
Expected: FAIL — `SECTION_KIND_SEED` does not exist.

- [ ] **Step 3: Write minimal implementation**

In `scripts.py`, add above `RecommendRequest`:

```python
# What a writer would say about a section of this kind, if they had stopped to
# say it. Retrieval embeds the entry's PROBLEM first -- writers arrive with a
# symptom, not a label -- so seeding by kind means seeding with the symptom
# that kind most often has, not with its name.
SECTION_KIND_SEED = {
    "hook": "my hook does not earn the next ten seconds",
    "promise": "the viewer does not know what they are staying for",
    "segment": "this middle section sags and viewers drop off",
    "payoff": "my ending does not deliver what the opening promised",
    "cta": "nobody acts at the end of my video",
    "objective": "my lesson does not say what the learner will be able to do",
    "concept": "my explanation is abstract and does not govern the practice",
    "proof": "I am asserting this works without showing a measurement",
    "exercise": "my exercise is vague and the learner cannot start it",
    "check": "neither of us can tell whether the lesson landed",
}


def seed_for_kind(kind) -> str:
    """The seed for a section kind, or empty for anything unrecognised."""
    return SECTION_KIND_SEED.get(kind or "", "")
```

Add the field to `RecommendRequest`:

```python
    section_kind: Optional[str] = None
```

And in the handler, prefer the seed when there is no typed focus:

```python
    seeded = seed_for_kind(req.section_kind)
    focus = req.focus or seeded
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd baakhapaa-backend && ./venv/Scripts/python -m pytest tests/test_section_kind_craft.py -v`
Expected: PASS, 4 tests.

Run: `./venv/Scripts/python eval_retrieval.py --min-p1 0.80 --min-screenplay-p1 0.85`
Expected: both floors clear — this task touches the retrieval path and the eval is the gate.

- [ ] **Step 5: Commit**

```bash
git add baakhapaa-backend/scripts.py baakhapaa-backend/tests/test_section_kind_craft.py
git commit -m "Seed craft retrieval from the section the caret is in"
```

- [ ] **Step 6: Write the failing test for the PROOF guide copy**

Create `baakhapaa-frontend/src/lib/sectionGuide.test.js`:

```js
import { guideFor } from "./sectionGuide";

/**
 * Every other line of guide copy in this product OFFERS something. This one
 * states a rule, and it is the only one that does.
 *
 * `corpus_proof` is described in `lessons.py` as "a measurement, never a
 * quotation -- the one place the script library is allowed to speak, and it
 * speaks in numbers so that nothing copyrighted is ever reproduced." On the
 * writing page there is no field validator between a writer and a pasted page,
 * and course mode is aimed at a creator scripting something they intend to
 * SELL, which is a commercial motive to quote material this product must never
 * help reproduce.
 */
it("states the rule for PROOF rather than offering a prompt", () => {
  const copy = guideFor("proof");

  expect(copy).toMatch(/measurement/i);
  expect(copy).toMatch(/not?(a)? quot/i);
});

it("offers rather than instructs everywhere else", () => {
  for (const kind of ["hook", "promise", "segment", "payoff", "cta",
                      "objective", "concept", "exercise", "check"]) {
    expect(guideFor(kind)).toBeTruthy();
    expect(guideFor(kind)).not.toMatch(/never/i);
  }
});

it("says nothing for a section it does not know", () => {
  expect(guideFor("segment 4")).toBe("");
  expect(guideFor(null)).toBe("");
});
```

- [ ] **Step 7: Run it, implement, run again**

Run: `cd baakhapaa-frontend && npx vitest run src/lib/sectionGuide.test.js`
Expected: FAIL — cannot resolve `./sectionGuide`.

Create `baakhapaa-frontend/src/lib/sectionGuide.js`:

```js
/**
 * One line per section kind, shown beside the pacing readout.
 *
 * These OFFER -- except `proof`, which states a rule. That asymmetry is
 * deliberate and is the only place in either mode where the guide is
 * prescriptive.
 */
const GUIDE = {
  hook: "Earn the next ten seconds. Open on the thing, not on the way in.",
  promise: "Say what they are staying for, in one sentence.",
  segment: "One idea. End it somewhere different from where it started.",
  payoff: "Deliver what the opening promised, not something adjacent.",
  cta: "One action, and a reason to take it now.",
  objective: "One thing they will be able to DO, not know.",
  concept: "The idea, and why it governs the practice that follows.",
  proof: "A measurement, never a quotation. Numbers are the one way the "
       + "script library is allowed to speak here.",
  exercise: "The task, and a starter they can begin from.",
  check: "How both of you know it landed.",
};

export function guideFor(kind) {
  return GUIDE[kind] || "";
}
```

Then render it in `ScriptPage.jsx` beside the pacing readout added in Task 10,
using the kind from `sectionAt`. `sectionAt` returns `kind: null` today, so
also resolve the kind there from the section name using the same
first-word-plus-synonyms rule `videoscript._kind_of` uses, lower-cased.

Run: `npx vitest run src/lib/sectionGuide.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 8: Commit**

```bash
git add baakhapaa-frontend/src/lib/sectionGuide.js baakhapaa-frontend/src/lib/sectionGuide.test.js baakhapaa-frontend/src/components/ScriptPage.jsx baakhapaa-frontend/src/utils/videoFormat.js
git commit -m "Say what each section owes, and state the rule that PROOF carries"
```

---

## Task 12: The page, and the suppressed overlay

**Files:**
- Modify: `baakhapaa-frontend/src/index.css`, `baakhapaa-frontend/src/components/ScriptPage.jsx`, `baakhapaa-frontend/src/components/OutlineView.jsx:46`, `baakhapaa-frontend/scripts/page-layout-check.mjs`
- Test: `baakhapaa-frontend/src/components/OutlineView.course.test.jsx` (create)

**Interfaces:**
- Consumes: `videoCategory` prop threaded in Task 10.
- Produces: `.video-page` CSS class.

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-frontend/src/components/OutlineView.course.test.jsx`:

```jsx
import React from "react";
import { render, screen } from "@testing-library/react";
import OutlineView from "./OutlineView";

/**
 * The retention shape is honest about being a CONVENTION, drawn from purchased
 * attention: a viewer who owes you nothing and may leave at 0:30. A learner
 * has already enrolled, often paid, and sat down on purpose. Drawing that
 * curve over a lesson is a convention borrowed from the wrong format, which is
 * worse than no instrument at all.
 */
const SECTIONS = [
  { id: "1", title: "## OBJECTIVE", draft_json: { section_kind: "objective", minutes: 1 } },
  { id: "2", title: "## EXERCISE", draft_json: { section_kind: "exercise", minutes: 2 } },
];

it("draws the retention shape for a video essay", () => {
  render(<OutlineView scenes={SECTIONS} format="long_form" videoCategory="essay" />);

  expect(screen.getByTestId("retention-shape")).toBeInTheDocument();
});

it("does not draw it for a course", () => {
  render(<OutlineView scenes={SECTIONS} format="long_form" videoCategory="course" />);

  expect(screen.queryByTestId("retention-shape")).not.toBeInTheDocument();
});

it("still lists the sections for a course", () => {
  // Suppressing the overlay must not remove the outline itself.
  render(<OutlineView scenes={SECTIONS} format="long_form" videoCategory="course" />);

  expect(screen.getByText(/OBJECTIVE/)).toBeInTheDocument();
  expect(screen.getByText(/EXERCISE/)).toBeInTheDocument();
});
```

If `RetentionShape` does not already carry `data-testid="retention-shape"`, add
it to its outermost element as part of this step.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd baakhapaa-frontend && npx vitest run src/components/OutlineView.course.test.jsx`
Expected: FAIL — the shape renders for a course.

- [ ] **Step 3: Write minimal implementation**

In `OutlineView.jsx`, accept `videoCategory` and narrow the condition at L46:

```js
  const isLongForm = format === "long_form";
  // The retention curve is a convention drawn from PURCHASED attention. A
  // course learner has already enrolled and will not bounce at 0:30, so the
  // curve would be a convention borrowed from the wrong format -- worse than
  // no instrument at all. What replaces it for a course is not designed yet;
  // the section list alone is honest in the meantime.
  const showRetention = isLongForm && videoCategory !== "course";
```

and use `showRetention` where `isLongForm` currently gates `RetentionShape`.

In `index.css`, add beside `.screenplay-page`:

```css
/* The long-form video page.
   A video script is prose read aloud, not a screenplay page. Courier at a
   fixed measure exists so that one page equals one minute, and in this format
   runtime comes from word count instead -- so that typography enforces a rule
   the format does not have.
   One font for the whole element, deliberately: the page is a <textarea>, and
   a line inside one cannot be styled. See ScriptPage.jsx. */
.video-page {
  font-family: "Mukta", system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.75;
  max-width: 46ch;
}
```

In `ScriptPage.jsx`, apply it to the textarea's className when
`format === "long_form"`.

In `page-layout-check.mjs`, add a case asserting `.video-page` declares a
`max-width` and a `line-height`, in the style of the existing checks — this is
the only thing in the repository that can see the page's geometry, because
`vite.config.js` sets `css: false`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd baakhapaa-frontend && npx vitest run src/components/OutlineView.course.test.jsx src/components/OutlineView.test.jsx`
Expected: PASS.

Run: `node scripts/page-layout-check.mjs && node scripts/contrast-check.mjs`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add baakhapaa-frontend/src/index.css baakhapaa-frontend/src/components/ScriptPage.jsx baakhapaa-frontend/src/components/OutlineView.jsx baakhapaa-frontend/src/components/OutlineView.course.test.jsx baakhapaa-frontend/scripts/page-layout-check.mjs
git commit -m "Set a video script as prose, and keep the retention curve off a lesson"
```

---

## Task 13: Verify the typewriter band against wrapped prose

**Files:**
- Modify: `baakhapaa-frontend/src/components/ScriptPage.jsx` (only if the band is wrong)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing new. This task's deliverable is a verified answer, and a fix only if the answer is bad.

The spec names this as the one risk to verify rather than reason about: the
focus band computes `--focus-y` from `padTop + line * lineHeight - scrollTop`.
Line height stays uniform under a proportional font, but wrapping changes, so
the visual-line count shifts.

- [ ] **Step 1: Start the site in demo mode**

```bash
BAAKHAPAA_DEMO=1 node scripts/start-site.mjs
```

Confirm `/health` reports `demo: true` before going further — this machine's
`.env` otherwise points at production Postgres.

- [ ] **Step 2: Create a long-form project and accept the scaffold**

Log in as `test@example.com` / `password`, create a project with format
**Long-form Video** and a 12-minute runtime, open the editor, and click the
Pen's offer to lay in the structure.

- [ ] **Step 3: Type enough narration to wrap**

Under `## HOOK`, type at least six lines of continuous prose — long enough that
several lines wrap rather than ending at a newline.

- [ ] **Step 4: Turn on typewriter mode and check the band**

Press the typewriter toggle and move the caret up and down through the wrapped
narration. The lit band must stay centred on the caret's line.

- [ ] **Step 5: Record the answer**

If the band tracks correctly, add a comment above the band's `paintBand` in
`ScriptPage.jsx` recording that it was verified against wrapped proportional
text on this date, and commit that comment alone. If it drifts, the cause is
that `line` counts logical lines while the band needs visual ones — fix it by
measuring from the textarea's own scroll position rather than a line index, and
commit the fix with the measurement that showed it was needed.

```bash
git add baakhapaa-frontend/src/components/ScriptPage.jsx
git commit -m "Verify the typewriter band against wrapped proportional text"
```

---

## Task 14: Full-suite gate and documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run everything**

```bash
cd baakhapaa-backend && ./venv/Scripts/python -m pytest -q && ./venv/Scripts/python -m ruff check .
cd ../baakhapaa-frontend && npm run test:ci && npm run lint && CI=true npm run build
```

Expected: all green. The backend suite is slow on this machine — run it unpiped
so a slow run and a hung run can be told apart.

- [ ] **Step 2: Re-count the docs**

```bash
cd baakhapaa-backend && ./venv/Scripts/python check_docs.py
```

Expected: it reports the new counts. Update the two test-count lines in
`CLAUDE.md` to whatever it prints — never type them from memory.

- [ ] **Step 3: Record the format in CLAUDE.md**

In the `long_form` bullet under **Working**, add a sentence stating that the
editor now has video typing rules, a scaffolded structure, a per-section
pacing readout, and that `course` is a sixth `video_category` with its own
section vocabulary and two mandatory sections.

- [ ] **Step 4: Verify check_docs passes**

Run: `./venv/Scripts/python check_docs.py`
Expected: `CLAUDE.md matches the repository.`

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Record the long-form writing surface in the project state"
```
