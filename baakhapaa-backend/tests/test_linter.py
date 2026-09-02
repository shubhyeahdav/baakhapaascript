"""Craft linter.

Each rule maps to a `technique` that exists in knowledge_base.json — that link
is what lets a flag carry a fix, so it is asserted rather than assumed.
"""
import json
import os

import linter


def _rules(text):
    return {f["rule"] for f in linter.lint(text)}


def _flag(text, rule):
    return next(f for f in linter.lint(text) if f["rule"] == rule)


def test_empty_draft_produces_no_flags():
    assert linter.lint("") == []
    assert linter.lint("   \n\n  ") == []


def test_unfilmable_interiority_in_action():
    text = "INT. ROOM - DAY\n\nRaaja realises his father was right all along.\n"
    assert "unfilmable_interiority" in _rules(text)


def test_camera_visible_action_is_not_flagged():
    text = "INT. ROOM - DAY\n\nRaaja turns the photograph face-down.\n"
    assert "unfilmable_interiority" not in _rules(text)


def test_on_the_nose_dialogue():
    """The craft entry's warning sign names this line almost verbatim."""
    text = (
        "INT. KITCHEN - NIGHT\n\n"
        "                      RAAJA\n"
        "          You never supported my dreams!\n"
    )
    flag = _flag(text, "on_the_nose")
    assert flag["severity"] == "high"
    assert flag["technique"] == "Let them fight about the small wrong thing"


def test_directed_emotion_parenthetical():
    text = (
        "INT. KITCHEN - NIGHT\n\n"
        "                      RAAJA\n"
        "              (tearfully)\n"
        "          Huncha.\n"
    )
    assert "directed_emotion" in _rules(text)


def test_long_action_block():
    body = "\n".join(f"He moves another chair across the room, number {i}." for i in range(6))
    assert "action_block_too_long" in _rules(f"INT. ROOM - DAY\n\n{body}\n")


def test_short_action_block_is_fine():
    body = "\n".join(["He crosses the room.", "He sits.", "He waits."])
    assert "action_block_too_long" not in _rules(f"INT. ROOM - DAY\n\n{body}\n")


def test_dialogue_slab():
    speech = "\n".join(f"          And another thing, point number {i}." for i in range(7))
    text = f"INT. ROOM - DAY\n\n                      RAAJA\n{speech}\n"
    assert "dialogue_slab" in _rules(text)


def test_greeting_opens_the_scene():
    text = (
        "INT. CHIYA PASAL - MORNING\n\n"
        "                      SANJANA\n"
        "          Namaste.\n\n"
        "                      RAAJA\n"
        "          Timro result aayo?\n"
    )
    flag = _flag(text, "greeting_scene_open")
    assert flag["technique"] == "Start at the last possible moment, cut on the turn"


def test_three_consecutive_two_handers():
    scene = (
        "INT. ROOM {i} - DAY\n\n"
        "                      RAAJA\n"
        "          Line one.\n\n"
        "                      SANJANA\n"
        "          Line two.\n\n"
    )
    text = "".join(scene.format(i=i) for i in range(3))
    assert "consecutive_two_handers" in _rules(text)


def test_flags_are_ordered_by_line():
    text = (
        "INT. ROOM - DAY\n\n"
        "Raaja realises something.\n\n"
        "                      RAAJA\n"
        "          You never supported my dreams!\n"
    )
    lines = [f["line"] for f in linter.lint(text)]
    assert lines == sorted(lines)


def test_repeats_of_one_rule_collapse_into_a_single_flag():
    """A paragraph that is interior throughout must not produce one flag per
    line — repetition trains the writer to dismiss the panel."""
    body = "\n".join([
        "He realises it was always going to end this way.",
        "He remembers the rooftop.",
        "He knows what comes next.",
    ])
    flags = [f for f in linter.lint(f"INT. ROOM - DAY\n\n{body}\n")
             if f["rule"] == "unfilmable_interiority"]
    assert len(flags) == 1
    assert flags[0]["occurrences"] == 3
    assert "3 lines" in flags[0]["message"]


def test_distant_repeats_are_kept_separate():
    """Collapsing must not swallow a genuinely separate occurrence later on."""
    text = (
        "INT. ROOM - DAY\n\nHe realises it.\n\n"
        "                      RAAJA\n          Ho.\n\n"
        "INT. ROOFTOP - NIGHT\n\nShe remembers the argument.\n"
    )
    flags = [f for f in linter.lint(text) if f["rule"] == "unfilmable_interiority"]
    assert len(flags) == 2


def test_works_on_an_incomplete_draft():
    """The writer most in need of feedback has half a scene, not a script."""
    text = "INT. CHIYA PASAL - MORNING\n\nRaaja feels the weight of it.\n"
    assert "unfilmable_interiority" in _rules(text)


def test_every_rule_points_at_a_real_craft_entry():
    """A flag whose technique doesn't exist in the library cannot show a fix."""
    kb_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "knowledge_base.json")
    with open(kb_path, encoding="utf-8") as f:
        known = {e["technique"] for e in json.load(f)}

    samples = [
        "INT. ROOM - DAY\n\nRaaja realises it.\n",
        "INT. ROOM - DAY\n\nShe looks at him meaningfully.\n",
        "INT. ROOM - DAY\n\n     RAAJA\n          You never supported my dreams!\n",
        "INT. ROOM - DAY\n\n" + "\n".join(f"Action line {i}." for i in range(6)) + "\n",
    ]
    seen = {f["technique"] for s in samples for f in linter.lint(s)}
    assert seen, "no flags produced"
    assert seen <= known, f"unknown techniques: {seen - known}"


# --- the synthetic opening is not a scene --------------------------------
#
# `scenes()` prepends an UNTITLED_SCENE for anything above the first slugline,
# and almost every screenplay has something there: "FADE IN:" alone is enough.
# `statistics()` counted it, so a 16-scene script reported 17, a ~0.04-page
# phantom led scene_length_curve, and median_scene_pages was dragged down —
# which meant the corpus percentiles were computed partly against a scene
# nobody wrote. Found by writing an actual screenplay and counting the
# headings by hand.

FADE_IN_SCRIPT = (
    "FADE IN:\n\n"
    "INT. CHIYA PASAL - MORNING\n\n"
    "Sanjana wipes the counter.\n\n"
    "EXT. STREET - DAY\n\n"
    "She walks.\n"
)


def test_a_fade_in_is_not_counted_as_a_scene():
    import screenplay
    assert screenplay.statistics(FADE_IN_SCRIPT)["scene_count"] == 2


def test_statistics_agrees_with_the_scene_index():
    """These two disagreed by one, and the editor shows both."""
    import screenplay
    stats = screenplay.statistics(FADE_IN_SCRIPT)
    assert stats["scene_count"] == len(screenplay.scene_summaries(FADE_IN_SCRIPT))


def test_a_script_with_no_preamble_is_unaffected():
    import screenplay
    no_preamble = FADE_IN_SCRIPT.replace("FADE IN:" + chr(10) + chr(10), "")
    assert screenplay.statistics(no_preamble)["scene_count"] == 2
