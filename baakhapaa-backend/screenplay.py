"""Screenplay parser — turns editor text into structured elements and scenes.

Everything downstream needs this: the craft linter needs to know which lines
are action versus dialogue, `.fdx` export needs element types, and script
statistics need scene boundaries. One parser, several consumers.

Screenplay format has six element types:

    scene_heading   INT. CHIYA PASAL, PATAN - MORNING
    action          Steam rises from glasses of chiya.
    character       SANJANA
    parenthetical   (not looking up)
    dialogue        Timro result aayo?
    transition      CUT TO:

The editor stores plain text, and writers indent inconsistently, so
classification leans on shape (caps, punctuation, position) rather than on
column counts alone.
"""
import re
from dataclasses import dataclass, field
from typing import List, Optional

SCENE_HEADING_RE = re.compile(
    r"^\s*(INT\.?/EXT\.?|EXT\.?/INT\.?|INT\.?|EXT\.?|I/E\.?)[\s.]", re.IGNORECASE
)
TRANSITION_RE = re.compile(
    r"^\s*(CUT TO:|FADE (IN|OUT)\.?:?|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:"
    r"|FADE TO BLACK\.?|THE END\.?)\s*$",
    re.IGNORECASE,
)
# SANJANA · SANJANA (V.O.) · MRS. SHRESTHA (CONT'D) · RAAJA AND SANJANA
CHARACTER_RE = re.compile(
    r"^\s*(?P<name>[A-Z][A-Z0-9 .'\-]{0,38})"
    r"(?P<ext>\s*\((V\.O\.|O\.S\.|O\.C\.|CONT'D|CONT’D|CONTD)\))?\s*$"
)
PARENTHETICAL_RE = re.compile(r"^\s*\(.*\)\s*$")

ELEMENT_TYPES = (
    "scene_heading",
    "action",
    "character",
    "parenthetical",
    "dialogue",
    "transition",
)


@dataclass
class Element:
    type: str
    text: str
    line_number: int  # 1-indexed, matches the editor's gutter
    character: Optional[str] = None  # speaker, for dialogue/parenthetical


@dataclass
class Scene:
    heading: str
    line_number: int
    elements: List[Element] = field(default_factory=list)

    @property
    def speaking_characters(self) -> List[str]:
        seen = []
        for el in self.elements:
            if el.type == "character" and el.text not in seen:
                seen.append(el.text)
        return seen

    @property
    def dialogue_lines(self) -> List[Element]:
        return [el for el in self.elements if el.type == "dialogue"]

    @property
    def action_lines(self) -> List[Element]:
        return [el for el in self.elements if el.type == "action"]

    @property
    def is_two_hander(self) -> bool:
        return len(self.speaking_characters) == 2


def _looks_like_character_cue(line: str, next_line: str) -> bool:
    """A character cue is an all-caps name on its own line, followed by
    dialogue or a parenthetical.

    The follower check is what separates `SANJANA` (a cue) from a shouted
    action line like `THE DOOR SLAMS.` — nothing follows the latter.
    """
    stripped = line.strip()
    if not stripped or len(stripped) > 45:
        return False
    if stripped != stripped.upper():
        return False
    if stripped.endswith((".", "!", "?", ",")) and not stripped.endswith(("JR.", "SR.")):
        return False
    if not CHARACTER_RE.match(line):
        return False
    if not re.search(r"[A-Z]", stripped):
        return False
    return bool(next_line.strip())


def parse(text: str) -> List[Element]:
    """Classify every non-blank line into a screenplay element."""
    lines = (text or "").split("\n")
    elements: List[Element] = []
    current_speaker: Optional[str] = None
    # True while inside a dialogue block (after a cue, until a blank line)
    in_dialogue = False

    for i, raw in enumerate(lines):
        line_number = i + 1
        stripped = raw.strip()

        if not stripped:
            in_dialogue = False
            current_speaker = None
            continue

        next_line = lines[i + 1] if i + 1 < len(lines) else ""

        if SCENE_HEADING_RE.match(raw):
            elements.append(Element("scene_heading", stripped, line_number))
            in_dialogue, current_speaker = False, None
            continue

        if TRANSITION_RE.match(raw):
            elements.append(Element("transition", stripped, line_number))
            in_dialogue, current_speaker = False, None
            continue

        if _looks_like_character_cue(raw, next_line):
            name = re.sub(r"\s*\((V\.O\.|O\.S\.|O\.C\.|CONT'D|CONT’D|CONTD)\)", "",
                          stripped, flags=re.IGNORECASE).strip()
            elements.append(Element("character", name, line_number))
            current_speaker, in_dialogue = name, True
            continue

        if PARENTHETICAL_RE.match(raw) and in_dialogue:
            elements.append(Element("parenthetical", stripped, line_number, current_speaker))
            continue

        if in_dialogue:
            elements.append(Element("dialogue", stripped, line_number, current_speaker))
            continue

        elements.append(Element("action", stripped, line_number))

    return elements


def scenes(text: str) -> List[Scene]:
    """Group elements into scenes. Content before the first slugline becomes
    an untitled scene so nothing is silently dropped."""
    result: List[Scene] = []
    current: Optional[Scene] = None

    for el in parse(text):
        if el.type == "scene_heading":
            current = Scene(heading=el.text, line_number=el.line_number)
            result.append(current)
            continue
        if current is None:
            current = Scene(heading="(untitled opening)", line_number=el.line_number)
            result.append(current)
        current.elements.append(el)

    return result


def statistics(text: str) -> dict:
    """Shape metrics for the writer's own script.

    Deliberately the same vocabulary as the corpus fingerprints, so a script
    can be compared against library medians without a translation layer.
    One script page is roughly one minute of screen time, and a page is ~55
    lines, which is where the page estimate comes from.
    """
    els = parse(text)
    scs = scenes(text)
    total_lines = len([l for l in (text or "").split("\n") if l.strip()])

    dialogue = [e for e in els if e.type == "dialogue"]
    action = [e for e in els if e.type == "action"]

    speaker_counts: dict = {}
    for e in dialogue:
        if e.character:
            speaker_counts[e.character] = speaker_counts.get(e.character, 0) + 1

    top3 = sum(sorted(speaker_counts.values(), reverse=True)[:3])
    int_count = sum(1 for s in scs if s.heading.upper().lstrip().startswith("INT"))
    ext_count = sum(1 for s in scs if s.heading.upper().lstrip().startswith("EXT"))

    est_pages = round(total_lines / 55, 2) if total_lines else 0.0

    return {
        "scene_count": len(scs),
        "estimated_pages": est_pages,
        "estimated_minutes": est_pages,  # one page ≈ one minute
        "dialogue_lines": len(dialogue),
        "action_lines": len(action),
        "dialogue_action_ratio": round(len(dialogue) / len(action), 2) if action else None,
        "character_count": len(speaker_counts),
        "speaking_top3_share": round(top3 / len(dialogue), 2) if dialogue else None,
        "int_ext_ratio": round(int_count / (int_count + ext_count), 2) if (int_count + ext_count) else None,
        "speaking_characters": sorted(speaker_counts, key=speaker_counts.get, reverse=True),
        "lines_per_character": speaker_counts,
    }
