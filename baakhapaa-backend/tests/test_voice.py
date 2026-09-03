"""Voice findings — where two characters have collapsed into one.

The Cast view has shown three numbers per character since it shipped, and a
number is not a finding. A writer looking at `avg_words 8.2` beside
`avg_words 8.4` has to already know that those being equal is the problem, and
nobody arrives knowing that. These tests pin the sentences.

They also pin the silences, which matter more. Every rule here has a minimum
line count, because two characters with four lines each SHOULD look alike and
saying otherwise is noise — and a check that fires constantly gets switched off,
which is the same reason `linter.py` is conservative.
"""
import voice


def _char(name, lines=20, avg=8.0, distinct=0.7, questions=0.1, **extra):
    return {
        "name": name,
        "line_count": lines,
        "avg_words": avg,
        "distinct_ratio": distinct,
        "question_share": questions,
        **extra,
    }


# --- two voices that have become one -----------------------------------------

def test_two_characters_written_identically_are_reported_as_one_voice():
    out = voice.findings([_char("RAAJA"), _char("SANJANA")])

    assert [f["rule"] for f in out] == ["voices_collapsed"]
    assert set(out[0]["characters"]) == {"RAAJA", "SANJANA"}
    assert "could not say which of them is speaking" in out[0]["message"]


def test_the_finding_names_the_technique_that_answers_it():
    """Every rule points at an entry in the craft library by its exact
    `technique` string, so the panel can attach the worked example without a
    second lookup."""
    out = voice.findings([_char("A"), _char("B")])

    assert out[0]["technique"] == (
        "Give a character one phrase they return to, and change its meaning"
    )


def test_characters_who_differ_on_one_measure_are_left_alone():
    """All three have to match. People legitimately share a speech length or a
    question rate; it is the combination that means nobody could tell them
    apart."""
    out = voice.findings([_char("A", avg=8.0), _char("B", avg=14.0)])

    assert out == []


def test_a_thin_part_is_not_compared_at_all():
    """Six lines is not a voice yet, and two characters with four lines each
    will always look alike."""
    out = voice.findings([_char("A", lines=4), _char("B", lines=4)])

    assert out == []


def test_a_whole_cast_of_one_voice_reports_every_pair():
    """Compared pairwise rather than against an average, because 'sounds the
    same' is a relation between two people — and an average would call a cast
    that has entirely converged individually normal."""
    out = voice.findings([_char("A"), _char("B"), _char("C")])

    pairs = {tuple(sorted(f["characters"])) for f in out}
    assert pairs == {("A", "B"), ("A", "C"), ("B", "C")}


# --- one voice that has narrowed ---------------------------------------------

def test_a_character_repeating_the_same_words_is_flagged():
    out = voice.findings([_char("BABA", lines=30, distinct=0.30)])

    assert [f["rule"] for f in out] == ["narrow_vocabulary"]
    assert "30 lines" in out[0]["message"]


def test_repetition_over_a_short_part_says_nothing():
    """Ten lines is the floor. Screenplay dialogue is repetitive by nature and
    this should fire on a tic, not on plain speech."""
    out = voice.findings([_char("BABA", lines=8, distinct=0.30)])

    assert out == []


def test_a_character_who_mostly_asks_is_flagged_as_prompting_the_scene():
    out = voice.findings([_char("AAMA", lines=12, questions=0.6)])

    assert [f["rule"] for f in out] == ["mostly_asks"]
    assert "60%" in out[0]["message"]


# --- the page against the story bible ----------------------------------------

def test_a_character_described_as_terse_who_talks_at_length_is_flagged():
    """This is the finding only this product can make, because only this product
    has both the page and what the writer said about the page."""
    out = voice.findings([
        _char("KANCHHA", avg=19.0, voice="Blunt. A man of few words."),
    ])

    assert [f["rule"] for f in out] == ["bible_disagrees"]
    assert "average 19.0 words" in out[0]["message"]
    assert out[0]["severity"] == "high"


def test_a_character_described_as_talkative_who_barely_speaks_is_flagged():
    out = voice.findings([
        _char("SANJANA", avg=3.0, voice="Chatty, rambles when she is nervous."),
    ])

    assert [f["rule"] for f in out] == ["bible_disagrees"]
    assert "shorter than most of the cast" in out[0]["message"]


def test_a_bible_description_a_word_count_cannot_check_says_nothing():
    """Warmth, class, region and humour all matter and none of them is visible
    to arithmetic. Guessing at them would make every other finding here less
    believable."""
    out = voice.findings([
        _char("AAMA", voice="Warm, teases everyone, speaks in Bhojpuri when angry."),
    ])

    assert out == []


def test_a_terse_description_that_the_page_agrees_with_says_nothing():
    out = voice.findings([_char("KANCHHA", avg=4.0, voice="Terse.")])

    assert out == []


def test_an_empty_bible_entry_is_not_a_disagreement():
    out = voice.findings([_char("KANCHHA", avg=19.0, voice="   ")])

    assert out == []


# --- shape -------------------------------------------------------------------

def test_findings_are_ordered_most_serious_first():
    out = voice.findings([
        _char("SOLO", lines=30, distinct=0.3, avg=19.0, voice="Terse."),
    ])

    assert [f["severity"] for f in out] == ["high", "medium"]


def test_an_empty_cast_is_not_an_error():
    """A blank page is the normal state of a new project."""
    assert voice.findings([]) == []
    assert voice.findings(None) == []


def test_by_character_indexes_a_shared_finding_under_both_names():
    """A collapsed pair is one finding about two people, and it has to appear
    under each of them or the panel shows it to neither."""
    out = voice.by_character([_char("A"), _char("B")])

    assert set(out) == {"A", "B"}
    assert out["A"][0] is out["B"][0]


# --- the route ---------------------------------------------------------------

TWO_VOICES = """INT. PASAL - DAY

                      RAAJA
          I went to see him again yesterday morning.

                      SANJANA
          You should have told me before you went.

                      RAAJA
          There was nothing at all to tell you.

                      SANJANA
          There is always something to tell me.

                      RAAJA
          I did not want to worry you about it.

                      SANJANA
          I would rather be worried than kept out.

                      RAAJA
          You are worried about it all the time.

                      SANJANA
          Because you never tell me anything now.
"""


def test_the_cast_route_returns_findings_beside_the_numbers(client, make_user, make_script):
    user = make_user()
    _project_id, script_id = make_script(user)
    saved = client.put(f"/scripts/{script_id}", json={"content": TWO_VOICES},
                       headers=user["headers"])
    assert saved.status_code == 200, saved.text

    r = client.get(f"/scripts/{script_id}/cast", headers=user["headers"])

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["characters"], "no cast parsed"
    assert "findings" in body and "findings_by_character" in body


def test_the_cast_route_is_free_on_every_tier(client, make_user, make_script):
    """It is the parser and arithmetic. Putting it behind a tier would be
    charging for a subtraction."""
    user = make_user()
    _project_id, script_id = make_script(user)

    r = client.get(f"/scripts/{script_id}/cast", headers=user["headers"])

    assert r.status_code == 200, r.text
