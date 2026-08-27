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
