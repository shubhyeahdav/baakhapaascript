"""The Stripe webhook: unauthenticated, and it grants paid tiers.

`POST /subscription/webhook` is the only route in this application that takes no
token, does not know who is calling, and changes what someone is allowed to do.
Its entire defence is a signature check against the raw request body. Until this
file it had no tests at all — which meant nothing proved the signature was
actually verified, nothing proved a replayed event could not stack a second
month onto one payment, and nothing proved the tier came from the payment we
recorded rather than from the JSON the caller sent.

That last one is the property worth naming. A webhook payload is attacker-shaped
data: anyone can POST to this URL. If the granted tier were read out of the
event, a forged `checkout.session.completed` claiming `studio` would be a free
upgrade. The design already avoids this — the reference is looked up in our own
`payments` table and the tier comes from that row — but "already avoids" is a
property of today's code, and this file is what keeps it true.

MECHANICS. `subscription_service` reads `MOCK_STRIPE`, `_WEBHOOK_SECRET` and
`stripe` as module globals, and `MOCK_STRIPE` is computed at import from the
environment. Under `conftest` there is no Stripe key, so it is `True` and
`handle_webhook` returns "ignored" before doing anything. Every test here that
wants the real path therefore patches the module attributes, not the environment
— the same idiom `test_deploy_checks.py` uses for `export_service.DEVANAGARI_READY`.
The last test in the file asserts the demo short-circuit itself, which is also
what proves these patches are doing something.
"""
import json
from types import SimpleNamespace

import pytest

import payments
import subscription_service
from database import supabase

WEBHOOK_SECRET = "whsec_test_secret"


def _user_row(user_id):
    return supabase.table("users").select("*").eq("id", user_id).execute().data[0]


def _payment_row(record_id):
    return supabase.table("payments").select("*").eq("id", record_id).execute().data[0]


def _event(reference=None, session_id="cs_test_123", event_type="checkout.session.completed",
           metadata=None, **session_extra):
    """A `checkout.session.completed` envelope shaped like Stripe's."""
    session = {"id": session_id, "client_reference_id": reference,
               "metadata": metadata or {}, "payment_status": "paid",
               "amount_total": 99900}
    session.update(session_extra)
    return {"type": event_type, "data": {"object": session}}


def _post(client, event, signature="t=1,v1=deadbeef"):
    """Raw bytes, not `json=` — the body identity is the thing being verified."""
    headers = {"stripe-signature": signature} if signature is not None else {}
    return client.post("/subscription/webhook",
                       content=json.dumps(event).encode(), headers=headers)


@pytest.fixture
def live_stripe(monkeypatch):
    """Take Stripe out of demo mode and record every verification call.

    The fake `construct_event` returns whatever was posted, so tests control the
    event; the `calls` list is how they assert *what was verified*.
    """
    calls = []

    def construct_event(payload, sig_header, secret):
        calls.append({"payload": payload, "sig": sig_header, "secret": secret})
        return json.loads(payload)

    monkeypatch.setattr(subscription_service, "MOCK_STRIPE", False)
    monkeypatch.setattr(subscription_service, "_WEBHOOK_SECRET", WEBHOOK_SECRET)
    monkeypatch.setattr(
        subscription_service, "stripe",
        SimpleNamespace(Webhook=SimpleNamespace(construct_event=construct_event)),
    )
    return calls


@pytest.fixture
def pending_payment(make_user):
    """A user who has started a Pro checkout and not yet been granted anything."""
    user = make_user("free")
    record = payments.create_record(user["id"], "pro", "stripe")
    return user, record


# --- the happy path ----------------------------------------------------------

def test_a_verified_checkout_grants_the_tier_that_was_paid_for(
        client, live_stripe, pending_payment):
    user, record = pending_payment

    r = _post(client, _event(reference=record["reference"]))

    assert r.status_code == 200, r.text
    assert r.json() == {"status": "updated", "user_id": user["id"], "tier": "pro"}
    assert _user_row(user["id"])["subscription_tier"] == "pro"


def test_a_verified_checkout_settles_the_payment_row(client, live_stripe, pending_payment):
    _, record = pending_payment

    _post(client, _event(reference=record["reference"], session_id="cs_test_settled"))

    row = _payment_row(record["id"])
    assert row["status"] == "completed"
    assert row["provider_ref"] == "cs_test_settled"
    assert row["completed_at"] is not None


def test_a_stripe_upgrade_carries_no_expiry_date(client, live_stripe, pending_payment):
    """Stripe owns its own renewal, so a Stripe plan is not time-boxed. NULL here
    means "not time-boxed" rather than "expired" — `effective_tier` reads it that
    way, and writing a date would make a live subscription lapse in 30 days."""
    user, record = pending_payment

    _post(client, _event(reference=record["reference"]))

    assert _user_row(user["id"])["subscription_expires_at"] is None


# --- what actually gets verified ---------------------------------------------

def test_the_raw_body_is_what_gets_verified(client, live_stripe, pending_payment):
    """Stripe signs the bytes. Re-serialising the parsed JSON before verifying
    would change key order and whitespace and break every real signature — the
    route reads `await request.body()` for exactly this reason."""
    _, record = pending_payment
    event = _event(reference=record["reference"])

    _post(client, event)

    assert live_stripe[0]["payload"] == json.dumps(event).encode()


def test_the_configured_signing_secret_is_what_it_is_verified_against(
        client, live_stripe, pending_payment):
    _, record = pending_payment

    _post(client, _event(reference=record["reference"]))

    assert live_stripe[0]["secret"] == WEBHOOK_SECRET


def test_the_signature_header_is_passed_through(client, live_stripe, pending_payment):
    _, record = pending_payment

    _post(client, _event(reference=record["reference"]), signature="t=99,v1=abc123")

    assert live_stripe[0]["sig"] == "t=99,v1=abc123"


def test_a_missing_signature_header_still_reaches_the_verifier(
        client, live_stripe, pending_payment):
    """A request with no signature at all must be verified and rejected, not
    skipped. `None` reaching `construct_event` is what makes Stripe raise."""
    _, record = pending_payment

    _post(client, _event(reference=record["reference"]), signature=None)

    assert live_stripe[0]["sig"] is None


# --- rejection ---------------------------------------------------------------

def test_a_bad_signature_is_a_400(client, monkeypatch, pending_payment):
    def explode(payload, sig_header, secret):
        raise ValueError("No signatures found matching the expected signature")

    monkeypatch.setattr(subscription_service, "MOCK_STRIPE", False)
    monkeypatch.setattr(subscription_service, "_WEBHOOK_SECRET", WEBHOOK_SECRET)
    monkeypatch.setattr(
        subscription_service, "stripe",
        SimpleNamespace(Webhook=SimpleNamespace(construct_event=explode)),
    )
    _, record = pending_payment

    r = _post(client, _event(reference=record["reference"]))

    assert r.status_code == 400, r.text
    assert "Webhook verification failed" in r.json()["detail"]


def test_a_bad_signature_grants_nothing(client, monkeypatch, pending_payment):
    """Stated separately from the status code, because a 400 that still wrote
    the upgrade is the failure that actually costs money."""
    def explode(payload, sig_header, secret):
        raise ValueError("bad signature")

    monkeypatch.setattr(subscription_service, "MOCK_STRIPE", False)
    monkeypatch.setattr(subscription_service, "_WEBHOOK_SECRET", WEBHOOK_SECRET)
    monkeypatch.setattr(
        subscription_service, "stripe",
        SimpleNamespace(Webhook=SimpleNamespace(construct_event=explode)),
    )
    user, record = pending_payment

    _post(client, _event(reference=record["reference"]))

    assert _user_row(user["id"])["subscription_tier"] == "free"
    assert _payment_row(record["id"])["status"] == "pending"


# --- forgery -----------------------------------------------------------------

def test_the_tier_comes_from_the_stored_row_not_the_payload(
        client, live_stripe, pending_payment):
    """The anti-forgery property. The event claims `studio`; the payment we
    recorded was `pro`. What the user gets is `pro`. If this ever inverts, the
    webhook becomes a free upgrade for anyone who can guess a reference."""
    user, record = pending_payment

    r = _post(client, _event(reference=record["reference"],
                             metadata={"tier": "studio"}, tier="studio"))

    assert r.json()["tier"] == "pro"
    assert _user_row(user["id"])["subscription_tier"] == "pro"


def test_the_amount_in_the_payload_is_never_read(client, live_stripe, pending_payment):
    """The recorded amount is the one that counts. A payload claiming one rupee
    against a Rs 999 record must not rewrite what we believe was charged."""
    _, record = pending_payment

    _post(client, _event(reference=record["reference"], amount_total=1))

    assert _payment_row(record["id"])["amount"] == payments.TIERS["pro"]["amount"]


# --- replay ------------------------------------------------------------------

def test_a_replayed_event_does_not_grant_twice(client, live_stripe, pending_payment):
    """Stripe retries on any non-2xx and can deliver the same event more than
    once by design. The second delivery must be a no-op."""
    user, record = pending_payment
    event = _event(reference=record["reference"])

    _post(client, event)
    settled_at = _payment_row(record["id"])["completed_at"]
    second = _post(client, event)

    assert second.status_code == 200, second.text
    assert _payment_row(record["id"])["completed_at"] == settled_at
    assert _user_row(user["id"])["subscription_tier"] == "pro"


def test_a_replayed_event_does_not_extend_an_existing_expiry(
        client, live_stripe, make_user):
    """The costly version of a replay: a writer who already has a Khalti month
    must not have a second one stacked on by a repeated Stripe delivery. This
    goes through `payments.complete`'s already-completed short-circuit."""
    user = make_user("free")
    record = payments.create_record(user["id"], "pro", "stripe")
    supabase.table("users").update(
        {"subscription_expires_at": "2099-01-01T00:00:00"}
    ).eq("id", user["id"]).execute()

    event = _event(reference=record["reference"])
    _post(client, event)
    after_first = _user_row(user["id"])["subscription_expires_at"]
    _post(client, event)

    assert _user_row(user["id"])["subscription_expires_at"] == after_first


# --- reference resolution ----------------------------------------------------

def test_the_reference_falls_back_to_metadata(client, live_stripe, pending_payment):
    """Not every Stripe integration path sets `client_reference_id`, so metadata
    is the second place to look."""
    user, record = pending_payment

    r = _post(client, _event(reference=None, metadata={"reference": record["reference"]}))

    assert r.json()["status"] == "updated"
    assert _user_row(user["id"])["subscription_tier"] == "pro"


def test_client_reference_id_wins_over_metadata(client, live_stripe, make_user):
    """When the two disagree, the top-level field is authoritative — metadata is
    the fallback, not an override."""
    user = make_user("free")
    real = payments.create_record(user["id"], "pro", "stripe")
    other = payments.create_record(user["id"], "studio", "stripe")

    r = _post(client, _event(reference=real["reference"],
                             metadata={"reference": other["reference"]}))

    assert r.json()["tier"] == "pro"
    assert _payment_row(other["id"])["status"] == "pending"


# --- events we do not act on -------------------------------------------------

def test_an_unrelated_event_type_is_ignored(client, live_stripe, pending_payment):
    """Stripe delivers whatever the endpoint is subscribed to. Anything that is
    not a completed checkout must touch nothing."""
    user, record = pending_payment

    r = _post(client, _event(reference=record["reference"], event_type="invoice.paid"))

    assert r.json() == {"status": "ignored", "event": "invoice.paid"}
    assert _user_row(user["id"])["subscription_tier"] == "free"
    assert _payment_row(record["id"])["status"] == "pending"


def test_an_event_with_no_reference_at_all_is_ignored(client, live_stripe, pending_payment):
    user, record = pending_payment

    r = _post(client, _event(reference=None))

    assert r.json()["status"] == "ignored"
    assert _user_row(user["id"])["subscription_tier"] == "free"
    assert _payment_row(record["id"])["status"] == "pending"


def test_an_unknown_reference_is_currently_ignored_silently(client, live_stripe):
    """PINS A KNOWN GAP RATHER THAN BLESSING IT.

    A verified `checkout.session.completed` whose reference matches no row gets a
    200 and `{"status": "ignored"}`. A 200 tells Stripe the event was handled, so
    it stops retrying — and nothing is logged. If a webhook ever arrives before
    the `payments` insert commits, or against a row that was never written, a
    real customer pays and is silently never upgraded.

    It now leaves a trace. The status code is still 200 — telling Stripe to
    retry would not help, because a reference we have no row for will not
    appear on a retry either — but the reference is named in the response and
    logged loudly enough that the payment can be reconciled by hand.
    """
    r = _post(client, _event(reference="BKP-nosuchreference"))

    assert r.status_code == 200
    assert r.json()["status"] == "ignored"
    assert r.json()["reason"] == "unknown reference"
    assert r.json()["reference"] == "BKP-nosuchreference"


def test_an_unknown_reference_is_logged_loudly(client, live_stripe, capsys):
    """The money moved and the tier did not. Somebody has to be able to find
    that afterwards, which means it cannot be a silent return."""
    _post(client, _event(reference="BKP-nosuchreference"))

    out = capsys.readouterr().out
    assert "BKP-nosuchreference" in out
    assert "reconcile" in out.lower()


# --- the default configuration -----------------------------------------------

def test_demo_mode_ignores_webhooks_without_calling_stripe(client, monkeypatch,
                                                           pending_payment):
    """With no Stripe key — the state CI and every local run are in — the handler
    must short-circuit before touching the `stripe` module at all.

    This is also the control for every other test in this file: if the patches in
    `live_stripe` stopped taking effect, this is the path they would silently
    fall back to, and it grants nothing.
    """
    class Explode:
        def __getattr__(self, name):
            raise AssertionError(f"demo mode must not reach stripe.{name}")

    monkeypatch.setattr(subscription_service, "MOCK_STRIPE", True)
    monkeypatch.setattr(subscription_service, "stripe", Explode())
    user, record = pending_payment

    r = _post(client, _event(reference=record["reference"]))

    assert r.status_code == 200, r.text
    assert r.json() == {"status": "ignored", "reason": "mock stripe"}
    assert _user_row(user["id"])["subscription_tier"] == "free"
