"""Craft-pattern retrieval — the thing that makes this product different.

`rag.py` is what separates Baakhapaa's generation from a bare prompt: a corpus
of craft entries, ranked against what the writer is actually trying to do, and
injected into the prompt. It had no direct test coverage at all. That is an odd
place for none, because retrieval fails *quietly* by design — every path in this
module swallows its exception and returns `[]`, so a broken embedder, a missing
table and a database outage all look identical from the outside, and generation
carries on ungrounded without anyone noticing the differentiator switched off.

So these tests cover two different things. The ranking tests say the right
pattern comes back first. The degradation tests say the failures really do
degrade rather than raise — and, just as importantly, that the empty result is
reached deliberately rather than by accident.

MECHANICS, both of which will bite anyone extending this file:

* Never let the real embedder load. `retrieve_relevant_patterns` calls
  `embed_texts` as an unqualified module global, so patching `rag.embed_texts`
  intercepts everything; the autouse fixture below also boobytraps
  `rag._get_model` so a test that forgets fails loudly instead of downloading
  130 MB of ONNX weights. `test_structure_and_export.py` routes around the model
  the same way.
* The mock database is a process-global store backed by one session tempfile, so
  `script_patterns` rows leak between tests. The autouse fixture clears the table
  either side of every test — without it, "an empty library" passes or fails
  depending on what ran before it.
"""
import json

import pytest

import database
import rag


@pytest.fixture(autouse=True)
def isolated_pattern_library(monkeypatch):
    """Empty `script_patterns` around every test, and make the real embedding
    model impossible to reach by accident."""
    # Bind the real store now. A test that replaces `database.supabase` with a
    # failing stub would otherwise be torn down through that stub: this fixture
    # depends on `monkeypatch`, so its teardown runs BEFORE monkeypatch unwinds.
    store = database.supabase

    def _clear():
        for row in store.table(rag.TABLE).select("*").execute().data or []:
            store.table(rag.TABLE).delete().eq("id", row["id"]).execute()

    def _tripwire():
        raise AssertionError(
            "a test reached the real embedding model; patch rag.embed_texts instead"
        )

    monkeypatch.setattr(rag, "_get_model", _tripwire)
    _clear()
    yield
    _clear()


def _seed(technique, embedding, **extra):
    row = {
        "id": f"pat-{technique}",
        "title_ref": f"Ref for {technique}",
        "genre": "Drama",
        "origin_tradition": "Nepali",
        "craft_level": "scene",
        "technique": technique,
        "problem": extra.pop("problem", "The scene feels flat."),
        "how_it_works": extra.pop("how_it_works", "Because it does."),
        "how_to_apply": extra.pop("how_to_apply", "Do the thing."),
        "worked_example": "Original prose.",
        "warning_sign": "Dialogue states the feeling.",
        "embedding": embedding,
    }
    row.update(extra)
    database.supabase.table(rag.TABLE).insert(row).execute()
    return row


@pytest.fixture
def stub_embedder(monkeypatch):
    """A deterministic embedder. Three dimensions, so the expected ranking is
    arithmetic a reader can check by eye — `_cosine` does not care how long the
    vectors are, only that both sides agree."""
    calls = []

    def _use(vector):
        def embed(texts):
            calls.append(list(texts))
            return [list(vector)]
        monkeypatch.setattr(rag, "embed_texts", embed)
        return calls

    return _use


# --- ranking -----------------------------------------------------------------

def test_the_closest_pattern_ranks_first(stub_embedder):
    stub_embedder([1.0, 0.0, 0.0])
    _seed("far", [0.0, 1.0, 0.0])
    _seed("near", [1.0, 0.0, 0.0])
    _seed("middling", [0.7, 0.7, 0.0])

    got = rag.retrieve_relevant_patterns("Drama", "Emotional", "A father and a debt")

    assert [p["technique"] for p in got] == ["near", "middling", "far"]


def test_top_k_limits_the_result(stub_embedder):
    """Three is the default because a prompt block of every pattern would drown
    the instruction it is meant to support."""
    stub_embedder([1.0, 0.0, 0.0])
    for i in range(6):
        _seed(f"pattern-{i}", [1.0 - i / 10, 0.1, 0.0])

    assert len(rag.retrieve_relevant_patterns("Drama", "Warm", "x")) == 3
    assert len(rag.retrieve_relevant_patterns("Drama", "Warm", "x", top_k=5)) == 5


def test_similarity_is_reported_and_rounded(stub_embedder):
    stub_embedder([1.0, 0.0, 0.0])
    _seed("exact", [1.0, 0.0, 0.0])

    got = rag.retrieve_relevant_patterns("Drama", "Warm", "x")

    assert got[0]["similarity"] == 1.0


def test_only_the_symptom_is_embedded_not_the_genre_and_tone(stub_embedder):
    """Genre and tone used to be concatenated into the query, and it was the
    single largest defect in retrieval.

    They are near-constant across requests — almost everything arrives as some
    variant of "Drama | Emotional" — so they added no information about what the
    writer was stuck on, while pulling every query toward whichever entry read
    as most generically emotional. Measured on the golden set, one entry was
    coming back for 21 of 25 real queries. Dropping the prefix took that to 8
    and moved precision@1 from 56% to 72%.

    They stay in the signature because every caller has them and removing the
    parameters is churn; what matters is that they never reach the embedder."""
    calls = stub_embedder([1.0, 0.0, 0.0])
    _seed("any", [1.0, 0.0, 0.0])

    rag.retrieve_relevant_patterns("Drama", "Emotional", "A father and a debt")

    assert calls[0] == ["A father and a debt"]


def test_an_embedding_stored_as_a_json_string_is_parsed(stub_embedder):
    """Real Supabase returns a pgvector column as text; the local mock returns a
    list. Both have to work, and only one of them is what CI sees."""
    stub_embedder([1.0, 0.0, 0.0])
    _seed("from-postgres", json.dumps([1.0, 0.0, 0.0]))

    got = rag.retrieve_relevant_patterns("Drama", "Warm", "x")

    assert [p["technique"] for p in got] == ["from-postgres"]
    assert got[0]["similarity"] == 1.0


def test_a_row_with_no_embedding_is_skipped_rather_than_scored(stub_embedder):
    """A half-loaded corpus is a normal local state. Those rows must drop out of
    the ranking, not sit in it at zero."""
    stub_embedder([1.0, 0.0, 0.0])
    _seed("unembedded", None)
    _seed("empty-vector", [])
    _seed("real", [0.5, 0.5, 0.0])

    got = rag.retrieve_relevant_patterns("Drama", "Warm", "x", top_k=5)

    assert [p["technique"] for p in got] == ["real"]


def test_the_full_payload_shape_comes_back(stub_embedder):
    """The prompt builder and the editor's Patterns tab both read these keys."""
    stub_embedder([1.0, 0.0, 0.0])
    _seed("shaped", [1.0, 0.0, 0.0])

    got = rag.retrieve_relevant_patterns("Drama", "Warm", "x")[0]

    for key in ("title_ref", "genre", "origin_tradition", "craft_level", "technique",
                "problem", "how_it_works", "how_to_apply", "worked_example",
                "warning_sign", "one_line_takeaway", "similarity"):
        assert key in got


# --- _cosine -----------------------------------------------------------------

def test_identical_vectors_score_one():
    assert rag._cosine([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)


def test_orthogonal_vectors_score_zero():
    assert rag._cosine([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_a_vector_of_the_wrong_length_scores_zero():
    """The load-bearing guard. `zip` stops at the shorter sequence, so without
    this a half-written blob would be scored over its overlap while both
    magnitudes were computed in full — producing not an error but a
    plausible-looking number that can sort to the top and put the wrong craft
    pattern in front of a writer."""
    assert rag._cosine([1.0, 0.0, 0.0], [1.0, 0.0]) == 0.0


def test_a_zero_vector_scores_zero():
    """Divide-by-zero, guarded by `if na and nb`."""
    assert rag._cosine([0.0, 0.0], [1.0, 0.0]) == 0.0


def test_a_wrong_length_row_cannot_outrank_a_good_one(stub_embedder):
    """The guard, end to end: a stale-dimension row loses to a mediocre match
    rather than winning on a fabricated score."""
    stub_embedder([1.0, 0.0, 0.0])
    _seed("stale-dimensions", [1.0, 0.0])
    _seed("honest-but-mediocre", [0.3, 0.9, 0.0])

    got = rag.retrieve_relevant_patterns("Drama", "Warm", "x", top_k=2)

    assert got[0]["technique"] == "honest-but-mediocre"


# --- degradation --------------------------------------------------------------

def test_an_empty_library_returns_nothing_without_embedding_anything(monkeypatch):
    """The state a fresh local database is actually in — `script_patterns` is
    empty until `load_knowledge_base.py` has been run and the backend restarted.
    The early return also means no embedding pass is paid for."""
    def explode(texts):
        raise AssertionError("an empty library must return before embedding")

    monkeypatch.setattr(rag, "embed_texts", explode)

    assert rag.retrieve_relevant_patterns("Drama", "Warm", "x") == []


def test_a_database_failure_returns_nothing_rather_than_raising(monkeypatch, stub_embedder):
    """Generation proceeds ungrounded. A writer gets a worse structure; they do
    not get a 500 in the middle of their work."""
    class Boom:
        def table(self, *a, **k):
            raise RuntimeError("connection refused")

    stub_embedder([1.0, 0.0, 0.0])
    monkeypatch.setattr(database, "supabase", Boom())

    assert rag.retrieve_relevant_patterns("Drama", "Warm", "x") == []


def test_an_embedding_failure_returns_nothing_rather_than_raising(monkeypatch):
    _seed("any", [1.0, 0.0, 0.0])

    def explode(texts):
        raise RuntimeError("onnx runtime is unhappy")

    monkeypatch.setattr(rag, "embed_texts", explode)

    assert rag.retrieve_relevant_patterns("Drama", "Warm", "x") == []


# --- pattern_to_text ----------------------------------------------------------

def test_the_problem_statement_is_weighted_over_the_technique():
    """Writers arrive with a symptom — "this scene feels flat" — not a genre tag.
    Repeating the problem is what keeps retrieval on the symptom, and it was the
    fix for an earlier genre+takeaway embedding that retrieved by subject."""
    text = rag.pattern_to_text({
        "problem": "FLATNESS", "technique": "TECHNIQUE", "craft_level": "scene",
    })

    assert text.count("FLATNESS") == 2
    assert text.count("TECHNIQUE") == 1


def test_the_warning_sign_is_embedded_because_it_is_also_a_symptom():
    """`warning_sign` is what the fault looks like on the page, which is the same
    register a query arrives in. Adding it was worth four points of precision@3
    and cut the number of entries no query ever reaches from three to two."""
    text = rag.pattern_to_text({
        "problem": "P", "technique": "T", "warning_sign": "SYMPTOM ON THE PAGE",
    })

    assert "SYMPTOM ON THE PAGE" in text


def test_craft_exposition_and_tags_are_not_embedded():
    """Three fields were deliberately dropped, each after being measured.

    `how_it_works` is the longest field in an entry and explains the fix rather
    than the fault; including it diluted the symptom until one entry answered
    most of the library. `craft_level` and `genre` are tags nobody types, and
    they gave every entry in a level a shared lump of text that made them harder
    to tell apart. Removing all three moved precision@1 from 56% to 72%."""
    text = rag.pattern_to_text({
        "problem": "P", "technique": "T",
        "how_it_works": "EXPOSITION", "craft_level": "dialogue",
        "genre": "GENRE", "origin_tradition": "TRADITION",
    })

    assert "EXPOSITION" not in text
    assert "dialogue" not in text
    assert "GENRE" not in text
    assert "TRADITION" not in text


def test_a_pattern_with_no_problem_falls_back_to_the_takeaway():
    """Older corpus rows predate the `problem` field."""
    text = rag.pattern_to_text({"one_line_takeaway": "LEGACY", "technique": "T"})

    assert "LEGACY" in text


def test_pattern_text_survives_a_row_with_nothing_in_it():
    """Empty in, empty out — and crucially not a crash. The loader validates
    entries, but a row can also arrive from a database written by an older
    version of the loader."""
    assert rag.pattern_to_text({}) == ""


# --- get_patterns_by_technique ------------------------------------------------

def test_an_exact_technique_lookup_needs_no_embedding(monkeypatch):
    """When the linter fires it already knows the technique name, because every
    rule was derived from a craft entry. Paying for an embedding pass to look up
    something you can name would be both slower and lossier."""
    def explode(texts):
        raise AssertionError("exact lookup must not embed")

    monkeypatch.setattr(rag, "embed_texts", explode)
    _seed("show-dont-tell", [1.0, 0.0, 0.0])

    got = rag.get_patterns_by_technique(["show-dont-tell"])

    assert [p["technique"] for p in got] == ["show-dont-tell"]


def test_an_exact_lookup_is_not_fuzzy():
    _seed("show-dont-tell", [1.0, 0.0, 0.0])

    assert rag.get_patterns_by_technique(["show dont tell"]) == []


def test_repeated_technique_names_are_returned_once():
    _seed("show-dont-tell", [1.0, 0.0, 0.0])

    got = rag.get_patterns_by_technique(["show-dont-tell", "show-dont-tell"])

    assert len(got) == 1


def test_exact_lookups_report_full_similarity():
    """`1.0` is how a caller tells a named lookup from a ranked hit."""
    _seed("show-dont-tell", [1.0, 0.0, 0.0])

    assert rag.get_patterns_by_technique(["show-dont-tell"])[0]["similarity"] == 1.0


def test_an_empty_name_list_returns_nothing():
    assert rag.get_patterns_by_technique([]) == []
    assert rag.get_patterns_by_technique([None, ""]) == []


def test_names_are_returned_in_the_order_asked_for():
    _seed("first", [1.0, 0.0, 0.0])
    _seed("second", [0.0, 1.0, 0.0])

    got = rag.get_patterns_by_technique(["second", "first"])

    assert [p["technique"] for p in got] == ["second", "first"]


# --- format_patterns_for_prompt -----------------------------------------------

def test_an_empty_pattern_set_formats_to_an_empty_string():
    """Not a dangling header. Retrieval returning `[]` is a normal outcome, and
    a prompt that ships "apply these techniques:" followed by nothing is worse
    than one that never mentions them."""
    assert rag.format_patterns_for_prompt([]) == ""


def test_the_prompt_block_numbers_each_technique():
    block = rag.format_patterns_for_prompt([
        {"technique": "One", "how_it_works": "", "how_to_apply": ""},
        {"technique": "Two", "how_it_works": "", "how_to_apply": ""},
    ])

    assert "1. One" in block
    assert "2. Two" in block


def test_the_prompt_block_omits_missing_optional_fields():
    block = rag.format_patterns_for_prompt([{"technique": "Bare"}])

    assert "Why it works:" not in block
    assert "Apply:" not in block


def test_the_prompt_block_forbids_echoing_the_source_labels():
    """Titles are provenance for us, not material for the model. The instruction
    is what keeps generated output publishable."""
    block = rag.format_patterns_for_prompt([{"technique": "One"}])

    assert "Never mention these labels" in block
