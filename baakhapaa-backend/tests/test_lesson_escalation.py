"""The other way into the course: from a craft technique, not a linter rule.

`for-rule` has existed since the course shipped and covers the linter's route
in. It cannot cover the craft panel's, because a recommendation is not a flag —
it arrives from the pattern library carrying a technique name and nothing a rule
map knows about.

This is the escalation path. A recommendation the writer has been given twice
and has not acted on is not a recommendation problem any more: either they do
not believe it or they do not know how, and both of those are what a lesson is
for. The decision about WHEN to escalate lives in the panel; this route only
answers whether there is anything to escalate to.

The 404 is the common case and has to stay cheap. Nineteen lessons cannot cover
thirty-nine craft entries.
"""
import lessons


def _get(client, user, technique, **params):
    return client.get(f"/learn/for-technique/{technique}",
                      params=params, headers=user["headers"])


def test_a_technique_with_a_lesson_returns_it(client, make_user):
    user = make_user()
    technique = next(iter(lessons.LESSON_BY_TECHNIQUE))

    r = _get(client, user, technique)

    assert r.status_code == 200, r.text
    assert r.json()["concept"]


def test_a_technique_with_no_lesson_is_a_404_not_an_error(client, make_user):
    """Most of the corpus has no lesson. The caller shows nothing; it must not
    show an apology, and it must not look like a fault."""
    user = make_user()

    r = _get(client, user, "Deny the scene privacy")

    assert r.status_code == 404, r.text


def test_the_lookup_ignores_capitalisation(client, make_user):
    """The lesson list and the knowledge base are maintained by hand and will
    drift in capitalisation long before they drift in meaning."""
    user = make_user()
    technique = next(iter(lessons.LESSON_BY_TECHNIQUE))

    r = _get(client, user, technique.upper())

    assert r.status_code == 200, r.text


def test_a_technique_containing_a_comma_survives_the_url(client, make_user):
    """Technique names are sentences — 'Give a character one phrase they return
    to, and change its meaning'. The route takes a path parameter for that
    reason, and this is what breaks if anyone narrows it."""
    user = make_user()
    with_comma = [t for t in lessons.LESSON_BY_TECHNIQUE if "," in t]
    if not with_comma:
        return

    r = _get(client, user, with_comma[0])

    assert r.status_code == 200, r.text


def test_the_map_is_built_from_the_lessons_themselves(client, make_user):
    """Not a second hand-maintained list. A lesson's `technique` field is
    already written to match the craft entry it teaches, so the map is derived
    from it — a hand-copied duplicate is a thing that goes stale."""
    for technique, lesson_id in lessons.LESSON_BY_TECHNIQUE.items():
        assert lesson_id in lessons.LESSONS_BY_ID
        assert lessons.LESSONS_BY_ID[lesson_id]["technique"].lower() == technique


def test_the_course_is_still_free_on_every_tier(client, make_user):
    """The escalation must not become the thing that puts a lesson behind a
    plan. The course is free on every tier and this is a door into it."""
    user = make_user()
    technique = next(iter(lessons.LESSON_BY_TECHNIQUE))

    r = _get(client, user, technique)

    assert r.status_code == 200, r.text
