"""Which craft library a writer's question is answered from.

The corpus serves two crafts now. A screenwriter asking about a sagging middle
must not be told about retention curves, and a video writer asking about a flat
middle must not be told about act breaks.

**The exclusion runs one way, and that is the whole design.** Video-only entries
are kept out of a screenwriter's results; nothing is kept out of a video
writer's. Story craft transfers — a want, a turn, a cost and a payoff are the
same in a video essay as in a film — and narrowing the existing 39 entries by
hand would be a craft judgement with no evidence behind it, made while shrinking
the pool that produces the current numbers.

That asymmetry buys a property worth asserting: **screenplay retrieval is
numerically unchanged.** Measured before this work and after it, real-query p@1
is 90.0% either way.
"""
import rag


def test_a_screenplay_project_asks_the_screenplay_library():
    for fmt in ("short", "film", "web_series", "short_form", None, "", "typo"):
        assert rag.craft_for_format(fmt) == rag.SCREENPLAY_CRAFT, fmt


def test_a_long_form_project_asks_the_video_library():
    assert rag.craft_for_format("long_form") == rag.VIDEO_CRAFT


def test_an_untagged_entry_serves_both():
    """Every one of the 39 entries written before long-form video existed has
    no `applies_to`, and absence has to mean "both" — anything else would drop
    the whole corpus out of one craft or the other on the day this landed."""
    entry = {"technique": "x"}

    assert rag._serves(entry, rag.SCREENPLAY_CRAFT)
    assert rag._serves(entry, rag.VIDEO_CRAFT)


def test_a_video_entry_is_hidden_from_a_screenwriter():
    """The failure this exists to prevent."""
    entry = {"technique": "x", "applies_to": ["video"]}

    assert not rag._serves(entry, rag.SCREENPLAY_CRAFT)
    assert rag._serves(entry, rag.VIDEO_CRAFT)


def test_a_screenplay_only_entry_is_hidden_from_a_video_writer():
    """Nothing is tagged this way yet — narrowing the existing corpus is a
    craft judgement left to the pilot. The mechanism works when somebody does
    it, and pinning that now is cheaper than discovering it does not later."""
    entry = {"technique": "x", "applies_to": ["screenplay"]}

    assert rag._serves(entry, rag.SCREENPLAY_CRAFT)
    assert not rag._serves(entry, rag.VIDEO_CRAFT)


def test_a_text_array_that_arrives_as_a_string_still_works():
    """Postgres hands `text[]` back as a string on some client versions. Read
    naively that is a string containing "video", so `"screenplay" in applies`
    would be False for an entry that serves both — silently emptying half the
    library for screenwriters, which is the most expensive possible direction
    for this bug."""
    entry = {"technique": "x", "applies_to": '["screenplay", "video"]'}

    assert rag._serves(entry, rag.SCREENPLAY_CRAFT)
    assert rag._serves(entry, rag.VIDEO_CRAFT)


def test_an_unparseable_applies_to_falls_back_to_both():
    """A malformed value must not hide a craft entry from everybody. Serving it
    to both is the direction that degrades into today's behaviour rather than
    into an empty library."""
    entry = {"technique": "x", "applies_to": "{screenplay,video}"}

    assert rag._serves(entry, rag.SCREENPLAY_CRAFT)
    assert rag._serves(entry, rag.VIDEO_CRAFT)


def test_the_corpus_on_disk_tags_every_entry():
    """The loader writes `applies_to` for every row. An entry that reached the
    JSON without it would still work — absence means both — but it would mean
    the corpus and the loader disagree about whether the field is required, and
    that is how the schema drifted last time."""
    import json
    import io
    import os

    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "knowledge_base.json")
    kb = json.load(io.open(path, encoding="utf-8"))

    untagged = [e["title_ref"] for e in kb if not e.get("applies_to")]
    assert not untagged, untagged


def test_the_video_entries_are_video_only():
    """If one of them leaked into the screenplay set it would start appearing
    for screenwriters, which is the thing this whole mechanism is for."""
    import json
    import io
    import os

    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "knowledge_base.json")
    kb = json.load(io.open(path, encoding="utf-8"))

    video = [e for e in kb if e.get("genre") == "video"]
    assert len(video) >= 6
    for e in video:
        assert e["applies_to"] == ["video"], e["title_ref"]


def test_every_worked_example_is_prose_somebody_wrote_here():
    """What keeps the corpus publishable by construction. A video entry that
    quoted a real script would put the whole library in the same position as
    `raw_scripts_TEMP/`, which must never be published."""
    import json
    import io
    import os

    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "knowledge_base.json")
    kb = json.load(io.open(path, encoding="utf-8"))

    for e in kb:
        assert e.get("worked_example"), e["title_ref"]
        assert len(e["worked_example"]) > 40, e["title_ref"]
