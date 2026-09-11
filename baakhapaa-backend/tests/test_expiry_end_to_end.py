"""A lapsed month, walked the whole way through, with a backdated row.

`tests/test_payments.py` already checks that `effective_tier()` returns `"free"`
for an expired row. That is the unit; this is the consequence. The two are not
the same claim, and the gap between them is where a billing bug lives: a tier
check that reads `users.subscription_tier` directly instead of going through
`effective_tier()` passes every unit test in the repository and still hands a
lapsed account a paid feature for ever.

This matters more here than in most products because **nothing renews itself**.
Khalti and eSewa have no subscription primitive, so every paid month ends by
running out rather than by a cancellation, and `subscription_expires_at` is the
only thing standing between a month that was paid for and a month that was not.
Every Nepali customer takes this path. Stripe's do not — their row has a NULL
expiry, because Stripe owns the renewal — so the branch this covers is the one
the local market uses and the one least likely to be exercised by hand.

`MONTH_3_TASKS.md` Day 17, "test the whole expiry path with a backdated row".
The rest of that day needs an SMTP account and is still open.
"""
import datetime

import pytest

from database import supabase


def _set_expiry(user_id: str, days_from_now: float):
    """Backdate or postdate a paid plan. Negative days = already lapsed."""
    when = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=days_from_now)
    supabase.table("users").update(
        {"subscription_expires_at": when.isoformat()}
    ).eq("id", user_id).execute()
    return when


# Routes that cost money to serve, and therefore have to read the effective
# tier rather than the stored one. Each is (label, callable taking the client,
# the user and a script id).
def _generate_scene(client, user, _script_id):
    return client.post(
        "/scripts/generate-scene",
        json={"scene_description": "A quiet argument", "genre": "Drama", "tone": "Emotional"},
        headers=user["headers"],
    )


def _improve(client, user, script_id):
    return client.post(
        "/scripts/improve",
        json={"script_id": script_id, "content": "INT. PASAL - DAY\n\nShe waits."},
        headers=user["headers"],
    )


def _export_word(client, user, script_id):
    return client.get(f"/export/script/word/{script_id}", headers=user["headers"])


PAID_ROUTES = [
    ("generate-scene", _generate_scene),
    ("improve", _improve),
    ("word export", _export_word),
]


@pytest.mark.parametrize("label,call", PAID_ROUTES, ids=[r[0] for r in PAID_ROUTES])
def test_a_lapsed_pro_account_is_refused_a_paid_route(
    client, make_user, make_script, label, call
):
    """The row still says `pro`. The date says the month ended yesterday.

    A route reading `subscription_tier` directly would serve this request and
    nothing else in the suite would notice — the stored tier is genuinely
    `"pro"`, and it stays `"pro"` for ever, because no job ever rewrites it.
    """
    user = make_user("pro")
    _project, script_id = make_script(user)
    _set_expiry(user["id"], -1)

    r = call(client, user, script_id)

    assert r.status_code == 403, f"{label} served a lapsed account: {r.text[:200]}"


@pytest.mark.parametrize("label,call", PAID_ROUTES, ids=[r[0] for r in PAID_ROUTES])
def test_the_same_account_inside_its_month_is_not_refused_for_tier(
    client, make_user, make_script, label, call
):
    """The other half, and the half that catches an over-eager fix.

    Asserting only the refusal above would pass just as well if the expiry check
    refused everybody — which would take the product to zero paid features
    without failing a test. So: same user, same routes, expiry moved forward.
    Not asserting 200, because these routes reach an AI provider that the suite
    deliberately neutralises; what is asserted is that whatever goes wrong is no
    longer the TIER going wrong.
    """
    user = make_user("pro")
    _project, script_id = make_script(user)
    _set_expiry(user["id"], 29)

    r = call(client, user, script_id)

    assert r.status_code != 403, f"{label} refused a paid account inside its month"


def test_a_stripe_subscriber_has_no_expiry_and_keeps_access(client, make_user, make_script):
    """NULL means "not time-boxed" — Stripe owns the renewal. That is why adding
    the column downgraded nobody, and it is the case a naive `expires_at < now`
    comparison gets wrong in the most expensive possible direction: by silently
    cancelling every existing international subscriber."""
    user = make_user("pro")
    _project, script_id = make_script(user)
    supabase.table("users").update(
        {"subscription_expires_at": None}
    ).eq("id", user["id"]).execute()

    r = _generate_scene(client, user, script_id)

    assert r.status_code != 403


def test_a_lapsed_studio_account_drops_to_free_not_to_pro(client, make_user, make_script):
    """There is no half-lapsed state. A studio month that ends leaves a free
    account, not a pro one — otherwise the cheaper tier becomes reachable by
    buying the dearer one once and waiting."""
    user = make_user("studio")
    _project, script_id = make_script(user)
    _set_expiry(user["id"], -40)

    r = _export_word(client, user, script_id)

    assert r.status_code == 403


def test_the_free_project_limit_comes_back_when_a_plan_lapses(client, make_user):
    """Tier gates are not only about AI. `FREE_PROJECT_LIMIT` is 3, and a
    lapsed account is a free account — so the fourth project has to be refused
    with a 402, the same as any other free user's."""
    user = make_user("pro")
    for i in range(3):
        made = client.post(
            "/projects/",
            json={"title": f"Project {i}", "genre": "Drama", "duration_minutes": 10},
            headers=user["headers"],
        )
        assert made.status_code == 200, made.text

    _set_expiry(user["id"], -1)

    r = client.post(
        "/projects/",
        json={"title": "One too many", "genre": "Drama", "duration_minutes": 10},
        headers=user["headers"],
    )

    assert r.status_code == 402, r.text


def test_an_expiry_exactly_now_is_treated_as_over(client, make_user, make_script):
    """The boundary. A month that ends at this instant has ended — reading it
    the other way gives away a request on a technicality and makes the rule
    harder to explain than it is worth."""
    user = make_user("pro")
    _project, script_id = make_script(user)
    _set_expiry(user["id"], -0.0001)

    r = _generate_scene(client, user, script_id)

    assert r.status_code == 403
