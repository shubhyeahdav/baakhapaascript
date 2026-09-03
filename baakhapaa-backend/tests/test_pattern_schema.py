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
