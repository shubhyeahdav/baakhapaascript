"""The measurements, and the rule that no text escapes with them."""
import outlier as measure
from outlier import Segment


def segs(*triples):
    return [Segment(a, b, t) for a, b, t in triples]


# A short with a question hook, a turn at 4.2s, and deliberately uneven
# sentence lengths -- the shape the craft says works.
GOOD = segs(
    (0.0, 1.4, "Why does nobody finish a Nepali web series?"),
    (1.4, 3.1, "I watched forty of them."),
    (3.1, 4.2, "Every single one."),
    (4.2, 7.8, "But the problem is not the writing, it is the first ninety seconds, "
               "and that is something you can fix before you shoot anything at all."),
    (7.8, 9.0, "Here is how."),
)

# Same length, same word count, one flat rhythm and no turn.
FLAT = segs(
    (0.0, 2.0, "Nepali web series are often quite long."),
    (2.0, 4.0, "The writing is usually fairly weak."),
    (4.0, 6.0, "The acting is often rather poor."),
    (6.0, 8.0, "The budget is normally very small."),
)


class TestHook:
    def test_it_ends_where_the_first_sentence_ends(self):
        assert measure.hook_seconds(GOOD) == 1.4

    def test_a_sentence_spanning_segments_is_one_sentence(self):
        # Vendors segment on pauses, not grammar.
        s = segs((0.0, 1.0, "Nobody finishes"), (1.0, 2.5, "a Nepali web series."))
        assert measure.hook_seconds(s) == 2.5

    def test_unpunctuated_speech_still_has_an_end(self):
        # Returning None here would drop the video from every average it
        # belongs in, which is worse than a slightly generous number.
        s = segs((0.0, 1.0, "no punctuation at all"), (1.0, 2.0, "none here either"))
        assert measure.hook_seconds(s) == 2.0

    def test_no_segments_is_none(self):
        assert measure.hook_seconds([]) is None


class TestRehook:
    def test_it_finds_the_turn(self):
        assert measure.first_rehook_seconds(GOOD) == 4.2

    def test_a_short_with_no_turn_reports_none(self):
        # None means "no rehook found", which is the finding, not a failure.
        assert measure.first_rehook_seconds(FLAT) is None

    def test_a_marker_inside_the_hook_does_not_count(self):
        # The hook is not a rehook of itself.
        s = segs((0.0, 2.0, "But here is the thing."), (2.0, 4.0, "Plain continuation."))
        assert measure.first_rehook_seconds(s) is None


class TestRhythm:
    def test_uneven_sentences_score_higher_than_flat_ones(self):
        # The whole claim, as a comparison rather than a threshold: this is
        # what "vary your sentence length" looks like when it is measured.
        assert measure.sentence_length_sigma(GOOD) > measure.sentence_length_sigma(FLAT)

    def test_a_single_sentence_has_no_variance_rather_than_zero(self):
        # 0.0 would say "perfectly monotonous" and drag every average it enters.
        assert measure.sentence_length_sigma(segs((0.0, 2.0, "One line only."))) is None

    def test_flat_delivery_is_near_zero_but_not_none(self):
        sigma = measure.sentence_length_sigma(FLAT)
        assert sigma is not None and sigma < 1.0


class TestOutlierRatio:
    def test_it_is_views_over_the_channels_own_median(self):
        assert measure.outlier_ratio(90_000, 10_000) == 9.0

    def test_a_big_channel_posting_an_average_video_is_not_an_outlier(self):
        # The entire reason raw view count is the wrong measure: two million
        # views on a channel that always gets two million is a ratio of 1.0.
        assert measure.outlier_ratio(2_000_000, 2_000_000) == 1.0

    def test_a_small_channel_breaking_out_is(self):
        assert measure.outlier_ratio(40_000, 800) == 50.0

    def test_no_baseline_is_none_rather_than_a_guess(self):
        assert measure.outlier_ratio(5000, 0) is None
        assert measure.outlier_ratio(5000, None) is None


class TestDeliveryShape:
    def test_front_load_is_a_share_not_a_count(self):
        v = measure.front_load(GOOD)
        assert 0 < v < 1

    def test_words_per_second_needs_a_duration(self):
        assert measure.words_per_second(GOOD, 0) is None

    def test_a_question_opening_is_detected(self):
        assert measure.opens_on_question(GOOD) is True

    def test_a_statement_opening_is_not(self):
        assert measure.opens_on_question(FLAT) is False


class TestNoTextEscapes:
    """The rule the whole corpus rests on.

    Transcripts are bought under terms that permit analysis, not
    redistribution. A record that carried even one phrase back would make the
    corpus unshippable -- and it would do so silently, which is why this is a
    test rather than a comment.
    """

    def test_every_measured_value_is_a_number_a_bool_or_none(self):
        rec = measure.measure(GOOD, 9.0, views=90_000, channel_median_views=10_000)
        for key, value in rec.items():
            assert isinstance(value, (int, float, bool, type(None))), \
                f"{key} carries {type(value).__name__} -- only numbers may leave measure()"

    def test_no_word_of_the_transcript_appears_in_the_record(self):
        rec = measure.measure(GOOD, 9.0, views=90_000, channel_median_views=10_000)
        blob = repr(rec).lower()
        for word in ("nepali", "series", "problem", "watched", "ninety"):
            assert word not in blob, f"the transcript word {word!r} reached the record"

    def test_the_record_is_the_same_shape_for_an_empty_transcript(self):
        # A failed transcription must not produce a differently-shaped row, or
        # every consumer needs two code paths.
        full = measure.measure(GOOD, 9.0, 90_000, 10_000)
        empty = measure.measure([], 9.0, 90_000, 10_000)
        assert set(full) == set(empty)
