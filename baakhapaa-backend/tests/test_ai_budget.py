"""A ceiling on what one account can spend on generation in a month.

Every AI route in this product was gated by tier and by nothing else. That is
fine until it is not: Pro is Rs 999 a month and bought unmetered generation, so
nothing stopped one account generating continuously, and the first anyone would
learn of it was the provider invoice.

The tests that matter most here are the ones about failing open and about where
the numbers come from. A writer losing their generation because a log table is
missing is a worse outcome than a month running slightly over — so an
unreadable table means "no spend", not "blocked". And usage is taken from the
provider's own report, never from an estimate of prompt length, because
estimates drift in the direction that costs somebody their month.
"""
import ai_budget
import script_engine


def _clear(user_id):
    from database import supabase
    for row in (supabase.table(ai_budget.TABLE).select("*")
                .eq("user_id", user_id).execute().data or []):
        supabase.table(ai_budget.TABLE).delete().eq("id", row["id"]).execute()


# --- the arithmetic ----------------------------------------------------------

def test_cost_is_input_and_output_priced_separately():
    """Output costs five times input on this model. Averaging them would make
    the ceiling wrong for exactly the requests that cost the most — long
    generations from short prompts."""
    cost = ai_budget.cost_usd(1_000_000, 0)
    out = ai_budget.cost_usd(0, 1_000_000)

    assert cost == ai_budget.INPUT_USD_PER_MTOK
    assert out == ai_budget.OUTPUT_USD_PER_MTOK
    assert out > cost


def test_usage_accumulates_across_calls():
    _clear("u-acc")
    ai_budget.record("u-acc", 1000, 500)
    ai_budget.record("u-acc", 1000, 500)

    assert ai_budget.spent_usd("u-acc") == round(
        ai_budget.cost_usd(2000, 1000), 6)


def test_a_call_that_reported_nothing_is_not_charged():
    """Demo mode and failed calls report no usage. Charging a guess for them
    would spend a writer's month on requests that never reached a provider."""
    _clear("u-zero")
    ai_budget.record("u-zero", 0, 0)

    assert ai_budget.spent_usd("u-zero") == 0.0


# --- the ceiling -------------------------------------------------------------

def test_an_account_under_its_ceiling_is_allowed():
    _clear("u-under")

    assert ai_budget.over_ceiling("u-under", "pro") is False


def test_an_account_that_has_spent_its_month_is_stopped(monkeypatch):
    _clear("u-over")
    monkeypatch.setitem(ai_budget.CEILINGS_USD, "pro", 0.01)
    ai_budget.record("u-over", 100_000, 100_000)

    assert ai_budget.over_ceiling("u-over", "pro") is True


def test_a_tier_with_no_ceiling_is_never_stopped():
    """Free never reaches the ceiling check — the tier gate runs first — but a
    zero ceiling must read as 'not metered' rather than 'always over', or
    adding a new unmetered tier would silently block it."""
    _clear("u-free")
    ai_budget.record("u-free", 100_000, 100_000)

    assert ai_budget.over_ceiling("u-free", "free") is False


def test_an_unreadable_table_does_not_block_anyone(monkeypatch):
    """Fails open, deliberately. A writer losing a generation because a log
    table is missing is worse than a month running slightly over."""
    class _Broken:
        def table(self, _name):
            raise RuntimeError("relation does not exist")

    import database
    monkeypatch.setattr(database, "supabase", _Broken())

    assert ai_budget.spent_usd("anyone") == 0.0
    assert ai_budget.over_ceiling("anyone", "pro") is False


def test_the_summary_reports_dollars_not_tokens():
    """A token count means nothing to a screenwriter, and the ceiling is
    denominated in dollars."""
    _clear("u-sum")
    ai_budget.record("u-sum", 1000, 1000)

    s = ai_budget.summary("u-sum", "pro")

    assert s["metered"] is True
    assert s["spent_usd"] > 0
    assert s["remaining_usd"] == round(s["ceiling_usd"] - s["spent_usd"], 4)
    assert "-" in s["period"]


def test_a_free_plan_reports_itself_as_unmetered():
    """A progress bar reading 0% of 0 is worse than no bar."""
    assert ai_budget.summary("u-anything", "free")["metered"] is False


# --- where the numbers come from ---------------------------------------------

def test_the_engine_reports_the_providers_own_usage(monkeypatch):
    """Not an estimate of prompt length. Estimates drift, and they drift in the
    direction that costs money."""
    monkeypatch.setattr(script_engine, "MOCK_AI", False)
    monkeypatch.setattr(script_engine, "PROVIDER", "anthropic")

    class _Msg:
        content = [type("B", (), {"type": "text", "text": "scene"})()]
        usage = type("U", (), {"input_tokens": 1234, "output_tokens": 567})()

    monkeypatch.setattr(
        script_engine, "client",
        type("C", (), {"messages": type("M", (), {
            "create": staticmethod(lambda **kw: _Msg())})()})(),
    )
    sink = []

    script_engine._call_llm("sys", "user", usage_sink=sink)

    assert sink == [{"input_tokens": 1234, "output_tokens": 567}]


def test_a_call_with_no_sink_still_works(monkeypatch):
    """Every existing call site passes no sink. Adding the parameter must not
    have changed any of them."""
    monkeypatch.setattr(script_engine, "MOCK_AI", False)
    monkeypatch.setattr(script_engine, "PROVIDER", "anthropic")

    class _Msg:
        content = [type("B", (), {"type": "text", "text": "scene"})()]
        usage = None

    monkeypatch.setattr(
        script_engine, "client",
        type("C", (), {"messages": type("M", (), {
            "create": staticmethod(lambda **kw: _Msg())})()})(),
    )

    assert script_engine._call_llm("sys", "user") == "scene"


# --- the route ---------------------------------------------------------------

def test_a_paid_user_over_the_ceiling_is_refused_with_429(
    client, make_user, monkeypatch
):
    """429, not 402. The account is in good standing and has paid; it has used
    this month's generation. A 402 would send them to a checkout page that
    cannot fix it."""
    user = make_user(tier="pro")
    monkeypatch.setitem(ai_budget.CEILINGS_USD, "pro", 0.01)
    ai_budget.record(user["id"], 100_000, 100_000)

    r = client.post("/scripts/improve",
                    json={"scene_text": "INT. X - DAY", "instruction": "sharper"},
                    headers=user["headers"])

    assert r.status_code == 429, r.text
    assert "resets at the start of next month" in r.json()["detail"]


def test_the_free_tier_message_is_still_the_upgrade_one(client, make_user):
    """The ceiling must not have taken over the 403 a free user should see.
    Telling them to wait for next month when what they need is a plan would be
    the wrong sentence entirely."""
    user = make_user()

    r = client.post("/scripts/improve",
                    json={"scene_text": "INT. X - DAY", "instruction": "sharper"},
                    headers=user["headers"])

    assert r.status_code == 403, r.text
    assert "Pro or Studio" in r.json()["detail"]


def test_the_usage_route_reports_where_the_account_stands(client, make_user):
    user = make_user(tier="pro")
    _clear(user["id"])

    r = client.get("/subscription/usage", headers=user["headers"])

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["metered"] is True
    assert body["spent_usd"] == 0.0
    assert body["ceiling_usd"] > 0


def test_free_users_can_read_their_usage_too(client, make_user):
    """It reports 'not metered', which is the honest answer and better than a
    403 on a page that is only telling them where they stand."""
    user = make_user()

    r = client.get("/subscription/usage", headers=user["headers"])

    assert r.status_code == 200, r.text
    assert r.json()["metered"] is False
