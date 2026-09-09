"""Remove the throwaway accounts that testing left in the real database.

Two days of responsive-audit and probe runs registered accounts and created
projects while every document in the repo said the app was in demo mode writing
to a local SQLite file. It was not: `.env` holds real Supabase credentials, so
`database.use_mock` is False and all of it went into the real Postgres.

This deletes only addresses matching the generated shapes those scripts used,
and only at `@example.com`. Anything else — including a real account that merely
looks disposable — is left alone. Deletion goes through `auth.purge_user`, the
same path the account-deletion route uses, so projects, scripts, versions,
comments, storyboard frames and invites go with the user instead of becoming
orphaned rows.

Dry run by default, because this is a production database:

    ./venv/Scripts/python purge_test_accounts.py            # list, change nothing
    ./venv/Scripts/python purge_test_accounts.py --delete   # actually remove

Exits non-zero if it could not reach the database.
"""
import re
import sys

# The generators used by scripts/responsive-audit.mjs, editor-load-race.mjs and
# the various one-off probes. Anchored, and `@example.com` only.
THROWAWAY = re.compile(
    r"^(?:probe-\d+|local-deploy|ui-check|audit-\d+|[msp]-\d+)@example\.com$"
)


def main():
    delete = "--delete" in sys.argv

    try:
        from database import supabase
        import database
    except Exception as e:                                    # noqa: BLE001
        print(f"Could not open the database: {e}")
        return 1

    if database.use_mock:
        print("This is the mock/SQLite store, not the real database — nothing to do.")
        print("Delete baakhapaa_local.db instead if you want a clean local slate.")
        return 0

    rows = supabase.table("users").select("id,email,created_at").execute().data or []
    doomed = [r for r in rows if THROWAWAY.match((r.get("email") or "").strip().lower())]
    keep = len(rows) - len(doomed)

    print(f"{len(rows)} accounts in the real database")
    print(f"  {len(doomed)} match the throwaway pattern")
    print(f"  {keep} do not, and will not be touched")
    if not doomed:
        return 0

    print()
    for r in sorted(doomed, key=lambda r: r.get("created_at") or ""):
        print(f"  {r['email']:<44} {r.get('created_at', '')}")

    if not delete:
        print("\nDry run. Re-run with --delete to remove these.")
        return 0

    # Belt and braces: never proceed if anything outside example.com crept in.
    stray = [r["email"] for r in doomed if not r["email"].lower().endswith("@example.com")]
    if stray:
        print(f"\nRefusing: {stray} is not an @example.com address.")
        return 1

    from auth import purge_user

    print()
    failed = 0
    for r in doomed:
        try:
            removed = purge_user(r["id"])
            print(f"  removed {r['email']}  {removed if removed else ''}")
        except Exception as e:                                # noqa: BLE001
            failed += 1
            print(f"  FAILED  {r['email']}: {type(e).__name__}: {str(e)[:90]}")

    left = supabase.table("users").select("id").execute().data or []
    print(f"\n{len(doomed) - failed} removed, {failed} failed. {len(left)} accounts remain.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
