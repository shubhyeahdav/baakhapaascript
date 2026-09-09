"""Provider selection and JSON extraction.

`_extract_json` is the highest-risk function on the real-key path (plan item
A3): everything to date has been verified against canned demo content, so the
first live call is the first time a model's actual formatting is parsed.
"""
import pytest

import script_engine as se


def test_demo_mode_is_active_without_keys():
    assert se.PROVIDER == "mock"
    assert se.MOCK_AI is True


def test_placeholder_keys_are_not_treated_as_real():
    """`.env` ships placeholders like `your-anthropic-key`; those must not be
    mistaken for configuration."""
    assert se._usable("your-anthropic-key-here") is False
    assert se._usable("") is False
    assert se._usable(None) is False
    assert se._usable("gsk_realKeyLikeThis") is True


def test_legacy_call_name_still_resolves():
    assert se._call_claude is se._call_llm


# --- OpenAI-compatible providers -------------------------------------------
#
# Everything that is not Anthropic speaks the same wire format, so there is one
# transport behind several names. What each test here actually guards is the
# rule the transport must not erode: WHICH company receives a draft is only ever
# decided by somebody setting LLM_PROVIDER on purpose.
#
# `monkeypatch.setenv` to a placeholder rather than `delenv`: script_engine calls
# load_dotenv() on import, and load_dotenv fills in a variable that is missing
# while leaving an already-set one alone — so deleting a key invites the real one
# back out of `.env`, and the test would pass only on a machine without one.

import importlib


def _reload(monkeypatch, **env):
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    return importlib.reload(se)


def test_tokenrouter_needs_its_key(monkeypatch):
    try:
        with pytest.raises(RuntimeError, match="LLM_API_KEY"):
            _reload(monkeypatch, LLM_PROVIDER="tokenrouter",
                    LLM_API_KEY="your-key-placeholder")
    finally:
        monkeypatch.undo()
        importlib.reload(se)


def test_tokenrouter_uses_the_preset_url_and_model(monkeypatch):
    try:
        r = _reload(monkeypatch, LLM_PROVIDER="tokenrouter", LLM_API_KEY="tr_realish_key")
        assert r.PROVIDER == "tokenrouter"
        assert r.OPENAI_COMPATIBLE is True
        assert r.MOCK_AI is False
        assert r.OPENAI_BASE_URL == "https://api.tokenrouter.com/v1"
        assert r.OPENAI_MODEL == "z-ai/glm-5.3-free"
    finally:
        monkeypatch.undo()
        importlib.reload(se)


def test_a_custom_endpoint_must_say_where(monkeypatch):
    """`custom` has no preset, so a missing base URL has to be an error rather
    than a default — silently falling back to somebody else's endpoint is the
    exact failure this whole mechanism exists to prevent."""
    try:
        with pytest.raises(RuntimeError, match="LLM_BASE_URL"):
            _reload(monkeypatch, LLM_PROVIDER="custom", LLM_API_KEY="k_realish",
                    LLM_BASE_URL="")
    finally:
        monkeypatch.undo()
        importlib.reload(se)


def test_an_unrecognised_provider_name_sends_nothing_anywhere(monkeypatch):
    """A typo in LLM_PROVIDER must land in demo mode, never on a live default."""
    try:
        r = _reload(monkeypatch, LLM_PROVIDER="tokenrouterr",
                    LLM_API_KEY="tr_realish_key",
                    ANTHROPIC_API_KEY="your-anthropic-key-not-a-real-key")
        assert r.PROVIDER == "mock"
        assert r.OPENAI_COMPATIBLE is False
    finally:
        monkeypatch.undo()
        importlib.reload(se)


def test_every_preset_names_who_receives_the_draft(monkeypatch):
    """The warning printed at boot is the only place an operator is told where
    their users' scripts are going. A preset without a recipient would print an
    empty sentence."""
    for name, preset in se._OPENAI_PRESETS.items():
        assert preset["recipient"], f"{name} does not say who receives the text"
        assert preset["key_env"] and preset["model_env"], name


# --- JSON extraction -------------------------------------------------------

def test_plain_json():
    assert se._extract_json('{"acts": [1, 2]}') == {"acts": [1, 2]}


def test_fenced_json():
    raw = '```json\n{"acts": [1]}\n```'
    assert se._extract_json(raw) == {"acts": [1]}


def test_fenced_json_without_language_tag():
    assert se._extract_json('```\n{"acts": [1]}\n```') == {"acts": [1]}


def test_json_with_preamble():
    """Open-weight models routinely narrate before answering. The old cleaning
    could not handle this at all."""
    raw = 'Sure! Here is the three-act structure:\n\n```json\n{"acts": [1]}\n```'
    assert se._extract_json(raw) == {"acts": [1]}


def test_json_with_trailing_commentary():
    raw = '{"acts": [1]}\n\nLet me know if you would like me to expand any act.'
    assert se._extract_json(raw) == {"acts": [1]}


def test_values_survive_extraction_intact():
    """The old cleaning used `str.strip("```json")`, which strips *characters*
    rather than a substring. Harmless in practice (JSON starts `{` and ends
    `}`), but pinned so a future "simplification" back to strip() can't
    introduce the truncation the old form only avoided by luck."""
    parsed = se._extract_json('{"character": "Sanjana", "location": "pasal"}')
    assert parsed["character"] == "Sanjana"
    assert parsed["location"] == "pasal"


def test_unparseable_response_raises_cleanly():
    with pytest.raises(RuntimeError, match="could not be parsed"):
        se._extract_json("I cannot help with that request.")


def test_empty_response_raises_cleanly():
    with pytest.raises(RuntimeError):
        se._extract_json("")
