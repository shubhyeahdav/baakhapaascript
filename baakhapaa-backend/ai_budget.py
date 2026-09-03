"""A ceiling on what one account can spend on generation in a month.

Every AI route in this product is gated by tier and by nothing else. A Pro
subscription is Rs 999 a month and buys unmetered generation, which is fine
until it is not: nothing stops one account from generating continuously, and
the first anyone would learn of it is the provider invoice. That is a bad way
to find out, and the fix is cheap.

This is deliberately a ceiling, not a meter. It is not billing, it does not
prorate, and it does not try to be exact — it counts tokens the provider
reports and stops the account when the month's estimated cost passes a limit.
Being approximately right and refusing early is the useful behaviour; being
exactly right is a different project.

Three properties worth keeping:

  * **It fails open.** If the usage table is unreadable, the request proceeds.
    A writer losing their generation because a log table is missing is a worse
    outcome than a month running slightly over.
  * **It counts what was actually used**, from the provider's own `usage`
    numbers, not from an estimate of prompt length. Estimates drift, and they
    drift in the direction that costs money.
  * **The limit is per tier and per calendar month.** Not a rolling window: a
    writer should be able to look at a date and know when it resets.
"""
import os
from datetime import datetime, timezone

TABLE = "ai_usage"

# Anthropic list prices, US dollars per million tokens, for the model this
# product actually calls (`script_engine.MODEL`). Hard-coded rather than
# fetched: prices change rarely and a wrong number here makes the ceiling
# wrong in a direction we can see, whereas a failed price lookup on the
# writing path would make it wrong silently.
INPUT_USD_PER_MTOK = float(os.getenv("AI_INPUT_USD_PER_MTOK", "2.00"))
OUTPUT_USD_PER_MTOK = float(os.getenv("AI_OUTPUT_USD_PER_MTOK", "10.00"))

# What one account may spend in a month, by tier.
#
# Pro is Rs 999, about $7.20. A ceiling of $6 leaves the subscription
# profitable at the limit while being far above any plausible honest use: the
# measured cost of a whole script including a storyboard is about $0.44, so
# this is roughly thirteen complete scripts a month. Studio is higher because
# it is sold as a team plan. Free never reaches here — the AI routes are tier-
# gated before this runs — but it is listed so the table is total rather than
# relying on a lookup default.
CEILINGS_USD = {
    "free": 0.0,
    "pro": float(os.getenv("AI_MONTHLY_CEILING_PRO", "6.00")),
    "studio": float(os.getenv("AI_MONTHLY_CEILING_STUDIO", "40.00")),
}


def _period(now=None):
    """The calendar month, as a sortable string. A writer can look at a date
    and know when this resets, which a rolling window would not give them."""
    now = now or datetime.now(timezone.utc)
    return f"{now.year:04d}-{now.month:02d}"


def cost_usd(input_tokens, output_tokens):
    return (input_tokens * INPUT_USD_PER_MTOK / 1_000_000
            + output_tokens * OUTPUT_USD_PER_MTOK / 1_000_000)


def _row(user_id, period):
    from database import supabase
    rows = (supabase.table(TABLE).select("*")
            .eq("user_id", user_id).eq("period", period).execute().data or [])
    return rows[0] if rows else None


def spent_usd(user_id, period=None):
    """What this account has spent this month, or 0.0 if that cannot be read.

    Failing open is the deliberate choice: a writer losing a generation because
    a log table is missing is worse than a month running slightly over.
    """
    try:
        row = _row(user_id, period or _period())
        return float(row.get("cost_usd") or 0.0) if row else 0.0
    except Exception as e:
        print(f"AI usage unreadable ({e}); not enforcing the ceiling.")
        return 0.0


def remaining_usd(user_id, tier):
    ceiling = CEILINGS_USD.get((tier or "free").lower(), 0.0)
    return max(0.0, ceiling - spent_usd(user_id))


def over_ceiling(user_id, tier):
    """True when this account has spent its month.

    Checked BEFORE a call rather than after, because after is too late — the
    tokens are already bought. It means the ceiling can be exceeded by at most
    one request, which is the right amount of imprecision for something whose
    job is to stop a runaway rather than to bill.
    """
    ceiling = CEILINGS_USD.get((tier or "free").lower(), 0.0)
    if ceiling <= 0:
        return False       # not metered at this tier; the tier gate handles it
    return spent_usd(user_id) >= ceiling


def record(user_id, input_tokens=0, output_tokens=0):
    """Add one call's usage to this month's total.

    Called after the response has been sent. A dropped write costs the ceiling
    a little accuracy, which is why nothing here retries."""
    if not user_id or (not input_tokens and not output_tokens):
        return
    try:
        from database import supabase
        period = _period()
        row = _row(user_id, period)
        added = cost_usd(input_tokens, output_tokens)
        if row:
            supabase.table(TABLE).update({
                "input_tokens": (row.get("input_tokens") or 0) + input_tokens,
                "output_tokens": (row.get("output_tokens") or 0) + output_tokens,
                "cost_usd": round(float(row.get("cost_usd") or 0.0) + added, 6),
                "calls": (row.get("calls") or 0) + 1,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", row["id"]).execute()
        else:
            supabase.table(TABLE).insert({
                "user_id": user_id,
                "period": period,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_usd": round(added, 6),
                "calls": 1,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
    except Exception as e:
        print(f"AI usage not recorded ({e}).")


def summary(user_id, tier):
    """What to show a writer who asks where they are.

    Reports dollars because that is what the ceiling is denominated in, and a
    token count means nothing to a screenwriter."""
    ceiling = CEILINGS_USD.get((tier or "free").lower(), 0.0)
    spent = spent_usd(user_id)
    return {
        "period": _period(),
        "spent_usd": round(spent, 4),
        "ceiling_usd": ceiling,
        "remaining_usd": round(max(0.0, ceiling - spent), 4),
        "metered": ceiling > 0,
    }
