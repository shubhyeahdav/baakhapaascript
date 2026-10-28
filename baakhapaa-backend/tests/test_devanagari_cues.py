"""A character cue written in Devanagari is a cue.

Until 2026-10-12 it was not, and that single fact made the product's headline
claim unreachable for the writers it is for.

`linter.py` has had bilingual regexes since the Nepali linting work: on-the-nose
dialogue, emotional parentheticals and scene-opening greetings all match
Devanagari and romanised Nepali. But every one of those rules is guarded by
`el.type == "dialogue"` or `== "parenthetical"`, and those types only exist
after a character cue. `_looks_like_character_cue` tested
`re.search(r"[A-Z]", ...)` and `CHARACTER_RE` was `[A-Z][A-Z0-9 .'-]`, so a
screenplay typed the way a Nepali writer types one --

    सुनिता
    तिमीले कहिल्यै मेरो कुरा सुनेनौ।

-- parsed as two ACTION lines. No cue, no dialogue, and therefore not one
dialogue flag on the whole draft. Silence, on exactly the dialogue the product
tells writers to write.

The measured before/after on `scripts/demo/nepali-draft.txt`: 3 flags to 6,
gaining both `on_the_nose` findings and the `greeting_scene_open`.
"""
import linter
import screenplay


NEPALI_SCENE = """INT. CHIYA PASAL, PATAN - MORNING

Steam off the kettle. SUNITA scrubs a glass that is already clean.

सुनिता
कस्तो छ

राजा
(रिसाएर)
तिमीले कहिल्यै मेरो कुरा सुनेनौ।
"""


def types_of(text):
    return [el.type for el in screenplay.parse(text)]


class TestTheCueItself:
    def test_a_devanagari_name_is_a_character_cue(self):
        assert types_of(NEPALI_SCENE) == [
            "scene_heading", "action",
            "character", "dialogue",
            "character", "parenthetical", "dialogue",
        ]

    def test_the_speaker_is_named_in_its_own_script(self):
        """`speaking_characters` feeds the storyboard cast list, the voice
        report and the export's shot list. An empty list there is how a
        Devanagari draft used to reach every one of those as castless."""
        scenes = screenplay.scenes(NEPALI_SCENE)
        assert scenes[0].speaking_characters == ["सुनिता", "राजा"]

    def test_dialogue_is_attributed_to_the_devanagari_speaker(self):
        spoken = [el for el in screenplay.parse(NEPALI_SCENE) if el.type == "dialogue"]
        assert [el.character for el in spoken] == ["सुनिता", "राजा"]


class TestTheRulesItUnblocks:
    """Each of these was unreachable, not wrong. The regex always matched; the
    line never arrived at it."""

    def test_on_the_nose_fires_on_devanagari_dialogue(self):
        rules = [f["rule"] for f in linter.lint(NEPALI_SCENE)]
        assert "on_the_nose" in rules

    def test_a_greeting_opening_a_scene_fires_in_devanagari(self):
        rules = [f["rule"] for f in linter.lint(NEPALI_SCENE)]
        assert "greeting_scene_open" in rules

    def test_an_emotional_parenthetical_fires_in_devanagari(self):
        flags = [f for f in linter.lint(NEPALI_SCENE) if f["rule"] == "directed_emotion"]
        # Specifically the parenthetical branch, not the action-line branch
        # that happened to catch `(रिसाएर)` back when it parsed as action.
        assert flags and flags[0]["line"] == 9


class TestTheFalseCueItWouldOtherwiseCreate:
    """Accepting Devanagari in a cue widens what can be mistaken for one, and
    the guards that hold English in check are punctuation-based. Devanagari
    does not end a sentence with a full stop."""

    def test_a_short_nepali_action_line_ending_in_a_danda_is_not_a_cue(self):
        """The danda is the ONLY thing keeping these two out of the cue branch.

        Both are short enough to pass `CHARACTER_RE`'s 39-character name
        limit, caseless so they pass the all-caps test, and each has a
        non-empty line after it — so every other guard says "cue". Without
        `।` in the trailing-punctuation list, the first becomes a character
        called `सुनिता हाँस्छे।` and the second becomes her dialogue.

        An earlier version of this test used a 44-character sentence, which
        `CHARACTER_RE` rejected on length alone — so it passed with the danda
        guard deliberately removed, and proved nothing.
        """
        text = (
            "INT. CHIYA PASAL - MORNING\n"
            "\n"
            "सुनिता हाँस्छे।\n"
            "राजा जान्छ।\n"
        )
        assert types_of(text) == ["scene_heading", "action", "action"]

    def test_a_name_longer_than_the_cue_limit_is_not_a_cue(self):
        """Separately, because the length guard and the danda guard were
        conflated once already. 44 characters of Devanagari is a sentence."""
        text = (
            "INT. CHIYA PASAL - MORNING\n"
            "\n"
            "सुनिता भित्र सम्झ्छे उसको बुबाले भनेको कुरा\n"
            "राजा ढोकामा उभिन्छ\n"
        )
        assert types_of(text)[1] == "action"

    def test_a_long_devanagari_sentence_is_not_a_cue(self):
        long_line = "यो वाक्य एकदमै लामो छ र यसमा धेरै शब्दहरू छन् जसले यसलाई नाम होइन भन्छ"
        text = f"INT. X - DAY\n\n{long_line}\nअर्को लाइन\n"
        assert "character" not in types_of(text)

    def test_a_devanagari_line_with_nothing_after_it_is_not_a_cue(self):
        """The follower check, which is what separates `SANJANA` from a
        shouted action line, has to keep working in the other script too."""
        text = "INT. X - DAY\n\nसुनिता\n\nRaaja leaves.\n"
        assert types_of(text) == ["scene_heading", "action", "action"]


class TestEnglishIsUnchanged:
    """The change is additive. Every one of these passed before it."""

    def test_an_ascii_cue_still_parses(self):
        text = "INT. X - DAY\n\nSANJANA\nTimro result aayo?\n"
        assert types_of(text) == ["scene_heading", "character", "dialogue"]

    def test_a_shouted_action_line_is_still_action(self):
        text = "INT. X - DAY\n\nTHE DOOR SLAMS.\nRaaja turns.\n"
        assert types_of(text) == ["scene_heading", "action", "action"]

    def test_a_lowercase_line_is_still_not_a_cue(self):
        text = "INT. X - DAY\n\nSanjana waits.\nRaaja arrives.\n"
        assert "character" not in types_of(text)

    def test_a_shot_is_still_a_shot_not_a_cue(self):
        text = "INT. X - DAY\n\nANGLE ON THE DOOR\nIt opens.\n"
        assert types_of(text)[1] != "character"

    def test_a_cue_extension_still_parses(self):
        text = "INT. X - DAY\n\nSANJANA (V.O.)\nI never went back.\n"
        assert types_of(text) == ["scene_heading", "character", "dialogue"]

    def test_a_line_of_digits_is_not_a_cue(self):
        """What the `[A-Z]` search was actually for, kept as `isalpha` so it
        rejects a number without naming an alphabet."""
        text = "INT. X - DAY\n\n1947\nThe year on the wall.\n"
        assert types_of(text)[1] != "character"


class TestMixedScripts:
    """A Nepali screenplay is rarely all one script -- the house style writes
    sluglines and action in English and dialogue in Nepali."""

    def test_an_ascii_cue_over_devanagari_dialogue_still_works(self):
        text = "INT. X - DAY\n\nSUNITA\nकस्तो छ\n"
        assert types_of(text) == ["scene_heading", "character", "dialogue"]

    def test_a_devanagari_cue_over_romanised_dialogue_works(self):
        text = "INT. X - DAY\n\nसुनिता\nkasto cha\n"
        assert types_of(text) == ["scene_heading", "character", "dialogue"]

    def test_both_scripts_name_the_same_cast_list_separately(self):
        """Two spellings of one person are two speakers, and that is correct:
        `check_character_names` is the thing that reports near-duplicates, and
        it cannot report what the parser never saw."""
        text = "INT. X - DAY\n\nSUNITA\nOne.\n\nसुनिता\nदुई।\n"
        assert screenplay.scenes(text)[0].speaking_characters == ["SUNITA", "सुनिता"]
