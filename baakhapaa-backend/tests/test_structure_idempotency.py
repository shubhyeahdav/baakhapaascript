"""One script row per project.

`generate-structure` used to INSERT unconditionally. `GET /scripts/project/{id}`
returns the FIRST row, so a second generation produced a script the app could
never reach again — along with whatever suggestions were stored on it. It also
made the project wizard's two-call create fragile: a free user whose structure
call failed had already spent their one-project allowance, so retrying returned
402 and the account was stuck with an empty project.
"""
import projects
from database import supabase

PROJECT = {
    "title": "Sapana",
    "genre": "Drama",
    "tone": "Emotional",
    "language": "Bilingual",
    "duration_minutes": 15,
    "target_audience": "Youth",
}


def _scripts_for(project_id):
    return supabase.table("scripts").select("*").eq("project_id", project_id).execute().data


def _generate(client, user, project_id):
    r = client.post(
        f"/scripts/generate-structure?project_id={project_id}",
        json=PROJECT, headers=user["headers"],
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_regenerating_reuses_the_same_script_row(client, make_user):
    user = make_user("pro")
    project_id = client.post("/projects/", json=PROJECT, headers=user["headers"]).json()["id"]

    first = _generate(client, user, project_id)
    second = _generate(client, user, project_id)

    assert first["script_id"] == second["script_id"]
    assert len(_scripts_for(project_id)) == 1


def test_the_reachable_script_is_the_one_that_was_updated(client, make_user):
    """The orphaning bug in one assertion: what the dashboard opens must be what
    the last generation wrote to."""
    user = make_user("pro")
    project_id = client.post("/projects/", json=PROJECT, headers=user["headers"]).json()["id"]
    _generate(client, user, project_id)
    regenerated = _generate(client, user, project_id)

    opened = client.get(f"/scripts/project/{project_id}", headers=user["headers"]).json()
    assert opened["id"] == regenerated["script_id"]
    assert opened["suggestions_json"]


def test_regenerating_a_structure_never_discards_the_draft(client, make_user):
    """Structure is a suggestion set. Losing pages of writing to it would be the
    worst possible trade."""
    user = make_user("pro")
    project_id = client.post("/projects/", json=PROJECT, headers=user["headers"]).json()["id"]
    script_id = _generate(client, user, project_id)["script_id"]

    draft = "INT. CHIYA PASAL - MORNING\n\nSteam rises from the glasses.\n"
    client.put(f"/scripts/{script_id}", json={"content": draft}, headers=user["headers"])

    _generate(client, user, project_id)

    reopened = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()
    assert reopened["content"] == draft


def test_a_project_at_the_free_allowance_can_still_be_opened(client, make_user):
    """Spending the last of the free allowance must not strand the writer.

    The wizard used to generate a structure right after creating the project,
    so a failure there left a project that existed, had consumed an allowance
    slot, and could not be reached by creating another. The wizard no longer
    generates anything (structure is asked for from inside the editor), but the
    property still matters: a writer at their limit has to be able to open what
    they already own.
    """
    user = make_user("free")
    project_id = client.post("/projects/", json=PROJECT,
                             headers=user["headers"]).json()["id"]
    for i in range(projects.FREE_PROJECT_LIMIT - 1):
        client.post("/projects/", json={**PROJECT, "title": f"Filler {i}"},
                    headers=user["headers"])

    # The allowance is now spent.
    assert client.post("/projects/", json=PROJECT,
                       headers=user["headers"]).status_code == 402

    opened = client.get(f"/scripts/project/{project_id}", headers=user["headers"])
    assert opened.status_code == 200
    assert opened.json()["id"]

    # And a later structure attempt adopts that same row rather than adding one.
    assert _generate(client, user, project_id)["script_id"] == opened.json()["id"]
    assert len(_scripts_for(project_id)) == 1


# --- act lengths are a choice, not a law ---------------------------------
#
# The 33/33/34 split is a default. A short with a long second act is a
# deliberate shape, and until this route existed the only way to alter it was
# to regenerate the whole structure — which discards every suggestion in it.

def _structure(client, user, project_id):
    body = {"genre": "Drama", "tone": "Emotional", "language": "English",
            "duration_minutes": 12, "target_audience": "General",
            "format": "short", "episode_count": 1}
    r = client.post(f"/scripts/generate-structure?project_id={project_id}",
                    json=body, headers=user["headers"])
    assert r.status_code == 200, r.text
    return r.json()


def test_an_act_can_be_made_longer(client, make_user, make_script):
    user = make_user("free")
    project_id, _ = make_script(user)
    script_id = _structure(client, user, project_id)["script_id"]

    r = client.put(f"/scripts/{script_id}/acts",
                   json={"durations": {"2": 8}}, headers=user["headers"])
    assert r.status_code == 200, r.text

    acts = {a["act_number"]: a for a in r.json()["structure"]["acts"]}
    assert acts[2]["duration_minutes"] == 8.0


def test_the_percentages_are_recomputed_rather_than_left_stale(client, make_user, make_script):
    """They were derived from the durations, so a second stored copy would
    disagree the moment one was edited."""
    user = make_user("free")
    project_id, _ = make_script(user)
    script_id = _structure(client, user, project_id)["script_id"]

    r = client.put(f"/scripts/{script_id}/acts",
                   json={"durations": {"2": 8}}, headers=user["headers"])
    acts = r.json()["structure"]["acts"]

    assert sum(a["percentage"] for a in acts) == 100
    assert {a["act_number"]: a["percentage"] for a in acts} == {1: 25, 2: 50, 3: 25}


def test_only_the_named_acts_move(client, make_user, make_script):
    """A client that changed act II must not resend — and so clobber — the
    others."""
    user = make_user("free")
    project_id, _ = make_script(user)
    script_id = _structure(client, user, project_id)["script_id"]

    r = client.put(f"/scripts/{script_id}/acts",
                   json={"durations": {"2": 8}}, headers=user["headers"])
    acts = {a["act_number"]: a for a in r.json()["structure"]["acts"]}

    assert acts[1]["duration_minutes"] == 4.0
    assert acts[3]["duration_minutes"] == 4.0


def test_the_change_survives_a_reload(client, make_user, make_script):
    user = make_user("free")
    project_id, _ = make_script(user)
    script_id = _structure(client, user, project_id)["script_id"]
    client.put(f"/scripts/{script_id}/acts",
               json={"durations": {"2": 8}}, headers=user["headers"])

    import json as _json
    saved = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()
    acts = {a["act_number"]: a for a in _json.loads(saved["suggestions_json"])["acts"]}
    assert acts[2]["duration_minutes"] == 8.0


def test_a_script_with_no_structure_says_so(client, make_user, make_script):
    user = make_user("free")
    _, script_id = make_script(user)

    r = client.put(f"/scripts/{script_id}/acts",
                   json={"durations": {"1": 5}}, headers=user["headers"])

    assert r.status_code == 400
    assert "no structure" in r.json()["detail"].lower()


def test_somebody_elses_script_is_not_adjustable(client, make_user, make_script):
    owner = make_user("free")
    project_id, _ = make_script(owner)
    script_id = _structure(client, owner, project_id)["script_id"]
    stranger = make_user("free")

    r = client.put(f"/scripts/{script_id}/acts",
                   json={"durations": {"2": 8}}, headers=stranger["headers"])

    assert r.status_code == 404
