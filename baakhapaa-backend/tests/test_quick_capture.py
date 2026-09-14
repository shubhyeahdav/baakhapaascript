"""Starting to write without answering anything first.

Every route into the product went through the new-project wizard, and `title`
was required. A writer with a thought at eleven at night had to name it before
they could write it. Measured on the real path: the backend is fast (2-20ms
across the whole writing journey), so what stood between an idea and the page
was never speed — it was questions.

Two things here are not obvious and both exist to avoid a worse bug.

**Pressing it twice returns the same scratch.** Otherwise a writer who pressed
it, wrote nothing, and pressed it again would accumulate empty projects for
ever. Reusing the empty one is what lets the free limit stay a simple number
instead of growing a second limit to cap the empties.

**The free limit counts projects with CONTENT.** `FREE_PROJECT_LIMIT` is 3, and
a capture that burns a slot on a thought nobody has written yet is worse than no
capture at all. This repository has made that mistake once already — CLAUDE.md
records the free allowance being one project with nothing calling
`DELETE /projects/{id}`, so a false start was permanent.
"""
from database import supabase

import projects as projects_module


def _write(client, user, script_id, content):
    r = client.put(f"/scripts/{script_id}", json={"content": content},
                   headers=user["headers"])
    assert r.status_code == 200, r.text
    return r


def test_one_press_gives_a_project_and_a_script(client, make_user):
    user = make_user()

    r = client.post("/projects/quick", headers=user["headers"])

    assert r.status_code == 200, r.text
    assert r.json()["project"]["id"]
    assert r.json()["script"]["id"]
    assert r.json()["script"]["content"] == ""


def test_it_asks_nothing(client, make_user):
    """No body at all. The moment this needs a field is the moment it stops
    being quicker than the wizard."""
    user = make_user()

    r = client.post("/projects/quick", headers=user["headers"])

    assert r.status_code == 200, r.text


def test_pressing_it_twice_returns_the_same_scratch(client, make_user):
    """Otherwise an indecisive evening leaves a dashboard full of empties."""
    user = make_user()

    first = client.post("/projects/quick", headers=user["headers"]).json()
    second = client.post("/projects/quick", headers=user["headers"]).json()

    assert first["project"]["id"] == second["project"]["id"]
    assert first["script"]["id"] == second["script"]["id"]


def test_once_something_is_written_the_next_press_starts_a_new_one(client, make_user):
    """The scratch is reused only while it is still scratch. A second idea must
    not land in the middle of the first one."""
    user = make_user()
    first = client.post("/projects/quick", headers=user["headers"]).json()
    _write(client, user, first["script"]["id"], "INT. CHIYA PASAL - DAY\n\nShe waits.\n")

    second = client.post("/projects/quick", headers=user["headers"]).json()

    assert second["project"]["id"] != first["project"]["id"]


def test_it_uses_the_writers_own_defaults(client, make_user):
    """Onboarding already asked. Asking again is the friction this removes, and
    ignoring the answers would be a different way of doing the same thing."""
    user = make_user()
    client.put("/auth/preferences",
               json={"experience": "some", "format": "short_form",
                     "language": "Nepali", "genre": "Comedy", "tone": "Wry"},
               headers=user["headers"])

    project = client.post("/projects/quick", headers=user["headers"]).json()["project"]

    assert project["format"] == "short_form"
    assert project["genre"] == "Comedy"
    assert project["language"] == "Nepali"


def test_a_stranger_cannot_press_it(client):
    r = client.post("/projects/quick")

    assert r.status_code in (401, 403)


def test_one_writers_scratch_is_not_another_writers(client, make_user):
    """`_empty_scratch` looks up by user. Looking it up by title alone would
    hand somebody else's untitled project to whoever pressed the button next."""
    writer = make_user()
    stranger = make_user()
    theirs = client.post("/projects/quick", headers=writer["headers"]).json()

    mine = client.post("/projects/quick", headers=stranger["headers"]).json()

    assert mine["project"]["id"] != theirs["project"]["id"]


# --- the free limit ---------------------------------------------------------

def test_three_empty_captures_do_not_lock_a_free_writer_out(client, make_user):
    """The whole point. An empty project costs nothing and must not cost a
    writer their allowance — which is the mistake this repo already made once,
    when the free plan was one project and a false start was permanent.

    Reuse means three presses give one scratch, so this also writes in each one
    to force three separate rows.
    """
    user = make_user("free")
    for i in range(projects_module.FREE_PROJECT_LIMIT):
        captured = client.post("/projects/quick", headers=user["headers"]).json()
        # Written, then blanked — a project that was touched and abandoned.
        _write(client, user, captured["script"]["id"], f"INT. TRY {i} - DAY\n")
        _write(client, user, captured["script"]["id"], "")

    r = client.post("/projects/quick", headers=user["headers"])

    assert r.status_code == 200, r.text


def test_three_written_projects_still_stop_a_free_writer(client, make_user):
    """The limit is not removed, only measured honestly. A writer with three
    real scripts is still a writer with three real scripts."""
    user = make_user("free")
    for i in range(projects_module.FREE_PROJECT_LIMIT):
        captured = client.post("/projects/quick", headers=user["headers"]).json()
        _write(client, user, captured["script"]["id"],
               f"INT. SCENE {i} - DAY\n\nSomething actually happens here.\n")

    r = client.post("/projects/quick", headers=user["headers"])

    assert r.status_code == 402, r.text


def test_the_wizard_is_held_to_the_same_count(client, make_user):
    """Both routes create projects, so both must read the limit the same way —
    or the cheaper one becomes a way around the dearer one."""
    user = make_user("free")
    for i in range(projects_module.FREE_PROJECT_LIMIT):
        made = client.post("/projects/", json={"title": f"P{i}", "duration_minutes": 10},
                           headers=user["headers"])
        script = client.get(f"/scripts/project/{made.json()['id']}",
                            headers=user["headers"]).json()
        _write(client, user, script["id"], f"INT. SCENE {i} - DAY\n\nReal content.\n")

    r = client.post("/projects/", json={"title": "Fourth", "duration_minutes": 10},
                    headers=user["headers"])

    assert r.status_code == 402, r.text


def test_a_paid_writer_is_never_counted_at_all(client, make_user):
    user = make_user("pro")
    for _ in range(projects_module.FREE_PROJECT_LIMIT + 2):
        captured = client.post("/projects/quick", headers=user["headers"]).json()
        _write(client, user, captured["script"]["id"], "INT. SOMEWHERE - DAY\n\nWords.\n")

    r = client.post("/projects/quick", headers=user["headers"])

    assert r.status_code == 200, r.text


# --- the title names itself -------------------------------------------------

def test_the_first_slugline_names_an_untitled_project(client, make_user):
    """The other half of asking nothing. A writer never names anything; it ends
    up named."""
    user = make_user()
    captured = client.post("/projects/quick", headers=user["headers"]).json()

    _write(client, user, captured["script"]["id"],
           "INT. CHIYA PASAL - MORNING\n\nShe wipes the counter.\n")

    project = supabase.table("projects").select("*").eq(
        "id", captured["project"]["id"]).execute().data[0]
    assert project["title"] == "INT. CHIYA PASAL - MORNING"


def test_a_draft_with_no_slugline_uses_its_first_line(client, make_user):
    """A long-form video script has no sluglines at all, and a writer typing
    prose should still end up with a name."""
    user = make_user()
    captured = client.post("/projects/quick", headers=user["headers"]).json()

    _write(client, user, captured["script"]["id"],
           "Every monsoon this street becomes a river.\n")

    project = supabase.table("projects").select("*").eq(
        "id", captured["project"]["id"]).execute().data[0]
    assert project["title"] == "Every monsoon this street becomes a river."


def test_a_project_the_writer_named_is_never_renamed(client, make_user):
    """The rule that makes this safe. Deriving a title is a convenience on an
    untitled scratch; doing it to a project somebody named is destroying their
    work, silently, on every save."""
    user = make_user()
    made = client.post("/projects/", json={"title": "Sapana", "duration_minutes": 10},
                       headers=user["headers"])
    project_id = made.json()["id"]
    script = client.get(f"/scripts/project/{project_id}", headers=user["headers"]).json()

    _write(client, user, script["id"], "INT. SOMEWHERE ELSE - NIGHT\n\nHe waits.\n")

    project = supabase.table("projects").select("*").eq(
        "id", project_id).execute().data[0]
    assert project["title"] == "Sapana"


def test_a_derived_title_is_not_re_derived_on_the_next_save(client, make_user):
    """Once named, it stays named. Otherwise rewriting the opening scene renames
    the project underneath the writer, which is the same fault as above arriving
    one save later."""
    user = make_user()
    captured = client.post("/projects/quick", headers=user["headers"]).json()
    _write(client, user, captured["script"]["id"], "INT. FIRST - DAY\n\nOne.\n")

    _write(client, user, captured["script"]["id"], "INT. SECOND - NIGHT\n\nTwo.\n")

    project = supabase.table("projects").select("*").eq(
        "id", captured["project"]["id"]).execute().data[0]
    assert project["title"] == "INT. FIRST - DAY"


def test_a_very_long_first_line_is_trimmed(client, make_user):
    """`title` is capped at 200 characters by `ProjectCreate`. A derived title
    that exceeds it would be a write the model would refuse coming from a
    client, which is the kind of asymmetry that turns into a 500 later."""
    user = make_user()
    captured = client.post("/projects/quick", headers=user["headers"]).json()

    _write(client, user, captured["script"]["id"], "x" * 400 + "\n")

    project = supabase.table("projects").select("*").eq(
        "id", captured["project"]["id"]).execute().data[0]
    assert len(project["title"]) <= 200


def test_blanking_a_draft_does_not_wipe_the_title(client, make_user):
    """Selecting all and deleting is something writers do. It must not take the
    project's name with it."""
    user = make_user()
    captured = client.post("/projects/quick", headers=user["headers"]).json()
    _write(client, user, captured["script"]["id"], "INT. FIRST - DAY\n\nOne.\n")

    _write(client, user, captured["script"]["id"], "")

    project = supabase.table("projects").select("*").eq(
        "id", captured["project"]["id"]).execute().data[0]
    assert project["title"] == "INT. FIRST - DAY"
