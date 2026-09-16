"""The in-app notice has to come before the email, and nothing enforced it.

Day 17 asks for exactly one thing this file can answer: *confirm the in-app
notice appears before the email does*. It did not. Both windows were seven
days — `renewals.WARN_DAYS` here and `WARN_WITHIN_DAYS` in
`PlanNotice.jsx` — written months apart, in two languages, with nothing
connecting them. They fired on the same day and which one a writer met first
was a race between opening the app and the cron running.

That ordering is not cosmetic. A writer who uses the product should learn that
their plan is ending *from the product*. The email exists for the person the
banner cannot reach — someone who has not opened the app in three weeks — and
an email that arrives first turns a normal month-ending into something that
looks like it came out of nowhere.

This is the same guard `test_pattern_schema.py` and `test_project_columns.py`
use: read the other file as text and compare it against the code here. It
needs no browser and no server, and it is the only place in the repository
where these two numbers are compared at all.
"""
import io
import os
import re

import renewals

JSX = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "baakhapaa-frontend", "src", "components", "PlanNotice.jsx",
)


def _in_app_days() -> int:
    src = io.open(JSX, encoding="utf-8").read()
    m = re.search(r"WARN_WITHIN_DAYS\s*=\s*(\d+)", src)
    assert m, "PlanNotice.jsx no longer declares WARN_WITHIN_DAYS"
    return int(m.group(1))


def test_the_banner_warns_before_the_mailer_does():
    in_app, mailed = _in_app_days(), renewals.WARN_DAYS

    assert in_app > mailed, (
        f"the in-app notice warns at {in_app} days and the email at {mailed}. "
        "They must not be equal: a writer should hear it from the product "
        "first, and the email is for the person who is not opening the "
        "product at all."
    )


def test_there_is_a_real_gap_rather_than_a_single_day():
    """One day of margin is the same race with extra steps — the cron runs on
    its own schedule and a writer opens the app on theirs."""
    assert _in_app_days() - renewals.WARN_DAYS >= 5


def test_the_mailer_window_is_still_configurable():
    """`RENEWAL_WARN_DAYS` moves the email. If someone raises it past the
    banner this test keeps passing and the one above starts failing, which is
    the right way round — the failure names the ordering, not the setting."""
    assert isinstance(renewals.WARN_DAYS, int)
    assert renewals.WARN_DAYS > 0


def test_the_banner_is_exported_so_this_can_keep_reading_it():
    """A regex over source is fragile by nature. Pinning the export means the
    frontend has a reason not to quietly make it a local const again."""
    src = io.open(JSX, encoding="utf-8").read()

    assert "export const WARN_WITHIN_DAYS" in src
