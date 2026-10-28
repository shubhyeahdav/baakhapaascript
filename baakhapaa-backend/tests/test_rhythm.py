"""The rhythm meter, measured on text a writer is still typing."""
import rhythm as draft

# Lengths 7, 4, 13, 3 — the shape the craft asks for.
VARIED = (
    "Nobody finishes a Nepali web series anymore. "
    "I watched forty of them. "
    "The problem is not the writing or the acting or even the budget, it is the "
    "first ninety seconds. "
    "Here is why."
)

# Every sentence seven words. Same word count as VARIED, no rhythm.
FLAT = (
    "Nepali web series run far too long. "
    "The writing is often rather quite weak. "
    "The acting is usually somewhat very poor. "
    "The budget is normally far too small."
)


class TestRhythm:
    def test_varied_writing_scores_higher_than_flat(self):
        # The whole claim as a comparison rather than a threshold.
        assert draft.sigma(VARIED) > draft.sigma(FLAT)

    def test_one_sentence_has_no_rhythm_rather_than_zero(self):
        # 0.0 would read as perfect monotony and drag every average it enters.
        assert draft.sigma("Just the one line here.") is None

    def test_empty_text_is_none(self):
        assert draft.sigma("") is None


class TestMonotoneRun:
    def test_it_finds_the_flat_stretch(self):
        # This is the actionable half: a sigma says the script is flat, a run
        # says where.
        assert draft.longest_monotone_run(FLAT) == 4

    def test_varied_writing_has_no_long_run(self):
        assert draft.longest_monotone_run(VARIED) < 3

    def test_one_word_of_slack_counts_as_the_same_length(self):
        # "nine words then ten" reads as identical rhythm to an ear.
        nine = " ".join(["word"] * 9) + "."
        ten = " ".join(["word"] * 10) + "."
        assert draft.longest_monotone_run(nine + " " + ten) == 2

    def test_two_words_apart_breaks_the_run(self):
        nine = " ".join(["word"] * 9) + "."
        twelve = " ".join(["word"] * 12) + "."
        assert draft.longest_monotone_run(nine + " " + twelve) == 1

    def test_no_sentences_is_zero_not_one(self):
        assert draft.longest_monotone_run("") == 0


class TestEstimate:
    def test_it_scales_with_length(self):
        short = draft.estimate_seconds("One two three four five.")
        longer = draft.estimate_seconds("One two three four five. " * 10)
        assert longer > short

    def test_one_hundred_fifty_words_is_about_a_minute(self):
        # The conventional rate, stated so a change to it fails here loudly.
        text = " ".join(["word"] * 150) + "."
        assert draft.estimate_seconds(text) == 60.0

    def test_an_empty_draft_has_no_estimate(self):
        assert draft.estimate_seconds("") is None


class TestOpening:
    def test_a_question_opening_is_detected(self):
        assert draft.opens_on_question("Why does nobody finish these? I checked.") is True

    def test_a_statement_opening_is_not(self):
        assert draft.opens_on_question("Nobody finishes these. I checked.") is False


class TestNoTextEscapes:
    """Same rule as the outlier records: a draft belongs to the writer."""

    def test_every_value_is_a_number_a_bool_or_none(self):
        rec = draft.measure_draft(VARIED)
        for key, value in rec.items():
            assert isinstance(value, (int, float, bool, type(None))), \
                f"{key} carries {type(value).__name__}"

    def test_no_word_of_the_draft_appears_in_the_record(self):
        rec = draft.measure_draft(VARIED)
        blob = repr(rec).lower()
        for word in ("nepali", "series", "watched", "budget", "ninety"):
            assert word not in blob

    def test_an_empty_draft_returns_the_same_shape(self):
        # The meter renders from the first keystroke, so it must not need two
        # code paths for "nothing typed yet".
        assert set(draft.measure_draft("")) == set(draft.measure_draft(VARIED))

    def test_nothing_returns_a_verdict(self):
        # No key here may be a judgement. The product reports; the writer
        # decides. A future "rhythm_ok" boolean fails this test on sight.
        for key in draft.measure_draft(VARIED):
            assert not any(w in key for w in ("good", "bad", "ok", "pass", "fail", "score"))


# --- the editor's meter (Month 4, Day 7) --------------------------------------

DRAFT = (
    "## HOOK\n"
    "Why does nobody finish a Nepali web series?\n"
    "I watched forty of them.\n"
    "\n"
    "[B-ROLL: laptop screen]\n"
    "The writing is often quite weak. The acting is often quite poor. "
    "The budget is always far too small.\n"
)


class TestNepali:
    def test_a_devanagari_word_is_one_word(self):
        # Vowel signs are combining marks; `\w` does not match them, and the
        # old pattern counted this five-word sentence as twelve.
        assert draft.words("तिमीले कहिल्यै मेरो साथ दिएनौ।") == 5

    def test_the_danda_ends_a_sentence(self):
        assert draft.sentences("तिमीले कहिल्यै मेरो साथ दिएनौ। चिया चिसो भयो।") == [
            "तिमीले कहिल्यै मेरो साथ दिएनौ", "चिया चिसो भयो"]

    def test_digits_still_are_not_words(self):
        assert draft.words("In 2024 it rained.") == 3


class TestMeter:
    def test_only_spoken_lines_are_measured(self):
        # Headings and cues are not read aloud. Left in, `## HOOK` has no full
        # stop and fuses with the next sentence.
        assert next(t for _, t in draft.spoken_lines(DRAFT)).startswith("Why")
        assert all("B-ROLL" not in t and "##" not in t for _, t in draft.spoken_lines(DRAFT))

    def test_screenplay_grammar_lines_are_not_spoken(self):
        text = "INT. CHIYA PASAL - DAY\n\nSITA\n(quietly)\nThe tea is cold.\n"
        assert [t for _, t in draft.spoken_lines(text)] == ["The tea is cold."]

    def test_the_run_says_where_it_is(self):
        run = draft.monotone_run_span(DRAFT)
        assert run == {"sentences": 4, "from_line": 3, "to_line": 6}

    def test_two_similar_sentences_are_not_a_run(self):
        assert draft.monotone_run_span("I went home. You went out.") is None

    def test_an_empty_draft_measures_nothing(self):
        m = draft.meter("")
        assert m["word_count"] == 0
        assert m["sentence_length_sigma"] is None
        assert m["monotone_run"] is None
        assert m["observations"] == []

    def test_one_sentence_has_no_rhythm_rather_than_perfect_monotony(self):
        assert draft.meter("One line, and only one.")["sentence_length_sigma"] is None

    def test_no_text_of_the_draft_comes_back(self):
        # Fixed observation sentences are allowed; a phrase of the draft is not.
        m = draft.meter(DRAFT)
        flat = repr(m)
        for phrase in ("Nepali web series", "laptop", "forty", "budget"):
            assert phrase not in flat


class TestRehookObservation:
    FLAT = ("Nepali web series run far too long. The writing is often rather weak. "
            "The acting is usually rather poor. The budget is always far too small. "
            "The audience is always quite tired.")
    REHOOKS = ("Nepali web series run far too long. The writing is often rather weak. "
               "But the problem is not the writing at all. "
               "So why does nobody finish them? The first ninety seconds.")

    def test_a_short_whose_only_device_is_the_opening_is_reported(self):
        rules = [o["rule"] for o in draft.observations(self.FLAT)]
        assert rules == ["single_device"]

    def test_it_is_phrased_as_an_observation(self):
        msg = draft.observations(self.FLAT)[0]["message"]
        assert not any(w in msg.lower() for w in ("bad", "weak", "should", "must", "fix"))

    def test_silent_on_a_short_that_already_rehooks(self):
        assert draft.observations(self.REHOOKS) == []
        assert draft.attention_devices(self.REHOOKS)

    def test_silent_on_a_draft_too_short_to_owe_a_second_device(self):
        assert draft.observations("Short line. Another one.") == []


def test_the_route_measures_and_keeps_nothing(client, make_user):
    user = make_user()          # free tier: no model is called
    r = client.post("/scripts/rhythm", json={"text": DRAFT}, headers=user["headers"])

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["monotone_run"]["from_line"] == 3
    assert body["wpm"] == 150.0
    assert "laptop" not in r.text


def test_the_route_needs_an_account(client):
    assert client.post("/scripts/rhythm", json={"text": DRAFT}).status_code in (401, 403)
