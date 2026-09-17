"""How many times does the Patterns tab read the database?

Measured against the deployed system on 2026-09-16, this endpoint took **2.5
seconds** while the work inside it took 8.8ms. It was not slow. It was chatty:

    scene_sync._format_of        the script, then its project
    require_script_access        the script again, then its project again
    get_patterns_by_technique    all 45 craft rows, WITH their embeddings
    recommendation_log.rows      the log

One uncached read costs about 175ms from a development machine, and four or
five in sequence is two seconds on any host. The pattern is invisible in a test
suite because the local mock is a SQLite file — every one of those reads is
microseconds here, so nothing fails and nothing is slow. Only a real network
shows it, and no test in this repository crosses one.

So this counts the reads instead of timing them. A count is the thing that
actually changed, it is stable across machines, and it fails on the change that
causes the regression rather than on a stopwatch.

`POST /scripts/recommendations` is the endpoint that matters most for this:
it is free on every tier, it runs while somebody is typing, and for a free user
it IS the product.
"""
import pytest

import database


# What the endpoint is allowed to spend, and why this number.
#
# What it actually reads today, in order:
#
#   users                  the caller, resolving the token
#   scripts                the script
#   projects               its project -- format AND the write check, one read
#   craft_recommendations  the log
#   script_patterns        the corpus, through rag's cache
#
# Five, down from eight this morning. In production the corpus read is served
# from the cache for CACHE_TTL, so the steady state is four.
#
# The budget is set with headroom rather than pinned exactly: the point is to
# catch a read added inside a loop or a duplicate lookup creeping back, not to
# fail on a refactor that moves one read around.
BUDGET = 8


@pytest.fixture
def count_reads(monkeypatch):
    """Count `supabase.table(...)` calls for the duration of one request."""
    store = database.supabase
    original = store.table
    calls = []

    def counting(name, *a, **kw):
        calls.append(name)
        return original(name, *a, **kw)

    monkeypatch.setattr(store, "table", counting, raising=False)
    return calls


def _draft():
    return (
        "INT. CHIYA PASAL - DAY\n\n"
        "SARITA wipes the counter.\n\n"
        "SARITA\nI am very angry that you left.\n\n"
        "RAJU\nI know. I feel guilty about it.\n"
    )


def test_the_patterns_tab_stays_within_its_read_budget(
    client, make_user, make_script, count_reads
):
    """The regression guard. Four round trips became two when the duplicate
    script-and-project lookup was collapsed; this stops a third appearing."""
    user = make_user()
    _project_id, script_id = make_script(user)
    count_reads.clear()

    r = client.post("/scripts/recommendations",
                    json={"scene_text": _draft(), "script_id": script_id,
                          "focus": "my dialogue is on the nose"},
                    headers=user["headers"])

    assert r.status_code == 200, r.text
    assert len(count_reads) <= BUDGET, (
        f"the Patterns tab made {len(count_reads)} database reads "
        f"({', '.join(count_reads)}). Budget is {BUDGET}. Every one of these "
        "is a round trip on the deployed system, at roughly 175ms each, on an "
        "endpoint that runs while somebody is typing."
    )


def test_the_script_and_its_project_are_read_once_each(
    client, make_user, make_script, count_reads
):
    """The specific duplication that cost two round trips.

    `_format_of` fetched the script and the project to pick the craft library,
    then `require_script_access` fetched the same script and the same project
    to decide whether the caller may write. Naming it here means a re-introduced
    duplicate fails with the reason attached, rather than as a budget number
    nobody can interpret.
    """
    user = make_user()
    _project_id, script_id = make_script(user)
    count_reads.clear()

    client.post("/scripts/recommendations",
                json={"scene_text": _draft(), "script_id": script_id},
                headers=user["headers"])

    assert count_reads.count("scripts") <= 1, (
        f"the script row was read {count_reads.count('scripts')} times")
    assert count_reads.count("projects") <= 1, (
        f"the project row was read {count_reads.count('projects')} times")


def test_a_request_with_no_script_reads_almost_nothing(
    client, make_user, count_reads
):
    """The editor sends this before a script exists. There is nothing to look
    up, and it should not go looking."""
    user = make_user()
    count_reads.clear()

    r = client.post("/scripts/recommendations",
                    json={"scene_text": _draft()},
                    headers=user["headers"])

    assert r.status_code == 200
    assert "scripts" not in count_reads
    assert "projects" not in count_reads


# --- opening a script ---------------------------------------------------------

def test_opening_a_script_reads_its_project_once(
    client, make_user, make_script, count_reads
):
    """`GET /scripts/project/{id}` read the project THREE times: once for the
    audit owner, once to embed it in the response, and again inside
    `sync_from_draft` via `_format_of`. About 175ms each against a real
    database, on the request that opens the editor.

    `sync_from_draft` now takes the format from a caller that already has it.
    The default still looks it up — an optimisation for callers holding the
    answer, never a new obligation.
    """
    user = make_user()
    project_id, _script_id = make_script(user)
    count_reads.clear()

    r = client.get(f"/scripts/project/{project_id}", headers=user["headers"])

    assert r.status_code == 200, r.text
    assert count_reads.count("projects") <= 1, (
        f"opening a script read the project {count_reads.count('projects')} times "
        f"({', '.join(count_reads)})"
    )


# --- saving, which happens far more often than any of the above ---------------

def test_saving_a_draft_reads_its_project_once(
    client, make_user, make_script, count_reads
):
    """The hottest route in the product. `PUT /scripts/{id}` runs on every
    autosave, and it read the project TWICE -- once to decide whether the
    project still needed naming, and again inside `sync_from_draft` via
    `_format_of`, which also re-read the script. At roughly 175ms per
    uncached read that is half a second of round trips on a keystroke timer.
    """
    user = make_user()
    _project_id, script_id = make_script(user)
    count_reads.clear()

    r = client.put(f"/scripts/{script_id}",
                   json={"content": _draft()}, headers=user["headers"])

    assert r.status_code == 200, r.text
    assert count_reads.count("projects") <= 1, (
        f"a save read the project {count_reads.count('projects')} times "
        f"({', '.join(count_reads)})"
    )


def test_saving_still_names_an_untitled_project(client, make_user, count_reads):
    """The read that was hoisted out of `_name_an_untitled_project` is the one
    that decides whether to rename. Collapsing reads must not cost the feature:
    a project left called Untitled still takes its name from the first slugline.
    """
    from projects import UNTITLED

    user = make_user()
    proj = client.post("/projects/", json={"title": UNTITLED, "genre": "Drama",
                                           "tone": "Emotional",
                                           "language": "Bilingual",
                                           "duration_minutes": 15,
                                           "target_audience": "Youth"},
                       headers=user["headers"])
    project_id = proj.json()["id"]
    script_id = client.get(f"/scripts/project/{project_id}",
                           headers=user["headers"]).json()["id"]

    client.put(f"/scripts/{script_id}",
               json={"content": _draft()}, headers=user["headers"])

    named = client.get(f"/projects/{project_id}", headers=user["headers"]).json()
    assert named["title"] == "INT. CHIYA PASAL - DAY"


def test_coverage_reads_its_project_once(
    client, make_user, make_script, count_reads
):
    user = make_user()
    _project_id, script_id = make_script(user)
    client.put(f"/scripts/{script_id}",
               json={"content": _draft()}, headers=user["headers"])
    count_reads.clear()

    r = client.get(f"/scripts/{script_id}/coverage", headers=user["headers"])

    assert r.status_code == 200, r.text
    assert count_reads.count("projects") <= 1, (
        f"coverage read the project {count_reads.count('projects')} times")


def test_review_reads_its_project_once(
    client, make_user, make_script, count_reads
):
    user = make_user()
    _project_id, script_id = make_script(user)
    client.put(f"/scripts/{script_id}",
               json={"content": _draft()}, headers=user["headers"])
    count_reads.clear()

    r = client.get(f"/scripts/{script_id}/review", headers=user["headers"])

    assert r.status_code == 200, r.text
    assert count_reads.count("projects") <= 1, (
        f"review read the project {count_reads.count('projects')} times")
