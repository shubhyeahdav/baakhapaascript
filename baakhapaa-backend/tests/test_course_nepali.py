"""The course in Nepali, past the lesson prose (Month 4, Day 12).

The prose was translated; the module headers above it and the grader's answer
below it were not. So a writer doing the course in Nepali read "The page" over
Nepali lessons, and when they got an exercise wrong they were told why in
English.
"""
import re

import lessons
import lessons_ne
import linter

DEVANAGARI = re.compile(r"[ऀ-ॿ]")

# Every sentence the linter can produce, as it produces them (counts filled).
LINTER_SENTENCES = [
    "This action line describes what someone thinks or feels, which the camera cannot show.",
    "The emotion is stated rather than embodied.",
    "An emotional parenthetical is doing the actor's work.",
    "The character states the real grievance out loud.",
    "This action paragraph runs 6 lines. Past about four, readers skim it.",
    "SITA speaks for 7 lines without interruption.",
    "The scene opens on a greeting. The scene probably starts later than you think.",
    "The scene ends on a goodbye. Cut on the turn instead.",
    "5 of 6 dialogue lines end in a full stop. Nobody is interrupting or trailing off.",
    "3 scenes in a row are two people alone talking.",
]


def test_every_linter_sentence_has_a_nepali_rendering():
    for sentence in LINTER_SENTENCES:
        out = lessons_ne.problem_ne(f"Line 4: {sentence}")
        assert out.startswith("लाइन 4: "), out
        assert DEVANAGARI.search(out.split(": ", 1)[1]), f"untranslated: {sentence}"


DRAFTS = [
    # unfilmable interiority, directed emotion (action + parenthetical),
    # on the nose, a greeting open and a goodbye close
    "INT. CHIYA PASAL - DAY\n\nSita thinks about her mother.\n"
    "Ram stares at her meaningfully.\n\nSITA\nHello.\n\nRAM\n(tearfully)\n"
    "You never supported me.\n\nSITA\nGoodbye.\n",
    # an action block and a dialogue slab
    "INT. ROOM - NIGHT\n\n" + "Rain on the tin roof again.\n" * 6 +
    "\nSITA\n" + "I said it once and I will say it again here.\n" * 7,
    # every line closed, and three two-handers in a row
    "".join(f"INT. ROOM {n} - DAY\n\nA\nOne.\n\nB\nTwo.\n\nA\nThree.\n\nB\nFour.\n\n"
            for n in range(3)),
]


def test_every_message_the_linter_actually_produces_translates():
    """Run the real linter, so a reworded rule fails here instead of quietly
    falling back to English for every Nepali writer."""
    seen = set()
    for draft in DRAFTS:
        for f in linter.lint(draft):
            seen.add(f["rule"])
            out = lessons_ne.problem_ne(f"Line {f['line']}: {f['message']}")
            assert DEVANAGARI.search(out.split(": ", 1)[1]), f"{f['rule']}: {f['message']}"
    assert len(seen) >= 8, seen


def test_counts_survive_translation():
    out = lessons_ne.problem_ne("5 of 6 dialogue lines end in a full stop. "
                                "Nobody is interrupting or trailing off.")
    assert "6 मध्ये 5" in out


def test_an_unknown_sentence_comes_back_in_english():
    """Per-field fallback, as the lesson prose has: a rule added tomorrow
    still reads."""
    assert lessons_ne.problem_ne("Line 2: A rule nobody has translated.") == \
        "लाइन 2: A rule nobody has translated."
    assert lessons_ne.problem_ne("Something new.") == "Something new."


def test_every_lesson_fails_in_nepali_when_asked():
    for lid in lessons.LESSONS_BY_ID:
        r = lessons.grade(lid, "hello", "ne")
        assert not r["passed"]
        for p in r["problems"]:
            assert DEVANAGARI.search(p), f"{lid}: {p}"


def test_english_grading_is_unchanged():
    r = lessons.grade("the-page", "hello")
    assert r["problems"][0].startswith("Found 0 scene heading(s)")


def test_every_module_header_is_translated():
    modules = {l["module"] for l in lessons.LESSONS}
    assert modules <= set(lessons_ne.MODULES_NE), modules - set(lessons_ne.MODULES_NE)
    ne = {lessons.public_lesson(l, (), "ne")["module"] for l in lessons.LESSONS}
    assert all(DEVANAGARI.search(m) for m in ne)


def test_a_lesson_with_no_translation_reads_in_english_per_field():
    lesson = dict(lessons.LESSONS[0], id="not-yet-translated", module="A new module")
    out = lessons.public_lesson(lesson, (), "ne")
    assert out["title"] == lesson["title"]
    assert out["module"] == "A new module"


def test_the_submit_route_grades_in_the_language_asked(client, make_user):
    user = make_user()
    r = client.post("/learn/lessons/the-page/submit?lang=ne",
                    json={"content": "hello"}, headers=user["headers"])
    assert r.status_code == 200, r.text
    assert DEVANAGARI.search(r.json()["problems"][0])
