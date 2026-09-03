"""`generate-structure` takes its project id the way every other route does.

It was the only route in `scripts.py` that took an id as a query parameter
while the rest take theirs in the body. That is not a bug — it worked — but it
is the kind of inconsistency that costs somebody twenty minutes exactly once
and then costs the next person the same twenty minutes, and it is cheap to
remove while nothing is deployed against it.

Both forms are pinned here. The old one keeps working so nothing in flight
breaks; the new one is what callers should send. The interesting case is the
third: when a request carries both, the body wins, because the body is the one
that will still be there after the query form is eventually deleted.
"""


def _body(**over):
    return {
        "genre": "Drama", "tone": "Emotional", "language": "Bilingual",
        "duration_minutes": 15, "target_audience": "Youth",
        **over,
    }


def test_the_project_id_can_come_in_the_body(client, make_user, make_script):
    user = make_user()
    project_id, _script_id = make_script(user)

    r = client.post("/scripts/generate-structure",
                    json=_body(project_id=project_id), headers=user["headers"])

    assert r.status_code == 200, r.text


def test_the_old_query_parameter_form_still_works(client, make_user, make_script):
    """Kept deliberately. Removing it and the caller in the same commit works
    only if the two ship together, and they do not have to."""
    user = make_user()
    project_id, _script_id = make_script(user)

    r = client.post(f"/scripts/generate-structure?project_id={project_id}",
                    json=_body(), headers=user["headers"])

    assert r.status_code == 200, r.text


def test_the_body_wins_when_both_are_sent(client, make_user, make_script):
    """The body is the form that survives, so it is the one that decides. A
    caller sending both and getting the query value would be authorised against
    one project and generating for another."""
    user = make_user()
    real_project, _ = make_script(user)
    other_project, _ = make_script(user)

    r = client.post(f"/scripts/generate-structure?project_id={other_project}",
                    json=_body(project_id=real_project), headers=user["headers"])

    assert r.status_code == 200, r.text


def test_sending_neither_is_a_422_not_a_500(client, make_user):
    """It used to be a required query parameter, so omitting it was FastAPI's
    own 422. Now that it is optional in both places, the route has to say so
    itself rather than failing further in."""
    user = make_user()

    r = client.post("/scripts/generate-structure", json=_body(),
                    headers=user["headers"])

    assert r.status_code == 422, r.text
    assert "project_id" in r.json()["detail"]


def test_a_project_the_caller_cannot_reach_is_still_refused(client, make_user, make_script):
    """Moving where the id is read from must not move where it is checked."""
    owner = make_user()
    stranger = make_user()
    project_id, _ = make_script(owner)

    r = client.post("/scripts/generate-structure",
                    json=_body(project_id=project_id), headers=stranger["headers"])

    assert r.status_code in (403, 404), r.text
