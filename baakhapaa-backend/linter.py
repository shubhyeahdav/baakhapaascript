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
#
# --- on languages ----------------------------------------------------------
#
# These rules were English-only, which made the craft layer — the thing that
# distinguishes this product — silent on exactly the writing it exists for. The
# tool instructs writers to put dialogue in Nepali and action in English, so
# every dialogue-level rule (on-the-nose, directed emotion, greetings) was
# checking a language the dialogue was never going to be in.
#
# Both scripts are covered: Devanagari for writers typing Nepali directly, and
# romanised Nepali for the way people actually type on a phone keyboard. Action
# lines stay English-first because that is the documented house style, but the
# Nepali interiority verbs are here too for anyone writing action in Nepali.

# "he thinks", "she realises" — inner states the camera cannot photograph.
INTERIORITY_VERBS = re.compile(
    r"\b(thinks?|thinking|realis(?:e|es|ed)|realiz(?:e|es|ed)|remembers?|"
    r"feels?|feeling|wonders?|knows?|understands?|decides?|hopes?)\b"
    # Nepali: सोच् (think), महसुस (feel), सम्झ (remember), थाहा (know),
    # बुझ् (understand), चाहन् (want), निर्णय (decide), आशा (hope)
    r"|(सोच्|महसुस|सम्झ|थाहा|बुझ्|चाहन्|निर्णय|आशा)"
    r"|\b(sochcha|sochdai|sochyo|mahasus|samjhyo|samjhanchha|thaha chha|"
    r"bujhchha|chahanchha)\b",
    re.IGNORECASE,
)

# A parenthetical that tells the actor how to feel, instead of giving them
# something to do.
DIRECTED_EMOTION = re.compile(
    r"\((tearfully|sadly|angrily|happily|emotionally|meaningfully|knowingly|"
    r"lovingly|bitterly|coldly|warmly)\)|\b(looks?|stares?|gazes?)\s+at\s+\w+\s+"
    r"(meaningfully|knowingly|longingly|sadly)\b"
    # Nepali parentheticals: रुँदै (crying), रिसाएर (angrily), दुःखी (sad),
    # खुशी (happy), हाँस्दै (laughing), मुस्कुराउँदै (smiling), भावुक (emotional)
    r"|\((रुँदै|रुदै|रिसाएर|रिसाउँदै|दुःखी|दुखी|खुशी|खुसी|हाँस्दै|"
    r"मुस्कुराउँदै|भावुक|मायाले)\)"
    r"|\((rudai|risaera|risaudai|dukhi|khusi|hasdai|muskuraudai|bhaabuk)\)",
    re.IGNORECASE,
)

# Dialogue that states the real grievance out loud instead of circling it.
ON_THE_NOSE = re.compile(
    r"\b(you never (supported|understood|listened|cared|believed)|"
    r"you always|i feel like you|my dreams?|you don'?t (understand|care) (about )?me|"
    r"after everything i('| ha)ve done)\b"
    # Nepali: तिमीले कहिल्यै (you never), मेरो सपना (my dream),
    # तिमीलाई थाहा छैन (you don't know), बुझ्दैनौ (you don't understand),
    # मैले तिम्रो लागि (everything I did for you)
    r"|(तिमीले कहिल्यै|तपाईंले कहिल्यै|मेरो सपना|मेरा सपना|"
    r"तिमीलाई थाहा छैन|बुझ्दैनौ|बुझ्नुहुन्न|मैले तिम्रो लागि|"
    r"तिमीले मलाई कहिल्यै)"
    r"|\b(timile kahilyai|mero sapana|mero sapna|timilai thaha chhaina|"
    r"bujhdainau|maile timro lagi)\b",
    re.IGNORECASE,
)

GREETINGS = re.compile(
    r"^\s*(hi|hello|hey|namaste|namaskar|good (morning|evening|afternoon)|"
    r"how are you|k cha|kasto cha)\b[\s,.!?]*$"
    r"|^\s*(नमस्ते|नमस्कार|के छ|कस्तो छ|कसरी हुनुहुन्छ|सन्चै)[\s,.!?।]*$",
    re.IGNORECASE,
)

FAREWELLS = re.compile(
    r"^\s*(bye|goodbye|see you|see ya|take care|good night|pheri bhetaula)\b[\s,.!?]*$"
    r"|^\s*(बिदा|फेरि भेटौँला|फेरि भेटौला|जान्छु|राम्रोसँग बस्नु|शुभ रात्री)[\s,.!?।]*$",
    re.IGNORECASE,
)

MAX_ACTION_LINES = 4      # craft entry: "action paragraphs run more than four lines"
MAX_DIALOGUE_LINES = 5    # a speech nobody interrupts
MIN_SCENES_FOR_PRIVACY = 3


# How certain a rule is, which is NOT the same question as how much it matters.
#
# Writing is subjective, and a craft linter that ignores that gets switched off
# by exactly the writers worth keeping. But not every note is equally arguable,
# and the honest move is to say which kind each one is:
#
#   mechanical  A property of the medium, not an opinion. A camera cannot
#               photograph a realisation. Nobody sensible disagrees.
#   convention  Professional consensus, near-universal in practice. A writer may
#               break it knowingly; most breaks are accidents.
#   judgement   A reading. The rule spotted a shape that is often a problem and
#               is sometimes the point. Argue with it freely.
#
# `severity` stayed as it was — it answers "if this IS a problem, how much does
# it cost?". Conflating the two is what made `on_the_nose`, the most contestable
# rule here, carry the same authority as "this cannot be filmed".
MECHANICAL, CONVENTION, JUDGEMENT = "mechanical", "convention", "judgement"

_RULE_CONFIDENCE = {
    "unfilmable_interiority": MECHANICAL,
    "directed_emotion": CONVENTION,
    "action_block_too_long": CONVENTION,
    "dialogue_slab": CONVENTION,
    "on_the_nose": JUDGEMENT,
    "greeting_scene_open": JUDGEMENT,
    "farewell_scene_close": JUDGEMENT,
    "every_line_closed": JUDGEMENT,
    "consecutive_two_handers": JUDGEMENT,
}


def _flag(rule, severity, line, message, technique, scene=None):
    return {
        "rule": rule,
        "severity": severity,          # high | medium | low — what it costs
        # How arguable the note is. A writer deserves to know the difference
        # between "the camera cannot show this" and "I read this as on the nose".
        "confidence": _RULE_CONFIDENCE.get(rule, JUDGEMENT),
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
