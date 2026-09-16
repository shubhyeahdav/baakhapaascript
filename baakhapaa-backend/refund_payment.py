"""Record a refund and take back the days it bought.

    ./venv/Scripts/python refund_payment.py BKP-a1b2c3d4e5f6a7b8            # show
    ./venv/Scripts/python refund_payment.py BKP-a1b2c3d4e5f6a7b8 --confirm  # do it

WHY THIS EXISTS
---------------
It did not, and that was a hole with money in it. Nothing in the codebase
handled a refund, so a refunded Khalti or eSewa payment left the writer on Pro
indefinitely — the gateway gave the money back and the product kept giving the
plan away. Payment *failure* was covered by tests; the money going backwards
was not covered by anything.

WHY A SCRIPT AND NOT A ROUTE
----------------------------
`renewals.py` makes the smaller version of this argument: nothing should be
able to trigger a mail-out over HTTP. Refunding is the most consequential thing
that can happen to an account short of deleting it, this product has no admin
role — roles are per-project, deliberately — and inventing a global one to hang
an endpoint off would be a larger security decision than the feature warrants.

WHAT IT DOES NOT DO
-------------------
It does not move money. The refund happens in Khalti's, eSewa's or Stripe's
dashboard, by a person; this records the consequence so the product agrees with
the bank. Doing it the other way round — refunding here and hoping the gateway
follows — is how the two get out of step.

Dry by default, because this changes what somebody has paid for.
"""
import sys

from dotenv import load_dotenv

load_dotenv()


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    confirm = "--confirm" in sys.argv

    if len(args) != 1:
        print(__doc__)
        return 2

    reference = args[0]

    try:
        import database
        import payments
    except Exception as e:  # noqa: BLE001
        print(f"Could not open the database: {e}")
        return 1

    if database.use_mock:
        print("This machine is on the local SQLite mock. A refund recorded here")
        print("reaches nobody. Point it at the real database first.")
        return 1

    rows = database.supabase.table("payments").select("*").eq(
        "reference", reference).execute().data or []
    if not rows:
        print(f"No payment with reference {reference}.")
        return 1

    p = rows[0]
    users = database.supabase.table("users").select("*").eq(
        "id", p.get("user_id")).execute().data or []
    who = (users[0] if users else {}).get("email", "(account deleted)")

    print(f"\n  reference   {p.get('reference')}")
    print(f"  account     {who}")
    print(f"  plan        {p.get('tier')} via {p.get('provider')}")
    print(f"  amount      {p.get('amount')} {str(p.get('currency')).upper()}")
    print(f"  status      {p.get('status')}")
    if users:
        print(f"  expires     {users[0].get('subscription_expires_at')}")

    if not confirm:
        print("\nNothing changed. Re-run with --confirm to record the refund.")
        print("Refund the money in the gateway's own dashboard first — this")
        print("records the consequence, it does not move anything.")
        return 0

    result = payments.refund(reference)
    print("\n  " + result.get("reason", ""))
    if result.get("expires_at"):
        print(f"  expires now {result['expires_at']}")
        print("  reads as    " + ("free" if result.get("reads_as_free")
                                  else f"still {p.get('tier')} until then"))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
