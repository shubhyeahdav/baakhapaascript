"""The numbers in CLAUDE.md have to still be true.

On 2026-09-16 four documents were wrong at once and every error was the same
kind: a DERIVED number that somebody had typed. `CLAUDE.md` said 907 backend
tests when there were 1083, and 39 craft entries when there were 45. Nothing
was watching, because a transcribed number has no owner — it is a copy that
starts going out of date the moment it is made.

`check_docs.py` counts them and `--fix` writes them. This file is the half
cheap enough to run on every suite: the craft corpus, which is a single JSON
read. Collecting both test suites takes a subprocess each and belongs in CI.

The rest of these tests are about the guard itself. A checker nobody has
watched fail is indistinguishable from one that cannot — the same reason
`test_live_provider_guard.py` exists.
"""
import io

import pytest

import check_docs


def _claude_md():
    return io.open(check_docs.CLAUDE_MD, encoding="utf-8").read()


# --- the cheap half, run for real --------------------------------------------

def test_the_craft_corpus_count_in_claude_md_is_current():
    """The one that was wrong by six. Cheap enough to check every run."""
    problems = check_docs.drift(_claude_md(), check_docs.counted(cheap_only=True))

    assert not problems, (
        f"CLAUDE.md is out of date: {problems}. "
        "Run `python check_docs.py --fix` and commit the diff."
    )


def test_every_claim_appears_in_claude_md_exactly_once():
    """A claim the checker cannot find is silently unwatched, and a claim it
    finds twice means `--fix` would correct one copy and leave the other —
    which is worse than not checking, because the file then disagrees with
    itself."""
    import re

    text = _claude_md()
    for label, pattern, _pick in check_docs.CLAIMS:
        assert len(re.findall(pattern, text)) == 1, (
            f"the {label} claim appears {len(re.findall(pattern, text))} times "
            "in CLAUDE.md; it must appear exactly once"
        )


# --- the guard itself ---------------------------------------------------------

FAKE = (
    "> Backend tests: **7 across 2 files, all passing**\n"
    "> Frontend tests: **9 across 3 files**\n"
    "- `knowledge_base.json` (**5 craft entries** across five levels)\n"
)

TRUTH = {"backend_tests": 1083, "backend_files": 69,
         "frontend_tests": 1166, "frontend_files": 61, "craft": 45}


def test_a_stale_number_is_caught():
    problems = check_docs.drift(FAKE, TRUTH)

    labels = {p[0] for p in problems}
    assert labels == {"backend tests and files", "frontend tests and files",
                      "craft entries"}


def test_the_report_says_what_it_says_and_what_it_should_say():
    """An error that names only the wrong value leaves the reader to go and
    count. Both numbers, so the fix is obvious from the message."""
    problems = dict((p[0], (p[1], p[2])) for p in check_docs.drift(FAKE, TRUTH))

    assert problems["craft entries"] == ((5,), (45,))
    assert problems["backend tests and files"] == ((7, 2), (1083, 69))


def test_a_claim_that_has_vanished_is_reported_rather_than_passed():
    """Deleting the sentence must not be a way to make the check go quiet."""
    problems = check_docs.drift("nothing to see here", TRUTH)

    assert len(problems) == len(check_docs.CLAIMS)
    assert all(said is None for _label, said, _want in problems)


def test_fixing_rewrites_only_the_numbers():
    fixed = check_docs.apply_fix(FAKE, TRUTH)

    assert "**1083 across 69 files, all passing**" in fixed
    assert "**1166 across 61 files**" in fixed
    assert "(**45 craft entries** across five levels)" in fixed
    # The prose around them survives intact.
    assert "`knowledge_base.json`" in fixed
    assert fixed.count("\n") == FAKE.count("\n")


def test_fixing_a_correct_document_changes_nothing():
    """Idempotent, or `--fix` becomes a source of diff noise that people learn
    to skip reading."""
    once = check_docs.apply_fix(FAKE, TRUTH)

    assert check_docs.apply_fix(once, TRUTH) == once


def test_the_real_document_is_left_alone_by_a_no_op_fix():
    text = _claude_md()

    assert check_docs.apply_fix(text, check_docs.counted(cheap_only=True)) == text


@pytest.mark.parametrize("label,_pattern,_pick", check_docs.CLAIMS)
def test_each_claim_has_a_name_worth_reading_in_a_failure(label, _pattern, _pick):
    """The label is what a failing build prints. "claim 3" would send someone
    to read this file to find out what broke."""
    assert len(label) > 4 and not label.isdigit()
