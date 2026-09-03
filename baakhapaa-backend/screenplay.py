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
import math
import re
import textwrap
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

# A shot is a camera instruction standing where action would stand. Written in
# capitals like a cue, which is why it has to be matched BEFORE the cue test:
# `ANGLE ON THE DOOR` otherwise parses as a character called ANGLE ON THE DOOR
# and puts the line beneath it in their mouth.
SHOT_RE = re.compile(
    r"^\s*(ANGLE ON|CLOSE ON|CLOSE UP|EXTREME CLOSE UP|WIDE ON|WIDE SHOT|"
    r"POV|REVERSE ANGLE|INSERT|BACK TO SCENE|AERIAL SHOT|TRACKING SHOT|"
    r"PAN TO|TILT (UP|DOWN)|PUSH IN|PULL BACK)\b",
    re.IGNORECASE,
)

# A montage opens a run of images that is not a scene and does not want a
# slugline per shot. Both spellings are standard and so is the END that closes
# them, without which everything after the montage stays inside it.
MONTAGE_RE = re.compile(
    r"^\s*(END (OF )?)?(MONTAGE|SERIES OF SHOTS)\b.*$",
    re.IGNORECASE,
)

# Television structure. A feature has none of these; an episode is unwritable
# without them, and until now they parsed as character cues — so `ACT TWO`
# became a speaker and the scene heading under it became their dialogue.
ACT_BREAK_RE = re.compile(
    r"^\s*(COLD OPEN|TEASER|TAG|"
    r"(END OF )?ACT\s+(ONE|TWO|THREE|FOUR|FIVE|SIX|[IVX]+|\d+))\b\.?\s*$",
    re.IGNORECASE,
)

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
    # Added later than the first six, and each for a format the product
    # otherwise could not hold:
    "shot",       # ANGLE ON, CLOSE ON — a director's instruction, not action
    "montage",    # MONTAGE / SERIES OF SHOTS and their END
    "act_break",  # ACT ONE, END OF ACT TWO, COLD OPEN, TAG — television
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

        # These three go before the character-cue test, not after it. All of
        # them are written in capitals on their own line, which is exactly the
        # shape of a cue — so tested later they would each become a speaker and
        # swallow the line beneath them as dialogue.
        if ACT_BREAK_RE.match(raw):
            elements.append(Element("act_break", stripped, line_number))
            in_dialogue, current_speaker = False, None
            continue

        if MONTAGE_RE.match(raw):
            elements.append(Element("montage", stripped, line_number))
            in_dialogue, current_speaker = False, None
            continue

        if SHOT_RE.match(raw):
            elements.append(Element("shot", stripped, line_number))
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



# ---------------------------------------------------------------------------
# The printed page
#
# One definition, here, because three consumers need it and each used to keep
# its own: the editor's page rules, the runtime measurement, and the PDF export.
# A writer told they are on page 6 who prints a PDF where that scene sits on
# page 8 has been lied to by their own tool, and the page is the unit of screen
# time in this craft.
# ---------------------------------------------------------------------------

# Rows per printed page, blanks included.
#
# NOT raised to the ~55 of a professionally formatted page, though it should be:
# `corpus_fingerprints.json` holds `estimated_pages`, `median_scene_pages` and
# `scene_length_curve` for 798 films measured at 45, `benchmark.py` reports a
# writer's draft as percentiles against them, and the corpus text needed to
# recompute those is not in this repo. Moving this number without rebuilding the
# corpus would put the draft and the library on two different scales and then
# report the difference back as a finding about the writing. Rebuild, then
# calibrate.
PAGE_LINES = 45


def cast_lines(text: str) -> list:
    """Every character's dialogue, gathered, with the numbers that expose voice.

    This is the reading the product did not have. The linter reads a page, the
    benchmark reads a shape, the corkboard reads an order — and none of them can
    answer the question a writer actually arrives with somewhere around page
    thirty, which is "do these two people sound the same?"

    Nothing here is a verdict. The three measures are chosen because they are
    the ones a writer can act on:

      * `avg_words` — how long a character's lines run. Two people with the same
        average are two people written at the same speed.
      * `distinct_ratio` — vocabulary spread. A character who says the same
        forty words for eighty lines has a tic, not a voice.
      * `question_share` — how often they ask rather than tell. It separates the
        character who drives a scene from the one who is driven, and it is
        usually the fastest thing to spot when two voices have collapsed.

    Sorted by line count, because the character with the most to say is the one
    whose voice costs the most when it is wrong.
    """
    elements = parse(text)

    by_speaker = {}
    for el in elements:
        if el.type != "dialogue" or not el.character:
            continue
        by_speaker.setdefault(el.character, []).append(el)

    out = []
    for name, els in by_speaker.items():
        words = [len(el.text.split()) for el in els]
        vocabulary = set()
        for el in els:
            vocabulary.update(w.strip(".,!?—-\"'").lower() for w in el.text.split())
        total_words = sum(words) or 1
        out.append({
            "name": name,
            "line_count": len(els),
            "avg_words": round(total_words / len(els), 1),
            "distinct_ratio": round(len(vocabulary) / total_words, 2),
            "question_share": round(
                sum(1 for el in els if el.text.rstrip().endswith("?")) / len(els), 2
            ),
            "lines": [
                {"line": el.line_number, "text": el.text} for el in els
            ],
        })
    out.sort(key=lambda c: c["line_count"], reverse=True)
    return out

# Characters per row, per element. Screenplay format gives dialogue a much
# narrower column than action, so measuring both at the action width undercounts
# how many rows a dialogue-heavy page really takes. Standard measures at 12pt
# Courier, which is 10 characters to the inch: action 6", dialogue 3.5".
LINE_CHARS = 60
ELEMENT_WIDTH = {
    "scene_heading": 60,
    "action": 60,
    "character": 35,
    "parenthetical": 27,
    "dialogue": 35,
    "transition": 60,
}


@dataclass
class Row:
    """One printed row -- what actually lands on the page.

    A source line is not a row. The editor is a plain textarea, so a writer
    types an action paragraph as a single very long line; printed, it occupies
    four. Counting source lines told that writer their four pages were one, and
    told the PDF to run the other three off the right edge of the paper.
    """
    text: str
    type: str  # element type, or "blank"
    character: Optional[str]
    source_line: int  # 1-indexed, matches the editor's gutter
    continued: bool = False  # a wrapped continuation of the row above


def wrap_element(text: str, width: int) -> List[str]:
    """Break one element to its column measure. Never drops characters --
    the export used to truncate at a fixed 90, silently, in the deliverable."""
    if not text:
        return [""]
    return textwrap.wrap(
        text, width=max(1, width), break_long_words=True, break_on_hyphens=False
    ) or [""]


def layout_rows(text: str) -> List[Row]:
    """The draft as printed rows, in order.

    Everything that counts pages goes through here, so the answer is the same
    whether the editor, the statistics panel or the PDF is the one asking.
    """
    lines = (text or "").split("\n")
    by_line = {el.line_number: el for el in parse(text)}
    rows: List[Row] = []
    for i, _raw in enumerate(lines, start=1):
        el = by_line.get(i)
        if el is None:
            # A blank line takes up just as much of a printed page as a written
            # one, and a screenplay is mostly blank lines.
            rows.append(Row("", "blank", None, i))
            continue
        width = ELEMENT_WIDTH.get(el.type, LINE_CHARS)
        for j, piece in enumerate(wrap_element(el.text, width)):
            rows.append(Row(piece, el.type, el.character, i, j > 0))
    return rows


def page_of(line_number: int, text: str = "") -> int:
    """1-indexed printed page holding source line `line_number`.

    `text` is optional only because a caller sometimes holds a line number and
    no draft; without it this cannot know how many rows a long line wraps to and
    assumes one row per line. Pass the text wherever you have it.
    """
    if line_number < 1:
        return 1
    if not text:
        return (line_number - 1) // PAGE_LINES + 1
    for index, row in enumerate(layout_rows(text)):
        if row.source_line == line_number:
            return index // PAGE_LINES + 1
    return page_count(text)


def page_count(text: str) -> int:
    """Printed pages in a draft."""
    # An empty draft is still one (blank) page, not zero.
    return max(1, math.ceil(len(layout_rows(text)) / PAGE_LINES))


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
    # Measured in printed rows, so a scene written as three long unbroken
    # paragraphs is not reported as three lines of screen time.
    rows = layout_rows(text)
    total_rows = len(rows)
    first_row = {}
    for _i, _row in enumerate(rows):
        first_row.setdefault(_row.source_line, _i)

    def _start_row(line_number):
        return first_row.get(line_number, total_rows)
    # A scene occupies everything from its own heading down to the next one.
    # Measuring by element count instead undercounts by about half, because a
    # screenplay page is mostly the blank lines between elements — and those
    # take up just as much of a printed page as the words do.
    starts = [sc.line_number for sc in all_scenes]
    spans = {
        sc.line_number: (
            _start_row(starts[i + 1]) if i + 1 < len(starts) else total_rows
        ) - _start_row(sc.line_number)
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
            "page": _start_row(sc.line_number) // PAGE_LINES + 1,
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
    # Only SLUGLINED scenes count. `scenes()` prepends a synthetic
    # UNTITLED_SCENE for anything above the first heading, and almost every
    # screenplay ever written has something there — "FADE IN:" alone is enough.
    # Counting it inflated scene_count by one, put a ~0.04-page phantom at the
    # front of scene_length_curve, and dragged median_scene_pages down, so the
    # corpus percentiles were computed against a scene nobody wrote.
    # `scene_summaries()` has always excluded it; this now agrees with it.
    scs = [s for s in scenes(text) if s.heading != UNTITLED_SCENE]

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
    # toolbar said "p. 1 / 5" while the Craft panel said 1.98 pages. It now
    # counts printed rows, so a long unwrapped paragraph costs what it costs.
    est_pages = round(len(layout_rows(text)) / PAGE_LINES, 2)

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
