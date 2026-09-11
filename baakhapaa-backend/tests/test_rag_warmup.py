"""Who pays the second it takes to load the embedding model.

Measured on this machine, fresh process:

    import rag        0.02s
    first embed       1.37 / 0.96 / 0.96s   <- the model loading
    second embed      0.005s

Somebody pays that. Without a warm-up it is the first person to open the
Patterns tab after a restart — and on the free tier that tab IS the product,
because retrieval with no API call is the whole of what a free user gets. So
the slowest request in the system was the first impression.

End to end, through the app, fresh process each time:

    warm-up off    boot 4.31s   first retrieval 0.686s
    warm-up on     boot 3.59s   first retrieval 0.007s

The boot is not slower, which is the point of the thread.
"""
import os
import threading
import time

import rag


def test_warm_model_loads_it(monkeypatch):
    """After warming, the model is resident rather than None."""
    monkeypatch.setattr(rag, "_model", None)

    assert rag.warm_model() is True
    assert rag._model is not None


def test_warming_twice_is_free():
    """It is called from a daemon thread at startup and lazily by the first
    real embed. Both paths must be able to run without loading twice."""
    rag.warm_model()
    first = rag._model

    t0 = time.perf_counter()
    rag.warm_model()
    elapsed = time.perf_counter() - t0

    assert rag._model is first
    assert elapsed < 0.5, f"second warm took {elapsed:.2f}s — it reloaded"


def test_a_warm_up_that_fails_does_not_raise(monkeypatch):
    """Swallowed on purpose. A warm-up that cannot run is not a reason to
    refuse the boot — it is a reason for the first request to be slow, which is
    the situation this started from. Raising here would turn a performance
    optimisation into an outage."""
    def boom():
        raise RuntimeError("no model here")

    monkeypatch.setattr(rag, "_get_model", boom)

    assert rag.warm_model() is False


def test_the_suite_itself_runs_with_the_warm_up_off():
    """`tests/conftest.py` sets this before the app is imported. 55 test files
    each paying a second to load a 130MB model they never call is a minute of
    nothing, and it would be spent on every run for ever."""
    assert os.getenv("RAG_WARM_MODEL") == "false"


def test_importing_the_app_starts_no_warm_up_thread():
    """The flag has to be read at import time, because that is when main.py
    runs. If this ever fails it means the app is loading the model during the
    test run and nobody will notice except by the clock."""
    import main  # noqa: F401  - imported for the side effect under test

    assert not any(t.name == "rag-warm" for t in threading.enumerate())
