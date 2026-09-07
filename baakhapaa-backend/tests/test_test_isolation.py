"""The suite must never touch a real database.

This exists because it happened. `conftest.py` popped `SUPABASE_URL` and
`SUPABASE_KEY` to "force the local mock database", and `database.py` calls
`load_dotenv()` on import — which declines to overwrite a variable that already
exists but DOES fill in one that is missing. So the pop invited the real values
straight back, and from the day Supabase keys were added to `.env` the entire
suite ran against the production project: 853 tests creating and deleting rows
in a live database.

It surfaced only by luck. The key in `.env` at the time was the anon key, which
row-level security refuses to write with, so the tests failed loudly instead of
succeeding destructively. With a service_role key they would have passed — and
deleted real data on the way.

The identical trap was already documented in `conftest.py` for the AI keys,
where the fix was to SET a placeholder rather than delete. It was never applied
to the database. That is the whole lesson: a trap you have already fallen into
is not fixed until every instance of it is.
"""
import os

import database


def test_the_tests_run_against_the_mock_database():
    """The single assertion that would have caught it."""
    assert type(database.supabase).__name__ == "MockSupabaseClient", (
        "the test suite is connected to a REAL database. Nothing in this suite "
        "is safe to run — it creates and deletes users, projects and scripts."
    )


def test_the_supabase_variables_are_set_to_placeholders_not_deleted():
    """Deleting them is what broke it: `load_dotenv()` refills a missing
    variable from `.env` on the next import, so a pop is undone by the first
    application import that follows it."""
    url = os.getenv("SUPABASE_URL")

    assert url, "SUPABASE_URL is unset, so load_dotenv will refill it from .env"
    assert "your-supabase" in url, (
        f"SUPABASE_URL is {url!r}, which database.py will treat as real"
    )


def test_the_local_database_is_a_throwaway_file():
    """Even the mock must not be the developer's own dev database, or a test
    run erases the projects they were working on."""
    path = os.getenv("LOCAL_DB_PATH", "")

    assert "baakhapaa_test_" in path, f"LOCAL_DB_PATH is {path!r}"


def test_the_ai_keys_are_placeholders_too():
    """The instance of this trap that was already fixed. Pinned beside the new
    one so the pair cannot drift apart again."""
    import script_engine

    assert script_engine.MOCK_AI is True, (
        "the suite would make live, billed API calls"
    )
