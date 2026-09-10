"""The property that makes query normalisation safe to ship.

`craft_query.normalise` sits in front of every retrieval call in the product —
the Patterns tab, `generate_structure`, the recommendations route. A change
there can move results for users who never type a word of Nepali, so the tests
that matter most here are the ones about what must NOT change.

The retrieval scores themselves are not tested here. They live in
`eval_retrieval.py`, which is the right shape for them: a metric with a floor,
run against the real corpus and the real model. Asserting "this query returns
that entry" in a unit test would pin the corpus in place — every new craft
entry could break it, and the fix would be to edit the test, which measures
nothing.
"""
import craft_query


# --- the safety property ---------------------------------------------------

def test_an_english_query_is_returned_byte_identical():
    """The whole reason this can go in front of every retrieval call.

    English queries score 86.7% (chips) and 100% (plain). Normalisation is not
    allowed to put that at risk, and the guarantee is stronger than "usually
    fine": the string that gets embedded is the same object's value it was
    before, so the embedding cannot have changed.
    """
    for q in (
        "my dialogue is on the nose, characters say exactly what they feel",
        "the middle sags and the ending feels unearned",
        "how do i show feelings without saying them",
        "my people talk too much",
    ):
        text, glosses = craft_query.normalise(q)
        assert text == q, f"English query was rewritten: {text!r}"
        assert glosses == []


def test_nothing_is_removed_only_added():
    """Glosses are appended, never substituted. If a term were replaced, a
    mixed-language query would lose the English half a writer typed on
    purpose — and most real romanised complaints are half English already."""
    q = "mero dialogue ekdam seedha cha"
    text, glosses = craft_query.normalise(q)
    assert text.startswith(q)
    assert glosses


def test_an_empty_query_is_left_alone():
    """The Patterns tab sends `focus: ""` for "Read my page", which is a real
    request meaning "diagnose the draft rather than a named complaint"."""
    for q in ("", "   ", None):
        text, glosses = craft_query.normalise(q)
        assert text == q
        assert glosses == []


# --- it actually recognises the two scripts --------------------------------

def test_devanagari_is_recognised_by_stem_not_by_word():
    """Nepali inflects the verb ending, so सुनिन्छ and सुनिन्छन् differ by a
    suffix. Matching whole words would catch neither reliably."""
    for q in ("मेरा पात्रहरू सबै उस्तै सुनिन्छन्", "पात्र उस्तै सुनिन्छ"):
        _text, glosses = craft_query.normalise(q)
        assert any("sound the same" in g for g in glosses), q


def test_romanised_spelling_variants_all_land():
    """Romanised Nepali has no standard orthography — the same word is typed
    several ways by the same person in the same paragraph."""
    for q in ("sabai eutai jasto sunincha", "sabai ustai suninchha"):
        _text, glosses = craft_query.normalise(q)
        assert any("sound the same" in g for g in glosses), q


def test_the_longer_phrase_wins_over_the_word_inside_it():
    """"dherai bolcha" is a complaint; "bolcha" is just a verb. Ordering the
    alternation by length is what keeps the specific gloss from being shadowed
    by the general one."""
    _text, glosses = craft_query.normalise("mero patra haru dherai bolchan")
    assert any("talk too much" in g for g in glosses)


# --- the collision risk ----------------------------------------------------

def test_romanised_terms_do_not_fire_inside_english_words():
    """Latin-script Nepali fragments sit inside English words — `katha` in
    `kathartic`, `anta` in `antagonist`, `susta` in `sustained`. Word
    boundaries are the only thing stopping a screenwriting complaint written
    in English from being glossed as Nepali."""
    q = ("the antagonist is sustained by a cathartic want, "
         "and the sonata of it all matters")
    text, glosses = craft_query.normalise(q)
    assert text == q, f"an English sentence was glossed: {glosses}"


def test_one_stray_word_is_not_enough_to_call_a_query_nepali():
    """`looks_nepali` gates anything that wants to behave differently for a
    Nepali writer. A single loanword in an English sentence must not trip it."""
    assert not craft_query.looks_nepali("what is the katha of my second act")
    assert craft_query.looks_nepali("mero katha ko beech ma kehi hunna")
    assert craft_query.looks_nepali("मेरो नायक बोरिङ छ")


# --- the lexicon itself ----------------------------------------------------

def test_every_concept_carries_at_least_one_term_and_a_gloss():
    """An entry with no terms can never fire, and an entry with no gloss adds
    an empty string to the query — both are silent no-ops that would sit in the
    table looking like coverage."""
    for glosses, deva, roman in craft_query.NEPALI_COMPLAINTS:
        assert glosses and glosses.strip(), (deva, roman)
        assert deva or roman, glosses


def test_glosses_are_english():
    """A gloss written in Nepali would be worse than none: the whole point is
    to leave the script the model cannot read."""
    for glosses, _deva, _roman in craft_query.NEPALI_COMPLAINTS:
        assert glosses.isascii(), glosses


def test_romanised_forms_are_ascii_and_devanagari_forms_are_not():
    """The two halves are matched by different mechanisms — substring for
    Devanagari, word-boundary regex for Latin. A term in the wrong column is
    matched the wrong way and silently never fires."""
    for glosses, deva, roman in craft_query.NEPALI_COMPLAINTS:
        for d in deva:
            assert not d.isascii(), f"{glosses}: {d!r} is in the Devanagari column"
        for r in roman:
            assert r.isascii(), f"{glosses}: {r!r} is in the romanised column"
