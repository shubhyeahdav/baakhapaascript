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

# Heading given to content that appears before the first slugline. Named rather
# than spelled inline because consumers need to tell a real scene from this one:
# it is a container for stray text, not a scene anyone can shoot.
UNTITLED_SCENE = "(untitled opening)"

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
            current = Scene(heading=UNTITLED_SCENE, line_number=el.line_number)
            result.append(current)
        current.elements.append(el)

    return result


# A slugline splits into a prefix (where we are relative to outdoors), a
# location, and a time of day: "INT. CHIYA PASAL, PATAN - MORNING".
_HEADING_RE = re.compile(
    r"^\s*(?P<prefix>INT\.?/EXT\.?|EXT\.?/INT\.?|INT\.?|EXT\.?|I/E\.?)[\s.]*(?P<body>.*)$",
    re.IGNORECASE,
)
_TIME_SUFFIX_RE = re.compile(r"\s+[-–—]\s*(?P<time>[^-–—]+)\s*$")


def heading_parts(heading: str) -> dict:
    """Split a slugline into where and when.

    Downstream consumers need these separately. An image prompt handed
    "INT. CHIYA PASAL, PATAN - MORNING" as one opaque string tends to render the
    words into the frame and loses the time of day as a lighting cue.
    """
    m = _HEADING_RE.match(heading or "")
    prefix = m.group("prefix").upper().rstrip(".") if m else ""
    body = (m.group("body") if m else (heading or "")).strip()

    time_of_day = ""
    t = _TIME_SUFFIX_RE.search(body)
    if t:
        time_of_day = t.group("time").strip()
        body = body[: t.start()].strip()

    return {
        "interior": prefix.startswith("INT") or prefix.startswith("I/E"),
        "location": body,
        "time_of_day": time_of_day,
    }


# How much action text travels with a scene summary. Long enough to describe an
# image, short enough that an image prompt stays about one picture.
MAX_SUMMARY_CHARS = 400



# Lines per printed page, blanks included. This is the number the PDF export
# lays out with (A4, 12pt Courier, 16pt leading, 72pt top margin, break below
# 60pt), and it lives here rather than there so the editor's page count and the
# exported PDF's page count cannot drift apart. A writer who is told they are on
# page 6 and prints a PDF where the scene sits on page 8 has been lied to, and
# page count is the unit of screen time in this craft.
PAGE_LINES = 45


def page_of(line_number: int) -> int:
    """1-indexed printed page holding `line_number` (also 1-indexed)."""
    if line_number < 1:
        return 1
    return (line_number - 1) // PAGE_LINES + 1


def page_count(text: str) -> int:
    """Printed pages in a draft. Every line counts, blank ones included —
    a blank line takes up just as much of a page as a written one."""
    lines = (text or "").split("\n")
    # An empty draft is still one (blank) page, not zero.
    return max(1, page_of(len(lines)))


def minutes_for(line_count: int) -> float:
    """Screen minutes for a run of `line_count` printed lines.

    One page is one minute, so this is just the page fraction. Counting the
    lines *as printed* — blanks included — is the whole point: a screenplay is
    mostly white space, and measuring only the typed lines undercounted every
    runtime in the product by roughly half.

    Two decimals because a short scene is a fraction of a page, and rounding to
    a whole minute would make every scene in a 12-minute short read as 0 or 1 —
    which is how the editor's timeline came to show 0M for scenes a writer had
    actually written.
    """
    return round(line_count / PAGE_LINES, 2) if line_count else 0.0


def scene_summaries(text: str) -> List[dict]:
    """One visual summary per *written* scene, in document order.

    Only sluglined scenes are returned, so summary N always corresponds to
    slugline N — the correspondence the editor's scene index and the storyboard
    both assume. A stray note above the first slugline would otherwise shift
    every scene by one.

    Action lines carry the image and dialogue does not, so only action travels
    here; speaking characters come along separately to say who is in shot.
    """
    out = []
    index = 0
    all_scenes = scenes(text)
    total_lines = len((text or "").split("\n"))
    # A scene occupies everything from its own heading down to the next one.
    # Measuring by element count instead undercounts by about half, because a
    # screenplay page is mostly the blank lines between elements — and those
    # take up just as much of a printed page as the words do.
    starts = [sc.line_number for sc in all_scenes]
    spans = {
        sc.line_number: (starts[i + 1] if i + 1 < len(starts) else total_lines + 1) - sc.line_number
        for i, sc in enumerate(all_scenes)
    }
    for sc in all_scenes:
        if sc.heading == UNTITLED_SCENE:
            continue
        parts = heading_parts(sc.heading)
        action = " ".join(el.text for el in sc.action_lines).strip()
        out.append({
            "index": index,
            "heading": sc.heading,
            "location": parts["location"],
            "time_of_day": parts["time_of_day"],
            "interior": parts["interior"],
            "line_number": sc.line_number,
            # Which printed page this scene opens on — what a writer means by
            # "the argument on page 7", and what a scene index has to show for
            # the page number in the corner to be worth anything.
            "page": page_of(sc.line_number),
            "characters": sc.speaking_characters,
            "action": action[:MAX_SUMMARY_CHARS],
            # How long this scene actually runs, measured off the page. Without
            # it every draft-derived scene carried a runtime of zero, and the
            # editor's timeline gave a nine-scene screenplay the same width as
            # nothing at all.
            "line_count": spans.get(sc.line_number, len(sc.elements)),
            "estimated_minutes": minutes_for(spans.get(sc.line_number, len(sc.elements))),
        })
        index += 1
    return out


def statistics(text: str) -> dict:
    """Shape metrics for the writer's own script.

    Deliberately the same vocabulary as the corpus fingerprints, so a script
    can be compared against library medians without a translation layer.
    One script page is roughly one minute of screen time, and a page is ~55
    lines, which is where the page estimate comes from.
    """
    els = parse(text)
    scs = scenes(text)

    dialogue = [e for e in els if e.type == "dialogue"]
    action = [e for e in els if e.type == "action"]

    speaker_counts: dict = {}
    for e in dialogue:
        if e.character:
            speaker_counts[e.character] = speaker_counts.get(e.character, 0) + 1

    top3 = sum(sorted(speaker_counts.values(), reverse=True)[:3])
    int_count = sum(1 for s in scs if s.heading.upper().lstrip().startswith("INT"))
    ext_count = sum(1 for s in scs if s.heading.upper().lstrip().startswith("EXT"))

    # The same page count the editor shows and the PDF prints. This was
    # non-blank-lines/55 while the editor paginated on all-lines/45, so the
    # toolbar said "p. 1 / 5" while the Craft panel said 1.98 pages.
    est_pages = round(len((text or "").split("\n")) / PAGE_LINES, 2)

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
