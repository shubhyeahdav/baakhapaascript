"""Khalti e-Payment (API v2).

The flow is two server calls with a browser trip between them:

  1. POST /epayment/initiate/ — we describe the purchase, Khalti returns a
     `pidx` and a `payment_url`. We send the user to that URL.
  2. The user pays; Khalti redirects to our `return_url` carrying `pidx`,
     `status`, `transaction_id`, `purchase_order_id` and the amounts.
  3. POST /epayment/lookup/ — we ask Khalti what actually happened.

Step 3 is not optional and is not a formality. The redirect in step 2 also
carries `status=Completed`, and that string arrives through the user's browser.
Only the lookup response is evidence.

Hosts (docs.khalti.com, checked 2026-08-20):
  sandbox  https://dev.khalti.com/api/v2/   keys from test-admin.khalti.com
  live     https://khalti.com/api/v2/       keys from admin.khalti.com

With no `KHALTI_SECRET_KEY`, this falls back to the sandbox key Khalti prints in
its own documentation samples, so the redirect genuinely reaches Khalti's test
payment page rather than looping back to us. Read the caveat on
`_DOC_SANDBOX_KEY` before relying on it.

Sandbox payer credentials, from the same docs: Khalti ID 9800000000-5,
MPIN 1111, OTP 987654. E-banking and card are not available in the test
environment - only the wallet path completes.
"""
import os

import httpx

import payments

DISPLAY_NAME = "Khalti"
DESCRIPTION = "Khalti wallet, mobile banking, connectIPS or card"
DEMO_HINT = "Set PAYMENT_SANDBOX=true to reach Khalti's sandbox"

_LIVE_BASE = "https://khalti.com/api/v2"
_SANDBOX_BASE = "https://dev.khalti.com/api/v2"

# How long to wait on Khalti before giving up. A gateway that has not answered
# in 15s has failed for this user regardless of what it does next.
TIMEOUT = float(os.getenv("KHALTI_TIMEOUT", "15"))

# The key Khalti prints in every code sample in its own public documentation
# (PHP, Python, C#, Node). It is a sandbox credential and cannot move real
# money, which is what makes it usable as a fallback: without it, this provider
# could only ever simulate, and a simulation proves nothing about the request
# shape, the auth header or the redirect.
#
# Two caveats, and they are the reason this is a fallback rather than a default
# anyone should ship on. Unlike eSewa's EPAYTEST, Khalti does not *designate*
# this as a shared public test credential - it is a documentation sample, so it
# may be rotated or disabled without notice, and any sandbox payment made with
# it lands in whichever test merchant account owns it. Get your own from
# test-admin.khalti.com and set KHALTI_SECRET_KEY before you rely on any of it.
_DOC_SANDBOX_KEY = "live_secret_key_68791341fdd94846a146f0457ff7b455"


def _own_key() -> str:
    key = (os.getenv("KHALTI_SECRET_KEY") or "").strip()
    # `.env.example` ships an empty value and people paste placeholders into it.
    return "" if not key or key.startswith("your-") else key


def _secret() -> str:
    return _own_key() or _DOC_SANDBOX_KEY


def mode() -> str:
    if _own_key():
        if os.getenv("KHALTI_ENV", "sandbox").strip().lower() == "live":
            return payments.LIVE
        return payments.SANDBOX
    # No key of our own: the documentation sandbox key, unless someone has
    # deliberately asked for the offline simulation. It can never be live -
    # KHALTI_ENV is ignored here, because pointing a sample key at production
    # would turn "no merchant account" into an opaque 401.
    return payments.SANDBOX if payments.sandbox_default() else payments.DEMO


def configured() -> bool:
    return mode() != payments.DEMO


def base_url() -> str:
    # Defaulting to the sandbox host matters: a misconfigured deploy that
    # defaulted live would take real money from real people while being tested.
    return _LIVE_BASE if mode() == payments.LIVE else _SANDBOX_BASE


def _headers() -> dict:
    return {"Authorization": f"Key {_secret()}", "Content-Type": "application/json"}


def reference_from(params: dict) -> str | None:
    """Khalti echoes our `purchase_order_id` back on the redirect, so the
    reference arrives for free. `pidx` is the fallback the caller uses when it
    does not."""
    return params.get("purchase_order_id") or params.get("reference")


def _explain(response: httpx.Response) -> str:
    """Khalti's error bodies name the offending field — `{"amount": ["..."]}`
    or `{"detail": "..."}`. The status code alone says nothing useful, and this
    is the message someone will be staring at when a key or an amount is wrong.
    """
    try:
        body = response.json()
    except ValueError:
        return response.text[:300]
    if isinstance(body, dict):
        if "detail" in body:
            return str(body["detail"])
        parts = [
            f"{field}: {'; '.join(msgs) if isinstance(msgs, list) else msgs}"
            for field, msgs in body.items()
        ]
        if parts:
            return " | ".join(parts)[:300]
    return str(body)[:300]


def _post(path: str, payload: dict) -> httpx.Response:
    """One retry on a transport error, none on an HTTP status.

    A refused connection or a dropped socket says nothing about whether the
    payment happened, and it is worth one more try. A 400 is Khalti telling us
    something definite, and repeating it would only produce the same answer.
    """
    url = f"{base_url()}{path}"
    last = None
    for _attempt in range(2):
        try:
            return httpx.post(url, json=payload, headers=_headers(), timeout=TIMEOUT)
        except httpx.TransportError as e:
            last = e
    raise RuntimeError(f"Could not reach Khalti at {url}: {last}")


def initiate(record: dict, origin: str, user: dict) -> dict:
    if mode() == payments.DEMO:
        # No credentials: loop back to our own return URL. Same shape, no
        # network, no money — and labelled as a simulation in the UI.
        return {
            "kind": "redirect",
            "url": f"{payments.return_url('khalti', origin)}"
                   f"?reference={record['reference']}&demo=1",
            "provider_ref": f"demo-{record['reference']}",
            "demo": True,
        }

    payload = {
        # No query string of our own: Khalti appends its own parameters, and a
        # return URL that already carries one is where that goes wrong.
        "return_url": payments.return_url("khalti", origin),
        "website_url": origin,
        "amount": int(record["amount"]),  # paisa
        "purchase_order_id": record["reference"],
        "purchase_order_name": f"Baakhapaa {record['tier'].capitalize()} - 1 month",
        "customer_info": {
            "name": user.get("name") or "Baakhapaa user",
            "email": user.get("email") or "",
        },
    }

    res = _post("/epayment/initiate/", payload)
    if res.status_code >= 400:
        raise RuntimeError(f"Khalti rejected the payment - {_explain(res)}")

    data = res.json()
    if not data.get("payment_url"):
        raise RuntimeError(f"Khalti returned no payment_url: {str(data)[:300]}")

    return {
        "kind": "redirect",
        "url": data["payment_url"],
        "provider_ref": data.get("pidx"),
        "demo": False,
    }


# Khalti's own vocabulary. "Initiated" and "Pending" mean not-yet, which is a
# different thing from no — and treating them as failure would tell a user their
# payment failed while the money was in flight.
_NOT_YET = {"pending", "initiated"}


def verify(record: dict, params: dict) -> dict:
    if mode() == payments.DEMO:
        return {"paid": True, "amount": record["amount"],
                "provider_ref": record.get("provider_ref") or "demo"}

    pidx = params.get("pidx") or record.get("provider_ref")
    if not pidx:
        return {"paid": False, "status": "failed",
                "detail": "Khalti did not return a payment id."}

    try:
        res = _post("/epayment/lookup/", {"pidx": pidx})
        if res.status_code >= 400:
            return {"paid": False, "status": "pending",
                    "detail": f"Khalti could not confirm this payment - {_explain(res)}"}
        data = res.json()
    except Exception as e:
        # Deliberately not marked failed: an unreachable gateway says nothing
        # about whether the user paid, and the row stays pending for a retry.
        return {"paid": False, "status": "pending",
                "detail": f"Could not confirm with Khalti: {e}"}

    status = (data.get("status") or "").lower()
    if status != "completed":
        return {
            "paid": False,
            "status": "pending" if status in _NOT_YET else "failed",
            "detail": f"Khalti reports the payment as {data.get('status') or 'unknown'}.",
        }

    return {
        "paid": True,
        "amount": data.get("total_amount"),
        "provider_ref": data.get("transaction_id") or pidx,
    }
