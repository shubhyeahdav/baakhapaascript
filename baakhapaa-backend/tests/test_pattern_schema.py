"""The pgvector schema and the loader have to describe the same table.

This file exists because they did not, and nothing would have caught it.

`pgvector_script_patterns.sql` is the only definition of `script_patterns`
anywhere in the repository, and it is run by hand in the Supabase SQL editor.
Every environment to date has been the SQLite mock in `database.py`, which
creates columns on demand and therefore agrees with any writer. So the file
drifted: it carried `one_line_takeaway` and `structural_pattern` as NOT NULL
columns nothing had written for months, it was missing the seven columns the
loader does write, and its `source_type` check rejected `'craft'` — the type of
every entry added since the corpus moved to craft techniques.

The first real Supabase deploy would have created the table without complaint
and then failed on the first `load_knowledge_base.py` run. That is the
schema-drift class of bug the handover notes warn about, and the cheapest guard
against it is a test that reads the SQL as text and compares it against the
code that writes to it. It needs no database.
"""
import io
import os
import re

import load_knowledge_base as loader
import rag

SQL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "pgvector_script_patterns.sql")


def _sql():
    return io.open(SQL_PATH, encoding="utf-8").read()


def _create_table_body():
    """Just the CREATE TABLE block, so a column named only in a comment or in
    the migration section at the bottom does not count as defined."""
    sql = _sql()
    start = sql.index("create table if not exists script_patterns")
    return sql[start:sql.index(");", start)]


def test_every_field_the_loader_writes_has_a_column():
    """`load_knowledge_base.REQUIRED` is the list of fields sent in the insert.
    A field with no column is an error on the first real load, not a silent
    drop, because Postgres rejects the whole row."""
    body = _create_table_body()

    missing = [f for f in loader.REQUIRED if not re.search(rf"^\s+{f}\s+text", body, re.M)]

    assert not missing, f"columns missing from script_patterns: {missing}"


def test_the_two_columns_the_loader_also_writes_are_present():
    """`embed_text` and `embedding` are not in REQUIRED — they are computed —
    but they are in the same insert."""
    body = _create_table_body()

    assert re.search(r"^\s+embed_text\s+text", body, re.M)
    assert re.search(r"^\s+embedding\s+vector", body, re.M)


def test_no_not_null_column_goes_unwritten():
    """A NOT NULL column that nothing writes makes every insert fail. Two of
    them sat in this file for months, unnoticed, because the mock database
    enforces no constraints."""
    written = set(loader.REQUIRED) | {"embed_text", "embedding"}
    generated = {"id", "created_at"}

    for line in _create_table_body().splitlines():
        m = re.match(r"\s+(\w+)\s+(?:text|vector|uuid|timestamptz)", line)
        if not m:
            continue
        name = m.group(1)
        if name in generated or "not null" not in line.lower():
            continue
        assert name in written, (
            f"'{name}' is NOT NULL but nothing writes it; the first insert "
            f"against a real Postgres would fail"
        )


def test_the_source_type_check_accepts_every_type_the_loader_accepts():
    """The check constraint and `VALID_TYPES` are two statements of the same
    rule in two languages. 'craft' was in one and not the other."""
    m = re.search(r"source_type\s+text\s+not null\s*\n?\s*check \(source_type in \(([^)]*)\)\)",
                  _sql())
    assert m, "source_type check constraint not found"

    allowed = set(re.findall(r"'([^']+)'", m.group(1)))

    assert loader.VALID_TYPES <= allowed, (
        f"the loader accepts {sorted(loader.VALID_TYPES - allowed)} but the "
        f"database would reject it"
    )


def test_the_craft_level_check_accepts_every_level_the_loader_accepts():
    m = re.search(r"craft_level\s+text\s+not null\s*\n?\s*check \(craft_level in \(([^)]*)\)\)",
                  _sql())
    assert m, "craft_level check constraint not found"

    allowed = set(re.findall(r"'([^']+)'", m.group(1)))

    assert loader.VALID_LEVELS <= allowed


def test_the_vector_dimension_matches_the_model_actually_in_use():
    """Changing `rag.EMBED_MODEL_NAME` without changing `vector(N)` produces a
    database that refuses every row, and the error names the dimension rather
    than the model, which is a slow thing to debug at deploy time.

    Measured on 2026-09-03: bge-base at 768 dimensions scored identically on
    precision@1 (88%) for 4.6x the embedding time, so the 384-dim model stays.
    If that is ever revisited, this test is the reminder that the schema moves
    with it."""
    dims = {"BAAI/bge-small-en-v1.5": 384,
            "sentence-transformers/all-MiniLM-L6-v2": 384,
            "BAAI/bge-base-en-v1.5": 768}
    expected = dims.get(rag.EMBED_MODEL_NAME)
    if expected is None:
        return  # an unfamiliar model; nothing to assert against

    assert f"vector({expected})" in _sql(), (
        f"{rag.EMBED_MODEL_NAME} is {expected}-dim; the schema says otherwise"
    )


def test_the_rpc_returns_what_retrieval_needs():
    """`match_script_patterns` is the server-side path retrieval switches to
    past ~500 entries. It has to return the same fields as fetch-and-rank, or
    the switch changes what a writer sees."""
    sql = _sql()
    start = sql.index("create or replace function match_script_patterns")
    returns = sql[sql.index("returns table (", start):sql.index("language sql", start)]

    for field in ("technique", "problem", "how_to_apply", "worked_example",
                  "warning_sign", "craft_level", "similarity"):
        assert field in returns, f"the RPC does not return '{field}'"

def test_every_field_the_loader_ACTUALLY_writes_has_a_column():
    """Asked of the loader, not of a hand-maintained list.

    The test above reads `loader.REQUIRED`, which is only PART of the insert —
    so a field written outside it was invisible to the guard. That is how
    `applies_to` reached the loader without reaching the schema, on 2026-09-14:
    the drift class this file exists to catch, arriving through this file.

    `loader.row_for` is the real payload. Comparing against that means a field
    added anywhere in the insert cannot get past this again.
    """
    body = _create_table_body()
    sample = {f: "x" for f in loader.REQUIRED}

    written = set(loader.row_for(sample).keys())

    missing = [
        f for f in written
        if not re.search(rf"^\s+{f}\s+(text|vector|real|int|bool|timestamp)", body, re.M | re.I)
        and not re.search(rf"^\s+{f}\s+text\[\]", body, re.M | re.I)
    ]
    assert not missing, (
        f"the loader writes {missing} and script_patterns has no column for it. "
        "Add the column to pgvector_script_patterns.sql AND run the migration "
        "against Supabase — the file is applied by hand in the SQL editor."
    )


# --- the RPC signature, not just its return shape ----------------------------
#
# The test above asks what `match_script_patterns` RETURNS. These ask what it
# ACCEPTS, which is the half that broke. `rag._rpc_search` calls it with named
# parameters and PostgREST resolves the overload BY those names, so a database
# holding the old two-argument version does not silently ignore the new
# argument — it returns PGRST202 and retrieval falls back to Python. Correct,
# quiet, and slower for no reason anyone would ever look into.

def _rpc_definition():
    sql = _sql()
    start = sql.index("create or replace function match_script_patterns")
    return sql[start:sql.index("$$;", start)]


def test_the_rpc_accepts_every_parameter_retrieval_sends():
    """Read off `_rpc_search` rather than listed here, so a fourth parameter
    added to the call cannot get past this the way `applies_to` got past the
    column guard."""
    import inspect

    call = inspect.getsource(rag._rpc_search)
    sent = set(re.findall(r'"([a-z_]+)":', call))
    definition = _rpc_definition()

    missing = sorted(p for p in sent if not re.search(rf"^\s+{p}\s", definition, re.M))

    assert not missing, (
        f"rag._rpc_search sends {missing} and the SQL function has no such "
        "parameter. PostgREST resolves by NAME, so this is a 404 at runtime, "
        "not an ignored argument."
    )


def test_the_rpc_narrows_by_craft_in_sql_rather_than_after():
    """The one-way exclusion has to survive the LIMIT.

    Filtering the RPC's three rows afterwards can only shrink them, so a
    screenwriter whose three nearest entries were all video craft would be told
    the library has nothing. Measured against the real database before this
    landed, the unfiltered function put a long-form video entry FIRST for a
    screenwriter asking why their opening does not hold.
    """
    definition = _rpc_definition()

    assert "filter_craft" in definition
    where = definition[definition.index("where"):definition.index("order by")]
    assert "applies_to" in where
    assert definition.index("where") < definition.index("limit match_count")


def test_the_old_signature_is_dropped_before_the_new_one_is_created():
    """`create or replace` with a different argument list creates a SECOND
    function rather than replacing the first. Both would then match a two-named
    -argument call — the third has a default — and Postgres rejects it as
    ambiguous. So the drop is the migration, and it has to come first."""
    sql = _sql()

    drop = sql.index("drop function if exists match_script_patterns(vector(384), int)")
    create = sql.index("create or replace function match_script_patterns")

    assert drop < create, "the drop must run before the create, or both survive"


def test_the_rpc_returns_the_craft_it_matched_on():
    """`_pattern_payload` defaults a missing `applies_to` to both crafts. An RPC
    that did not return the column would therefore label a video-only entry as
    serving screenwriters too — a wrong answer produced by a default, which is
    the hardest kind to see."""
    returns = _rpc_definition()

    assert "applies_to text[]" in returns
