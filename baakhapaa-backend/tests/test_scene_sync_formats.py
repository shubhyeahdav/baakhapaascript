"""Which parser reads the draft.

`sync_from_draft` called `screenplay.scene_summaries` unconditionally. A
long-form video script has no sluglines, so that returned nothing and a video
project's Outline, Corkboard and scene index were all empty for ever.

**The gate on this change is the second half of this file:** a screenplay
project must behave exactly as it did before. If that ever fails, the argument
for storing sections in the `scenes` table has failed with it.
"""
import scene_sync
import screenplay
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
    assert scene_sync.parser_for("") is screenplay


def test_the_video_parser_finds_sections_the_screenplay_parser_cannot():
    """The reason the switch has to exist at all."""
    assert screenplay.scene_summaries(VIDEO) == []
    assert len(videoscript.scene_summaries(VIDEO)) == 2


# --- the gate ---------------------------------------------------------------

def test_a_screenplay_draft_produces_byte_identical_summaries():
    """Not "similar". Identical. This is what makes the switch safe to land."""
    assert (scene_sync.parser_for("film").scene_summaries(SCREENPLAY)
            == screenplay.scene_summaries(SCREENPLAY))


def test_the_draft_payload_is_unchanged_for_a_screenplay():
    """`_draft_payload` gained keys for video. A screenplay's payload must carry
    exactly what it carried before — an extra key here silently changes what is
    stored in `draft_json` for every existing script on its next save."""
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


def test_a_format_lookup_that_fails_does_not_take_the_save_down():
    """`_format_of` reaches the database on every save. A save that raises
    because a lookup failed would lose a writer's work to a transient fault —
    the screenplay parser is the safe answer, not an exception."""
    assert scene_sync._format_of("not-a-real-script-id") is None
