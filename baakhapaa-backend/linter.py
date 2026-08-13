"""Craft linter — deterministic screenplay diagnostics.

Every rule here comes from a `warning_sign` already written into
`knowledge_base.json`. That is the whole design: the craft library states the
symptom in machine-checkable terms, so a rules engine can flag it and hand the
writer the technique that fixes it, complete with a worked example.

Two properties make this the free tier's core feature:
  * zero AI cost — pure Python over the parsed script
  * deterministic — the same draft always produces the same flags

Rules are intentionally conservative. A linter that fires constantly gets
switched off, and a false positive on someone's deliberate choice costs more
trust than a missed flag costs quality.
"""
import re
from typing import List

import screenplay

# Rule -> the `technique` field of the craft entry that fixes it. Retrieval
# uses this to attach how_to_apply / worked_example / warning_sign to a flag.
INTERIORITY_VERBS = re.compile(
    r"\b(thinks?|thinking|realis(?:e|es|ed)|realiz(?:e|es|ed)|remembers?|"
    r"feels?|feeling|wonders?|knows?|understands?|decides?|hopes?)\b",
    re.IGNORECASE,
)

DIRECTED_EMOTION = re.compile(
    r"\((tearfully|sadly|angrily|happily|emotionally|meaningfully|knowingly|"
    r"lovingly|bitterly|coldly|warmly)\)|\b(looks?|stares?|gazes?)\s+at\s+\w+\s+"
    r"(meaningfully|knowingly|longingly|sadly)\b",
    re.IGNORECASE,
)

ON_THE_NOSE = re.compile(
    r"\b(you never (supported|understood|listened|cared|believed)|"
    r"you always|i feel like you|my dreams?|you don'?t (understand|care) (about )?me|"
    r"after everything i('| ha)ve done)\b",
    re.IGNORECASE,
)

GREETINGS = re.compile(
    r"^\s*(hi|hello|hey|namaste|namaskar|good (morning|evening|afternoon)|"
    r"how are you|k cha|kasto cha)\b[\s,.!?]*$",
    re.IGNORECASE,
)

FAREWELLS = re.compile(
    r"^\s*(bye|goodbye|see you|see ya|take care|good night|pheri bhetaula)\b[\s,.!?]*$",
    re.IGNORECASE,
)

MAX_ACTION_LINES = 4      # craft entry: "action paragraphs run more than four lines"
MAX_DIALOGUE_LINES = 5    # a speech nobody interrupts
MIN_SCENES_FOR_PRIVACY = 3


def _flag(rule, severity, line, message, technique, scene=None):
    return {
        "rule": rule,
        "severity": severity,          # high | medium | low
        "line": line,
        "message": message,
        "technique": technique,        # matches knowledge_base.json `technique`
        "scene": scene,
    }


def lint(text: str) -> List[dict]:
    """Return flags for a draft, ordered by line number.

    Works on partial drafts — every rule reads what is present and none
    require a finished script.
    """
    if not (text or "").strip():
        return []

    elements = screenplay.parse(text)
    scs = screenplay.scenes(text)
    flags: List[dict] = []

    # --- line-level rules ---------------------------------------------------
    for el in elements:
        if el.type == "action":
            if INTERIORITY_VERBS.search(el.text):
                flags.append(_flag(
                    "unfilmable_interiority", "high", el.line_number,
                    "This action line describes what someone thinks or feels, "
                    "which the camera cannot show.",
                    "Convert inner state into something the camera can see",
                ))
            if DIRECTED_EMOTION.search(el.text):
                flags.append(_flag(
                    "directed_emotion", "medium", el.line_number,
                    "The emotion is stated rather than embodied.",
                    "Put the feeling into a physical thing that changes hands",
                ))

        if el.type == "parenthetical" and DIRECTED_EMOTION.search(el.text):
            flags.append(_flag(
                "directed_emotion", "medium", el.line_number,
                "An emotional parenthetical is doing the actor's work.",
                "Put the feeling into a physical thing that changes hands",
            ))

        if el.type == "dialogue" and ON_THE_NOSE.search(el.text):
            flags.append(_flag(
                "on_the_nose", "high", el.line_number,
                "The character states the real grievance out loud.",
                "Let them fight about the small wrong thing",
            ))

    # --- block-level rules --------------------------------------------------
    flags.extend(_action_blocks(elements))
    flags.extend(_dialogue_slabs(elements))

    # --- scene-level rules --------------------------------------------------
    for scene in scs:
        flags.extend(_scene_edges(scene))
        flags.extend(_closed_dialogue(scene))

    flags.extend(_consecutive_two_handers(scs))

    return _collapse_runs(sorted(flags, key=lambda f: (f["line"], f["rule"])))


COLLAPSE_WINDOW = 3  # lines


def _collapse_runs(flags: List[dict]) -> List[dict]:
    """Merge repeats of the same rule within a few lines into one flag.

    A five-line action paragraph that describes interiority throughout would
    otherwise produce five identical flags. That reads as noise and trains the
    writer to dismiss the panel, which costs more than the missed granularity.
    The merged flag keeps the first line and reports how many lines it covers.
    """
    collapsed: List[dict] = []
    for flag in flags:
        prev = collapsed[-1] if collapsed else None
        if (
            prev
            and prev["rule"] == flag["rule"]
            and flag["line"] - prev["_last_line"] <= COLLAPSE_WINDOW
        ):
            prev["occurrences"] += 1
            prev["_last_line"] = flag["line"]
            continue
        entry = dict(flag, occurrences=1, _last_line=flag["line"])
        collapsed.append(entry)

    for entry in collapsed:
        last = entry.pop("_last_line")
        if entry["occurrences"] > 1:
            entry["message"] += f" ({entry['occurrences']} lines, through line {last})"
    return collapsed


def _consecutive_runs(elements, kind):
    """Yield runs of consecutive same-type elements on adjacent lines."""
    run = []
    for el in elements:
        if el.type == kind and (not run or el.line_number == run[-1].line_number + 1):
            run.append(el)
        else:
            if len(run) > 0:
                yield run
            run = [el] if el.type == kind else []
    if run:
        yield run


def _action_blocks(elements):
    for run in _consecutive_runs(elements, "action"):
        if len(run) > MAX_ACTION_LINES:
            yield _flag(
                "action_block_too_long", "medium", run[0].line_number,
                f"This action paragraph runs {len(run)} lines. Past about four, "
                "readers skim it.",
                "Write description in the film's voice, not a camera manual",
            )


def _dialogue_slabs(elements):
    for run in _consecutive_runs(elements, "dialogue"):
        if len(run) > MAX_DIALOGUE_LINES:
            yield _flag(
                "dialogue_slab", "medium", run[0].line_number,
                f"{run[0].character or 'A character'} speaks for {len(run)} lines "
                "without interruption.",
                "Stop the line before the operative word",
            )


def _scene_edges(scene):
    dialogue = scene.dialogue_lines
    if not dialogue:
        return
    if GREETINGS.match(dialogue[0].text):
        yield _flag(
            "greeting_scene_open", "medium", dialogue[0].line_number,
            "The scene opens on a greeting. The scene probably starts later "
            "than you think.",
            "Start at the last possible moment, cut on the turn",
            scene.heading,
        )
    if FAREWELLS.match(dialogue[-1].text):
        yield _flag(
            "farewell_scene_close", "low", dialogue[-1].line_number,
            "The scene ends on a goodbye. Cut on the turn instead.",
            "Start at the last possible moment, cut on the turn",
            scene.heading,
        )


def _closed_dialogue(scene):
    """Every line ending in a full stop closes off subtext."""
    dialogue = scene.dialogue_lines
    if len(dialogue) < 6:
        return
    closed = sum(1 for d in dialogue if d.text.rstrip().endswith("."))
    if closed / len(dialogue) >= 0.9:
        yield _flag(
            "every_line_closed", "low", dialogue[0].line_number,
            f"{closed} of {len(dialogue)} dialogue lines end in a full stop. "
            "Nobody is interrupting or trailing off.",
            "Stop the line before the operative word",
            scene.heading,
        )


def _consecutive_two_handers(scs):
    run = []
    for scene in scs:
        if scene.is_two_hander:
            run.append(scene)
        else:
            if len(run) >= MIN_SCENES_FOR_PRIVACY:
                yield _two_hander_flag(run)
            run = []
    if len(run) >= MIN_SCENES_FOR_PRIVACY:
        yield _two_hander_flag(run)


def _two_hander_flag(run):
    return _flag(
        "consecutive_two_handers", "low", run[0].line_number,
        f"{len(run)} scenes in a row are two people alone talking.",
        "Deny the scene privacy",
        run[0].heading,
    )
