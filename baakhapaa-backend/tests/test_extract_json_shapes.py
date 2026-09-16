"""What a real model actually sends back, and what must never be "fixed".

Day 4 of the task list says: *fix whatever `_extract_json` fails on; real
models add preamble*. This is that, done without spending a token — the shapes
below are what open-weight and frontier models measurably produce, and every
one of them was run against the old implementation first.

Four of them failed and one was worse than a failure:

    preamble containing a brace     FAILED   — span started inside the prose
    two fenced blocks               WRONG    — returned the model's EXAMPLE
    trailing comma                  FAILED
    // comment                      FAILED

The second is the one that mattered. It parsed, it was well-formed, and it was
the wrong object; nothing downstream could have noticed. A structure would have
been built from whatever the model used to demonstrate the format.

The second half of this file is the more important half. `_repair_json` runs
only after a strict parse fails, and it has to leave dialogue alone: this
product's payload is screenplay text, full of apostrophes, quotation marks,
`//` in a URL, and commas before braces inside a line of speech. A repair that
corrupts a writer's words to rescue a model's syntax is a worse outcome than
the error message it avoided.
"""
import pytest

import script_engine as se

BT = chr(96) * 3
NL = chr(10)


def fence(body, tag="json"):
    return BT + tag + NL + body + NL + BT


# --- shapes that must parse --------------------------------------------------

@pytest.mark.parametrize("name,raw,want", [
    ("bare", '{"a": 1}', {"a": 1}),
    ("fenced", fence('{"a": 1}'), {"a": 1}),
    ("fenced with no language tag", fence('{"a": 1}', ""), {"a": 1}),
    ("preamble then fence", "Here it is:" + NL + fence('{"a": 1}'), {"a": 1}),
    ("json then sign-off", '{"a": 1}' + NL + "Let me know!", {"a": 1}),
    ("bold markdown around it", '**{"a": 1}**', {"a": 1}),
    ("a byte order mark", "﻿" + '{"a": 1}', {"a": 1}),
])
def test_ordinary_shapes_parse(name, raw, want):
    assert se._extract_json(raw) == want


def test_a_preamble_containing_a_brace_does_not_move_the_start():
    """"Here is the JSON {as requested}:" put the old span's start inside the
    prose, so a perfectly good object underneath it failed to parse."""
    raw = "Here is the JSON {as requested}:" + NL + '{"scenes": [], "title": "A"}'

    assert se._extract_json(raw) == {"scenes": [], "title": "A"}


def test_the_answer_wins_over_the_example_when_a_model_demonstrates_first():
    """The silent one. Both blocks parse, so the old code returned the first —
    the example — and looked entirely successful doing it.

    Last fence first, because a model that writes two is nearly always showing
    the format and then answering, in that order.
    """
    raw = ("The format looks like this:" + NL + fence('{"scenes": ["EXAMPLE"]}')
           + NL + "Here is your structure:" + NL
           + fence('{"scenes": ["INT. CHIYA PASAL - DAY"]}'))

    assert se._extract_json(raw) == {"scenes": ["INT. CHIYA PASAL - DAY"]}


# --- repairs that are safe ---------------------------------------------------

@pytest.mark.parametrize("name,raw,want", [
    ("trailing comma in an object", '{"a": 1,}', {"a": 1}),
    ("trailing comma in an array", '{"a": [1, 2,]}', {"a": [1, 2]}),
    ("a line comment", "{" + NL + "  // the answer" + NL + '  "a": 1' + NL + "}", {"a": 1}),
    ("a block comment", '{ /* note */ "a": 1 }', {"a": 1}),
])
def test_javascript_habits_are_repaired(name, raw, want):
    """Both are unambiguous outside a string and both are common in
    open-weight output. Repair runs only after a strict parse has failed, so
    valid JSON never reaches it."""
    assert se._extract_json(raw) == want


# --- repairs that must NOT happen --------------------------------------------

@pytest.mark.parametrize("name,raw,want", [
    ("a comma before a brace, inside a line",
     '{"line": "Wait, }"}', {"line": "Wait, }"}),
    ("a double slash inside a line",
     '{"line": "see http://x.com now"}', {"line": "see http://x.com now"}),
    ("apostrophes",
     '{"line": "It\'s Sarita\'s shop"}', {"line": "It's Sarita's shop"}),
    ("braces inside a line",
     '{"line": "he said {nothing}"}', {"line": "he said {nothing}"}),
    ("a block-comment opener inside a line",
     '{"line": "the sign read /* CLOSED"}', {"line": "the sign read /* CLOSED"}),
])
def test_dialogue_is_never_treated_as_syntax(name, raw, want):
    """The reason every repair walks the string state instead of running a
    regex. A writer's line is content, and there is no second copy of it."""
    assert se._extract_json(raw) == want


def test_devanagari_survives_intact():
    """The product lints Nepali dialogue; it must not mangle it on the way in."""
    raw = '{"line": "तपाईंले किन छोड्नुभयो?"}'

    assert se._extract_json(raw)["line"].startswith("तपाई")


def test_single_quotes_are_left_to_fail_rather_than_guessed_at():
    """Deliberately NOT repaired. Converting single quotes means deciding which
    apostrophes are delimiters, and in a screenplay most of them are not.

    A parse failure is recoverable. A script with the wrong words in it is not,
    and nobody would know to look.
    """
    with pytest.raises(RuntimeError):
        se._extract_json("{'line': \"It's Sarita's shop\"}")


def test_smart_quotes_are_left_to_fail_for_the_same_reason():
    with pytest.raises(RuntimeError):
        se._extract_json('{“line”: 1}')


# --- failures keep their specific messages ------------------------------------

def test_an_empty_response_still_says_it_was_empty():
    with pytest.raises(RuntimeError, match="empty response"):
        se._extract_json("")


def test_a_truncated_response_still_says_it_was_cut_off():
    """This message tells an operator to raise max_tokens. Losing it to a
    generic "could not be parsed" would send them to retry instead, which
    truncates in the same place and bills them twice."""
    with pytest.raises(RuntimeError, match="cut off"):
        se._extract_json('{"scenes": [{"title": "A"')


def test_prose_with_no_json_at_all_still_fails():
    with pytest.raises(RuntimeError, match="could not be parsed"):
        se._extract_json("I cannot help with that request.")


# --- the property, not just the examples -------------------------------------

def test_valid_json_is_never_altered_whatever_the_payload_holds():
    """Ten thousand generated payloads were round-tripped through five response
    shapes while this was being written; every failure found needed triple
    backticks INSIDE the payload, which a screenplay does not contain. See
    `_json_candidates` for the measurement and why that case is left alone.

    This is the cheap standing version of it: the repairs must be incapable of
    touching content, so anything that is already valid JSON has to come back
    byte-identical no matter what is in the strings.
    """
    import json

    nasty = [
        "It's Sarita's shop",
        "he said {nothing}",
        "see http://x.com now",
        "Wait, }",
        "a // b",
        "the sign read /* CLOSED",
        "तपाईं किन छोड्नुभयो?",
        "line one" + NL + "line two",
        "[bracket] and , comma",
        chr(34),
        chr(92),
    ]
    obj = {"scenes": [{"slug": s, "n": i} for i, s in enumerate(nasty)],
           "title": "Chiya Pasal", "trailing": nasty}
    raw = json.dumps(obj, ensure_ascii=False)

    for wrap in (
        lambda s: s,
        lambda s: "Here it is:" + NL + fence(s),
        lambda s: s + NL + NL + "Let me know if you want changes!",
        lambda s: "Sure {see below}:" + NL + s,
        lambda s: fence('{"example": 1}') + NL + NL + fence(s),
    ):
        assert se._extract_json(wrap(raw)) == obj


def test_a_bare_json_string_is_not_mistaken_for_the_answer():
    """Every caller indexes the result by key. A fragment that happens to be a
    valid JSON string, number or list is never what was asked for, and
    returning one looks like success all the way down."""
    for not_an_object in ('"just a string"', "42", "[1, 2, 3]", "null", "true"):
        with pytest.raises(RuntimeError):
            se._extract_json(not_an_object)
