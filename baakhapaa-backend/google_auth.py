"""Google sign-in — verifying that the person is who Google says they are.

The browser runs Google Identity Services, receives a signed ID token, and
POSTs it here. That token is the entire basis for creating or opening an
account, so the one rule this module exists to enforce is that **nothing in it
is trusted until the signature checks out**. An ID token is a JWT anybody can
mint the unsigned shape of; the email inside one is worth exactly as much as
its signature.

`verify_oauth2_token` does four things that all matter, and doing any of them
by hand is how this goes wrong:

  * checks the RS256 signature against Google's published keys, refreshing and
    caching them, so a forged token fails
  * checks `aud` equals our client id — without it, a token minted for a
    *different* application would be accepted here, which is the classic
    confused-deputy hole in "just decode the JWT" implementations
  * checks `iss` is Google
  * checks `exp`, with a little clock skew

Chosen over the authorisation-code redirect flow because this is a single-page
app: the ID token flow needs no client secret in the browser, no callback
route, and no session round trip. The trade is that the token arrives from the
client rather than from Google directly, which is exactly why the verification
above is not optional.
"""
import os

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

# The Web client id from the Google Cloud console. Unset means this deployment
# simply does not offer Google sign-in — see `is_configured`. There is no
# sandbox tier here the way there is for the payment gateways: a client id is
# free and self-service, so a simulated Google would prove nothing that the
# real one does not prove more cheaply.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()

# Google's own tolerance recommendation for server clock drift.
CLOCK_SKEW_SECONDS = 10


class GoogleAuthError(Exception):
    """The token did not check out. The message is safe to show a user."""


def is_configured() -> bool:
    """Whether this deployment can offer Google sign-in at all.

    The frontend asks before drawing the button, so an unconfigured deployment
    shows no Google option rather than a button that fails on click.
    """
    return bool(GOOGLE_CLIENT_ID)


def verify_id_token(credential: str) -> dict:
    """Verify a Google ID token and return the claims worth acting on.

    Raises `GoogleAuthError` for anything that fails, which the route turns
    into a 401. Every return path here has passed signature, audience, issuer
    and expiry.
    """
    if not is_configured():
        raise GoogleAuthError("Google sign-in is not configured on this server.")
    if not credential or not isinstance(credential, str):
        raise GoogleAuthError("No Google credential was supplied.")

    try:
        claims = google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=CLOCK_SKEW_SECONDS,
        )
    except ValueError as exc:
        # Covers a bad signature, the wrong audience, an expired token and a
        # malformed one. Deliberately not echoed back to the caller: the detail
        # helps an attacker tune a forgery and means nothing to a user.
        raise GoogleAuthError("Could not verify that Google sign-in.") from exc

    # Belt and braces. `verify_oauth2_token` checks the issuer, but this is the
    # claim that decides which account gets opened, so it is worth being
    # explicit about rather than inheriting.
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise GoogleAuthError("Could not verify that Google sign-in.")

    email = (claims.get("email") or "").strip().lower()
    if not email:
        raise GoogleAuthError("That Google account has no email address.")

    # The one claim that governs account linking. A Google Workspace admin can
    # create an account for an address they have not proven they control, so an
    # unverified email must never be allowed to open — or attach itself to — an
    # account that already exists here under that address.
    if not claims.get("email_verified"):
        raise GoogleAuthError(
            "That Google account's email address is not verified, so it cannot "
            "be used to sign in."
        )

    subject = claims.get("sub")
    if not subject:
        raise GoogleAuthError("Could not verify that Google sign-in.")

    return {
        # Google's stable, never-reused identifier for the account. The email
        # can change; this does not, which is why it is what we store.
        "sub": subject,
        "email": email,
        # Falls back to the local part rather than leaving the account nameless,
        # since `name` is optional in the token and `users.name` is NOT NULL.
        "name": (claims.get("name") or "").strip() or email.split("@")[0],
    }
