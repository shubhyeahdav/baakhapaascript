"""Renewal reminders.

Khalti and eSewa have no subscription primitive — they take one payment, once —
so a plan bought through either simply stops. `PlanNotice` warns inside the app,
but the writer who most needs telling is the one who has not opened the app in
three weeks, and no in-app banner can reach them.

Two rules shape this:

* **A Stripe subscription is never reminded.** Its expiry is NULL because
  Stripe owns the renewal; mailing those users would be telling them something
  untrue about their own plan.
* **Nobody is told the same thing twice.** The send is recorded on the user
  row, so re-running the job — which a cron will do daily, and a human will do
  by hand at least once — does not mail anybody again.

Run it from cron: `python renewals.py`. It is deliberately a script rather than
an endpoint, because nothing should be able to trigger a mail-out over HTTP.
"""
import datetime
import json
import os

import payments

# Warn once here, and again when it has actually lapsed. Seven days is long
# enough to act on and short enough that the mail still feels relevant.
WARN_DAYS = int(os.getenv("RENEWAL_WARN_DAYS", "7"))

# The two things a writer can be told, and the key each is recorded under so it
# is only ever said once.
BEFORE, AFTER = "expiring", "lapsed"


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _sent_log(user: dict) -> dict:
    raw = user.get("renewal_notices_json")
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        # A malformed log must not stop a reminder going out; the cost of
        # re-sending once is far lower than the cost of never sending.
        return {}


def due(user: dict, now: datetime.datetime | None = None) -> str | None:
    """Which reminder this user is owed right now, if any.

    Returns BEFORE, AFTER, or None. Pure — no database, no mail — so the rules
    can be tested without either.
    """
    now = now or _now()
    tier = user.get("subscription_tier") or "free"
    if tier == "free":
        return None

    expires = payments._parse(user.get("subscription_expires_at"))
    # NULL expiry means Stripe owns the renewal. Nothing to warn about.
    if expires is None:
        return None

    sent = _sent_log(user)
    stamp = user.get("subscription_expires_at")

    if expires <= now:
        # Keyed by the expiry date, so a writer who renews and later lapses
        # again is told again — it is a different lapse.
        return None if sent.get(AFTER) == stamp else AFTER

    if (expires - now).days <= WARN_DAYS:
        return None if sent.get(BEFORE) == stamp else BEFORE

    return None


def message(kind: str, user: dict, expires: datetime.datetime) -> tuple[str, str]:
    name = (user.get("name") or "").split(" ")[0] or "there"
    when = expires.strftime("%d %B %Y")
    tier = (user.get("subscription_tier") or "").capitalize()

    if kind == AFTER:
        return (
            "Your Baakhapaa plan has ended",
            f"Hi {name},\n\n"
            f"Your {tier} plan ended on {when}.\n\n"
            "Your work is safe. Nothing has been deleted, and the free features "
            "still work — the craft checks, pattern recommendations and PDF "
            "export. AI generation and the production package need a plan.\n\n"
            "Khalti and eSewa charge one month at a time, so nothing renewed on "
            "its own and nothing was charged to you.\n\n"
            "To pick up where you left off:\n"
            f"{os.getenv('FRONTEND_URL', 'https://baakhapaa.com')}/pricing\n\n"
            "— Baakhapaa\n"
        )

    # Rounded, not truncated. `timedelta.days` floors, so an expiry three days
    # out that this code reads a fraction of a second later is 2 days,
    # 23:59:59.99 — and the writer is told their plan ends in 2 days when it
    # ends in 3. The reminder mail exists to be trusted about exactly this, and
    # a person reading it thinks in whole days, not floors.
    days = max(1, round((expires - _now()).total_seconds() / 86400))
    return (
        f"Your Baakhapaa plan ends in {days} day{'s' if days != 1 else ''}",
        f"Hi {name},\n\n"
        f"Your {tier} plan ends on {when}.\n\n"
        "Khalti and eSewa charge one month at a time rather than as a standing "
        "subscription, so this will not renew by itself — and nothing will be "
        "charged to you unless you choose to.\n\n"
        "If you want to keep going:\n"
        f"{os.getenv('FRONTEND_URL', 'https://baakhapaa.com')}/pricing\n\n"
        "If not, nothing happens to your scripts. They stay where they are.\n\n"
        "— Baakhapaa\n"
    )


def _record(user_id: str, kind: str, stamp: str, sent: dict) -> None:
    from database import supabase

    sent[kind] = stamp
    supabase.table("users").update(
        {"renewal_notices_json": json.dumps(sent)}
    ).eq("id", user_id).execute()


def run(dry_run: bool = False) -> dict:
    """Send every reminder that is owed. Returns a per-kind tally."""
    import mailer
    from database import supabase

    users = supabase.table("users").select("*").execute().data or []
    tally = {BEFORE: 0, AFTER: 0, "skipped": 0}

    for user in users:
        kind = due(user)
        if not kind:
            tally["skipped"] += 1
            continue

        expires = payments._parse(user.get("subscription_expires_at"))
        subject, body = message(kind, user, expires)

        if dry_run:
            print(f"[dry run] {kind} -> {user.get('email')}: {subject}")
            tally[kind] += 1
            continue

        if mailer.send(user.get("email"), subject, body):
            # Only recorded when it actually went, so a failed send is retried
            # tomorrow rather than silently marked done.
            _record(user["id"], kind, user.get("subscription_expires_at"), _sent_log(user))
            tally[kind] += 1

    return tally


if __name__ == "__main__":
    import sys

    result = run(dry_run="--dry-run" in sys.argv)
    print(f"Renewal reminders: {result}")
