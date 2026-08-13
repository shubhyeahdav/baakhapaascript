"""Screenplay parsing — the foundation for the linter, .fdx export and stats."""
import screenplay

SAMPLE = """INT. CHIYA PASAL, PATAN - MORNING

Steam rises from glasses of chiya. RAAJA (24) sits by the window.

                      SANJANA
          Timro result aayo?

                      RAAJA
              (not looking up)
          Aayo. Pass bhaye.

Sanjana pushes her chiya toward him.

CUT TO:

EXT. ROOFTOP, KATHMANDU - NIGHT

The city hums below.
"""


def _types(text):
    return [e.type for e in screenplay.parse(text)]


def test_scene_headings_are_detected():
    els = screenplay.parse(SAMPLE)
    headings = [e.text for e in els if e.type == "scene_heading"]
    assert headings == [
        "INT. CHIYA PASAL, PATAN - MORNING",
        "EXT. ROOFTOP, KATHMANDU - NIGHT",
    ]


def test_character_cues_and_dialogue_are_paired():
    els = screenplay.parse(SAMPLE)
    dialogue = [(e.character, e.text) for e in els if e.type == "dialogue"]
    assert ("SANJANA", "Timro result aayo?") in dialogue
    assert ("RAAJA", "Aayo. Pass bhaye.") in dialogue


def test_parenthetical_is_attributed_to_the_speaker():
    els = screenplay.parse(SAMPLE)
    parens = [e for e in els if e.type == "parenthetical"]
    assert len(parens) == 1
    assert parens[0].character == "RAAJA"


def test_transition_is_not_mistaken_for_a_character():
    assert "transition" in _types(SAMPLE)
    names = [e.text for e in screenplay.parse(SAMPLE) if e.type == "character"]
    assert "CUT TO:" not in names


def test_shouted_action_is_not_a_character_cue():
    """An all-caps line with nothing after it is action, not a cue. Without
    the follower check this is the parser's most common false positive."""
    text = "INT. ROOM - DAY\n\nTHE DOOR SLAMS.\n"
    assert "character" not in _types(text)


def test_character_extension_is_stripped_from_the_name():
    text = "INT. ROOM - DAY\n\n     SANJANA (V.O.)\n          Timro result aayo?\n"
    names = [e.text for e in screenplay.parse(text) if e.type == "character"]
    assert names == ["SANJANA"]


def test_unindented_script_still_parses():
    """Writers paste from anywhere; classification must not depend on columns."""
    text = "INT. ROOM - DAY\n\nHe waits.\n\nSANJANA\nTimro result aayo?\n"
    els = screenplay.parse(text)
    assert [e.type for e in els] == [
        "scene_heading", "action", "character", "dialogue",
    ]


def test_scenes_group_elements():
    scs = screenplay.scenes(SAMPLE)
    assert len(scs) == 2
    assert scs[0].speaking_characters == ["SANJANA", "RAAJA"]
    assert scs[0].is_two_hander
    assert scs[1].speaking_characters == []


def test_content_before_the_first_slugline_is_kept():
    scs = screenplay.scenes("He waits by the window.\n\nINT. ROOM - DAY\n\nShe enters.\n")
    assert len(scs) == 2
    assert scs[0].heading == "(untitled opening)"


def test_statistics_shape():
    stats = screenplay.statistics(SAMPLE)
    assert stats["scene_count"] == 2
    assert stats["character_count"] == 2
    assert stats["dialogue_lines"] == 2
    assert stats["int_ext_ratio"] == 0.5  # one INT, one EXT
    assert set(stats["speaking_characters"]) == {"SANJANA", "RAAJA"}


def test_statistics_on_empty_script_do_not_crash():
    stats = screenplay.statistics("")
    assert stats["scene_count"] == 0
    assert stats["dialogue_action_ratio"] is None
