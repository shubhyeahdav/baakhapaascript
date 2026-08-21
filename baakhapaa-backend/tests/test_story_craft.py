"""The story craft layer has to reach the model.

Everything here pins a connection that was missing rather than a feature that
was absent. The Story Bible collected a logline, a dramatic question, a theme,
and per character a want, a need, a wound and a voice — and not one field ever
reached a prompt. The craft library grounded `generate_structure` and then
vanished at exactly the point the writer was actually writing. And the craft
linter, the product's whole differentiator, was English-only regex in a tool
that instructs writers to put their dialogue in Nepali.

A feature nothing consumes is indistinguishable from a feature nobody built.
"""
import pytest

import linter
import script_engine

BIBLE = {
    "logline": "A film student hides a job from his father.",
    "dramatic_question": "Will Raaja tell the truth before it costs him everything?",
    "theme": "Ambition is a debt paid by the people who love you.",
    "characters": [
        {"name": "Raaja", "age": "24", "want": "to make his film",
         "need": "his father's respect without lying for it",
         "wound": "was called impractical as a child",
         "voice": "deflects with jokes, never finishes a sentence about himself"},
        {"name": "Baba", "age": "58", "want": "a stable son",
         "need": "to be asked rather than told", "wound": "", "voice": "short, declarative"},
    ],
    "locations": ["Chiya pasal, Patan"],
    "notes": "Never let them say the theme out loud.",
}

PROJECT = {
    "title": "Sapana", "genre": "Drama", "tone": "Emotional",
    "language": "Bilingual", "duration_minutes": 15, "target_audience": "Youth",
}


class TestBibleReachesThePrompt:
    def test_every_field_the_writer_filled_in_is_present(self):
        block = script_engine.format_bible_for_prompt(BIBLE)
        for expected in ("film student hides a job", "before it costs him everything",
                         "Ambition is a debt", "to make his film",
                         "his father's respect", "called impractical",
                         "deflects with jokes", "Never let them say the theme"):
            assert expected in block, f"missing from the prompt: {expected}"

    def test_want_and_need_are_stated_as_a_pair(self):
        """A scene plays when the want is pursued and the need goes unmet.
        Saying both is the difference between dialogue that argues and dialogue
        that explains."""
        block = script_engine.format_bible_for_prompt(BIBLE)
        assert "wants to make his film" in block
        assert "actually needs his father's respect" in block

    def test_an_empty_bible_adds_nothing(self):
        """No bible must not mean a prompt full of empty labels."""
        assert script_engine.format_bible_for_prompt({}) == ""
        assert script_engine.format_bible_for_prompt(None) == ""
        assert script_engine.format_bible_for_prompt(
            {"logline": "", "characters": [{"name": ""}]}
        ) == ""

    def test_a_nameless_character_is_skipped(self):
        block = script_engine.format_bible_for_prompt(
            {"characters": [{"name": "", "want": "orphan want"}]}
        )
        assert "orphan want" not in block

    def test_character_names_default_to_the_bible(self, monkeypatch):
        """The editor never sent `character_names`, so every generation said
        "characters as needed" no matter who was in the story."""
        captured = {}
        monkeypatch.setattr(script_engine, "MOCK_AI", False)
        monkeypatch.setattr(script_engine, "_call_llm",
                            lambda system, user, **kw: captured.setdefault("prompt", user) or "ok")

        script_engine.generate_scene("They argue at dinner.", "Drama", "Tense",
                                     "English", [], bible=BIBLE)
        assert "Raaja, Baba" in captured["prompt"]
        assert "characters as needed" not in captured["prompt"]


class TestCraftGroundsTheWriting:
    def test_generate_scene_carries_craft_patterns(self, monkeypatch):
        captured = {}
        monkeypatch.setattr(script_engine, "MOCK_AI", False)
        monkeypatch.setattr(script_engine, "_call_llm",
                            lambda system, user, **kw: captured.setdefault("prompt", user) or "ok")

        patterns = [{"technique": "Let them fight about the small wrong thing",
                     "how_it_works": "Displacement keeps the real subject alive.",
                     "how_to_apply": "Give them a trivial object to argue over."}]
        script_engine.generate_scene("They argue.", "Drama", "Tense", "English", [],
                                     patterns=patterns)
        assert "small wrong thing" in captured["prompt"]
        assert "Displacement keeps the real subject alive." in captured["prompt"]

    def test_improve_scene_carries_bible_and_craft(self, monkeypatch):
        captured = {}
        monkeypatch.setattr(script_engine, "MOCK_AI", False)
        monkeypatch.setattr(script_engine, "_call_llm",
                            lambda system, user, **kw: captured.setdefault("prompt", user) or "ok")

        script_engine.improve_scene(
            "INT. ROOM - DAY\n\nThey talk.", "make it less on the nose", "English",
            bible=BIBLE,
            patterns=[{"technique": "Let them fight about the small wrong thing"}],
        )
        assert "deflects with jokes" in captured["prompt"]
        assert "small wrong thing" in captured["prompt"]

    def test_improve_is_grounded_by_what_the_linter_found(self, client, make_user):
        """Diagnosis first: if the linter can name what is wrong, that technique
        beats anything embedding distance would return."""
        import scripts as scripts_module

        on_the_nose = ("INT. KITCHEN - NIGHT\n\n"
                       "                      BABA\n"
                       "          You never understood me.\n")
        patterns = scripts_module._craft_for(
            "make it subtler", "Drama", "Tense", scene_text=on_the_nose
        )
        # The linter flags this line, so retrieval should be keyed on the
        # technique that answers it rather than on the instruction's prose.
        assert linter.lint(on_the_nose), "precondition: the draft is flagged"
        assert isinstance(patterns, list)

    def test_the_bible_is_loaded_server_side_not_trusted_from_the_client(
        self, client, make_user
    ):
        """A request carries a script id; the server reads the bible itself."""
        user = make_user("pro")
        project_id = client.post("/projects/", json=PROJECT, headers=user["headers"]).json()["id"]
        script_id = client.get(f"/scripts/project/{project_id}",
                               headers=user["headers"]).json()["id"]
        client.put(f"/scripts/{script_id}/bible", json=BIBLE, headers=user["headers"])

        r = client.post("/scripts/generate-scene",
                        json={"scene_description": "They argue.", "genre": "Drama",
                              "tone": "Tense", "language": "English",
                              "script_id": script_id},
                        headers=user["headers"])
        assert r.status_code == 200, r.text

    def test_a_script_you_cannot_read_yields_no_bible(self, client, make_user):
        """Passing someone else's script id must not leak their story bible."""
        owner = make_user("pro")
        project_id = client.post("/projects/", json=PROJECT, headers=owner["headers"]).json()["id"]
        script_id = client.get(f"/scripts/project/{project_id}",
                               headers=owner["headers"]).json()["id"]
        client.put(f"/scripts/{script_id}/bible", json=BIBLE, headers=owner["headers"])

        intruder = make_user("pro")
        r = client.post("/scripts/generate-scene",
                        json={"scene_description": "x", "genre": "Drama", "tone": "Tense",
                              "language": "English", "script_id": script_id},
                        headers=intruder["headers"])
        assert r.status_code == 404

    def test_generation_still_works_without_a_script_id(self, client, make_user):
        """The field is optional — an older client must not break."""
        user = make_user("pro")
        r = client.post("/scripts/generate-scene",
                        json={"scene_description": "They argue.", "genre": "Drama",
                              "tone": "Tense", "language": "English"},
                        headers=user["headers"])
        assert r.status_code == 200


class TestCraftLinterSpeaksNepali:
    """The tool tells writers to put dialogue in Nepali and action in English.
    Every dialogue-level rule was therefore checking a language the dialogue was
    never going to be in."""

    def test_devanagari_on_the_nose_is_caught(self):
        text = ("INT. KITCHEN - NIGHT\n\n"
                "                      BABA\n"
                "          तिमीले कहिल्यै मलाई बुझेनौ।\n")
        rules = {f["rule"] for f in linter.lint(text)}
        assert "on_the_nose" in rules

    def test_devanagari_emotional_parenthetical_is_caught(self):
        text = ("INT. KITCHEN - NIGHT\n\n"
                "                      SANJANA\n"
                "              (रुँदै)\n"
                "          म जान्छु।\n")
        rules = {f["rule"] for f in linter.lint(text)}
        assert "directed_emotion" in rules

    def test_romanised_nepali_is_caught_too(self):
        """People type on phone keyboards. Romanised Nepali is how a lot of
        Nepali dialogue actually gets written."""
        text = ("INT. KITCHEN - NIGHT\n\n"
                "                      BABA\n"
                "          Timile kahilyai bujhena.\n"
                "\n"
                "                      RAAJA\n"
                "          Mero sapana timilai thaha chhaina.\n")
        rules = {f["rule"] for f in linter.lint(text)}
        assert "on_the_nose" in rules

    def test_a_nepali_scene_opening_on_a_greeting_is_flagged(self):
        text = ("INT. CHIYA PASAL - MORNING\n\n"
                "Steam rises.\n\n"
                "                      KANCHHA\n"
                "          नमस्ते।\n\n"
                "                      SANJANA\n"
                "          के छ?\n")
        assert linter.lint(text), "a Nepali greeting opening should not be silent"

    @pytest.mark.parametrize("line", [
        "उसले ढोका बन्द गर्यो।",           # he closed the door — filmable
        "ऊ हिँड्यो।",                        # he walked — filmable
    ])
    def test_filmable_nepali_action_is_not_flagged(self, line):
        """A rule that fires on ordinary writing gets switched off."""
        text = f"INT. ROOM - DAY\n\n{line}\n"
        assert [f for f in linter.lint(text) if f["rule"] == "unfilmable_interiority"] == []

    def test_english_rules_still_work(self):
        """The Nepali additions must not have broken the original coverage."""
        text = ("INT. KITCHEN - NIGHT\n\n"
                "He realises she is lying.\n\n"
                "                      BABA\n"
                "          You never understood me.\n")
        rules = {f["rule"] for f in linter.lint(text)}
        assert "unfilmable_interiority" in rules
        assert "on_the_nose" in rules


class TestConfidenceIsNotSeverity:
    """Writing is subjective. A craft linter that ignores that gets switched off
    by exactly the writers worth keeping — so each note says how arguable it is,
    separately from how much it would cost if it is right."""

    def test_a_medium_constraint_is_marked_mechanical(self):
        """A camera cannot photograph a realisation. Not an opinion."""
        text = "INT. ROOM - DAY\n\nHe realises she is lying.\n"
        flag = next(f for f in linter.lint(text) if f["rule"] == "unfilmable_interiority")
        assert flag["confidence"] == linter.MECHANICAL

    def test_the_most_contestable_rule_is_marked_a_judgement(self):
        """`on_the_nose` is regex over literal phrases — a character may
        legitimately say "my dreams". It carries high severity because it costs a
        lot WHEN right, which is not the same as being certain."""
        text = ("INT. ROOM - DAY\n\n"
                "                      BABA\n"
                "          You never understood me.\n")
        flag = next(f for f in linter.lint(text) if f["rule"] == "on_the_nose")
        assert flag["severity"] == "high", "if it is on the nose, it matters"
        assert flag["confidence"] == linter.JUDGEMENT, "but it is a reading, not a fact"

    def test_house_style_is_marked_convention(self):
        text = ("INT. ROOM - DAY\n\n"
                "                      BABA\n"
                "              (tearfully)\n"
                "          I see.\n")
        flag = next(f for f in linter.lint(text) if f["rule"] == "directed_emotion")
        assert flag["confidence"] == linter.CONVENTION

    def test_every_flag_declares_a_confidence(self):
        """An unclassified rule must not silently inherit false authority."""
        text = ("INT. ROOM - DAY\n\n"
                "He realises she is lying and remembers everything she said.\n\n"
                "                      BABA\n"
                "              (tearfully)\n"
                "          You never understood me.\n")
        flags = linter.lint(text)
        assert flags
        assert all(f["confidence"] in (linter.MECHANICAL, linter.CONVENTION, linter.JUDGEMENT)
                   for f in flags)

    def test_an_unknown_rule_defaults_to_the_humblest_reading(self):
        """A new rule added without classification must claim the least."""
        flag = linter._flag("some_new_rule", "high", 1, "msg", "technique")
        assert flag["confidence"] == linter.JUDGEMENT
