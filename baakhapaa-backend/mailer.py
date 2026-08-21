"""Outbound email.

There is exactly one thing this needs to send today: a reminder that a plan is
about to lapse. That reminder is the half of the renewal problem the in-app
notice cannot solve — `PlanNotice` only reaches a writer who opens the app, and
the writer who most needs telling is the one who has not opened it in a while.

Plain SMTP rather than a provider SDK. Every transactional mail service speaks
it, so this works with whatever account gets set up without a code change and
without a vendor decision being baked in now.

**With no credentials configured this sends nothing and says so.** It does not
raise, and it does not pretend. A mailer that silently succeeds while
delivering nothing is worse than one that is obviously switched off — the whole
point of the reminder is that somebody finds out, and a fake success would mean
nobody ever learns that nobody was told.
"""
import os
import smtplib
import ssl
from email.message import EmailMessage


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def config() -> dict:
    return {
        "host": _env("SMTP_HOST"),
        "port": int(_env("SMTP_PORT", "587") or 587),
        "user": _env("SMTP_USER"),
        "password": _env("SMTP_PASSWORD"),
        "from_address": _env("MAIL_FROM") or _env("SMTP_USER"),
        "from_name": _env("MAIL_FROM_NAME", "Baakhapaa"),
    }


def configured() -> bool:
    c = config()
    return bool(c["host"] and c["from_address"])


def send(to_address: str, subject: str, body: str) -> bool:
    """Send one plain-text message. Returns whether it actually went.

    Never raises: a reminder that fails to send must not take down the job that
    is sending the other twenty.
    """
    if not configured():
        print(f"MAIL NOT SENT (no SMTP_HOST configured): {subject} -> {to_address}")
        return False
    if not to_address:
        return False

    c = config()
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{c['from_name']} <{c['from_address']}>"
    message["To"] = to_address
    message.set_content(body)

    try:
        # 465 is implicit TLS; everything else gets STARTTLS. Sending a
        # password over an unencrypted connection is not an option either way.
        if c["port"] == 465:
            with smtplib.SMTP_SSL(c["host"], c["port"], timeout=20,
                                  context=ssl.create_default_context()) as smtp:
                if c["user"]:
                    smtp.login(c["user"], c["password"])
                smtp.send_message(message)
        else:
            with smtplib.SMTP(c["host"], c["port"], timeout=20) as smtp:
                smtp.starttls(context=ssl.create_default_context())
                if c["user"]:
                    smtp.login(c["user"], c["password"])
                smtp.send_message(message)
        return True
    except Exception as e:
        print(f"MAIL FAILED ({subject} -> {to_address}): {e}")
        return False
