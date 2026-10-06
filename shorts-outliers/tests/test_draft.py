"""The rhythm meter, measured on text a writer is still typing."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import draft  # noqa: E402

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
