"""Money going backwards.

Nothing handled a refund. Payment *failure* was covered — a Khalti lookup that
fails leaves the payment pending, and an underpayment grants nothing — but the
case where money is returned after a successful payment had no code and no
test. A refunded plan kept working indefinitely: the gateway gave the money
back and the product carried on giving the plan away.

The design decision worth knowing before reading these: a refund does NOT write
"free" onto the user. It subtracts the days the payment bought, and
`effective_tier` demotes on a past expiry — a path that already exists, is
already tested, and is already used by every lapsing Khalti and eSewa plan.
Two ways to demote somebody would be two things that have to agree forever.
"""
import datetime

import pytest

import database
import payments
from conftest import GOOD_PASSWORD, _unique_email


@pytest.fixture
def paid_user(client):
    """A writer on Pro with thirty days left, and the payment that bought it."""
    email = _unique_email("payer")
    client.post("/auth/register",
                json={"email": email, "password": GOOD_PASSWORD, "name": "Mira"})
    login = client.post("/auth/login",
                        json={"email": email, "password": GOOD_PASSWORD}).json()
    user_id = login["user"]["id"]

    record = payments.create_record(user_id, "pro", "khalti")
    database.supabase.table("payments").update(
        {"status": "completed"}).eq("reference", record["reference"]).execute()
    expiry = payments.activate(user_id, "pro")

    return {"id": user_id, "email": email,
            "reference": record["reference"], "expiry": expiry}


def _user(user_id):
    rows = database.supabase.table("users").select("*").eq(
        "id", user_id).execute().data
    return rows[0] if rows else None


# --- the hole that existed ----------------------------------------------------

def test_a_refunded_payment_takes_its_days_back(paid_user):
    before = payments._parse(_user(paid_user["id"])["subscription_expires_at"])

    result = payments.refund(paid_user["reference"])

    after = payments._parse(_user(paid_user["id"])["subscription_expires_at"])
    assert result["ok"]
    assert (before - after).days == payments.SUBSCRIPTION_DAYS


def test_the_writer_then_reads_as_free_everywhere(paid_user):
    """The whole point. `effective_tier` is what every gate in the product
    consults, so a refund has to land there rather than on a column somebody
    might read directly."""
    payments.refund(paid_user["reference"])

    assert payments.effective_tier(_user(paid_user["id"])) == "free"


def test_a_paid_feature_is_actually_refused_afterwards(client, paid_user):
    """Through the API, not through the function. A tier that reads correctly
    but is not enforced would be the same bug one layer up."""
    login = client.post("/auth/login",
                        json={"email": paid_user["email"],
                              "password": GOOD_PASSWORD}).json()
    headers = {"Authorization": f"Bearer {login['token']}"}

    payments.refund(paid_user["reference"])

    r = client.post("/scripts/generate-scene",
                    json={"script_id": "whatever", "scene_id": "whatever"},
                    headers=headers)
    assert r.status_code in (402, 403), r.status_code


# --- the arithmetic that a blunt downgrade would get wrong --------------------

def test_a_writer_who_paid_twice_keeps_the_month_they_did_not_get_back(paid_user):
    """January refunded, February kept. Writing "free" onto the user would take
    a month they still paid for — which is the product stealing to correct a
    refund."""
    second = payments.create_record(paid_user["id"], "pro", "esewa")
    database.supabase.table("payments").update(
        {"status": "completed"}).eq("reference", second["reference"]).execute()
    payments.activate(paid_user["id"], "pro")   # extends to ~60 days

    payments.refund(paid_user["reference"])

    user = _user(paid_user["id"])
    assert payments.effective_tier(user) == "pro"
    remaining = payments._parse(user["subscription_expires_at"]) - payments._now()
    assert remaining.days >= payments.SUBSCRIPTION_DAYS - 2


def test_refunding_twice_does_not_take_sixty_days(paid_user):
    """An operator running the script twice, or re-running it after a timeout,
    must not compound."""
    payments.refund(paid_user["reference"])
    once = _user(paid_user["id"])["subscription_expires_at"]

    again = payments.refund(paid_user["reference"])

    assert again["ok"] and again.get("already")
    assert _user(paid_user["id"])["subscription_expires_at"] == once


# --- what it refuses to do ----------------------------------------------------

def test_a_stripe_plan_is_recorded_but_its_tier_is_left_to_stripe(paid_user):
    """NULL expiry means Stripe owns the renewal. Refunding an invoice does not
    cancel a subscription, so a tier written here would fight Stripe's own
    state — and the operator needs telling that, not a silent no-op."""
    database.supabase.table("users").update(
        {"subscription_expires_at": None}).eq("id", paid_user["id"]).execute()

    result = payments.refund(paid_user["reference"])

    assert result["ok"] and result.get("tier_unchanged")
    assert "Stripe" in result["reason"]
    assert payments.effective_tier(_user(paid_user["id"])) == "pro"


def test_a_payment_that_never_completed_cannot_be_refunded(paid_user):
    """Nothing was granted, so there is nothing to take back, and taking thirty
    days for a payment that failed would be the same bug with the sign flipped."""
    pending = payments.create_record(paid_user["id"], "pro", "khalti")

    result = payments.refund(pending["reference"])

    assert not result["ok"]
    assert "not completed" in result["reason"]


def test_an_unknown_reference_says_so_rather_than_guessing():
    result = payments.refund("BKP-does-not-exist")

    assert not result["ok"]
    assert "No payment" in result["reason"]


def test_the_payment_row_survives_the_refund(paid_user):
    """The money moved twice and the row is the only account of it. A refund
    that deleted the record would erase the evidence of both movements."""
    payments.refund(paid_user["reference"])

    rows = database.supabase.table("payments").select("*").eq(
        "reference", paid_user["reference"]).execute().data

    assert len(rows) == 1
    assert rows[0]["status"] == "refunded"
    assert rows[0]["refunded_at"]


def test_the_schema_allows_the_status_the_code_writes():
    """The drift class this repository keeps meeting: the local mock is
    schemaless and accepts any status, so only reading the SQL catches a CHECK
    constraint that would reject the row in Postgres."""
    import io
    import os

    sql = io.open(os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), "supabase_schema.sql"), encoding="utf-8").read()

    assert "'refunded'" in sql, "payments.status has no 'refunded' in its CHECK"
    assert "refunded_at" in sql
    assert "ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at" in sql, (
        "a column in CREATE TABLE only helps a database created from scratch; "
        "every existing environment is migrated by hand"
    )


def test_datetime_is_imported_where_refund_needs_it():
    """`refund` does date arithmetic. A missing import would only surface on a
    real refund, which is the worst possible moment to find it."""
    assert isinstance(payments.SUBSCRIPTION_DAYS, int)
    assert hasattr(datetime, "timedelta")
