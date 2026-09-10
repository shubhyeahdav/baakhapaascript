"""What the operator is told when a generation call produces nothing usable.

Three different failures used to arrive at one message — "AI response could not
be parsed as JSON. Try again." — and only one of them was worth retrying. The
other two told somebody to repeat a request that would fail identically and bill
them for it again.

The one that made this worth fixing: `z-ai/glm-5.3-free` through TokenRouter is
a reasoning model. `max_tokens` on a reasoning model is reasoning PLUS output,
not an output budget, so asking for a scene at 3000 tokens returns
`finish_reason="length"` with zero characters of answer. Measured at 3000 and
again at 8000: same result, twice the cost. The empty string then travelled to
`_extract_json`, which blamed the JSON.
"""
import pytest

import script_engine as se


class _Details:
    def __init__(self, reasoning_tokens):
        self.reasoning_tokens = reasoning_tokens


class _Usage:
    def __init__(self, reasoning=0):
        self.prompt_tokens = 100
        self.completion_tokens = reasoning
        self.completion_tokens_details = _Details(reasoning) if reasoning else None


class _Message:
    def __init__(self, content):
        self.content = content


class _Choice:
    def __init__(self, content, finish_reason):
        self.message = _Message(content)
        self.finish_reason = finish_reason


class _Response:
    """The shape the OpenAI-compatible SDK returns."""

    def __init__(self, content="", finish_reason="stop", reasoning=0):
        self.choices = [_Choice(content, finish_reason)]
        self.usage = _Usage(reasoning)


# --- the reasoning-budget burn ---------------------------------------------

def _as_openai(monkeypatch, response):
    """Point `_call_llm` at a fake OpenAI-compatible client."""
    class _Completions:
        def create(self, **_kw):
            return response

    class _Chat:
        completions = _Completions()

    class _Client:
        chat = _Chat()

    monkeypatch.setattr(se, "OPENAI_COMPATIBLE", True)
    monkeypatch.setattr(se, "_oai_client", _Client())
    monkeypatch.setattr(se, "OPENAI_MODEL", "z-ai/glm-5.3-free")
    monkeypatch.setattr(se, "PROVIDER", "tokenrouter")


def test_an_empty_answer_at_the_token_limit_names_the_reasoning_budget(monkeypatch):
    _as_openai(monkeypatch, _Response(content="", finish_reason="length", reasoning=2987))

    with pytest.raises(RuntimeError) as err:
        se._call_llm("sys", "user", max_tokens=3000)

    msg = str(err.value)
    assert "reasoning" in msg.lower()
    assert "3000" in msg
    # The actionable half. An error that only describes the fault is a better
    # error; one that says what to change is a fix.
    assert "LLM_MODEL" in msg or "Raise it" in msg


def test_it_says_how_much_was_spent_when_the_provider_reports_it(monkeypatch):
    _as_openai(monkeypatch, _Response(content="", finish_reason="length", reasoning=2987))

    with pytest.raises(RuntimeError) as err:
        se._call_llm("sys", "user", max_tokens=3000)

    assert "2987" in str(err.value)


def test_a_provider_that_reports_no_reasoning_count_still_reads_correctly(monkeypatch):
    """Not every OpenAI-compatible provider returns
    `completion_tokens_details`, and the ones that do nest it differently. The
    message has to work without it rather than print `None tokens`."""
    _as_openai(monkeypatch, _Response(content="", finish_reason="length", reasoning=0))

    with pytest.raises(RuntimeError) as err:
        se._call_llm("sys", "user", max_tokens=3000)

    msg = str(err.value)
    assert "None" not in msg
    assert "()" not in msg


def test_a_truncated_but_non_empty_answer_is_returned_not_raised(monkeypatch):
    """`finish_reason="length"` with text in it is an ordinary long answer that
    ran out of room. The caller may still be able to use it, and `_extract_json`
    has its own recovery for a truncated object — raising here would throw away
    a response that was paid for."""
    _as_openai(monkeypatch, _Response(content='{"a": 1}', finish_reason="length"))

    assert se._call_llm("sys", "user", max_tokens=3000) == '{"a": 1}'


def test_an_ordinary_empty_answer_is_not_blamed_on_reasoning(monkeypatch):
    """Empty with `finish_reason="stop"` is a different fault — a refusal, or a
    model that simply said nothing. Naming the token budget there would send
    somebody to raise a limit that was never reached."""
    _as_openai(monkeypatch, _Response(content="", finish_reason="stop"))

    assert se._call_llm("sys", "user", max_tokens=3000) == ""


# --- _extract_json tells its three failures apart --------------------------

def test_nothing_to_parse_says_so():
    with pytest.raises(RuntimeError) as err:
        se._extract_json("")

    msg = str(err.value)
    assert "empty" in msg.lower()
    # The old message ended "Try again." Here, retrying genuinely cannot help.
    assert "retrying will not change it" in msg.lower()


def test_a_response_cut_off_mid_json_says_to_raise_the_limit():
    truncated = '{"scenes": [{"title": "INT. CHIYA PASAL - DAY", "description": "She'

    with pytest.raises(RuntimeError) as err:
        se._extract_json(truncated)

    msg = str(err.value)
    assert "cut off" in msg.lower()
    assert "max_tokens" in msg


def test_genuinely_unparseable_prose_shows_what_arrived():
    """The one case where "try again" is real advice — the model wrote prose
    instead of JSON, and another sample may not. Showing the opening characters
    is what turns a report into a diagnosis."""
    with pytest.raises(RuntimeError) as err:
        se._extract_json("I'd be happy to help you with that screenplay!")

    msg = str(err.value)
    assert "Try again" in msg
    assert "happy to help" in msg


def test_the_good_paths_still_parse():
    """The recovery this function exists for, unchanged: preamble and sign-off
    around a JSON object are what open-weight models produce most."""
    assert se._extract_json('{"a": 1}') == {"a": 1}
    assert se._extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert se._extract_json('Here it is:\n```json\n{"a": 1}\n```') == {"a": 1}
    assert se._extract_json('{"a": 1}\n\nLet me know!') == {"a": 1}
