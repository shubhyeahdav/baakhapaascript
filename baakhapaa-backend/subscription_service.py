import os
from dotenv import load_dotenv

load_dotenv()

try:
    import stripe
except ImportError:  # stripe not installed → force demo mode
    stripe = None

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

# Paid tiers. Amount is in the currency's smallest unit (paisa for NPR), as Stripe requires.
TIERS = {
    "pro":    {"name": "Pro",    "amount": 99900,  "currency": "npr"},
    "studio": {"name": "Studio", "amount": 249900, "currency": "npr"},
}


def _set_tier(user_id: str, tier: str):
    from database import supabase
    supabase.table("users").update({"subscription_tier": tier}).eq("id", user_id).execute()


def create_checkout_session(user_id: str, tier: str, origin: str) -> dict:
    """Create a Stripe Checkout session for a paid tier and return its URL.
    In demo mode (placeholder keys), simulate a completed payment: upgrade the
    user immediately and return the success URL so the flow is testable locally."""
    if tier not in TIERS:
        raise ValueError(f"Unknown subscription tier: {tier}")

    plan = TIERS[tier]
    success_url = f"{origin}/dashboard?checkout=success&tier={tier}"
    cancel_url = f"{origin}/pricing?checkout=cancelled"

    if MOCK_STRIPE:
        _set_tier(user_id, tier)
        return {"url": success_url, "demo": True}

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
        client_reference_id=user_id,
        metadata={"user_id": user_id, "tier": tier},
        subscription_data={"metadata": {"user_id": user_id, "tier": tier}},
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return {"url": session.url, "demo": False}


def handle_webhook(payload: bytes, sig_header: str) -> dict:
    """Verify and process a Stripe webhook. On checkout.session.completed,
    upgrade the referenced user's subscription_tier in the database."""
    if MOCK_STRIPE:
        # No signing secret to verify against in demo mode — nothing to do
        # (the upgrade already happened in create_checkout_session).
        return {"status": "ignored", "reason": "mock stripe"}

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, _WEBHOOK_SECRET)
    except Exception as e:  # bad signature or malformed payload
        raise ValueError(f"Webhook verification failed: {e}")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        metadata = session.get("metadata") or {}
        user_id = session.get("client_reference_id") or metadata.get("user_id")
        tier = metadata.get("tier")
        if user_id and tier in TIERS:
            _set_tier(user_id, tier)
            return {"status": "updated", "user_id": user_id, "tier": tier}

    return {"status": "ignored", "event": event["type"]}
