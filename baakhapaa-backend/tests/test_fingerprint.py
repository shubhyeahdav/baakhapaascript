"""Fingerprint + benchmark: the measurement layer the corpus feeds."""
import fingerprint
import benchmark


def make_script(scenes=20, dialogue_per_scene=6, action_per_scene=2,
                cast=("SANJANA", "RAAJA"), interior=True, tod="DAY", locations=None):
    """Build a screenplay with known, controllable shape."""
    locations = locations or ["CHIYA PASAL", "ROOFTOP", "KITCHEN", "BUS PARK"]
    out = []
    for i in range(scenes):
        out.append(f"{'INT.' if interior else 'EXT.'} {locations[i % len(locations)]} - {tod}")
        out.append("")
        for _ in range(action_per_scene):
            out.append("A bus rattles past and someone shouts about the fare.")
        out.append("")
        for j in range(dialogue_per_scene):
            out.append(f"                      {cast[j % len(cast)]}")
            out.append("          Timro kura milena, ali bujha na.")
            out.append("")
    return "\n".join(out)


class TestFingerprint:
    def test_counts_scenes_and_cast(self):
        fp = fingerprint.fingerprint(make_script(scenes=12), title_ref="x", genre="drama")
        assert fp["scene_count"] == 12
        assert fp["character_count"] == 2
        assert fp["title_ref"] == "x" and fp["genre"] == "drama"

    def test_interior_and_time_of_day_detected(self):
        assert fingerprint.fingerprint(make_script(interior=True))["int_ext_ratio"] == 1.0
        assert fingerprint.fingerprint(make_script(interior=False))["int_ext_ratio"] == 0.0
        assert fingerprint.fingerprint(make_script(tod="DAY"))["day_night_ratio"] == 1.0
        assert fingerprint.fingerprint(make_script(tod="NIGHT"))["day_night_ratio"] == 0.0

    def test_evening_counts_as_night(self):
        # Writers rarely write bare DAY/NIGHT; the marker list has to be wider.
        assert fingerprint.fingerprint(make_script(tod="EVENING"))["day_night_ratio"] == 0.0
        assert fingerprint.fingerprint(make_script(tod="MORNING"))["day_night_ratio"] == 1.0

    def test_dialogue_heavy_script_has_high_ratio(self):
        talky = fingerprint.fingerprint(make_script(dialogue_per_scene=10, action_per_scene=1))
        spare = fingerprint.fingerprint(make_script(dialogue_per_scene=1, action_per_scene=10))
        assert talky["dialogue_action_ratio"] > spare["dialogue_action_ratio"]

    def test_location_churn_reflects_repeated_locations(self):
        one_place = fingerprint.fingerprint(make_script(scenes=20, locations=["CHIYA PASAL"]))
        many = fingerprint.fingerprint(
            make_script(scenes=20, locations=[f"PLACE {i}" for i in range(20)]))
        assert one_place["location_churn"] < many["location_churn"]

    def test_prose_is_marked_invalid(self):
        """A novelisation or bad scan still produces numbers. They are garbage,
        and letting them into a distribution is how a corpus silently rots."""
        prose = "It was a cold morning in Patan and he thought about everything. " * 300
        fp = fingerprint.fingerprint(prose)
        assert fp["valid"] is False

    def test_real_screenplay_is_valid(self):
        assert fingerprint.fingerprint(make_script(scenes=20, dialogue_per_scene=6))["valid"] is True

    def test_curve_has_one_value_per_decile(self):
        assert len(fingerprint.fingerprint(make_script(scenes=40))["scene_length_curve"]) == 10

    def test_empty_text_does_not_crash(self):
        fp = fingerprint.fingerprint("")
        assert fp["scene_count"] == 0 and fp["valid"] is False


def corpus(n=20, **kw):
    return [fingerprint.fingerprint(make_script(**kw), title_ref=f"f{i}", genre="drama")
            for i in range(n)]


class TestBenchmark:
    def test_small_cohort_refuses_to_report(self):
        res = benchmark.compare(fingerprint.fingerprint(make_script()), corpus(n=3))
        assert res["available"] is False
        assert "at least" in res["reason"]

    def test_typical_draft_produces_few_or_no_notes(self):
        """Silence is the correct output for an unremarkable draft. A report
        that flags everything teaches nothing about what is actually unusual."""
        rows = corpus(n=20)
        res = benchmark.compare(fingerprint.fingerprint(make_script()), rows)
        assert res["available"] is True
        assert res["notes"] == []

    def test_outlier_draft_is_flagged(self):
        rows = corpus(n=20, interior=True)
        outlier = fingerprint.fingerprint(make_script(interior=False))
        res = benchmark.compare(outlier, rows)
        assert any(n["metric"] == "int_ext_ratio" for n in res["notes"])

    def test_value_equal_to_corpus_is_never_an_outlier(self):
        """Regression: tie handling. With `<=` counting, a draft sitting exactly
        on a mass point scored the 100th percentile and got flagged for being
        completely normal."""
        rows = corpus(n=20)
        res = benchmark.compare(fingerprint.fingerprint(make_script()), rows)
        for metric, m in res["measured"].items():
            if m["value"] == m["corpus_median"]:
                assert 0.1 < m["percentile"] < 0.9, f"{metric} flagged while equal to median"

    def test_genre_cohort_used_when_large_enough(self):
        rows = corpus(n=20)
        assert benchmark.compare(fingerprint.fingerprint(make_script()), rows, genre="drama")["cohort"] == "drama"

    def test_falls_back_to_all_genres_when_cohort_too_small(self):
        rows = corpus(n=20)  # all labelled drama
        res = benchmark.compare(fingerprint.fingerprint(make_script()), rows, genre="thriller")
        assert res["cohort"] == "all genres"

    def test_invalid_rows_excluded_from_cohort(self):
        rows = corpus(n=20) + [fingerprint.fingerprint("prose " * 500) for _ in range(50)]
        res = benchmark.compare(fingerprint.fingerprint(make_script()), rows)
        assert res["cohort_size"] == 20

    def test_every_note_carries_its_sample_size(self):
        """A percentile without n is not a claim anyone can check."""
        rows = corpus(n=20, interior=True)
        res = benchmark.compare(fingerprint.fingerprint(make_script(interior=False)), rows)
        assert res["notes"] and all(n["n"] >= benchmark.MIN_COHORT for n in res["notes"])

    def test_missing_corpus_file_is_not_an_error(self):
        assert benchmark.load_corpus("does_not_exist_anywhere.json") == []
