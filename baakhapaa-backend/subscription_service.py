"""Stripe, as one payment provider among three.

This module used to *be* the payment system. It now implements the same small
interface as `khalti.py` and `esewa.py` — `configured` / `initiate` / `verify` /
`reference_from` — and `payments.py` decides which of the three to call.

Stripe keeps one thing the Nepali gateways do not have: a real subscription. It
bills again next month on its own, so a Stripe upgrade is activated with
`recurring=True` and carries no expiry date. Khalti and eSewa buy exactly one
month at a time. See `payments.effective_tier`.

Stripe remains the right path for a card issued outside Nepal; it is the wrong
path for most cards inside it, which is why it is no longer the only one.
"""
import os

from dotenv import load_dotenv

import payments

load_dotenv()

try:
    import stripe
except ImportError:  # stripe not installed → force demo mode
    stripe = None

DISPLAY_NAME = "Card (Stripe)"
DESCRIPTION = "International Visa or Mastercard — most Nepali cards are declined"
# Khalti and eSewa both publish sandbox credentials, so both reach a real
# gateway with no setup. Stripe does not: `sk_test_` keys are per-account
# credentials, not publishable ones, so this stays a simulation until someone
# pastes their own. Worth saying in the UI rather than looking like a bug.
DEMO_HINT = "Set STRIPE_SECRET_KEY (sk_test_…) to reach Stripe's sandbox"

_STRIPE_KEY = os.getenv("STRIPE_SECRET_KEY")
_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

# Demo mode: no real key configured (placeholder or missing) — simulate the
# checkout instead of calling Stripe. Same pattern as the mock AI / mock DB.
MOCK_STRIPE = (
    stripe is None
    or not _STRIPE_KEY
    or _STRIPE_KEY.startswith("your-")
    or not _STRIPE_KEY.startswith("sk_")
)

if not MOCK_STRIPE:
    stripe.api_key = _STRIPE_KEY
else:
    print("WARNING: Running with Mock Stripe (no real STRIPE_SECRET_KEY set). "
          "Checkout will simulate a successful payment and upgrade the tier locally.")

# Kept as a module attribute because callers and tests have always read it here.
TIERS = payments.TIERS


def mode() -> str:
    """Stripe's test keys are `sk_test_`, and a test key is a real sandbox: the
    API call happens, the session is created, the redirect goes to Stripe. Only
    an `sk_live_` key moves money."""
    if MOCK_STRIPE:
        return payments.DEMO
    return payments.LIVE if _STRIPE_KEY.startswith("sk_live_") else payments.SANDBOX


def configured() -> bool:
    return mode() != payments.DEMO


def reference_from(params: dict) -> str | None:
    return params.get("reference")


def initiate(record: dict, origin: str, user: dict) -> dict:
    plan = payments.TIERS[record["tier"]]
    # Path-based, matching Khalti and eSewa. Stripe is the one gateway that
    # lets us name our own parameter, so `session_id` is templated in
    # deliberately rather than appended by them.
    success_url = (f"{payments.return_url('stripe', origin)}"
                   f"?reference={record['reference']}"
                   "&session_id={CHECKOUT_SESSION_ID}")
    cancel_url = f"{origin}/pricing?checkout=cancelled"

    if MOCK_STRIPE:
        return {
            "kind": "redirect",
            "url": f"{origin}/dashboard?checkout=success&tier={record['tier']}",
            "demo": True,
            # A simulated Stripe plan is a simulated *subscription*, so it gets
            # no expiry — matching what the real path does.
            "recurring": True,
        }

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{
            "price_data": {
                "currency": plan["currency"],
                "product_data": {"name": f"Baakhapaa {plan['name']}"},
                "unit_amount": plan["amount"],
                "recurring": {"interval": "month"},
            },
            "quantity": 1,
        }],
        # Our own payment reference, so the webhook and the return trip both
        # resolve to the row we wrote before the user ever left.
        client_reference_id=record["reference"],
        metadata={"user_id": record["user_id"], "tier": record["tier"],
                  "reference": record["reference"]},
        subscription_data={"metadata": {"user_id": record["user_id"],
                                        "tier": record["tier"],
                                        "reference": record["reference"]}},
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return {"kind": "redirect", "url": session.url, "demo": False,
            "provider_ref": session.id, "recurring": True}


def verify(record: dict, params: dict) -> dict:
    """Confirm from Stripe's own record of the session.

    The webhook usually gets here first; this exists for the case where it is
    delayed or misconfigured, so a paying user is never left on the free tier
    waiting for an event they cannot see.
    """
    if MOCK_STRIPE:
        return {"paid": True, "amount": record["amount"], "provider_ref": "demo",
                "recurring": True}

    session_id = params.get("session_id") or record.get("provider_ref")
    if not session_id:
        return {"paid": False, "status": "failed",
                "detail": "Stripe did not return a session id."}

    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except Exception as e:
        return {"paid": False, "status": "pending",
                "detail": f"Could not confirm with Stripe: {e}"}

    if session.get("payment_status") != "paid":
        return {"paid": False, "status": "pending",
                "detail": f"Stripe reports the session as {session.get('payment_status')}."}

    return {"paid": True, "amount": session.get("amount_total"),
            "provider_ref": session_id, "recurring": True}


def handle_webhook(payload: bytes, sig_header: str) -> dict:
    """Verify and process a Stripe webhook. On checkout.session.completed,
    settle the matching payment row and grant the tier."""
    if MOCK_STRIPE:
        # No signing secret to verify against in demo mode — nothing to do
        # (the upgrade already happened when checkout was started).
        return {"status": "ignored", "reason": "mock stripe"}

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, _WEBHOOK_SECRET)
    except Exception as e:  # bad signature or malformed payload
        raise ValueError(f"Webhook verification failed: {e}") from e

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        metadata = session.get("metadata") or {}
        reference = session.get("client_reference_id") or metadata.get("reference")
        record = payments.record_by_reference(reference) if reference else None
        if record:
            result = payments.complete(record, provider_ref=session.get("id"),
                                       recurring=True)
            return {"status": "updated", "user_id": record["user_id"],
                    "tier": result["tier"]}

    return {"status": "ignored", "event": event["type"]}
