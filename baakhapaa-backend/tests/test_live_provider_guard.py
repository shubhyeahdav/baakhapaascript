"""The guard that stops the suite reaching a paid provider, tested.

`FEATURE_SUGGESTIONS.md` B4: the protection in `conftest.py` was a list of key
NAMES to neutralise, and a list of names goes stale the day a new provider
lands. It did, twice, and both times the failure was silent in a different way:

  * `LLM_PROVIDER` / `LLM_API_KEY` arrived with the OpenAI-compatible transport
    and the list did not cover them. Every AI test made a live billed call to a
    reasoning model that spends its budget thinking and returns nothing, so the
    suite did not fail — it hung. 75 minutes, no output.
  * `SUPABASE_URL` was popped instead of set, `load_dotenv()` refilled it, and
    853 tests ran against the production database. It surfaced only because the
    key in use could not write. With a service_role key they would have passed,
    and deleted real data doing it.

The fix is to stop describing what to switch off and start asserting what must
be true. Three conditions, checked once at session start, that hold for a
provider nobody has integrated yet.

This file exists because a guard nobody has seen fire is indistinguishable from
one that cannot. Each condition is forced here and the reason is checked.
"""
import pytest

from conftest import _live_provider_reason


def test_nothing_is_live_right_now():
    """The state every run of this suite must be in. If this fails, the run it
    is part of should already have been stopped at session start."""
    assert _live_provider_reason() is None


def test_a_live_text_provider_is_caught(monkeypatch):
    """The 75-minute hang, in the form it would take again: a provider the
    name-list does not know about setting PROVIDER to something real."""
    import script_engine

    monkeypatch.setattr(script_engine, "PROVIDER", "some-new-vendor-2027")

    reason = _live_provider_reason()

    assert reason is not None
    assert "some-new-vendor-2027" in reason
    assert "billed" in reason


def test_a_live_image_provider_is_caught(monkeypatch):
    """Storyboards are the expensive half — one board is up to 24 images."""
    import storyboard_engine

    monkeypatch.setattr(storyboard_engine, "MOCK_AI", False)

    reason = _live_provider_reason()

    assert reason is not None
    assert "OPENAI_API_KEY" in reason


def test_a_real_database_is_caught(monkeypatch):
    """The one that already happened, and the one with no undo. The message
    says DELETE in capitals on purpose: the suite's fixtures clean up after
    themselves, which is exactly what makes it destructive against real data."""
    import database

    monkeypatch.setattr(database, "use_mock", False)

    reason = _live_provider_reason()

    assert reason is not None
    assert "DELETE" in reason


def test_the_text_provider_is_reported_before_the_others(monkeypatch):
    """Order is deliberate rather than incidental. Text generation is checked
    first because it is the one that hangs — a run that hangs gives no output
    at all to read, so it is the least diagnosable and the most worth naming
    first."""
    import database
    import script_engine

    monkeypatch.setattr(script_engine, "PROVIDER", "anthropic")
    monkeypatch.setattr(database, "use_mock", False)

    assert "PROVIDER" in _live_provider_reason()


def test_the_message_says_what_to_do_and_what_not_to(monkeypatch):
    """A guard that fires and leaves someone guessing gets deleted by whoever
    it is blocking. It has to name the likely cause — a new provider's
    variables — and say explicitly that the check is not the thing to remove."""
    from conftest import _LIVE_PROVIDER_HINT

    text = _LIVE_PROVIDER_HINT.format(what="x")

    assert "conftest.py" in text
    assert "leave this check alone" in text
    assert "{what}" not in text


@pytest.mark.parametrize("attr,module_name", [
    ("PROVIDER", "script_engine"),
    ("MOCK_AI", "storyboard_engine"),
    ("use_mock", "database"),
])
def test_every_thing_the_guard_reads_still_exists(attr, module_name):
    """The guard reads three module attributes. If any is renamed, the guard
    would raise at session start rather than pass — which is loud, but this
    fails with the name in it instead."""
    import importlib

    module = importlib.import_module(module_name)

    assert hasattr(module, attr), f"{module_name}.{attr} is gone; the guard reads it"


def test_the_session_actually_stops_rather_than_just_noticing(monkeypatch):
    """The wiring, not the detection.

    `_live_provider_reason` returning a string is worth nothing on its own —
    what matters is that the session ENDS. `pytest.exit` raises
    `Session.Exited`, so this is the only way to see the whole path without
    ending the run that is checking it.
    """
    import script_engine
    from conftest import pytest_sessionstart

    monkeypatch.setattr(script_engine, "PROVIDER", "anthropic")

    with pytest.raises(Exception) as caught:
        pytest_sessionstart(session=None)

    assert type(caught.value).__name__ == "Exit", type(caught.value).__name__
    assert "must not run" in str(caught.value)


def test_a_clean_session_starts_without_complaint():
    """The other half: the guard must be silent in the normal case, or it is
    just an obstacle people learn to route around."""
    from conftest import pytest_sessionstart

    assert pytest_sessionstart(session=None) is None
