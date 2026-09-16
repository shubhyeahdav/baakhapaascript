"""Payment orchestration, provider-agnostic.

Stripe was the only path here, and Stripe cannot collect from most Nepali cards
— which made the whole billing system untestable against the actual market. This
module keeps Stripe for cards and adds Khalti and eSewa alongside it.

**The structural difference, which shapes everything below:** Stripe Checkout was
opened in `mode="subscription"` and Stripe remembered to bill again next month.
Khalti and eSewa have no subscription primitive at all — they take one payment,
once. So a plan bought through them has to carry its own expiry, and
`subscription_expires_at` is that. A Stripe subscription leaves it NULL, meaning
"Stripe is responsible for this one"; a Nepali gateway payment sets it 30 days
out, and the next payment extends it.

**Why a `payments` row exists before the user ever reaches the gateway:** the
user comes back from Khalti holding nothing but a `pidx`. If the tier came from
the returning request, anyone could come back claiming `studio`. Instead we
write down what was asked for, hand the gateway an id, and on return look up our
own row and check the gateway's reported amount against the price we recorded.
The client's word is never part of the decision.
"""
import datetime
import os
import uuid

from database import supabase

# Amounts are in paisa — the smallest NPR unit — because that is what all three
# gateways expect on the wire. Rs 999.00 is 99900.
TIERS = {
    "pro":    {"name": "Pro",    "amount": 99900,  "currency": "npr"},
    "studio": {"name": "Studio", "amount": 249900, "currency": "npr"},
}

# One month of access per payment. Configurable because the number is a pricing
# decision, not a technical one.
SUBSCRIPTION_DAYS = int(os.getenv("SUBSCRIPTION_DAYS", "30"))

# ---------------------------------------------------------------------------
# Three modes, not two
#
# The first cut of this had only "configured or not", which collapsed two very
# different states: a gateway we can genuinely talk to, and a local simulation
# that never leaves the process. That mattered because the simulation is the one
# state in which the integration is never actually exercised — the redirect went
# to our own /payment/return and no gateway ever saw a request. Bugs in the real
# request shape survive that indefinitely.
#
#   live    — real credentials, production host, real money
#   sandbox — the gateway's own test host. Real HTTP, real redirect, real
#             signature checking, no money. This is where an integration is
#             actually proven.
#   demo    — no credentials at all. Loops back to our own return URL. Correct
#             for CI and offline work, and honest about being a simulation.
# ---------------------------------------------------------------------------
LIVE, SANDBOX, DEMO = "live", "sandbox", "demo"

def sandbox_default() -> bool:
    """Whether a provider with no credentials should use the gateway's published
    test credentials rather than simulate locally.

    On by default, so a developer who has not signed up for anything still
    exercises the real request shape wherever a gateway publishes usable test
    credentials — eSewa does; Khalti issues per-developer keys, so it stays in
    demo until one is set. The test suite pins this false: a unit test must not
    depend on a third party being up.

    Read per call, not at import, so it can be changed without restarting and so
    tests can drive it — the same as every other setting in these modules.
    """
    return os.getenv("PAYMENT_SANDBOX", "true").strip().lower() in ("1", "true", "yes")


# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------
def _providers() -> dict:
    """Imported lazily so a provider module failing to import cannot take the
    whole app down with it — a broken gateway should cost that gateway only."""
    import esewa
    import khalti
    import subscription_service  # the Stripe adapter

    return {
        "khalti": khalti,
        "esewa": esewa,
        "stripe": subscription_service,
    }


def available() -> list[dict]:
    """What the pricing page should offer. A provider with no keys is still
    listed in demo mode — that is the whole point of demo mode — but says so, so
    nobody mistakes a simulated upgrade for a real one."""
    return [
        {
            "key": key,
            "name": mod.DISPLAY_NAME,
            "description": mod.DESCRIPTION,
            "mode": mod.mode(),
            # Only meaningful in demo: what it would take to reach the real
            # gateway. A simulated provider that does not say why looks broken.
            "hint": getattr(mod, "DEMO_HINT", None) if mod.mode() == DEMO else None,
            # Kept for callers that only ask "will this charge a real card".
            "live": mod.mode() == LIVE,
        }
        for key, mod in _providers().items()
    ]


def default_provider() -> str:
    """First configured provider, else Khalti — the Nepali default, since the
    product's users are in Nepal and Stripe cannot charge most of their cards."""
    providers = _providers()
    # A live gateway beats a sandbox one; a sandbox one beats a simulation.
    for wanted in (LIVE, SANDBOX):
        for key, mod in providers.items():
            if mod.mode() == wanted:
                return key
    return "khalti"


def return_url(provider: str, origin: str) -> str:
    """Where a gateway sends the browser back to, as a **path** and nothing else.

    This used to be `{origin}/payment/return?provider=esewa`, and that is a bug
    against a real gateway rather than a style preference. Every one of the
    three appends its own query string to the URL we give it — Khalti adds
    `?pidx=...&status=...`, eSewa adds `?data=<base64>` — and eSewa's own
    documentation does not say what it does when the URL already has one. A
    second `?` produces a URL where the parameters we need are unparseable, and
    the failure appears only once a real gateway is in the loop, which is
    exactly the case the demo path never exercised.

    Putting the provider in the path leaves the query string entirely to them.
    """
    return f"{origin.rstrip('/')}/payment/return/{provider}"


def _provider(key: str):
    mod = _providers().get(key)
    if mod is None:
        raise ValueError(f"Unknown payment provider: {key}")
    return mod


# ---------------------------------------------------------------------------
# Tier state
# ---------------------------------------------------------------------------
def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _parse(ts) -> datetime.datetime | None:
    if not ts:
        return None
    try:
        parsed = datetime.datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return None
    # A naive timestamp is one we wrote; we always write UTC.
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed


def effective_tier(user: dict | None) -> str:
    """The tier a user actually has right now.

    A NULL expiry means the plan is not time-boxed: a Stripe subscription, or a
    seeded demo account. Only a *set and past* expiry demotes anyone — so no
    existing row changes meaning by this column being added.
    """
    if not user:
        return "free"
    tier = user.get("subscription_tier") or "free"
    if tier == "free":
        return "free"
    expires = _parse(user.get("subscription_expires_at"))
    if expires and expires < _now():
        return "free"
    return tier


def activate(user_id: str, tier: str, days: int | None = None,
             recurring: bool = False) -> str | None:
    """Grant `tier` and return the new expiry (None for a recurring plan).

    Extends from the existing expiry when it is still in the future, so paying
    early never costs a user the days they already bought.
    """
    if tier not in TIERS:
        raise ValueError(f"Unknown subscription tier: {tier}")

    updates: dict = {"subscription_tier": tier}
    expiry_iso = None

    if recurring:
        # Stripe owns the renewal — an expiry we set would fight it.
        updates["subscription_expires_at"] = None
    else:
        rows = supabase.table("users").select("*").eq("id", user_id).execute()
        current = _parse((rows.data[0] if rows.data else {}).get("subscription_expires_at"))
        base = current if (current and current > _now()) else _now()
        expiry_iso = (base + datetime.timedelta(days=days or SUBSCRIPTION_DAYS)).isoformat()
        updates["subscription_expires_at"] = expiry_iso

    supabase.table("users").update(updates).eq("id", user_id).execute()
    return expiry_iso


def refund(reference: str) -> dict:
    """Record that a completed payment was refunded, and take back what it gave.

    Called by `refund_payment.py`, never over HTTP. Refunding is the most
    consequential thing anybody can do to an account that is not deleting it,
    and `renewals.py` already makes the argument for the smaller case: nothing
    should be able to trigger it with a request.

    HOW THE TIER IS TAKEN BACK. Not by writing "free" onto the user. The days
    the payment bought are subtracted from `subscription_expires_at`, and
    `effective_tier` does the rest — an expiry now in the past already reads as
    free everywhere, which is a path that is tested and in use. Inventing a
    second way to demote somebody would mean two mechanisms that have to agree
    forever.

    It also gets the arithmetic right where a blunt downgrade would not. A
    writer who paid for January and February, whose January payment is
    refunded, still has February. They lose thirty days, not their plan.

    A NULL expiry is left alone, deliberately. NULL means Stripe owns the
    renewal, and refunding an invoice there does not cancel the subscription —
    Stripe's own state is the truth, and writing a tier here would fight it.
    The refund is recorded and the caller is told.

    Returns what happened, so the operator script can print it rather than
    guess.
    """
    rows = supabase.table("payments").select("*").eq(
        "reference", reference).execute().data or []
    if not rows:
        return {"ok": False, "reason": f"No payment with reference {reference}."}

    payment = rows[0]
    if payment.get("status") == "refunded":
        # Idempotent: an operator who runs it twice must not take sixty days.
        return {"ok": True, "already": True, "payment": payment,
                "reason": "Already refunded; nothing changed."}
    if payment.get("status") != "completed":
        return {"ok": False, "payment": payment,
                "reason": f"Payment is {payment.get('status')}, not completed. "
                          "Only a payment that actually granted something can "
                          "be refunded."}

    supabase.table("payments").update({
        "status": "refunded",
        "refunded_at": _now().isoformat(),
    }).eq("reference", reference).execute()

    users = supabase.table("users").select("*").eq(
        "id", payment.get("user_id")).execute().data or []
    user = users[0] if users else None
    if not user:
        return {"ok": True, "payment": payment,
                "reason": "Payment marked refunded; the account no longer exists."}

    expires = _parse(user.get("subscription_expires_at"))
    if expires is None:
        return {"ok": True, "payment": payment, "tier_unchanged": True,
                "reason": "Payment marked refunded. This plan has no expiry, "
                          "which means Stripe owns its renewal — cancel it "
                          "there; a tier written here would fight Stripe's own "
                          "state."}

    new_expiry = expires - datetime.timedelta(days=SUBSCRIPTION_DAYS)
    supabase.table("users").update({
        "subscription_expires_at": new_expiry.isoformat(),
    }).eq("id", user["id"]).execute()

    return {"ok": True, "payment": payment,
            "expires_at": new_expiry.isoformat(),
            "reads_as_free": new_expiry < _now(),
            "reason": f"Refunded. {SUBSCRIPTION_DAYS} days taken back."}


# ---------------------------------------------------------------------------
# Payment records
# ---------------------------------------------------------------------------
def create_record(user_id: str, tier: str, provider: str) -> dict:
    plan = TIERS[tier]
    record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "tier": tier,
        "provider": provider,
        "amount": plan["amount"],
        "currency": plan["currency"],
        "status": "pending",
        "reference": f"BKP-{uuid.uuid4().hex[:16]}",
        "provider_ref": None,
        "created_at": _now().isoformat(),
        "completed_at": None,
    }
    supabase.table("payments").insert(record).execute()
    return record


def record_by_reference(reference: str) -> dict | None:
    rows = supabase.table("payments").select("*").eq("reference", reference).execute()
    return rows.data[0] if rows.data else None


def _update_record(record_id: str, updates: dict) -> None:
    supabase.table("payments").update(updates).eq("id", record_id).execute()


def history(user_id: str) -> list[dict]:
    rows = (
        supabase.table("payments").select("*")
        .eq("user_id", user_id).order("created_at", desc=True).execute()
    )
    # `provider_ref` is a gateway-side lookup key and never leaves the server.
    fields = ("id", "tier", "provider", "amount", "currency",
              "status", "created_at", "completed_at")
    return [{k: r.get(k) for k in fields} for r in (rows.data or [])]


# ---------------------------------------------------------------------------
# The two calls the router makes
# ---------------------------------------------------------------------------
def start(user_id: str, tier: str, provider: str, origin: str,
          user: dict | None = None) -> dict:
    """Open a payment with the chosen gateway.

    Returns either `{"kind": "redirect", "url": ...}` (Khalti, Stripe) or
    `{"kind": "form_post", "action": ..., "fields": {...}}` (eSewa, which takes
    a signed browser form rather than an API-created session). The frontend
    handles both; nothing above this line needs to know which is which.
    """
    if tier not in TIERS:
        raise ValueError(f"Unknown subscription tier: {tier}")
    mod = _provider(provider)

    record = create_record(user_id, tier, provider)
    result = mod.initiate(record, origin, user or {})

    if result.get("provider_ref"):
        _update_record(record["id"], {"provider_ref": result["provider_ref"]})

    # Demo mode: there is no gateway to come back from, so settle it here.
    if result.get("demo"):
        complete(record,
                 provider_ref=result.get("provider_ref") or "demo",
                 recurring=result.get("recurring", False))

    result["reference"] = record["reference"]
    result["provider"] = provider
    return result


def current_expiry(user_id: str) -> str | None:
    rows = supabase.table("users").select("*").eq("id", user_id).execute()
    return (rows.data[0] if rows.data else {}).get("subscription_expires_at")


def complete(record: dict, provider_ref: str | None = None,
             recurring: bool = False) -> dict:
    """Mark a payment paid and grant the tier. Idempotent: a gateway that
    redirects twice, or a user who refreshes the return page, must not stack
    two months of access onto one payment."""
    if record.get("status") == "completed":
        # Still report the expiry. This branch is what a refreshed return page
        # hits, and "your plan is active" without a date is the less useful
        # half of the answer.
        return {"status": "completed", "tier": record["tier"], "already": True,
                "expires_at": current_expiry(record["user_id"])}

    _update_record(record["id"], {
        "status": "completed",
        "provider_ref": provider_ref or record.get("provider_ref"),
        "completed_at": _now().isoformat(),
    })
    expires = activate(record["user_id"], record["tier"], recurring=recurring)
    return {"status": "completed", "tier": record["tier"], "expires_at": expires}


_NO_MATCH = "No matching payment was started from this account."


def verify(provider: str, params: dict, user_id: str | None = None) -> dict:
    """Settle a payment the user has just returned from.

    The gateway is asked directly what happened — the browser's query string is
    a hint about *which* payment to look up, never evidence that it succeeded.
    """
    mod = _provider(provider)

    reference = params.get("reference") or mod.reference_from(params)
    record = record_by_reference(reference) if reference else None
    if not record:
        return {"status": "unknown", "detail": _NO_MATCH}

    # A payment belongs to the account that opened it.
    if user_id and record["user_id"] != user_id:
        return {"status": "unknown", "detail": _NO_MATCH}

    if record["status"] == "completed":
        return {"status": "completed", "tier": record["tier"], "already": True,
                "expires_at": current_expiry(record["user_id"])}

    outcome = mod.verify(record, params)

    if not outcome.get("paid"):
        status = outcome.get("status", "failed")
        _update_record(record["id"], {"status": status})
        return {"status": status,
                "detail": outcome.get("detail", "Payment was not completed.")}

    # The amount is checked against what we recorded, not what was requested, so
    # a tampered redirect cannot buy Studio at the Pro price.
    paid = outcome.get("amount")
    if paid is not None and int(paid) < int(record["amount"]):
        _update_record(record["id"], {"status": "underpaid"})
        return {
            "status": "underpaid",
            "detail": (f"Paid {int(paid) / 100:.2f} against a price of "
                       f"{int(record['amount']) / 100:.2f} NPR."),
        }

    return complete(record, provider_ref=outcome.get("provider_ref"))
