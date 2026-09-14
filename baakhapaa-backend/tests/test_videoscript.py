"""Parsing a long-form video script.

A video script is not a screenplay. There are no sluglines, no character cues
and no printed pages; there is narration read aloud, broken into sections, with
bracketed instructions to the editor that nobody says out loud.

The structure lives IN the document — `## HOOK - 0:15` delimits a section the
way a slugline delimits a scene. Holding it beside the document instead would
mean it cannot survive export, cannot be diffed, and drifts from the text on the
first edit, which is the bug `scene_sync` exists to fix.
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
    assert [s.kind for s in videoscript.sections(SAMPLE)] == ["hook", "segment", "payoff"]


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


def test_an_unknown_section_name_is_a_segment_not_an_error():
    """A writer inventing their own section name is writing, not erring."""
    assert videoscript.sections("## THE BIT ABOUT DRAINS - 2:00\nWords.\n")[0].kind == "segment"


def test_bracketed_cues_are_their_own_elements():
    kinds = [el.type for el in videoscript.parse(SAMPLE)]

    assert "broll" in kinds
    assert "on_screen" in kinds


def test_cues_are_not_spoken():
    """Nobody reads "[B-ROLL: Kathmandu traffic at dawn]" aloud. Counting it
    inflates every runtime estimate in the format."""
    assert videoscript.spoken_words("Two words.\n[B-ROLL: four more words here]\n") == 2


def test_a_section_heading_is_not_spoken_either():
    assert videoscript.spoken_words("## HOOK - 0:15\nThree spoken words.\n") == 3


def test_runtime_comes_from_words_not_lines():
    """Screenplay runtime is pages at 55 lines each. Narration read aloud has no
    relationship to that — the same word count written as one paragraph or as
    ten short lines takes the same time to say."""
    one_line = " ".join(["word"] * 150)
    many_lines = "\n".join(["word"] * 150)

    assert videoscript.runtime_seconds(one_line) == videoscript.runtime_seconds(many_lines)


def test_a_hundred_and_fifty_words_is_about_a_minute():
    assert 55 <= videoscript.runtime_seconds(" ".join(["word"] * 150)) <= 65


def test_devanagari_narration_is_counted():
    """The linter reads Nepali and the course is translated into it. A runtime
    of zero for a script written in Devanagari would make the format useless for
    exactly the writers the product is for."""
    assert videoscript.spoken_words("मेरो नाम राजा हो") == 4


def test_an_empty_draft_has_no_sections_and_no_runtime():
    """Called on every save, including the first, before anything is written."""
    assert videoscript.sections("") == []
    assert videoscript.runtime_seconds("") == 0.0


def test_text_before_the_first_section_is_kept_not_dropped():
    """`screenplay.py` names this case UNTITLED_SCENE rather than discarding it,
    because stray text above the first heading would otherwise shift every
    section by one. The same trap exists here."""
    found = videoscript.sections("A stray note.\n\n## HOOK - 0:10\nThe hook.\n")

    assert found[0].heading == videoscript.UNTITLED_SECTION
    assert found[1].kind == "hook"


# --- the summary contract ---------------------------------------------------

def test_summaries_keep_the_screenplay_key_contract():
    """`scene_sync._match_rows` and `_draft_payload` read these keys by name.
    Keeping the contract is what lets one sync function serve both formats with
    no special case — the entire argument for this approach."""
    first = videoscript.scene_summaries(SAMPLE)[0]

    for key in ("index", "heading", "line_number", "characters", "action",
                "estimated_minutes", "line_count", "page"):
        assert key in first, key


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
    gutter and in the scene index."""
    assert videoscript.scene_summaries(SAMPLE)[0]["page"] is None


def test_the_section_kind_and_target_travel_with_the_summary():
    """These are what the retention instrument will draw. They have no
    screenplay equivalent, so they ride in the summary and land in draft_json
    rather than in a column."""
    first = videoscript.scene_summaries(SAMPLE)[0]

    assert first["section_kind"] == "hook"
    assert first["target_seconds"] == 15


def test_summaries_are_indexed_from_zero_in_document_order():
    """Document position is the authority on order — the same rule scene_sync
    applies to sluglines."""
    assert [s["index"] for s in videoscript.scene_summaries(SAMPLE)] == [0, 1, 2]


def test_estimated_minutes_is_what_was_written_not_what_was_planned():
    """`target_seconds` is the plan; `estimated_minutes` is the draft. The
    Outline shows written against planned, and conflating them would make every
    section look exactly on target for ever."""
    one = "## HOOK - 0:15\n" + " ".join(["word"] * 150) + "\n"

    summary = videoscript.scene_summaries(one)[0]

    assert summary["target_seconds"] == 15
    assert 0.9 <= summary["estimated_minutes"] <= 1.1


def test_no_sections_means_no_summaries():
    assert videoscript.scene_summaries("") == []
