"""The craft panel remembering what it already said.

Before this it had no memory at all. It recomputed three recommendations on
every request with no idea it had given the same three yesterday, or that the
writer had acted on one of them a week ago. Two consequences, both bad: advice
repeated after it had been taken, and nothing was ever known to have worked —
the product could not answer the one question that would tell it whether its
craft library is any good.

The tests worth reading here are the ones about what is NOT recorded. A
technique that arrived by semantic similarity was never a linter flag, so there
is nothing for it to stop being, and marking it resolved would be inventing a
result. And a viewer reading somebody else's script is not evidence about that
script's craft.
"""
import recommendation_log as log


def _clear(script_id):
    from database import supabase
    for row in (supabase.table(log.TABLE).select("*")
                .eq("script_id", script_id).execute().data or []):
        supabase.table(log.TABLE).delete().eq("id", row["id"]).execute()


# --- recording --------------------------------------------------------------

def test_a_technique_shown_twice_is_counted_twice():
    _clear("s-count")
    log.record("s-count", ["Deny the scene privacy"])
    log.record("s-count", ["Deny the scene privacy"])

    seen = log.history("s-count")

    assert seen["Deny the scene privacy"]["times_shown"] == 2


def test_recording_nothing_writes_nothing():
    """An empty draft returns no recommendations, and that is not an event."""
    _clear("s-empty")
    log.record("s-empty", [])

    assert log.history("s-empty") == {}


def test_a_script_with_no_id_is_not_recorded():
    """The panel works without a script id — the editor can ask about a draft
    that has not been saved yet. That has to cost nothing, not raise."""
    log.record(None, ["Deny the scene privacy"])

    assert log.history(None) == {}


# --- resolution -------------------------------------------------------------

def test_a_diagnosed_technique_that_stops_being_flagged_is_resolved():
    """The only evidence this product can gather that a technique worked, and
    it costs the writer nothing: they fixed the line, the linter went quiet."""
    _clear("s-resolve")
    log.record("s-resolve", ["Deny the scene privacy"], ["Deny the scene privacy"])

    log.resolve("s-resolve", still_flagged=[])

    assert log.history("s-resolve")["Deny the scene privacy"]["resolved"] is True


def test_a_technique_still_flagged_is_not_resolved():
    _clear("s-open")
    log.record("s-open", ["Deny the scene privacy"], ["Deny the scene privacy"])

    log.resolve("s-open", still_flagged=["Deny the scene privacy"])

    assert log.history("s-open")["Deny the scene privacy"]["resolved"] is False


def test_a_technique_that_only_ever_arrived_by_similarity_never_resolves():
    """It was never a flag, so there is nothing for it to stop being. Counting
    it as resolved would turn a measurement into a vanity metric — every
    recommendation would 'succeed' the moment it was made."""
    _clear("s-sim")
    log.record("s-sim", ["Deny the scene privacy"], diagnosed_techniques=[])

    log.resolve("s-sim", still_flagged=[])

    assert log.history("s-sim")["Deny the scene privacy"]["resolved"] is False


def test_a_resolved_technique_that_comes_back_is_reopened():
    """It is on the page again. Leaving it marked resolved would hide a
    regression from the person who has to fix it."""
    _clear("s-regress")
    log.record("s-regress", ["Deny the scene privacy"], ["Deny the scene privacy"])
    log.resolve("s-regress", still_flagged=[])

    log.resolve("s-regress", still_flagged=["Deny the scene privacy"])

    assert log.history("s-regress")["Deny the scene privacy"]["resolved"] is False


def test_a_similarity_technique_that_is_later_flagged_becomes_diagnosable():
    """Suggested on a hunch, then the linter caught it for real. From that
    point it can resolve, because now there is something to stop."""
    _clear("s-promote")
    log.record("s-promote", ["Deny the scene privacy"])
    log.record("s-promote", ["Deny the scene privacy"], ["Deny the scene privacy"])

    log.resolve("s-promote", still_flagged=[])

    assert log.history("s-promote")["Deny the scene privacy"]["resolved"] is True


# --- ordering ---------------------------------------------------------------

def test_unfinished_business_is_ranked_above_new_advice():
    """A technique the writer has been shown and has not resolved survived the
    linter twice. That is better evidence than something nothing has ever
    suggested."""
    seen = {"OLD": {"times_shown": 3, "resolved": False, "diagnosed": True}}
    key = log.rank_key(seen)

    ranked = sorted([{"technique": "NEW"}, {"technique": "OLD"}], key=key)

    assert [p["technique"] for p in ranked] == ["OLD", "NEW"]


def test_something_already_fixed_is_ranked_last():
    """Bringing it back unprompted is exactly the repetition the log exists to
    stop."""
    seen = {"DONE": {"times_shown": 4, "resolved": True, "diagnosed": True}}
    key = log.rank_key(seen)

    ranked = sorted([{"technique": "DONE"}, {"technique": "NEW"}], key=key)

    assert [p["technique"] for p in ranked] == ["NEW", "DONE"]


def test_retrieval_order_survives_as_the_tiebreak():
    """Two techniques with the same history must come back in the order
    retrieval ranked them. This reorders similarity, it does not replace it."""
    key = log.rank_key({})
    order = [{"technique": "FIRST"}, {"technique": "SECOND"}]

    assert [p["technique"] for p in sorted(order, key=key)] == ["FIRST", "SECOND"]


# --- the number the library has never had about itself ----------------------

def test_resolution_rate_counts_only_diagnosed_recommendations():
    _clear("s-rate")
    log.record("s-rate", ["A", "B"], ["A", "B"])
    log.resolve("s-rate", still_flagged=["B"])

    rates = log.resolution_rates("s-rate")

    assert rates["A"] == {"shown": 1, "resolved": 1, "rate": 1.0}
    assert rates["B"] == {"shown": 1, "resolved": 0, "rate": 0.0}


# --- the route --------------------------------------------------------------

ON_THE_NOSE = """INT. PASAL - DAY

                      RAAJA
          I am very angry with you about what you did to my father.

                      SANJANA
              (sadly)
          I feel so guilty and ashamed about all of it.
"""


def _recommend(client, user, script_id, text=ON_THE_NOSE):
    return client.post(
        "/scripts/recommendations",
        json={"scene_text": text, "script_id": script_id},
        headers=user["headers"],
    )


# The test database starts with an empty craft library — `script_patterns` is
# loaded by `load_knowledge_base.py`, which CI runs separately and these tests
# must not depend on. Retrieval is stubbed so these say something about the
# route rather than about whether somebody remembered to load the corpus.
CARD = {
    "technique": "Deny the scene privacy", "craft_level": "scene",
    "title_ref": "T", "genre": "Drama", "origin_tradition": "screen craft",
    "problem": "p", "how_it_works": "w", "how_to_apply": "a",
    "worked_example": "e", "warning_sign": "s", "similarity": 0.9,
    "one_line_takeaway": "Deny the scene privacy",
}


def test_the_route_reports_what_it_has_already_said(
    client, make_user, make_script, monkeypatch
):
    import script_engine

    monkeypatch.setattr(script_engine, "retrieve_relevant_patterns",
                        lambda *a, **k: [dict(CARD)])
    user = make_user()
    _p, script_id = make_script(user)
    _clear(script_id)

    first = _recommend(client, user, script_id)
    second = _recommend(client, user, script_id)

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    # The first round is what teaches it. The second is where it shows.
    assert second.json()["seen"]["Deny the scene privacy"]["times_shown"] == 1
    assert log.history(script_id)["Deny the scene privacy"]["times_shown"] == 2


def test_a_request_without_a_script_id_still_works(client, make_user):
    """The panel has to work on a draft nobody has saved yet."""
    user = make_user()

    r = client.post("/scripts/recommendations",
                    json={"scene_text": ON_THE_NOSE}, headers=user["headers"])

    assert r.status_code == 200, r.text
    assert r.json()["seen"] == {} or all(
        v["times_shown"] == 0 for v in r.json()["seen"].values()
    )


def test_a_viewer_gets_recommendations_and_records_nothing(
    client, make_user, make_script
):
    """A viewer reading somebody else's script is not evidence about that
    script's craft. `require_script_access` defaults to editor, so getting this
    wrong would have cost a viewer their recommendations rather than granted
    them a write — which is the safe direction to be wrong in, and still wrong."""
    owner = make_user()
    reader = make_user()
    project_id, script_id = make_script(owner)
    added = client.post(
        f"/projects/{project_id}/members",
        json={"email": reader["email"], "role": "viewer"},
        headers=owner["headers"],
    )
    assert added.status_code == 200, added.text

    _clear(script_id)
    r = _recommend(client, reader, script_id)

    assert r.status_code == 200, r.text
    assert log.history(script_id) == {}
