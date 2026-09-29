"""Parsing a long-form video script.

Parallel to `screenplay.py` and deliberately the same shape, because
`scene_sync.sync_from_draft` switches between them on the project's format and
everything downstream — Outline, Corkboard, versions, comments, review — reads
the result without knowing which produced it.

What is different, and why:

  * **There are no sluglines.** `## HOOK - 0:15` delimits a section the way a
    slugline delimits a scene, and it lives IN the document for the same reason
    a slugline does: structure held beside the text cannot survive export,
    cannot be diffed, and drifts from the words on the first edit. That is the
    bug `scene_sync` exists to fix.
  * **There are no printed pages**, so `scene_summaries` returns `page: None`
    rather than 1. A confident wrong number in the editor's gutter is worse
    than an empty one.
  * **Runtime is words over a speaking rate**, not lines over `PAGE_LINES`. The
    same words written as one paragraph or as ten short lines take the same
    time to say, which is not true of a screenplay page.
"""
import os
import re
from dataclasses import dataclass, field
from typing import List, Optional

# `## HOOK - 0:15`, `## SEGMENT 1 - 3:00`, `## PAYOFF`. The target is optional:
# a writer sketching an outline should not have to decide every section's
# length before writing a word of it. An em dash is accepted alongside a hyphen
# because an editor doing smart substitution will produce one.
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

# See `.env.example`. EN is the conventional English narration figure. NE is the
# same number and is NOT measured: there is no Nepali narration sample on this
# machine to count against, and a different invented number would be worse than
# a borrowed one — a wrong estimate that looks specific is harder to doubt.
SPEAKING_WPM = {
    "english": float(os.getenv("SPEAKING_WPM_EN", "150")),
    "nepali": float(os.getenv("SPEAKING_WPM_NE", "150")),
}
# A bilingual script mixes both, so neither rate is right. The slower of the two
# is used, because an estimate that runs long costs a writer a trim and an
# estimate that runs short costs them a reshoot.
SPEAKING_WPM["bilingual"] = min(SPEAKING_WPM["english"], SPEAKING_WPM["nepali"])

# Devanagari alongside Latin. A script written in Nepali must not measure as
# zero words — that would make the format useless for exactly the writers this
# product is for.
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


def parse(text: str) -> List[Element]:
    """Every line, typed. Blank lines are dropped — they carry no meaning here,
    unlike on a screenplay page where they separate elements."""
    out = []
    for i, raw in enumerate((text or "").splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        if SECTION_RE.match(line):
            out.append(Element("section_heading", line, i))
            continue
        cue = CUE_RE.match(line)
        if cue:
            label = cue.group("label").strip().upper()
            kind = "on_screen" if label.startswith("ON SCREEN") else "broll"
            out.append(Element(kind, cue.group("text").strip(), i))
            continue
        out.append(Element("narration", line, i))
    return out


def sections(text: str, mode: str = DEFAULT_MODE) -> List[Section]:
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
                kind=_kind_of(name, mode),
                target_seconds=target,
                line_number=el.line_number,
            )
            found.append(current)
            continue
        if current is None:
            # Stray text above the first heading. Kept, not dropped: discarding
            # it would shift every section index by one, and the index is what
            # the editor's rail and the Corkboard count.
            current = Section(UNTITLED_SECTION, "segment", None, el.line_number)
            found.append(current)
        current.elements.append(el)
    return found


def spoken_words(text: str) -> int:
    """Words a person actually says.

    Section headings and bracketed cues are excluded. Nobody reads
    "[B-ROLL: ...]" aloud, and counting it inflates every runtime estimate in
    the format.
    """
    return sum(
        len(WORD_RE.findall(el.text))
        for el in parse(text)
        if el.type == "narration"
    )


def wpm_for(language: Optional[str] = "English") -> float:
    """Look up the speaking rate for a given language.

    Handles English, Nepali, Bilingual (the minimum of the two), and any
    unrecognized language (defaults to English). Handles None gracefully.
    """
    return SPEAKING_WPM.get(
        (language or "english").strip().lower(), SPEAKING_WPM["english"]
    )


def runtime_seconds(text: str, language: str = "English") -> float:
    wpm = wpm_for(language)
    if not wpm:
        return 0.0
    return round(spoken_words(text) / wpm * 60, 1)


def _section_text(sec: Section) -> str:
    """Just this section's narration, for measuring it on its own."""
    return "\n".join(el.text for el in sec.elements if el.type == "narration")


def scene_summaries(text: str, language: str = "English",
                    mode: str = DEFAULT_MODE) -> List[dict]:
    """One summary per section, in document order, keyed the way
    `screenplay.scene_summaries` keys its scenes.

    Keeping that contract is the whole reason `scene_sync` needs no special
    case for this format, and therefore the reason Outline, Corkboard, version
    history, comments and review work for a video script without being touched.

    Keys with no meaning here are `None`, never faked. A video has no location,
    no time of day, no interior and no printed page.
    """
    out = []
    for index, sec in enumerate(sections(text, mode)):
        narration = sec.narration
        out.append({
            "index": index,
            "heading": sec.heading,
            # No sluglines, so no scene metadata. Null, not invented.
            "location": None,
            "time_of_day": None,
            "interior": None,
            "line_number": sec.line_number,
            # No printed pages. Returning 1 for every section would put a wrong
            # number in the editor's gutter and in the scene index.
            "page": None,
            # A video script has a narrator, not a cast. Empty rather than
            # absent, because consumers iterate it.
            "characters": [],
            "action": narration[:MAX_SUMMARY_CHARS],
            "line_count": len(sec.elements),
            # What has been WRITTEN. `target_seconds` below is what was planned;
            # the Outline shows one against the other, and conflating them would
            # make every section look exactly on target for ever.
            "estimated_minutes": round(
                runtime_seconds(_section_text(sec), language) / 60, 2
            ),
            # Video-only, and the two fields the retention instrument will draw.
            "section_kind": sec.kind,
            "target_seconds": sec.target_seconds,
        })
    return out
