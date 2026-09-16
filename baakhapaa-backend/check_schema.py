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


def _columns_written_to_payments() -> set:
    """Every column `payments.py` puts in a payment row.

    Added when refunds landed: `refunded_at` is a new column AND `status`
    gained a value its CHECK constraint did not allow. A column check cannot
    see a constraint, so `tests/test_refunds.py` reads the SQL for the second
    half — but the column itself belongs here, where the real database is the
    one being asked.
    """
    return {
        "id", "user_id", "tier", "provider", "amount", "currency", "status",
        "reference", "provider_ref", "created_at", "completed_at", "refunded_at",
    }


CHECKS = (
    ("projects", _columns_written_to_projects),
    (rag.TABLE, _columns_written_to_patterns),
    ("payments", _columns_written_to_payments),
)

# The exact statement to run, per column. Kept beside the check so the output
# is something you can paste rather than something you have to translate.
DDL = {
    ("projects", "video_category"):
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS video_category TEXT DEFAULT 'essay';",
    ("script_patterns", "applies_to"):
        "ALTER TABLE script_patterns ADD COLUMN IF NOT EXISTS applies_to text[];",
    # Both statements under one key on purpose. Refunds needed a new COLUMN
    # and a wider CHECK on `status`, and a column probe cannot see a
    # constraint -- `status` already exists, so a key of its own would never
    # fire and the constraint would be silently left un-migrated. They land
    # together or the first refund is rejected by the second half.
    ("payments", "refunded_at"):
        "ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;"
        " ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;"
        " ALTER TABLE payments ADD CONSTRAINT payments_status_check"
        " CHECK (status IN ('pending','completed','failed','underpaid','refunded'));",
}


def check_rpc() -> str:
    """Is `match_script_patterns` there, at the signature the code calls?

    A column is not the only thing that drifts. The RPC lives in the same
    hand-applied file, it is called with named parameters, and PostgREST
    resolves it BY those names — so a database still holding the two-argument
    version does not get a craft-filtered search that quietly ignores the
    filter, it gets a 404. That is the safe failure, and it is invisible:
    retrieval falls back to Python, logs one line, and stays correct. Nothing
    else would ever tell you.

    Returns "" when it is fine, or the reason it is not.
    """
    rpc = getattr(database.supabase, "rpc", None)
    if rpc is None:
        return "this client has no rpc() at all"
    probe = [0.0] * 384
    probe[0] = 1.0
    try:
        res = rpc(rag.RPC_NAME, {"query_embedding": probe, "match_count": 1,
                                 "filter_craft": rag.SCREENPLAY_CRAFT}).execute()
    except Exception as e:  # noqa: BLE001 - any failure means "cannot use it"
        return str(e)[:200]
    rows = getattr(res, "data", None)
    if rows and "applies_to" not in rows[0]:
        return "returns rows without applies_to, so the craft filter cannot be verified"
    return ""


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

    reason = check_rpc()
    print(f"  [{'OK ' if not reason else 'GAP'}] {rag.RPC_NAME}(): "
          + ("present, craft-filtered" if not reason else reason))

    if not problems and not reason:
        print("\nThe database matches the code.")
        return 0

    if reason:
        print("\nRetrieval still works — it ranks in Python instead — but the")
        print("faster path is off. Re-run pgvector_script_patterns.sql end to")
        print("end in the SQL editor; it drops the old signature before")
        print("creating the new one, which a bare CREATE OR REPLACE will not.")

    if not problems:
        return 1

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
