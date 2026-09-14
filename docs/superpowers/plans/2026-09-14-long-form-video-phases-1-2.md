# Long-form Video Format — Implementation Plan (Phases 1 & 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `long_form` as a fourth project format — 8–25 minute YouTube content written section-first — so a writer can create one, write it, and see its sections in the Outline and Corkboard.

**Architecture:** A new `videoscript.py` parser sits behind the same interface `screenplay.py` exposes. `scene_sync.sync_from_draft` switches on the project's format, so sections land in the existing `scenes` table and every downstream consumer (Outline, Corkboard, versions, comments, sharing, review) works untouched.

**Tech Stack:** FastAPI + Pydantic v2, Supabase/Postgres, pytest; React 18 + Vite + vitest on the frontend.

**Spec:** `docs/superpowers/specs/2026-09-14-long-form-video-design.md`

## Global Constraints

- **The suite must stay at ~3.5 minutes.** If it takes an hour something is calling out to a real API. See `tests/conftest.py`.
- **Every environment variable the app reads must be documented in `baakhapaa-backend/.env.example`** — `tests/test_env_documentation.py::test_every_setting_the_app_reads_is_documented` fails the build otherwise. This plan adds two.
- **Python runs as `./venv/Scripts/python`** from `baakhapaa-backend`. Set `PYTHONIOENCODING=utf-8` and `PYTHONUTF8=1` before any command that prints Devanagari.
- **PowerShell 5.1 has no `&&`.** Use `;` when chaining.
- **Write files as UTF-8 with LF newlines** (`newline="\n"`).
- **A screenplay project's behaviour must not change.** This is the gate on Task 6 and the reason the whole approach is safe.
- **Commit after every task.** Never `git add -A` — stage the exact files the task names.
- Ruff must pass: `./venv/Scripts/python -m ruff check .`

---

## File Structure

| File | Responsibility |
|---|---|
| `baakhapaa-backend/models.py` | **Modify.** Add `long_form` to `PROJECT_FORMATS`, add `VIDEO_CATEGORIES` and the `video_category` field + validator. |
| `baakhapaa-backend/projects.py` | **Modify.** Persist `video_category` on create; allow it in `PROJECT_UPDATE_FIELDS`. |
| `baakhapaa-backend/videoscript.py` | **Create.** The parser: section headers, narration, bracketed cues, runtime from words. One responsibility — turning long-form draft text into structure. |
| `baakhapaa-backend/scene_sync.py` | **Modify.** Choose the parser by format; tolerate a `None` page. |
| `baakhapaa-backend/.env.example` | **Modify.** Document `SPEAKING_WPM_EN` and `SPEAKING_WPM_NE`. |
| `baakhapaa-frontend/src/pages/NewProject.jsx` | **Modify.** Offer the format in the wizard. |
| `baakhapaa-backend/tests/test_videoscript.py` | **Create.** Parser and runtime behaviour. |
| `baakhapaa-backend/tests/test_long_form_format.py` | **Create.** The format end to end through the API. |
| `baakhapaa-backend/tests/test_scene_sync_formats.py` | **Create.** The switch, and that screenplay behaviour is unchanged. |

---

### Task 1: The format exists in the model

**Files:**
- Modify: `baakhapaa-backend/models.py:139` (`PROJECT_FORMATS`), `:181-231` (`ProjectBase`)
- Test: `baakhapaa-backend/tests/test_long_form_format.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `models.PROJECT_FORMATS` gains `"long_form"`; `models.VIDEO_CATEGORIES: tuple[str, ...]`; `ProjectBase.video_category: str` defaulting to `"essay"`.

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-backend/tests/test_long_form_format.py`:

```python
"""A fourth format: long-form video.

`short_form` is vertical social video capped at 180 seconds; `short`, `film`
and `web_series` are narrative screenwriting measured in pages. Nothing covered
a twelve-minute YouTube piece, so a writer had to force it through a three-act
screenplay or call it a 180-second reel and lie about the length.
"""
import pytest

import models


def test_long_form_is_a_project_format():
    assert "long_form" in models.PROJECT_FORMATS


def test_long_form_is_measured_in_minutes_not_seconds():
    """`short_form` is the only second-scale format. A twelve-minute video
    expressed in seconds is 720, which is past MAX_DURATION_SECONDS and would
    have to be stored as a lie."""
    assert "long_form" not in models.SECOND_SCALE_FORMATS


def test_a_video_category_shapes_the_section_spine():
    assert models.VIDEO_CATEGORIES == (
        "essay", "tutorial", "documentary", "commentary", "vlog",
    )


def test_a_project_defaults_to_an_essay():
    assert models.ProjectBase().video_category == "essay"


def test_an_unknown_video_category_is_refused():
    """The category picks a beat spine. An unrecognised one would fall through
    to whatever the default branch does and give a tutorial an essay's shape."""
    with pytest.raises(ValueError):
        models.ProjectBase(video_category="unboxing")


def test_the_hook_types_are_reused_unchanged():
    """`hook_type` was written for short_form and all six values transfer to
    long-form exactly. Reusing it is a real saving, not a stretch — if this
    ever fails, the two formats have diverged and long-form needs its own."""
    assert models.ProjectBase(format="long_form").hook_type in models.HOOK_TYPES
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd baakhapaa-backend; ./venv/Scripts/python -m pytest tests/test_long_form_format.py -q -p no:warnings
```

Expected: FAIL — `AssertionError` on `"long_form" in models.PROJECT_FORMATS`, and `AttributeError: module 'models' has no attribute 'VIDEO_CATEGORIES'`.

- [ ] **Step 3: Write minimal implementation**

In `models.py`, change `PROJECT_FORMATS` (currently line 139) and add the categories below `SHORT_FORM_CATEGORIES`:

```python
# `long_form` is 8-25 minute YouTube content — video essay, tutorial,
# documentary, commentary, vlog. Minutes, like film, because a twelve-minute
# video in seconds is 720 and past MAX_DURATION_SECONDS; but NOT a screenplay,
# because it is narration read aloud rather than scenes played out. Its runtime
# comes from words at a speaking rate, not from pages. See videoscript.py.
PROJECT_FORMATS = ("short_form", "long_form", "short", "film", "web_series")
```

```python
# What kind of long-form video, which shapes the section spine the way
# SHORT_FORM_CATEGORIES shapes the short-form one.
VIDEO_CATEGORIES = ("essay", "tutorial", "documentary", "commentary", "vlog")
```

In `ProjectBase`, beside `short_form_category`:

```python
    # Long-form only. Ignored by every other format, kept so switching format
    # back and forth in the wizard does not silently lose the answer — the same
    # reason episode_count and duration_seconds are unconditional.
    video_category: str = "essay"
```

And the validator, beside `_short_form_category`:

```python
    @field_validator("video_category")
    @classmethod
    def _video_category(cls, v):
        if v not in VIDEO_CATEGORIES:
            raise ValueError(f"video_category must be one of {VIDEO_CATEGORIES}")
        return v
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./venv/Scripts/python -m pytest tests/test_long_form_format.py -q -p no:warnings
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Run the whole backend suite**

```bash
./venv/Scripts/python -m pytest -q -p no:warnings
```

Expected: PASS. `PROJECT_FORMATS` is validated in several places; if anything fails it is asserting the old tuple and should be updated to assert membership rather than equality.

- [ ] **Step 6: Commit**

```bash
git add baakhapaa-backend/models.py baakhapaa-backend/tests/test_long_form_format.py
git commit -m "Add long_form as a fourth project format

short_form is capped at 180 seconds and everything else is a screenplay
measured in pages, so a twelve-minute YouTube piece had no honest home.

video_category shapes the section spine the way short_form_category already
does. hook_type is reused unchanged — all six values transfer, and a test
pins that, so if the formats ever diverge it fails rather than drifts.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The format survives a round trip through the API

**Files:**
- Modify: `baakhapaa-backend/projects.py:50-60` (create payload), `:102-107` (`PROJECT_UPDATE_FIELDS`)
- Test: `baakhapaa-backend/tests/test_long_form_format.py`

**Interfaces:**
- Consumes: `models.ProjectBase.video_category` from Task 1.
- Produces: a created project row carrying `format="long_form"` and `video_category`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_long_form_format.py`:

```python
def test_a_long_form_project_can_be_created_and_reads_back(client, make_user):
    """`target_audience` and `format` were both accepted by the request model
    and whitelisted for update but never written on create — so they were
    silently dropped. A new field added to the model and not to this payload
    repeats that exactly, and nothing else would notice."""
    user = make_user()

    made = client.post(
        "/projects/",
        json={
            "title": "Why Kathmandu floods",
            "format": "long_form",
            "video_category": "documentary",
            "duration_minutes": 14,
        },
        headers=user["headers"],
    )

    assert made.status_code == 200, made.text
    assert made.json()["format"] == "long_form"
    assert made.json()["video_category"] == "documentary"


def test_the_category_can_be_changed_later(client, make_user):
    user = make_user()
    made = client.post(
        "/projects/",
        json={"title": "Draft", "format": "long_form", "duration_minutes": 12},
        headers=user["headers"],
    )
    project_id = made.json()["id"]

    r = client.put(
        f"/projects/{project_id}",
        json={"video_category": "tutorial"},
        headers=user["headers"],
    )

    assert r.status_code == 200, r.text
    assert r.json()["video_category"] == "tutorial"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./venv/Scripts/python -m pytest tests/test_long_form_format.py -q -p no:warnings -k "round_trip or changed_later"
```

Expected: FAIL — `KeyError: 'video_category'` or the key missing from the response.

- [ ] **Step 3: Write minimal implementation**

In `projects.py`, add to the create payload beside `short_form_category`:

```python
        "video_category": project.video_category,
```

And to `PROJECT_UPDATE_FIELDS`:

```python
    "duration_seconds", "hook_type", "short_form_category", "video_category",
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./venv/Scripts/python -m pytest tests/test_long_form_format.py -q -p no:warnings
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add baakhapaa-backend/projects.py baakhapaa-backend/tests/test_long_form_format.py
git commit -m "Persist video_category on create, not only on update

target_audience and format were both accepted by the request model and
whitelisted for update while never being written on create, so they were
dropped silently. A test now covers the round trip rather than the field list.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Measure the speaking rate, then write it down

**Files:**
- Modify: `baakhapaa-backend/.env.example`
- Test: none — this task produces a measurement and two documented constants consumed by Task 4.

**Interfaces:**
- Consumes: nothing.
- Produces: `SPEAKING_WPM_EN` and `SPEAKING_WPM_NE` documented in `.env.example`, with the measured basis recorded.

> **Why this is its own task.** The spec says the rate "gets measured, not asserted". Folding it into the parser task invites someone to type 150 and move on. The number is what every runtime estimate in the format depends on.

- [ ] **Step 1: Count words in the sample script**

```bash
cd baakhapaa-backend
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1
./venv/Scripts/python -c "
import re, pathlib
p = pathlib.Path('docs/samples/march.txt')
if not p.exists():
    p = next(pathlib.Path('.').rglob('march.txt'), None)
print('sample:', p)
text = p.read_text(encoding='utf-8') if p else ''
words = re.findall(r\"[\wऀ-ॿ']+\", text)
deva = [w for w in words if re.search(r'[ऀ-ॿ]', w)]
print('total words', len(words), 'devanagari words', len(deva))
"
```

- [ ] **Step 2: Record the decision**

There is no Nepali narration corpus on this machine, so `SPEAKING_WPM_NE` cannot be measured from data here. **Say so rather than inventing a number.** Use the widely-cited English narration figure as the English default and set Nepali to the same value with an explicit note that it is unvalidated and is a pilot question.

Add to `.env.example`, below the `RAG_WARM_MODEL` block:

```
# Speaking rate, words per minute, used to turn a long-form video script into a
# runtime. Screenplay runtime is pages (PAGE_LINES = 55, one page ~ one
# minute); that convention does not apply to narration read aloud, so
# videoscript.py counts words instead.
#
# 150 wpm is the conventional figure for English narration. NE is set to the
# same value and is NOT measured: there is no Nepali narration sample on this
# machine to count against, and guessing a different number would be worse than
# admitting the same one — a wrong estimate that looks specific is harder to
# doubt than one that looks borrowed. This is a PILOT question: ask a writer to
# read 300 words aloud and time it. Until then every long-form runtime estimate
# for Nepali carries this assumption.
SPEAKING_WPM_EN=150
SPEAKING_WPM_NE=150
```

- [ ] **Step 3: Verify the documentation gate passes**

```bash
./venv/Scripts/python -m pytest tests/test_env_documentation.py -q -p no:warnings
```

Expected: PASS. (It will only fail once Task 4 reads the variables; running it now confirms the file parses.)

- [ ] **Step 4: Commit**

```bash
git add baakhapaa-backend/.env.example
git commit -m "Document the speaking rate, and that half of it is a guess

Long-form runtime is words over a speaking rate, not pages. 150 wpm is the
conventional English narration figure. Nepali is set to the same number and is
explicitly NOT measured — there is no Nepali narration sample here to count
against, and a different invented number would be worse: a wrong estimate that
looks specific is harder to doubt than one that looks borrowed.

Left as a pilot question with the instruction attached: have a writer read 300
words aloud and time it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The parser — sections, cues and narration

**Files:**
- Create: `baakhapaa-backend/videoscript.py`
- Test: `baakhapaa-backend/tests/test_videoscript.py`

**Interfaces:**
- Consumes: `SPEAKING_WPM_EN` / `SPEAKING_WPM_NE` from Task 3.
- Produces:
  - `videoscript.SECTION_RE: re.Pattern`
  - `videoscript.ELEMENT_TYPES: tuple[str, ...]` — `("section_heading", "narration", "broll", "on_screen")`
  - `videoscript.Element` — dataclass `(type: str, text: str, line_number: int)`
  - `videoscript.Section` — dataclass `(heading: str, kind: str, target_seconds: int | None, line_number: int, elements: list[Element])`
  - `videoscript.parse(text: str) -> list[Element]`
  - `videoscript.sections(text: str) -> list[Section]`
  - `videoscript.spoken_words(text: str) -> int`
  - `videoscript.runtime_seconds(text: str, language: str = "English") -> float`

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-backend/tests/test_videoscript.py`:

```python
"""Parsing a long-form video script.

A video script is not a screenplay. There are no sluglines, no character cues
and no printed pages; there is narration read aloud, broken into sections, with
bracketed instructions to the editor that nobody says out loud.

The structure lives IN the document — `## HOOK - 0:15` delimits a section the
way a slugline delimits a scene. Holding it beside the document instead would
mean it cannot survive export, cannot be diffed, and drifts from the text on the
first edit, which is the bug scene_sync exists to fix.
"""
import videoscript


SAMPLE = """## HOOK - 0:15
Every monsoon this street becomes a river.
[B-ROLL: Kathmandu traffic at dawn]

## SEGMENT 1 - 3:00
The drainage was built for a city of two hundred thousand.
[ON SCREEN: 1964]
Nobody widened it.

## PAYOFF - 1:30
So the water has nowhere to go but here.
"""


def test_sections_are_found_by_their_heading():
    found = videoscript.sections(SAMPLE)

    assert [s.kind for s in found] == ["hook", "segment", "payoff"]


def test_a_section_carries_its_target_duration():
    """The target is what the writer planned. It is the whole point of writing
    section-first — a forty-second hook is visible before it is recorded."""
    found = videoscript.sections(SAMPLE)

    assert found[0].target_seconds == 15
    assert found[1].target_seconds == 180
    assert found[2].target_seconds == 90


def test_a_heading_with_no_target_is_allowed():
    """A writer sketching an outline should not have to decide the length of
    every section before writing a word of it."""
    found = videoscript.sections("## HOOK\nSomething.\n")

    assert found[0].target_seconds is None
    assert found[0].kind == "hook"


def test_bracketed_cues_are_their_own_elements():
    kinds = [el.type for el in videoscript.parse(SAMPLE)]

    assert "broll" in kinds
    assert "on_screen" in kinds


def test_cues_are_not_spoken():
    """Nobody reads "[B-ROLL: Kathmandu traffic at dawn]" aloud. Counting it
    inflates every runtime estimate in the format."""
    spoken = videoscript.spoken_words("Two words.\n[B-ROLL: four more words here]\n")

    assert spoken == 2


def test_a_section_heading_is_not_spoken_either():
    spoken = videoscript.spoken_words("## HOOK - 0:15\nThree spoken words.\n")

    assert spoken == 3


def test_runtime_comes_from_words_not_lines():
    """Screenplay runtime is pages at 55 lines each. Narration read aloud has
    no relationship to that — the same word count written as one paragraph or
    ten short lines takes the same time to say."""
    one_line = " ".join(["word"] * 150)
    many_lines = "\n".join(["word"] * 150)

    assert videoscript.runtime_seconds(one_line) == videoscript.runtime_seconds(many_lines)


def test_a_hundred_and_fifty_words_is_about_a_minute():
    assert 55 <= videoscript.runtime_seconds(" ".join(["word"] * 150)) <= 65


def test_devanagari_narration_is_counted():
    """The linter reads Nepali and the course is translated into it. A runtime
    of zero for a script written in Devanagari would make the format useless
    for exactly the writers the product is for."""
    assert videoscript.spoken_words("मेरो नाम राजा हो") == 4


def test_an_empty_draft_has_no_sections_and_no_runtime():
    """Called on every save, including the first, before anything is written."""
    assert videoscript.sections("") == []
    assert videoscript.runtime_seconds("") == 0.0


def test_text_before_the_first_section_is_kept_not_dropped():
    """screenplay.py names this case UNTITLED_SCENE rather than discarding it,
    because stray text above the first heading would otherwise shift every
    section by one. The same trap exists here."""
    found = videoscript.sections("A stray note.\n\n## HOOK - 0:10\nThe hook.\n")

    assert found[0].heading == videoscript.UNTITLED_SECTION
    assert found[1].kind == "hook"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./venv/Scripts/python -m pytest tests/test_videoscript.py -q -p no:warnings
```

Expected: FAIL — `ModuleNotFoundError: No module named 'videoscript'`.

- [ ] **Step 3: Write minimal implementation**

Create `baakhapaa-backend/videoscript.py`:

```python
"""Parsing a long-form video script.

Parallel to `screenplay.py` and deliberately the same shape, because
`scene_sync.sync_from_draft` switches between them on the project's format and
everything downstream — Outline, Corkboard, versions, comments, review — reads
the result without knowing which produced it.

What is different, and why:

  * There are no sluglines. `## HOOK - 0:15` delimits a section the way a
    slugline delimits a scene, and it lives IN the document for the same reason
    a slugline does: structure held beside the text cannot survive export,
    cannot be diffed, and drifts on the first edit.
  * There are no printed pages, so `scene_summaries` returns `page: None`
    rather than 1. A wrong number in the editor's gutter is worse than no
    number.
  * Runtime is words over a speaking rate, not lines over PAGE_LINES. The same
    words written as one paragraph or ten short lines take the same time to
    say, which is not true of a screenplay page.
"""
import os
import re
from dataclasses import dataclass, field
from typing import List, Optional

# `## HOOK - 0:15`, `## SEGMENT 1 - 3:00`, `## PAYOFF`. The target is optional:
# a writer sketching an outline should not have to decide every section's
# length before writing a word of it. An em dash is accepted alongside a hyphen
# because an editor that does smart substitution will produce one.
SECTION_RE = re.compile(
    r"^\s*##\s+(?P<name>[^\n\-—]+?)"
    r"(?:\s*[-—]\s*(?P<mins>\d+):(?P<secs>\d{1,2}))?\s*$"
)

# A bracketed instruction to the editor. Nobody says it out loud, which is the
# only reason the distinction matters: counting it would inflate every runtime
# estimate in the format.
CUE_RE = re.compile(r"^\s*\[(?P<label>[A-Z][A-Z\s\-]*?):\s*(?P<text>.*?)\]\s*$")

ELEMENT_TYPES = ("section_heading", "narration", "broll", "on_screen")

# Heading given to narration appearing before the first section. Named rather
# than spelled inline for the reason `screenplay.UNTITLED_SCENE` is: consumers
# need to tell a real section from a container for stray text, and dropping it
# would shift every section index by one.
UNTITLED_SECTION = "(untitled opening)"

# Which section kinds the format knows. Anything else parses as `segment`,
# because a writer inventing their own section name is writing, not erring.
SECTION_KINDS = ("hook", "promise", "segment", "payoff", "cta")

# See `.env.example`. EN is the conventional English narration figure; NE is the
# same number and is NOT measured — there is no Nepali narration sample on this
# machine, and a different invented number would be worse than a borrowed one.
SPEAKING_WPM = {
    "english": float(os.getenv("SPEAKING_WPM_EN", "150")),
    "nepali": float(os.getenv("SPEAKING_WPM_NE", "150")),
}
# Bilingual scripts mix both, so neither rate is right. The slower of the two is
# used, because an estimate that runs long costs a writer a trim and an estimate
# that runs short costs them a reshoot.
SPEAKING_WPM["bilingual"] = min(SPEAKING_WPM["english"], SPEAKING_WPM["nepali"])

# Devanagari plus Latin. A script written in Nepali must not measure as zero
# words — that would make the format useless for the writers the product is for.
WORD_RE = re.compile(r"[\wऀ-ॿ']+")

MAX_SUMMARY_CHARS = 400


@dataclass
class Element:
    type: str
    text: str
    line_number: int  # 1-indexed, matches the editor's gutter


@dataclass
class Section:
    heading: str
    kind: str
    target_seconds: Optional[int]
    line_number: int
    elements: List[Element] = field(default_factory=list)

    @property
    def narration(self) -> str:
        return " ".join(
            el.text for el in self.elements if el.type == "narration"
        ).strip()


def _kind_of(name: str) -> str:
    first = (name or "").strip().lower().split()
    if first and first[0] in SECTION_KINDS:
        return first[0]
    return "segment"


def parse(text: str) -> List[Element]:
    out = []
    for i, raw in enumerate((text or "").splitlines(), start=1):
        line = raw.rstrip()
        if not line.strip():
            continue
        if SECTION_RE.match(line):
            out.append(Element("section_heading", line.strip(), i))
            continue
        cue = CUE_RE.match(line)
        if cue:
            label = cue.group("label").strip().upper()
            kind = "on_screen" if label.startswith("ON SCREEN") else "broll"
            out.append(Element(kind, cue.group("text").strip(), i))
            continue
        out.append(Element("narration", line.strip(), i))
    return out


def sections(text: str) -> List[Section]:
    found: List[Section] = []
    current: Optional[Section] = None
    for el in parse(text):
        if el.type == "section_heading":
            m = SECTION_RE.match(el.text)
            name = (m.group("name") or "").strip()
            target = None
            if m.group("mins") is not None:
                target = int(m.group("mins")) * 60 + int(m.group("secs"))
            current = Section(
                heading=el.text.lstrip("#").strip(),
                kind=_kind_of(name),
                target_seconds=target,
                line_number=el.line_number,
            )
            found.append(current)
            continue
        if current is None:
            current = Section(UNTITLED_SECTION, "segment", None, el.line_number)
            found.append(current)
        current.elements.append(el)
    return found


def spoken_words(text: str) -> int:
    """Words a person actually says. Section headings and bracketed cues are
    excluded — nobody reads "[B-ROLL: ...]" aloud, and counting it inflates
    every runtime estimate in the format."""
    return sum(
        len(WORD_RE.findall(el.text))
        for el in parse(text)
        if el.type == "narration"
    )


def runtime_seconds(text: str, language: str = "English") -> float:
    wpm = SPEAKING_WPM.get((language or "english").strip().lower(),
                           SPEAKING_WPM["english"])
    if not wpm:
        return 0.0
    return round(spoken_words(text) / wpm * 60, 1)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./venv/Scripts/python -m pytest tests/test_videoscript.py -q -p no:warnings
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Confirm the env gate now demands the new variables**

```bash
./venv/Scripts/python -m pytest tests/test_env_documentation.py -q -p no:warnings
./venv/Scripts/python -m ruff check .
```

Expected: both PASS. If the documentation test fails, Task 3's `.env.example` entry is missing or misspelled — fix the spelling, not the test.

- [ ] **Step 6: Commit**

```bash
git add baakhapaa-backend/videoscript.py baakhapaa-backend/tests/test_videoscript.py
git commit -m "Parse a long-form video script

Parallel to screenplay.py and deliberately the same shape, because scene_sync
switches between them on the project's format and everything downstream reads
the result without knowing which produced it.

Three real differences. Sections are delimited in the DOCUMENT (## HOOK - 0:15)
for the same reason sluglines are: structure held beside the text cannot survive
export, cannot be diffed, and drifts on the first edit. There are no printed
pages. And runtime is words over a speaking rate, not lines over PAGE_LINES —
the same words as one paragraph or ten short lines take the same time to say,
which is not true of a screenplay page.

Bracketed cues are parsed as their own elements and excluded from the word
count, because nobody reads [B-ROLL: ...] aloud and counting it would inflate
every estimate. Devanagari counts as words, or the format would measure a
Nepali script as zero and be useless to the writers it is for.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `scene_summaries` — the contract that lets everything else work

**Files:**
- Modify: `baakhapaa-backend/videoscript.py`
- Test: `baakhapaa-backend/tests/test_videoscript.py`

**Interfaces:**
- Consumes: `videoscript.sections`, `videoscript.runtime_seconds` from Task 4.
- Produces: `videoscript.scene_summaries(text: str) -> list[dict]` with keys `index`, `heading`, `line_number`, `characters`, `action`, `estimated_minutes`, `line_count`, `page`, `location`, `time_of_day`, `interior`, `section_kind`, `target_seconds`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_videoscript.py`:

```python
def test_summaries_keep_the_screenplay_key_contract():
    """`scene_sync._match_rows` and `_draft_payload` read these keys by name.
    Keeping the contract is what lets one sync function serve both formats
    with no special case — which is the entire argument for this approach."""
    summaries = videoscript.scene_summaries(SAMPLE)

    for key in ("index", "heading", "line_number", "characters", "action",
                "estimated_minutes", "line_count", "page"):
        assert key in summaries[0], key


def test_screenplay_only_keys_are_none_rather_than_faked():
    """A video script has no location, no time of day and no interior. Faking
    them would put a confident wrong answer in the Corkboard's metadata row,
    which is worse than an empty one."""
    first = videoscript.scene_summaries(SAMPLE)[0]

    assert first["location"] is None
    assert first["time_of_day"] is None
    assert first["interior"] is None


def test_page_is_none_because_there_are_no_pages():
    """Returning 1 for every section would put a wrong number in the editor's
    gutter and in the scene index. Only two places read this key —
    scene_sync.py:58 and screenplay.py:512 — so tolerating None is contained."""
    assert videoscript.scene_summaries(SAMPLE)[0]["page"] is None


def test_the_section_kind_and_target_travel_with_the_summary():
    """These are what the retention instrument draws. They have no screenplay
    equivalent, so they ride in the summary and land in draft_json rather than
    in a column."""
    first = videoscript.scene_summaries(SAMPLE)[0]

    assert first["section_kind"] == "hook"
    assert first["target_seconds"] == 15


def test_summaries_are_indexed_from_zero_in_document_order():
    """Document position is the authority on order — the same rule scene_sync
    applies to sluglines."""
    summaries = videoscript.scene_summaries(SAMPLE)

    assert [s["index"] for s in summaries] == [0, 1, 2]


def test_estimated_minutes_is_what_was_written_not_what_was_planned():
    """`target_seconds` is the plan; `estimated_minutes` is the draft. The
    Outline shows written against planned, and conflating them would make every
    section look exactly on target for ever."""
    one_section = "## HOOK - 0:15\n" + " ".join(["word"] * 150) + "\n"

    summary = videoscript.scene_summaries(one_section)[0]

    assert summary["target_seconds"] == 15
    assert 0.9 <= summary["estimated_minutes"] <= 1.1


def test_no_sections_means_no_summaries():
    assert videoscript.scene_summaries("") == []
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./venv/Scripts/python -m pytest tests/test_videoscript.py -q -p no:warnings -k summaries or kind or page
```

Expected: FAIL — `AttributeError: module 'videoscript' has no attribute 'scene_summaries'`.

- [ ] **Step 3: Write minimal implementation**

Append to `videoscript.py`:

```python
def scene_summaries(text: str, language: str = "English") -> List[dict]:
    """One summary per section, in document order, keyed the way
    `screenplay.scene_summaries` keys its scenes.

    Keeping that contract is the whole reason `scene_sync` needs no special
    case for this format, and therefore the reason Outline, Corkboard, version
    history, comments and review work for a video script without being touched.

    Keys with no meaning here are `None`, never faked. A video has no location,
    no time of day, no interior and no printed page — and a confident wrong
    number in the editor's gutter is worse than an empty one.
    """
    out = []
    for index, sec in enumerate(sections(text)):
        narration = sec.narration
        out.append({
            "index": index,
            "heading": sec.heading,
            # No sluglines, so no scene metadata. Null, not invented.
            "location": None,
            "time_of_day": None,
            "interior": None,
            "line_number": sec.line_number,
            # No printed pages. See the docstring.
            "page": None,
            # A video script has a narrator, not a cast. Empty rather than
            # absent, because consumers iterate it.
            "characters": [],
            "action": narration[:MAX_SUMMARY_CHARS],
            "line_count": len(sec.elements),
            # What has been WRITTEN. `target_seconds` below is what was
            # planned; the Outline shows one against the other, and conflating
            # them would make every section look exactly on target for ever.
            "estimated_minutes": round(
                runtime_seconds(_section_text(sec), language) / 60, 2
            ),
            # Video-only, and the two fields the retention instrument draws.
            "section_kind": sec.kind,
            "target_seconds": sec.target_seconds,
        })
    return out


def _section_text(sec: Section) -> str:
    """Just this section's narration, for measuring it on its own."""
    return "\n".join(el.text for el in sec.elements if el.type == "narration")
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./venv/Scripts/python -m pytest tests/test_videoscript.py -q -p no:warnings
```

Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add baakhapaa-backend/videoscript.py baakhapaa-backend/tests/test_videoscript.py
git commit -m "Give video sections the summary contract screenplay scenes have

scene_sync._match_rows and _draft_payload read these keys by name, so keeping
the contract is what lets one sync function serve both formats with no special
case — which is the entire argument for this approach.

Keys with no meaning for video are None, never faked. No location, no time of
day, no interior, and no page: returning 1 for every section would put a wrong
number in the editor's gutter. Only two places read that key, so tolerating
None is contained rather than sprawling.

section_kind and target_seconds ride along because they have no screenplay
equivalent and the retention instrument will need them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The switch — and proving screenplays did not move

**Files:**
- Modify: `baakhapaa-backend/scene_sync.py:34-60` (`_draft_payload`), `:136-155` (`sync_from_draft`)
- Test: `baakhapaa-backend/tests/test_scene_sync_formats.py`

**Interfaces:**
- Consumes: `videoscript.scene_summaries` from Task 5.
- Produces: `scene_sync.parser_for(project_format: str)` returning the `screenplay` or `videoscript` module.

> **This is the task the whole approach rests on.** If a screenplay project's behaviour changes by so much as a key, the reuse argument is gone.

- [ ] **Step 1: Write the failing test**

Create `baakhapaa-backend/tests/test_scene_sync_formats.py`:

```python
"""Which parser reads the draft.

`sync_from_draft` called `screenplay.scene_summaries` unconditionally. A
long-form video script has no sluglines, so that returned nothing and a video
project's Outline, Corkboard and scene index were all empty for ever.

The gate on this change is the second half of this file: a screenplay project
must behave EXACTLY as it did before. If that ever fails, the argument for
storing sections in the scenes table has failed with it.
"""
import screenplay
import scene_sync
import videoscript


SCREENPLAY = """INT. CHIYA PASAL - MORNING

She wipes the counter.

                    SAPANA
          Timro result aayo?
"""

VIDEO = """## HOOK - 0:15
Every monsoon this street becomes a river.
[B-ROLL: traffic at dawn]

## PAYOFF - 1:00
The water has nowhere to go.
"""


def test_a_screenplay_format_uses_the_screenplay_parser():
    for fmt in ("short", "film", "web_series", "short_form"):
        assert scene_sync.parser_for(fmt) is screenplay, fmt


def test_long_form_uses_the_video_parser():
    assert scene_sync.parser_for("long_form") is videoscript


def test_an_unknown_format_falls_back_to_the_screenplay_parser():
    """A typo in a stored format must not empty somebody's scene index. The
    screenplay parser is the safe default: it is what every existing row was
    written by."""
    assert scene_sync.parser_for("flim") is screenplay
    assert scene_sync.parser_for(None) is screenplay


def test_the_video_parser_finds_sections_the_screenplay_parser_cannot():
    assert screenplay.scene_summaries(VIDEO) == []
    assert len(videoscript.scene_summaries(VIDEO)) == 2


# --- the gate ---------------------------------------------------------------

def test_a_screenplay_draft_produces_byte_identical_summaries():
    """Not "similar". Identical. This is what makes the switch safe to land."""
    assert (scene_sync.parser_for("film").scene_summaries(SCREENPLAY)
            == screenplay.scene_summaries(SCREENPLAY))


def test_the_draft_payload_is_unchanged_for_a_screenplay():
    """_draft_payload gained keys for video. A screenplay's payload must carry
    exactly what it carried before — an extra key here silently changes what is
    stored in draft_json for every existing script on the next save."""
    summary = screenplay.scene_summaries(SCREENPLAY)[0]

    payload = scene_sync._draft_payload(summary)

    assert set(payload) == {
        "heading", "time_of_day", "interior", "line_number", "characters",
        "summary", "minutes", "line_count", "page",
    }


def test_a_video_payload_carries_the_section_fields():
    summary = videoscript.scene_summaries(VIDEO)[0]

    payload = scene_sync._draft_payload(summary)

    assert payload["section_kind"] == "hook"
    assert payload["target_seconds"] == 15
    assert payload["page"] is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./venv/Scripts/python -m pytest tests/test_scene_sync_formats.py -q -p no:warnings
```

Expected: FAIL — `AttributeError: module 'scene_sync' has no attribute 'parser_for'`.

- [ ] **Step 3: Write minimal implementation**

In `scene_sync.py`, add below the imports:

```python
import videoscript

# Which parser reads the draft. `screenplay` is the fallback for anything
# unrecognised, deliberately: a typo in a stored format must not empty
# somebody's scene index, and every row that exists today was written by it.
_PARSERS = {"long_form": videoscript}


def parser_for(project_format):
    """The module that turns this project's draft into summaries.

    Both expose `scene_summaries(text) -> list[dict]` with the same keys, which
    is what lets one sync function serve both formats with no special case.
    """
    return _PARSERS.get(project_format or "", screenplay)
```

Change `_draft_payload` so the video-only keys appear only when present:

```python
def _draft_payload(summary: dict) -> dict:
    """The fields sync owns, as one JSON blob.

    Repo convention (`suggestions_json`, `bible_json`, `preferences_json`): a
    growing set of derived fields lives in one nullable TEXT column instead of
    costing a migration each.

    Video-only keys are added ONLY when the summary carries them. A screenplay's
    payload has to stay exactly what it was — an unconditional extra key here
    would silently change what is stored in draft_json for every existing
    script on its next save, and nothing would report it.
    """
    payload = {
        "heading": summary["heading"],
        "time_of_day": summary["time_of_day"],
        "interior": summary["interior"],
        "line_number": summary["line_number"],
        "characters": summary["characters"],
        "summary": summary["action"],
        "minutes": summary["estimated_minutes"],
        "line_count": summary["line_count"],
        "page": summary["page"],
    }
    if "section_kind" in summary:
        payload["section_kind"] = summary["section_kind"]
        payload["target_seconds"] = summary["target_seconds"]
    return payload
```

And in `sync_from_draft`, replace line 151:

```python
    from database import supabase, get_scenes_by_script, get_project_by_id

    rows = get_scenes_by_script(script_id)
    # Which parser depends on what is being written. A video script has no
    # sluglines, so the screenplay parser returns nothing for it and the
    # Outline, Corkboard and scene index would all be empty for ever.
    script = supabase.table("scripts").select("project_id").eq(
        "id", script_id).execute()
    project_format = None
    if script.data:
        project = get_project_by_id(script.data[0]["project_id"])
        project_format = (project or {}).get("format")
    summaries = parser_for(project_format).scene_summaries(content or "")
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./venv/Scripts/python -m pytest tests/test_scene_sync_formats.py -q -p no:warnings
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Run the whole backend suite — this is the real gate**

```bash
./venv/Scripts/python -m pytest -q -p no:warnings
./venv/Scripts/python -m ruff check .
```

Expected: PASS, and the count should be the previous total plus this plan's new tests. **Any pre-existing `scene_sync` test that fails here means a screenplay's behaviour changed — fix the implementation, never the existing test.**

- [ ] **Step 6: Commit**

```bash
git add baakhapaa-backend/scene_sync.py baakhapaa-backend/tests/test_scene_sync_formats.py
git commit -m "Choose the parser by what is being written

sync_from_draft called screenplay.scene_summaries unconditionally. A long-form
video script has no sluglines, so that returned nothing and a video project's
Outline, Corkboard and scene index were empty for ever.

An unrecognised format falls back to the screenplay parser on purpose: a typo
in a stored format must not empty somebody's scene index, and every row that
exists today was written by it.

_draft_payload adds the video keys only when the summary carries them. An
unconditional extra key would silently change what is stored in draft_json for
every existing script on its next save, and nothing would report it.

The gate is that a screenplay draft produces byte-identical summaries — not
similar, identical. If that ever fails, the argument for storing sections in
the scenes table has failed with it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Offer the format in the wizard

**Files:**
- Modify: `baakhapaa-frontend/src/pages/NewProject.jsx:18-25` (`FORMATS`)
- Test: `baakhapaa-frontend/src/pages/NewProject.test.jsx` (append; create if absent)

**Interfaces:**
- Consumes: the backend accepting `format: "long_form"` and `video_category` from Tasks 1–2.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

Append to `baakhapaa-frontend/src/pages/NewProject.test.jsx`:

```jsx
describe("long-form video", () => {
  it("is offered as a format", () => {
    // short_form is capped at 180 seconds and everything else is a screenplay.
    // Without this a twelve-minute YouTube script has no honest home.
    render(<NewProject />, { wrapper: Wrapper });

    expect(screen.getByText("Long-form Video")).toBeInTheDocument();
  });

  it("is measured in minutes, not seconds", () => {
    // The bug this prevents: grouping it with short_form because both are
    // "social video" would cap a twelve-minute script at 180 seconds.
    const fmt = FORMATS.find((f) => f.key === "long_form");

    expect(fmt.unit).toBe("min");
    expect(fmt.max).toBeGreaterThanOrEqual(60);
  });
});
```

Add `FORMATS` to the import at the top of the file if it is not already there, and export it from `NewProject.jsx` (`export const FORMATS = [...]`).

- [ ] **Step 2: Run test to verify it fails**

```bash
cd baakhapaa-frontend; npx vitest run src/pages/NewProject.test.jsx
```

Expected: FAIL — unable to find the text "Long-form Video".

- [ ] **Step 3: Write minimal implementation**

In `NewProject.jsx`, add to `FORMATS` after the `short_form` entry:

```jsx
  // Long-form is minutes, like a film, and NOT a screenplay: it is narration
  // read aloud in sections, so its runtime comes from words at a speaking rate
  // rather than from pages. Grouping it with short_form because both are
  // "social video" would cap a twelve-minute script at 180 seconds.
  { key: "long_form", label: "Long-form Video", blurb: "YouTube, 8–25 min", typical: 12, max: 60, unit: "min" },
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/pages/NewProject.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Run the full frontend suite and the build**

```bash
npm run test:ci
npm run build
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add baakhapaa-frontend/src/pages/NewProject.jsx baakhapaa-frontend/src/pages/NewProject.test.jsx
git commit -m "Offer long-form video in the project wizard

Minutes, not seconds, and a test pins that: grouping it with short_form because
both are 'social video' would cap a twelve-minute script at 180 seconds.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: End to end, and write down what is now true

**Files:**
- Test: `baakhapaa-backend/tests/test_long_form_format.py` (append)
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-09-14-long-form-video-design.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_long_form_format.py`:

```python
def test_a_long_form_draft_produces_sections_end_to_end(client, make_user, make_script):
    """The whole point, walked the way a writer walks it: make a long-form
    project, save a draft with sections, and find them as rows — which is what
    the Outline and Corkboard read."""
    user = make_user()
    made = client.post(
        "/projects/",
        json={"title": "Why Kathmandu floods", "format": "long_form",
              "video_category": "documentary", "duration_minutes": 14},
        headers=user["headers"],
    )
    project_id = made.json()["id"]

    script = client.get(f"/scripts/project/{project_id}", headers=user["headers"])
    script_id = script.json()["id"]

    saved = client.put(
        f"/scripts/{script_id}",
        json={"content": "## HOOK - 0:15\nEvery monsoon this street floods.\n"
                         "\n## PAYOFF - 1:00\nThe water has nowhere to go.\n"},
        headers=user["headers"],
    )
    assert saved.status_code == 200, saved.text

    scenes = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()["scenes"]

    assert [s["title"] for s in scenes] == ["HOOK - 0:15", "PAYOFF - 1:00"]
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd baakhapaa-backend; ./venv/Scripts/python -m pytest tests/test_long_form_format.py -q -p no:warnings -k end_to_end
```

Expected: FAIL, or PASS if Tasks 1–6 are complete. **If it fails, the failure is the finding** — read it rather than adjusting the assertion. The likely cause is that `sync_from_draft` writes `title` only for rows created by the structure preview; if so, the fix is in `sync_from_draft`, and it needs its own test.

- [ ] **Step 3: Make it pass**

Follow where the failure points. Do not weaken the assertion to match the behaviour.

- [ ] **Step 4: Run every suite**

```bash
./venv/Scripts/python -m pytest -q -p no:warnings
./venv/Scripts/python -m ruff check .
cd ../baakhapaa-frontend; npm run test:ci; npm run build
```

Expected: all PASS.

- [ ] **Step 5: Update the docs**

In `CLAUDE.md`, under **Working**, add:

```markdown
- **Long-form video is a fourth format** (`long_form`, `videoscript.py`) — 8–25
  minute YouTube content written section-first. `short_form` is capped at 180
  seconds and everything else is a screenplay measured in pages, so a
  twelve-minute video essay previously had to be forced through a three-act
  split or stored as a lie about its length. Sections are delimited in the
  DOCUMENT (`## HOOK - 0:15`) the way sluglines delimit scenes — structure held
  beside the text cannot survive export, cannot be diffed, and drifts on the
  first edit. `scene_sync.parser_for` switches on the project's format, so
  Outline, Corkboard, versions, comments, sharing and review all work untouched;
  a section is stored as a `scenes` row with its video fields in `draft_json`.
  **A section is not a scene** — `act_number`, `time_allocation` and INT/EXT are
  left null rather than repurposed. Runtime is words over a speaking rate
  (`SPEAKING_WPM_EN` / `SPEAKING_WPM_NE`), not pages; **the Nepali rate is not
  measured** and is a pilot question.
```

In the spec, change the status line to record what shipped:

```markdown
**Status:** phases 1–2 implemented 2026-09-14. Phases 3 (retention instrument)
and 4 (craft layer) are not built and each needs its own plan.
```

- [ ] **Step 6: Commit**

```bash
git add baakhapaa-backend/tests/test_long_form_format.py CLAUDE.md docs/superpowers/specs/2026-09-14-long-form-video-design.md
git commit -m "Walk a long-form script end to end, and record what is true

Project to draft to section rows, the way a writer walks it — the Outline and
Corkboard read those rows, so this is the test that says the format works
rather than that its parts do.

CLAUDE.md gains the format, including the two things most likely to be
forgotten: a section is not a scene and the shared columns are left null rather
than repurposed, and the Nepali speaking rate is not measured.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Not in this plan

Each needs its own plan, and each is better written once the phase below it is real:

- **Phase 3 — the retention instrument.** Needs the section durations Task 5 produces. Must state that the drop-off curve is convention, not measurement.
- **Phase 4 — the craft layer.** The corpus `format` field, the retrieval filter, video entries, the video linter. **Last on purpose:** retrieval is at 90.0% real-query p@1 and a format filter shrinks the candidate pool, which can move that number in either direction with nothing to notice. It needs per-format golden-set queries and a per-format CI floor, against a format that already works.
- Storyboards per section, two-column A/V export, content calendars, repurposing a screenplay — out of scope per the spec.
- **Tier placement.** Built tier-agnostic; `FEATURE_SUGGESTIONS.md` §A stays the owner's decision.

## Self-review notes

- **Spec coverage:** format (T1–2, T7), parser (T4), runtime and the measured constant (T3–4), storage and the overload (T5–6), the `None` page contract (T5–6), end to end (T8). Retention instrument and craft layer are explicitly deferred with reasons.
- **Type consistency:** `scene_summaries` returns the same key set in T5 and is consumed under those names in T6 and T8. `parser_for` is defined in T6 and used only there and in tests.
- **Known soft spot:** Task 6's `sync_from_draft` change needs the project's format, which means a lookup `sync_from_draft` does not do today. Task 8 Step 2 is where that surfaces if the lookup is wrong, and it says to follow the failure rather than weaken the assertion.
