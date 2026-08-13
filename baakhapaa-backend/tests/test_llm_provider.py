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
