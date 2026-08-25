"""Renewal reminders.

The in-app notice only reaches a writer who opens the app, and the writer who
most needs telling is the one who has not opened it in three weeks. These cover
the two rules that make the mail-out safe to run on a cron: a Stripe
subscriber is never told their plan is ending, and nobody is told twice.
"""
import datetime
import json

import mailer
import renewals


def _iso(days):
    return (datetime.datetime.now(datetime.timezone.utc)
            + datetime.timedelta(days=days)).isoformat()


def _user(**over):
    base = {
        "id": "u1", "email": "writer@example.com", "name": "Prerana Shrestha",
        "subscription_tier": "pro", "subscription_expires_at": _iso(3),
        "renewal_notices_json": None,
    }
    base.update(over)
    return base


# ---------------------------------------------------------------------------
# Who is owed a reminder
# ---------------------------------------------------------------------------
def test_a_plan_ending_this_week_is_owed_a_warning():
    assert renewals.due(_user(subscription_expires_at=_iso(3))) == renewals.BEFORE


def test_a_plan_with_a_month_left_is_left_alone():
    assert renewals.due(_user(subscription_expires_at=_iso(25))) is None


def test_a_lapsed_plan_is_owed_the_other_message():
    assert renewals.due(_user(subscription_expires_at=_iso(-2))) == renewals.AFTER


def test_a_stripe_subscriber_is_never_reminded():
    """A NULL expiry means Stripe owns the renewal. Telling those users their
    plan is about to end would be telling them something untrue."""
    assert renewals.due(_user(subscription_expires_at=None)) is None


def test_a_free_account_is_never_reminded():
    assert renewals.due(_user(subscription_tier="free")) is None


# ---------------------------------------------------------------------------
# Nobody is told twice
# ---------------------------------------------------------------------------
def test_a_warning_already_sent_is_not_repeated():
    stamp = _iso(3)
    already = json.dumps({renewals.BEFORE: stamp})
    assert renewals.due(
        _user(subscription_expires_at=stamp, renewal_notices_json=already)
    ) is None


def test_lapsing_after_a_renewal_is_a_new_reminder():
    """Keyed by the expiry date, not a flag: a writer who renews and lapses
    again months later is a different lapse and must be told again."""
    old_stamp = _iso(-40)
    now_stamp = _iso(-1)
    already = json.dumps({renewals.AFTER: old_stamp})
    assert renewals.due(
        _user(subscription_expires_at=now_stamp, renewal_notices_json=already)
    ) == renewals.AFTER


def test_a_corrupt_log_does_not_swallow_the_reminder():
    """Sending one extra mail is a far smaller failure than never sending."""
    assert renewals.due(
        _user(renewal_notices_json="{not json")
    ) == renewals.BEFORE


# ---------------------------------------------------------------------------
# What the writer reads
# ---------------------------------------------------------------------------
def test_the_warning_says_it_will_not_renew_itself():
    user = _user()
    expires = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=3)
    subject, body = renewals.message(renewals.BEFORE, user, expires)
    assert "ends in 3 days" in subject
    assert "will not renew by itself" in body
    # And that nothing will be taken without them choosing to.
    assert "charged to you unless you choose" in body


def test_the_lapsed_message_leads_with_the_work_being_safe():
    """The fear on reading "your plan has ended" is that the scripts are gone."""
    user = _user(subscription_expires_at=_iso(-1))
    expires = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)
    _subject, body = renewals.message(renewals.AFTER, user, expires)
    assert "Your work is safe" in body
    assert "Nothing has been deleted" in body


def test_it_uses_a_first_name_not_the_whole_row():
    _subject, body = renewals.message(
        renewals.BEFORE, _user(),
        datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=3),
    )
    assert "Hi Prerana," in body
    assert "Shrestha" not in body


# ---------------------------------------------------------------------------
# The mailer itself
# ---------------------------------------------------------------------------
def test_an_unconfigured_mailer_reports_failure_rather_than_pretending(monkeypatch, capsys):
    """A mailer that silently 'succeeds' while delivering nothing is worse than
    one that is obviously off — nobody would ever learn nobody was told."""
    monkeypatch.delenv("SMTP_HOST", raising=False)
    assert mailer.configured() is False
    assert mailer.send("writer@example.com", "Subject", "Body") is False
    assert "MAIL NOT SENT" in capsys.readouterr().out


def test_a_send_failure_does_not_raise(monkeypatch):
    """One bad address must not take down the job sending the other twenty."""
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("MAIL_FROM", "hello@baakhapaa.com")

    def explode(*a, **k):
        raise OSError("connection refused")

    monkeypatch.setattr("smtplib.SMTP", explode)
    assert mailer.send("writer@example.com", "Subject", "Body") is False


def test_a_dry_run_sends_nothing(monkeypatch, client, make_user):
    """The first thing anyone will do with a mail-out is check who it targets
    without actually mailing them."""
    sent = []
    monkeypatch.setattr(mailer, "send", lambda *a, **k: sent.append(a) or True)

    user = make_user("pro")
    from database import supabase
    supabase.table("users").update(
        {"subscription_expires_at": _iso(2)}
    ).eq("id", user["id"]).execute()

    tally = renewals.run(dry_run=True)
    assert tally[renewals.BEFORE] >= 1
    assert sent == []


def test_the_countdown_rounds_rather_than_floors():
    """`timedelta.days` truncates. An expiry three days out, read a fraction of
    a second later, is 2 days 23:59:59.99 — and floor turns that into "2 days".
    The mail exists to be trusted about exactly this number, and a person
    reading it thinks in whole days."""
    user = _user()
    almost_three = (
        datetime.datetime.now(datetime.timezone.utc)
        + datetime.timedelta(days=3)
        - datetime.timedelta(milliseconds=50)
    )
    subject, _body = renewals.message(renewals.BEFORE, user, almost_three)
    assert "ends in 3 days" in subject
