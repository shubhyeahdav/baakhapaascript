"""Free keyless image provider for storyboard frames.

Tests the URL builder directly rather than the network, so the suite stays
offline and fast. `STORYBOARD_PROVIDER` is read at import time, so the
provider switch itself is asserted through the module constant.
"""
from urllib.parse import urlparse, parse_qs

import storyboard_engine as se


def _frame_prompt():
    return se.generate_frame(
        "Raaja hides his result from his father",
        "Wide Shot",
        "drama",
        "Chiya pasal, Patan",
        "quiet anxiety",
    )


def test_placeholder_is_the_default_provider():
    """Pollinations sends scene text to a third party, so it must never be
    switched on implicitly."""
    assert se.STORYBOARD_PROVIDER == "placeholder"
    assert "placehold.co" in _frame_prompt()


def test_pollinations_url_is_wellformed():
    url = se._pollinations_url("Wide Shot cinematic storyboard frame. A tea shop.")
    parsed = urlparse(url)
    assert parsed.scheme == "https"
    assert parsed.netloc == "image.pollinations.ai"
    assert parsed.path.startswith("/prompt/")

    qs = parse_qs(parsed.query)
    assert qs["width"] == ["1280"]
    assert qs["height"] == ["720"]
    assert qs["nologo"] == ["true"]
    assert qs["seed"][0].isdigit()


def test_same_prompt_gives_the_same_url():
    """A storyboard is a shoot reference. If the seed changed per call the art
    would differ on every page load and the frame would be useless."""
    a = se._pollinations_url("INT. CHIYA PASAL - MORNING, wide")
    b = se._pollinations_url("INT. CHIYA PASAL - MORNING, wide")
    assert a == b


def test_different_prompts_give_different_seeds():
    a = parse_qs(urlparse(se._pollinations_url("a wide shot")).query)["seed"][0]
    b = parse_qs(urlparse(se._pollinations_url("a close up")).query)["seed"][0]
    assert a != b


def test_prompt_special_characters_are_encoded():
    url = se._pollinations_url("INT. PASAL - DAY. Raaja & Sanjana; 100% tension?")
    # Everything after the query separator must be our params, not prompt text.
    assert url.count("?") == 1
    for raw in ("&", " ", ";"):
        assert raw not in urlparse(url).path


# --- frames are drawn concurrently ---------------------------------------
#
# One frame takes about nineteen seconds against the real provider, measured.
# Drawn one at a time, a full 24-frame board is seven and a half minutes of a
# writer watching a progress bar, which is long enough to look broken.
#
# A passing test does not demonstrate concurrency, so these measure it: the
# stub records overlap directly, and wall-clock is compared against the
# sequential cost of the same work.

def _scenes(n):
    return [{"id": f"sc{i}", "scene_type": "minor", "act_number": 1,
             "title": f"INT. ROOM {i} - DAY",
             "draft_json": {"summary": "She waits.", "characters": ["AARATI"]}}
            for i in range(n)]


class _Recorder:
    """Counts how many draws are in flight at once."""

    def __init__(self, delay=0.05):
        self.delay = delay
        self.live = 0
        self.peak = 0
        self._lock = __import__("threading").Lock()

    def __call__(self, *args, **kwargs):
        import time
        with self._lock:
            self.live += 1
            self.peak = max(self.peak, self.live)
        time.sleep(self.delay)
        with self._lock:
            self.live -= 1
        return "https://example.test/frame.png"


def test_frames_are_drawn_at_the_same_time(monkeypatch):
    import storyboard_engine

    rec = _Recorder()
    monkeypatch.setattr(storyboard_engine, "generate_frame", rec)

    class _Table:
        def insert(self, row):
            self._row = row
            return self

        def execute(self):
            return type("R", (), {"data": [dict(self._row)]})()

    class _DB:
        def table(self, _name):
            return _Table()

    storyboard_engine.generate_storyboard("s1", _scenes(12), _DB())

    assert rec.peak > 1, "frames were drawn one at a time"
    assert rec.peak <= storyboard_engine.STORYBOARD_CONCURRENCY


def test_a_board_is_faster_than_drawing_one_at_a_time(monkeypatch):
    import time
    import storyboard_engine

    monkeypatch.setattr(storyboard_engine, "generate_frame", _Recorder(delay=0.05))

    class _Table:
        def insert(self, row):
            self._row = row
            return self

        def execute(self):
            return type("R", (), {"data": [dict(self._row)]})()

    class _DB:
        def table(self, _name):
            return _Table()

    started = time.time()
    storyboard_engine.generate_storyboard("s1", _scenes(12), _DB())
    elapsed = time.time() - started

    # Twelve frames at 50ms each is 0.6s sequentially. Six at a time should be
    # nearer 0.1s; anything under half the sequential cost proves the point
    # without making the test sensitive to a slow machine.
    assert elapsed < 0.3, f"took {elapsed:.2f}s, close to the sequential 0.6s"


def test_frames_keep_document_order_despite_finishing_out_of_order(monkeypatch):
    """The images race; the rows must not. `order_index` is what a reader pages
    through and what the production package prints in."""
    import random
    import time
    import storyboard_engine

    def erratic(*args, **kwargs):
        time.sleep(random.uniform(0.001, 0.05))
        return "https://example.test/frame.png"

    monkeypatch.setattr(storyboard_engine, "generate_frame", erratic)

    written = []

    class _Table:
        def insert(self, row):
            self._row = row
            return self

        def execute(self):
            written.append(self._row)
            return type("R", (), {"data": [dict(self._row)]})()

    class _DB:
        def table(self, _name):
            return _Table()

    frames = storyboard_engine.generate_storyboard("s1", _scenes(10), _DB())

    assert [f["order_index"] for f in frames] == list(range(10))
    assert [r["scene_id"] for r in written] == [f"sc{i}" for i in range(10)]


def test_one_refused_image_costs_only_its_own_frame(monkeypatch):
    """`generate_frame` returns None rather than raising, and that has to keep
    working now the calls are threaded."""
    import storyboard_engine

    calls = {"n": 0}

    def flaky(*args, **kwargs):
        calls["n"] += 1
        return None if calls["n"] == 3 else "https://example.test/frame.png"

    monkeypatch.setattr(storyboard_engine, "generate_frame", flaky)

    class _Table:
        def insert(self, row):
            self._row = row
            return self

        def execute(self):
            return type("R", (), {"data": [dict(self._row)]})()

    class _DB:
        def table(self, _name):
            return _Table()

    frames = storyboard_engine.generate_storyboard("s1", _scenes(6), _DB())

    assert len(frames) == 6
    assert sum(1 for f in frames if f["image_url"] is None) == 1
