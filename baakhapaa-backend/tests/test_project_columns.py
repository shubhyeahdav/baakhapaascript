"""`supabase_schema.sql` and `projects.py` have to describe the same table.

This file exists because they did not, and **project creation was broken for
every format** while 993 tests passed.

`video_category` was added to the insert in `projects.py` when long-form video
landed. The column was never added to `supabase_schema.sql`, so it was never
added to the real database. Postgres rejects the WHOLE ROW for an unknown
column — it does not drop the field — so `POST /projects/` returned a 500 and
the wizard said "Could not create the project. Please try again." for a
screenplay just as much as for a video.

Nothing caught it because `database.py`'s local mock is schemaless: it stores
rows as flat JSON and therefore agrees with any writer. CLAUDE.md names this as
a standing hazard and counts three schema-drift bugs before this one. This is
the fourth.

`tests/test_pattern_schema.py` is the same guard for `script_patterns`, and it
was written after the same class of failure there. `projects` never got one.
It has one now.
"""
import io
import os
import re

import projects as projects_module

SQL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "supabase_schema.sql"
)


def _sql():
    return io.open(SQL_PATH, encoding="utf-8").read()


def _create_table_body():
    """Just the CREATE TABLE block, so a column named only in a comment or in
    the migration section at the bottom does not count as defined."""
    sql = _sql()
    start = re.search(r"create table (if not exists )?projects", sql, re.I).start()
    return sql[start:sql.index(");", start)]


def _defined_columns():
    body = _create_table_body()
    cols = set()
    for line in body.splitlines()[1:]:
        m = re.match(r"\s*([a-z_]+)\s+(TEXT|UUID|INT|INTEGER|BOOLEAN|TIMESTAMP|SERIAL)",
                     line, re.I)
        if m:
            cols.add(m.group(1).lower())
    return cols


def _columns_the_code_writes():
    """Every column name `projects.py` sends in an insert or an update.

    Read out of the source rather than from a hand-maintained list, for the
    reason `test_pattern_schema` learned the hard way: a list is a second place
    to remember something, and the thing that broke was somebody adding a field
    to the insert and not to the list.
    """
    src = io.open(
        os.path.join(os.path.dirname(SQL_PATH), "projects.py"), encoding="utf-8"
    ).read()
    # The create payload: "column": project.attr
    written = set(re.findall(r'"([a-z_]+)":\s*(?:project|defaults)\.', src))
    written |= set(projects_module.PROJECT_UPDATE_FIELDS)
    # Written by the code but set explicitly rather than from the model.
    written |= {"user_id", "status", "title"}
    return written


def test_every_column_projects_py_writes_exists_in_the_schema():
    """The test that would have caught it.

    A missing column is not a dropped field — Postgres rejects the entire row,
    so ONE unknown column breaks project creation for everybody, in every
    format.
    """
    defined = _defined_columns()

    missing = sorted(c for c in _columns_the_code_writes() if c not in defined)

    assert not missing, (
        f"projects.py writes {missing} and supabase_schema.sql has no column "
        "for it. Postgres rejects the whole row, so this breaks project "
        "creation entirely — and the local mock is schemaless, so nothing else "
        "will tell you. Add the column to the CREATE TABLE block AND to the "
        "migration section, then run it against Supabase by hand."
    )


def test_video_category_is_specifically_covered():
    """Named rather than left to the sweep above, because this is the one that
    broke and a regression should fail with its own name attached."""
    assert "video_category" in _defined_columns()


def test_every_new_column_also_has_a_migration():
    """A column in CREATE TABLE only helps a database created from scratch.

    Every existing environment — including the production project this is
    developed against — is migrated by hand in the SQL editor, so a column
    without an ALTER is a column that exists in the file and not in the
    database. That is exactly the shape of this bug.
    """
    sql = _sql()
    alters = set(re.findall(
        r"alter table projects add column if not exists ([a-z_]+)", sql, re.I))

    for col in ("video_category", "short_form_category", "hook_type"):
        assert col in alters, (
            f"{col} is in the schema but has no ALTER TABLE — an existing "
            "database will never get it."
        )
