"""Does the real database match what the code writes?

Run it before believing a green test suite:

    ./venv/Scripts/python check_schema.py

WHY THIS EXISTS
---------------
Five schema-drift bugs, two of them on 2026-09-14, and every one the same
shape: a field added to an insert without a column added to the table.

The suite cannot see them. `database.py`'s local mock stores rows as flat JSON,
so it accepts any column Postgres would reject — 996 tests passed while
`projects.video_category` was missing from the real database, and Postgres
rejects the WHOLE ROW for an unknown column rather than dropping the field. So
one missing column broke project creation for every format, and nothing said so
until somebody tried it.

`tests/test_project_columns.py` and `tests/test_pattern_schema.py` compare the
code against the SQL FILES, which catches the mistake at the moment it is made.
This is the other half: the SQL files are applied to real databases BY HAND in
the Supabase editor, so a correct file proves nothing about the database this
machine is actually pointed at.

READ ONLY. It selects one column at a time and writes nothing, so it is safe to
run against production — which is the only place it is useful.
"""
import sys

import database
import projects as projects_module
import rag


def _columns_written_to_projects() -> set:
    """Every column `projects.py` puts in a row."""
    return set(projects_module.PROJECT_UPDATE_FIELDS) | {
        "user_id", "title", "status", "genre", "tone", "language",
        "duration_minutes", "target_audience", "format", "episode_count",
        "duration_seconds", "hook_type", "short_form_category", "video_category",
    }


def _columns_written_to_patterns() -> set:
    import load_knowledge_base as loader

    sample = {f: "x" for f in loader.REQUIRED}
    # `embedding` is a vector column and is checked with the rest; a missing one
    # fails the same way.
    return set(loader.row_for(sample).keys())


CHECKS = (
    ("projects", _columns_written_to_projects),
    (rag.TABLE, _columns_written_to_patterns),
)

# The exact statement to run, per column. Kept beside the check so the output
# is something you can paste rather than something you have to translate.
DDL = {
    ("projects", "video_category"):
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS video_category TEXT DEFAULT 'essay';",
    ("script_patterns", "applies_to"):
        "ALTER TABLE script_patterns ADD COLUMN IF NOT EXISTS applies_to text[];",
}


def missing_columns(table: str, wanted: set) -> list:
    """Which of `wanted` the real table does not have.

    One `select` per column rather than one for all of them: Postgres names
    only the FIRST unknown column in its error, so a combined query would
    report one missing field and hide the rest — which is the exact failure
    mode this script exists to end.
    """
    missing = []
    for col in sorted(wanted):
        try:
            database.supabase.table(table).select(col).limit(1).execute()
        except Exception as e:  # noqa: BLE001 - any failure here means "cannot use it"
            if "does not exist" in str(e) or "42703" in str(e):
                missing.append(col)
            else:
                print(f"  ? {table}.{col}: {str(e)[:120]}")
    return missing


def main() -> int:
    if database.use_mock:
        print("This machine is on the local SQLite mock, which accepts any column.")
        print("Nothing to check — and nothing this could tell you. Point it at a")
        print("real database (SUPABASE_URL / SUPABASE_KEY) to get an answer.")
        return 0

    print("Checking the REAL database against what the code writes.\n")
    problems = []
    for table, wanted in CHECKS:
        cols = wanted()
        gaps = missing_columns(table, cols)
        mark = "OK " if not gaps else "GAP"
        print(f"  [{mark}] {table}: {len(cols) - len(gaps)}/{len(cols)} columns present")
        for col in gaps:
            print(f"          missing: {col}")
            problems.append((table, col))

    if not problems:
        print("\nThe database matches the code.")
        return 0

    print("\nRun these in the Supabase SQL editor, then restart the backend:\n")
    for table, col in problems:
        print("   " + DDL.get(
            (table, col),
            f"-- no statement recorded for {table}.{col}; add one to check_schema.DDL",
        ))
    print("\nUntil then, any insert touching those columns fails ENTIRELY —")
    print("Postgres rejects the whole row rather than dropping the unknown field.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
