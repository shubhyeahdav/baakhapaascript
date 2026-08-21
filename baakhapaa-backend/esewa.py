"""eSewa ePay v2.

eSewa does not have an API that creates a checkout session. It takes a **browser
form POST**, signed with HMAC-SHA256 over an exactly-ordered subset of the
fields. That is why `initiate` returns fields for the frontend to submit rather
than a URL to redirect to — the signature covers form values, so the browser has
to be the thing that sends them.

The signed string is literally `total_amount=X,transaction_uuid=Y,product_code=Z`
in that order, with no spaces. Order and spacing are part of the signature; get
either wrong and eSewa returns a signature error that names neither.

On return, eSewa hands back a base64 JSON blob in `?data=`. We check its
signature and then call the status API anyway, because a signature proves the
blob came from eSewa and the status call proves the money moved.

Hosts (developer.esewa.com.np/pages/Epay-V2, checked 2026-08-20):
  sandbox  form https://rc-epay.esewa.com.np/api/epay/main/v2/form
           status https://rc.esewa.com.np/api/epay/transaction/status/
  live     form https://epay.esewa.com.np/api/epay/main/v2/form
           status https://epay.esewa.com.np/api/epay/transaction/status/

eSewa publishes its UAT credentials for exactly this purpose, so with no keys
configured this provider runs against the **real sandbox** rather than a local
simulation — the request shape, the signature and the redirect are all genuinely
exercised. `PAYMENT_SANDBOX=false` drops back to the simulation for CI and
offline work.

Amounts here are **rupees**, not paisa — eSewa is the one gateway of the three
that wants the major unit, so every amount crossing this boundary is divided by
100 and multiplied back on the way in.
"""
import base64
import hashlib
import hmac
import json
import os

import httpx

import payments

DISPLAY_NAME = "eSewa"
DESCRIPTION = "eSewa wallet — Nepal's most widely held digital wallet"
DEMO_HINT = "Set PAYMENT_SANDBOX=true to reach eSewa's sandbox"

_LIVE_FORM = "https://epay.esewa.com.np/api/epay/main/v2/form"
_TEST_FORM = "https://rc-epay.esewa.com.np/api/epay/main/v2/form"
_LIVE_STATUS = "https://epay.esewa.com.np/api/epay/transaction/status/"
_TEST_STATUS = "https://rc.esewa.com.np/api/epay/transaction/status/"

# Published by eSewa in its own integration docs as the UAT merchant pair. Not a
# secret, and not usable against the live host — its only purpose is to let an
# integration be built and proven before a merchant account exists.
# Sandbox login for the payer side: 9806800001-5 / Nepal@123, token 123456.
_UAT_PRODUCT_CODE = "EPAYTEST"
_UAT_SECRET = "8gBm/:&EnhH.1/q"

TIMEOUT = float(os.getenv("ESEWA_TIMEOUT", "15"))

# The order is the contract. Do not sort, do not reorder.
_SIGNED_FIELDS = ("total_amount", "transaction_uuid", "product_code")


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def _has_own_keys() -> bool:
    code, key = _env("ESEWA_PRODUCT_CODE"), _env("ESEWA_SECRET_KEY")
    return bool(code and key) and not key.startswith("your-")


def mode() -> str:
    if _has_own_keys():
        return payments.LIVE if _env("ESEWA_ENV").lower() == "live" else payments.SANDBOX
    # No keys of our own: use eSewa's published UAT pair against its test host,
    # unless someone has deliberately asked for the offline simulation.
    return payments.SANDBOX if payments.sandbox_default() else payments.DEMO


def configured() -> bool:
    return mode() != payments.DEMO


def _product_code() -> str:
    return _env("ESEWA_PRODUCT_CODE") if _has_own_keys() else _UAT_PRODUCT_CODE


def _secret() -> str:
    return _env("ESEWA_SECRET_KEY") if _has_own_keys() else _UAT_SECRET


def form_url() -> str:
    return _LIVE_FORM if mode() == payments.LIVE else _TEST_FORM


def status_url() -> str:
    return _LIVE_STATUS if mode() == payments.LIVE else _TEST_STATUS


def sign(fields: dict) -> str:
    """HMAC-SHA256 over `k=v,k=v,k=v` in `_SIGNED_FIELDS` order, base64'd."""
    message = ",".join(f"{k}={fields[k]}" for k in _SIGNED_FIELDS)
    digest = hmac.new(_secret().encode(), message.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def _rupees(paisa: int) -> str:
    """eSewa wants the major unit. Two decimals kept because the signature is
    over the literal string — '999' and '999.0' are different signatures."""
    return f"{int(paisa) / 100:.2f}"


def reference_from(params: dict) -> str | None:
    """Our `transaction_uuid` is the reference. It arrives either directly or
    inside the base64 `data` blob, depending on how the frontend forwards it."""
    if params.get("transaction_uuid"):
        return params["transaction_uuid"]
    decoded = decode_data(params.get("data"))
    return decoded.get("transaction_uuid") if decoded else None


def decode_data(blob: str | None) -> dict | None:
    if not blob:
        return None
    try:
        # eSewa's base64 sometimes arrives without its padding.
        padded = blob + "=" * (-len(blob) % 4)
        return json.loads(base64.b64decode(padded).decode())
    except Exception:
        return None


def initiate(record: dict, origin: str, user: dict) -> dict:
    total = _rupees(record["amount"])
    # No query string of our own. eSewa appends `?data=<base64>` and its docs do
    # not say what it does when the URL already carries one — so we never give
    # it one. Both outcomes land here and the gateway decides which it was;
    # trusting *which URL we arrived at* would be trusting the browser.
    ret = payments.return_url("esewa", origin)

    if mode() == payments.DEMO:
        return {
            "kind": "redirect",
            "url": f"{ret}?reference={record['reference']}&demo=1",
            "demo": True,
        }

    fields = {
        "amount": total,
        "tax_amount": "0",
        "total_amount": total,
        "transaction_uuid": record["reference"],
        "product_code": _product_code(),
        "product_service_charge": "0",
        "product_delivery_charge": "0",
        "success_url": ret,
        "failure_url": ret,
        "signed_field_names": ",".join(_SIGNED_FIELDS),
    }
    fields["signature"] = sign(fields)

    return {"kind": "form_post", "action": form_url(), "fields": fields, "demo": False}


def _signature_ok(decoded: dict) -> bool:
    """Verify eSewa's own signature on the returned blob.

    eSewa signs a *different* field list on the way back and names it in
    `signed_field_names`, so the list is read from the payload rather than
    assumed — assuming it is how this check silently passes on everything.
    """
    signed = decoded.get("signed_field_names")
    provided = decoded.get("signature")
    if not signed or not provided:
        return False
    message = ",".join(f"{k}={decoded.get(k, '')}" for k in signed.split(","))
    expected = base64.b64encode(
        hmac.new(_secret().encode(), message.encode(), hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(expected, provided)


# eSewa's own vocabulary. PENDING and AMBIGUOUS are not-yet rather than no.
_NOT_YET = {"PENDING", "AMBIGUOUS"}


def verify(record: dict, params: dict) -> dict:
    if mode() == payments.DEMO:
        return {"paid": True, "amount": record["amount"], "provider_ref": "demo"}

    decoded = decode_data(params.get("data")) or {}
    if decoded and not _signature_ok(decoded):
        return {"paid": False, "status": "failed",
                "detail": "The eSewa response did not carry a valid signature."}

    # The status API is authoritative regardless of what the blob said. One
    # retry on a transport error: a dropped socket says nothing about whether
    # the user paid, and this is the call that decides.
    query = {
        "product_code": _product_code(),
        "total_amount": _rupees(record["amount"]),
        "transaction_uuid": record["reference"],
    }
    data, last = None, None
    for _ in range(2):
        try:
            res = httpx.get(status_url(), timeout=TIMEOUT, params=query)
            res.raise_for_status()
            data = res.json()
            break
        except Exception as e:
            last = e
    if data is None:
        return {"paid": False, "status": "pending",
                "detail": f"Could not confirm with eSewa: {last}"}

    status = (data.get("status") or "").upper()
    if status != "COMPLETE":
        return {
            "paid": False,
            "status": "pending" if status in _NOT_YET else "failed",
            "detail": f"eSewa reports the payment as {data.get('status') or 'unknown'}.",
        }

    # Back to paisa for the shared amount check in payments.verify.
    total = data.get("total_amount")
    amount = int(round(float(total) * 100)) if total is not None else None

    return {"paid": True, "amount": amount, "provider_ref": data.get("ref_id")}
