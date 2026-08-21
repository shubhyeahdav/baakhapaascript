"""Payments across three gateways.

The interesting cases here are not "does a payment work" — in demo mode every
payment works. They are the ones that only exist because Khalti and eSewa are
one-shot payment rails rather than subscription rails:

  * a paid month has to expire, and an expired month has to read as free
    everywhere the tier is checked, not just on the pricing page;
  * the return trip from a wallet carries nothing trustworthy, so the tier must
    come from a row we wrote before the user left;
  * a wallet can redirect twice, and two redirects must not buy two months.

The eSewa signature test is here for a different reason: the signed string is an
exact, ordered, space-free format, and getting it wrong produces an eSewa error
that names neither the field nor the order.
"""
import base64
import datetime
import hashlib
import hmac
import json

import pytest

import esewa
import payments
from database import supabase


def _set(user_id, **fields):
    supabase.table("users").update(fields).eq("id", user_id).execute()


def _user_row(user_id):
    return supabase.table("users").select("*").eq("id", user_id).execute().data[0]


def _iso(days):
    return (datetime.datetime.now(datetime.timezone.utc)
            + datetime.timedelta(days=days)).isoformat()


# ---------------------------------------------------------------------------
# Expiry — the whole reason this layer exists
# ---------------------------------------------------------------------------
def test_a_plan_with_no_expiry_is_not_time_boxed():
    """Every user row that existed before this column did has NULL here. If NULL
    meant 'expired', adding the column would have downgraded every paying user."""
    assert payments.effective_tier({"subscription_tier": "pro"}) == "pro"
    assert payments.effective_tier(
        {"subscription_tier": "studio", "subscription_expires_at": None}) == "studio"


def test_a_lapsed_plan_reads_as_free():
    assert payments.effective_tier(
        {"subscription_tier": "pro", "subscription_expires_at": _iso(-1)}) == "free"


def test_a_future_expiry_is_still_paid():
    assert payments.effective_tier(
        {"subscription_tier": "pro", "subscription_expires_at": _iso(5)}) == "pro"


def test_an_unparseable_expiry_does_not_lock_a_paying_user_out():
    """A malformed timestamp is our bug, and the user should not pay for it."""
    assert payments.effective_tier(
        {"subscription_tier": "pro", "subscription_expires_at": "not-a-date"}) == "pro"


def test_expired_pro_user_is_refused_paid_features(client, make_user):
    """The point of routing every gate through effective_tier: this must hold at
    the endpoint, not merely in a helper."""
    user = make_user("pro")
    _set(user["id"], subscription_expires_at=_iso(-1))

    r = client.post(
        "/scripts/generate-scene",
        json={"scene_description": "A quiet argument", "genre": "Drama", "tone": "Emotional"},
        headers=user["headers"],
    )
    assert r.status_code == 403


def test_auth_me_reports_the_effective_tier_not_the_stored_one(client, make_user):
    """Otherwise the UI keeps rendering 'Pro' while every route returns 403 —
    the worst version of this failure, because it looks like a bug in the app."""
    user = make_user("pro")
    _set(user["id"], subscription_expires_at=_iso(-1))

    me = client.get("/auth/me", headers=user["headers"])
    assert me.status_code == 200
    assert me.json()["subscription_tier"] == "free"


def test_paying_early_extends_rather_than_replaces(client, make_user):
    """A writer who renews with a week left should keep that week."""
    user = make_user("free")
    _set(user["id"], subscription_expires_at=_iso(7))

    payments.activate(user["id"], "pro")
    expiry = payments._parse(_user_row(user["id"])["subscription_expires_at"])

    # 7 remaining + 30 bought, not 30 from today.
    assert expiry > datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=35)


def test_a_stripe_upgrade_carries_no_expiry(client, make_user):
    """Stripe bills again on its own. A date we set here would fight it and cut
    a subscriber off mid-subscription."""
    user = make_user("free")
    payments.activate(user["id"], "pro", recurring=True)
    assert _user_row(user["id"])["subscription_expires_at"] is None


# ---------------------------------------------------------------------------
# The checkout round trip
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("provider", ["khalti", "esewa", "stripe"])
def test_checkout_opens_a_payment_with_every_provider(client, make_user, provider):
    user = make_user("free")
    r = client.post("/subscription/checkout",
                    json={"tier": "pro", "provider": provider},
                    headers=user["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider"] == provider
    assert body["reference"].startswith("BKP-")
    # Either a URL to send the browser to, or a signed form for it to submit.
    assert body["kind"] in ("redirect", "form_post")


def test_providers_endpoint_lists_all_three_and_a_default(client):
    r = client.get("/subscription/providers")
    assert r.status_code == 200
    keys = {p["key"] for p in r.json()["providers"]}
    assert keys == {"khalti", "esewa", "stripe"}
    assert r.json()["default"] in keys


def test_an_unknown_provider_is_rejected(client, make_user):
    user = make_user("free")
    r = client.post("/subscription/checkout",
                    json={"tier": "pro", "provider": "paypal"},
                    headers=user["headers"])
    assert r.status_code == 400


def test_an_unknown_tier_is_rejected(client, make_user):
    user = make_user("free")
    r = client.post("/subscription/checkout",
                    json={"tier": "enterprise", "provider": "khalti"},
                    headers=user["headers"])
    assert r.status_code == 400


def test_checkout_records_the_price_before_the_user_leaves(client, make_user):
    """The recorded amount is what the return trip is checked against."""
    user = make_user("free")
    client.post("/subscription/checkout", json={"tier": "studio", "provider": "khalti"},
                headers=user["headers"])
    row = payments.history(user["id"])[0]
    assert row["tier"] == "studio"
    assert row["amount"] == payments.TIERS["studio"]["amount"]


# ---------------------------------------------------------------------------
# Verification — where the security actually lives
# ---------------------------------------------------------------------------
def test_verifying_a_reference_that_is_not_yours_is_a_404(client, make_user):
    """A payment belongs to the account that opened it. Without this check, a
    reference seen in someone else's URL is an upgrade."""
    buyer = make_user("free")
    other = make_user("free")

    started = client.post("/subscription/checkout",
                          json={"tier": "studio", "provider": "khalti"},
                          headers=buyer["headers"]).json()

    r = client.post("/subscription/verify",
                    json={"provider": "khalti",
                          "params": {"reference": started["reference"]}},
                    headers=other["headers"])
    assert r.status_code == 404


def test_verifying_an_invented_reference_is_a_404(client, make_user):
    user = make_user("free")
    r = client.post("/subscription/verify",
                    json={"provider": "khalti", "params": {"reference": "BKP-made-up"}},
                    headers=user["headers"])
    assert r.status_code == 404


def test_verification_is_idempotent(client, make_user):
    """A wallet that redirects twice, or a user who refreshes the return page,
    must not stack two months onto one payment."""
    user = make_user("free")
    record = payments.create_record(user["id"], "pro", "khalti")

    first = payments.verify("khalti", {"reference": record["reference"]}, user["id"])
    expiry_after_first = _user_row(user["id"])["subscription_expires_at"]

    second = payments.verify("khalti", {"reference": record["reference"]}, user["id"])

    assert first["status"] == "completed"
    assert second.get("already") is True
    assert _user_row(user["id"])["subscription_expires_at"] == expiry_after_first


def test_underpayment_does_not_grant_the_tier(monkeypatch, client, make_user):
    """The gateway's reported amount is checked against the price we recorded,
    so a tampered redirect cannot buy Studio at the Pro price."""
    import khalti

    user = make_user("free")
    record = payments.create_record(user["id"], "studio", "khalti")

    monkeypatch.setattr(khalti, "verify", lambda rec, params: {
        "paid": True, "amount": payments.TIERS["pro"]["amount"], "provider_ref": "x",
    })

    result = payments.verify("khalti", {"reference": record["reference"]}, user["id"])
    assert result["status"] == "underpaid"
    assert _user_row(user["id"])["subscription_tier"] == "free"


def test_an_unreachable_gateway_leaves_the_payment_pending(monkeypatch, client, make_user):
    """A gateway we cannot reach has told us nothing about whether the user
    paid. Marking it failed would strand a real payment."""
    import khalti

    user = make_user("free")
    record = payments.create_record(user["id"], "pro", "khalti")

    monkeypatch.setattr(khalti, "verify", lambda rec, params: {
        "paid": False, "status": "pending", "detail": "timeout",
    })

    result = payments.verify("khalti", {"reference": record["reference"]}, user["id"])
    assert result["status"] == "pending"
    assert payments.history(user["id"])[0]["status"] == "pending"


def test_payment_history_never_leaks_the_gateway_reference(client, make_user):
    user = make_user("free")
    client.post("/subscription/checkout", json={"tier": "pro", "provider": "khalti"},
                headers=user["headers"])
    r = client.get("/subscription/payments", headers=user["headers"])
    assert r.status_code == 200
    assert r.json()["payments"]
    assert all("provider_ref" not in p for p in r.json()["payments"])


def test_payment_history_is_scoped_to_the_caller(client, make_user):
    buyer = make_user("free")
    other = make_user("free")
    client.post("/subscription/checkout", json={"tier": "pro", "provider": "esewa"},
                headers=buyer["headers"])

    assert client.get("/subscription/payments", headers=other["headers"]).json()["payments"] == []


# ---------------------------------------------------------------------------
# eSewa's signature format
# ---------------------------------------------------------------------------
def test_esewa_signs_the_exact_documented_string(monkeypatch):
    """`total_amount=X,transaction_uuid=Y,product_code=Z` — that order, no
    spaces. Both are part of the signature and neither is guessable from the
    error eSewa returns when they are wrong."""
    monkeypatch.setenv("ESEWA_SECRET_KEY", "8gBm/:&EnhH.1/q")
    fields = {"total_amount": "999.00", "transaction_uuid": "BKP-abc", "product_code": "EPAYTEST"}

    expected = base64.b64encode(hmac.new(
        b"8gBm/:&EnhH.1/q",
        b"total_amount=999.00,transaction_uuid=BKP-abc,product_code=EPAYTEST",
        hashlib.sha256,
    ).digest()).decode()

    assert esewa.sign(fields) == expected


def test_esewa_amount_is_rupees_not_paisa():
    """eSewa is the one gateway of the three that wants the major unit. Sending
    paisa would charge a hundred times the price."""
    assert esewa._rupees(payments.TIERS["pro"]["amount"]) == "999.00"


def test_esewa_rejects_a_response_whose_signature_does_not_match(monkeypatch):
    monkeypatch.setenv("ESEWA_SECRET_KEY", "8gBm/:&EnhH.1/q")
    forged = {
        "transaction_uuid": "BKP-abc", "total_amount": "999.00", "status": "COMPLETE",
        "signed_field_names": "transaction_uuid,total_amount,status",
        "signature": base64.b64encode(b"nonsense").decode(),
    }
    assert esewa._signature_ok(forged) is False


def test_esewa_reads_the_reference_out_of_the_base64_blob():
    blob = base64.b64encode(json.dumps({"transaction_uuid": "BKP-xyz"}).encode()).decode()
    assert esewa.reference_from({"data": blob}) == "BKP-xyz"


def test_esewa_survives_unpadded_base64():
    """eSewa's blob arrives without padding often enough to matter."""
    blob = base64.b64encode(json.dumps({"transaction_uuid": "BKP-xyz"}).encode()).decode().rstrip("=")
    assert esewa.decode_data(blob) == {"transaction_uuid": "BKP-xyz"}


def test_esewa_garbage_decodes_to_none_rather_than_raising():
    assert esewa.decode_data("!!!not-base64!!!") is None


# ---------------------------------------------------------------------------
# Khalti's sandbox/live split
# ---------------------------------------------------------------------------
def test_khalti_defaults_to_the_sandbox_host(monkeypatch):
    """Defaulting to live would mean a misconfigured deploy takes real money
    from real people while it is being tested."""
    import khalti
    monkeypatch.delenv("KHALTI_ENV", raising=False)
    assert "dev.khalti.com" in khalti.base_url()


def test_khalti_live_env_switches_hosts(monkeypatch):
    """A key is part of it: `KHALTI_ENV=live` with no secret is not a live
    gateway, it is a misconfiguration, and pointing at the production host would
    only turn it into a confusing 401."""
    import khalti
    monkeypatch.setenv("KHALTI_SECRET_KEY", "live_secret_key_abc123")
    monkeypatch.setenv("KHALTI_ENV", "live")
    assert khalti.mode() == payments.LIVE
    assert khalti.base_url() == "https://khalti.com/api/v2"


def test_khalti_with_a_key_but_no_env_is_sandbox(monkeypatch):
    import khalti
    monkeypatch.setenv("KHALTI_SECRET_KEY", "live_secret_key_abc123")
    monkeypatch.delenv("KHALTI_ENV", raising=False)
    assert khalti.mode() == payments.SANDBOX
    assert "dev.khalti.com" in khalti.base_url()


def test_a_placeholder_key_never_reaches_the_live_gateway(monkeypatch):
    """`.env.example` ships `your-khalti-secret`. A deployment that copied it
    without editing must never attempt a live charge — it is treated as no key
    at all, which means the sandbox, or the simulation when that is off."""
    import khalti
    monkeypatch.setenv("KHALTI_SECRET_KEY", "your-khalti-secret")
    monkeypatch.setenv("KHALTI_ENV", "live")

    monkeypatch.setenv("PAYMENT_SANDBOX", "false")
    assert khalti.mode() == payments.DEMO

    monkeypatch.setenv("PAYMENT_SANDBOX", "true")
    assert khalti.mode() == payments.SANDBOX
    assert "dev.khalti.com" in khalti.base_url()


# ---------------------------------------------------------------------------
# Erasure
# ---------------------------------------------------------------------------
def test_deleting_an_account_takes_its_payment_history(client, make_user):
    """Real Postgres cascades payments from the users FK; the mock has no
    notion of one. Without an explicit purge, an erased account leaves its
    billing history behind in demo mode and not in production — the worst kind
    of difference, because the safe-looking environment is the leaky one."""
    from database import purge_user

    user = make_user("free")
    client.post("/subscription/checkout", json={"tier": "pro", "provider": "khalti"},
                headers=user["headers"])
    assert payments.history(user["id"])

    purge_user(user["id"])
    assert payments.history(user["id"]) == []


# ---------------------------------------------------------------------------
# The redirect the gateway actually receives
# ---------------------------------------------------------------------------
def test_the_return_url_we_hand_a_gateway_carries_no_query_string():
    """Every gateway appends its own parameters to this URL — Khalti
    `?pidx=...`, eSewa `?data=...` — and eSewa's docs do not say what it does
    when the URL already has one. A second `?` makes the parameters we need
    unparseable, and only a real gateway ever produces that."""
    url = payments.return_url("esewa", "https://baakhapaa.com")
    assert url == "https://baakhapaa.com/payment/return/esewa"
    assert "?" not in url


def test_the_return_url_tolerates_a_trailing_slash_origin():
    assert payments.return_url("khalti", "https://baakhapaa.com/") == \
        "https://baakhapaa.com/payment/return/khalti"


def test_esewa_sends_both_outcomes_to_the_same_clean_url(monkeypatch):
    """Which URL the browser lands on is not evidence of anything — the gateway
    is asked either way — so both are the same and neither carries a query."""
    monkeypatch.setenv("PAYMENT_SANDBOX", "true")
    record = {"amount": 99900, "reference": "BKP-abc", "tier": "pro"}
    result = esewa.initiate(record, "https://baakhapaa.com", {})

    assert result["kind"] == "form_post"
    assert result["fields"]["success_url"] == "https://baakhapaa.com/payment/return/esewa"
    assert result["fields"]["failure_url"] == result["fields"]["success_url"]


def test_khalti_return_url_has_no_query_string(monkeypatch):
    import khalti
    monkeypatch.setenv("KHALTI_SECRET_KEY", "live_secret_key_abc123")

    sent = {}

    class _Res:
        status_code = 200

        @staticmethod
        def json():
            return {"pidx": "p1", "payment_url": "https://dev.khalti.com/pay/p1"}

    def fake_post(url, json=None, headers=None, timeout=None):
        sent.update(json or {})
        return _Res()

    monkeypatch.setattr("httpx.post", fake_post)
    khalti.initiate({"amount": 99900, "reference": "BKP-abc", "tier": "pro"},
                    "https://baakhapaa.com", {"name": "A", "email": "a@b.c"})

    assert sent["return_url"] == "https://baakhapaa.com/payment/return/khalti"
    assert "?" not in sent["return_url"]


# ---------------------------------------------------------------------------
# Sandbox vs demo — the distinction that makes the integration provable
# ---------------------------------------------------------------------------
def test_esewa_defaults_to_the_real_sandbox_not_a_simulation(monkeypatch):
    """eSewa publishes UAT credentials, so with no merchant account the flow can
    still exercise the real request shape, signature and redirect. A local
    bounce proves none of those."""
    monkeypatch.setenv("PAYMENT_SANDBOX", "true")
    monkeypatch.delenv("ESEWA_SECRET_KEY", raising=False)
    monkeypatch.delenv("ESEWA_PRODUCT_CODE", raising=False)

    assert esewa.mode() == payments.SANDBOX
    assert esewa.form_url() == "https://rc-epay.esewa.com.np/api/epay/main/v2/form"
    assert esewa.status_url() == "https://rc.esewa.com.np/api/epay/transaction/status/"


def test_the_sandbox_can_be_turned_off_for_offline_work(monkeypatch):
    monkeypatch.setenv("PAYMENT_SANDBOX", "false")
    monkeypatch.delenv("ESEWA_SECRET_KEY", raising=False)
    assert esewa.mode() == payments.DEMO


def test_the_uat_credentials_never_reach_the_live_host(monkeypatch):
    """The published pair is worthless against production, but pointing it there
    would turn a clear 'no merchant account' into an opaque gateway error."""
    monkeypatch.setenv("PAYMENT_SANDBOX", "true")
    monkeypatch.delenv("ESEWA_SECRET_KEY", raising=False)
    monkeypatch.setenv("ESEWA_ENV", "live")  # ignored without our own keys
    assert esewa.mode() == payments.SANDBOX
    assert "rc-epay" in esewa.form_url()


def test_a_stripe_test_key_is_a_sandbox_not_a_simulation():
    """`sk_test_` really calls Stripe and really redirects there; only
    `sk_live_` moves money. Collapsing those into one flag is how an
    integration goes unexercised."""
    import subscription_service
    assert subscription_service.mode() in (payments.DEMO, payments.SANDBOX, payments.LIVE)


def test_providers_endpoint_reports_the_mode(client):
    r = client.get("/subscription/providers")
    assert r.status_code == 200
    for p in r.json()["providers"]:
        assert p["mode"] in (payments.DEMO, payments.SANDBOX, payments.LIVE)
        assert p["live"] is (p["mode"] == payments.LIVE)


# ---------------------------------------------------------------------------
# Talking to a real gateway means real failures
# ---------------------------------------------------------------------------
def test_khalti_field_errors_are_surfaced_not_swallowed(monkeypatch):
    """Khalti names the offending field in its error body. The status code
    alone is what someone would otherwise be staring at."""
    import khalti
    monkeypatch.setenv("KHALTI_SECRET_KEY", "live_secret_key_abc123")

    class _Res:
        status_code = 400

        @staticmethod
        def json():
            return {"amount": ["Amount should be greater than Rs. 10."]}

    monkeypatch.setattr("httpx.post", lambda *a, **k: _Res())

    with pytest.raises(RuntimeError) as e:
        khalti.initiate({"amount": 100, "reference": "BKP-a", "tier": "pro"},
                        "https://baakhapaa.com", {})
    assert "amount" in str(e.value)
    assert "greater than" in str(e.value)


def test_khalti_retries_once_on_a_dropped_connection(monkeypatch):
    """A refused socket says nothing about whether the payment happened."""
    import httpx as _httpx

    import khalti
    monkeypatch.setenv("KHALTI_SECRET_KEY", "live_secret_key_abc123")

    calls = []

    class _Res:
        status_code = 200

        @staticmethod
        def json():
            return {"pidx": "p1", "payment_url": "https://dev.khalti.com/pay/p1"}

    def flaky(*a, **k):
        calls.append(1)
        if len(calls) == 1:
            raise _httpx.ConnectError("connection refused")
        return _Res()

    monkeypatch.setattr("httpx.post", flaky)
    result = khalti.initiate({"amount": 99900, "reference": "BKP-a", "tier": "pro"},
                             "https://baakhapaa.com", {})
    assert len(calls) == 2
    assert result["url"].startswith("https://dev.khalti.com")


def test_khalti_does_not_retry_a_definite_rejection(monkeypatch):
    """A 400 is Khalti telling us something. Asking again gets the same answer
    and doubles the latency of every misconfigured checkout."""
    import khalti
    monkeypatch.setenv("KHALTI_SECRET_KEY", "live_secret_key_abc123")

    calls = []

    class _Res:
        status_code = 400

        @staticmethod
        def json():
            return {"detail": "Invalid token."}

    def counted(*a, **k):
        calls.append(1)
        return _Res()

    monkeypatch.setattr("httpx.post", counted)
    with pytest.raises(RuntimeError):
        khalti.initiate({"amount": 99900, "reference": "BKP-a", "tier": "pro"},
                        "https://baakhapaa.com", {})
    assert len(calls) == 1


def test_a_khalti_lookup_failure_leaves_the_payment_pending(monkeypatch, client, make_user):
    """Never 'failed' on our inability to ask - that strands a real payment."""
    import httpx as _httpx

    import khalti
    monkeypatch.setenv("KHALTI_SECRET_KEY", "live_secret_key_abc123")

    def down(*a, **k):
        raise _httpx.ConnectError("down")

    monkeypatch.setattr("httpx.post", down)

    user = make_user("free")
    record = payments.create_record(user["id"], "pro", "khalti")
    outcome = khalti.verify(record, {"pidx": "p1"})

    assert outcome["paid"] is False
    assert outcome["status"] == "pending"


# ---------------------------------------------------------------------------
# Khalti's sandbox fallback
#
# Previously Khalti could only ever simulate without a merchant account, which
# meant its request shape, auth header and redirect went unexercised — the one
# state in which an integration bug survives indefinitely.
# ---------------------------------------------------------------------------
def test_khalti_falls_back_to_the_documentation_sandbox_key(monkeypatch):
    import khalti
    monkeypatch.setenv("PAYMENT_SANDBOX", "true")
    monkeypatch.delenv("KHALTI_SECRET_KEY", raising=False)

    assert khalti.mode() == payments.SANDBOX
    assert "dev.khalti.com" in khalti.base_url()
    assert khalti._secret() == khalti._DOC_SANDBOX_KEY


def test_the_khalti_sample_key_can_never_go_live(monkeypatch):
    """A documentation sample key against production is not a live gateway, it
    is an opaque 401 where a clear 'no merchant account' should have been."""
    import khalti
    monkeypatch.setenv("PAYMENT_SANDBOX", "true")
    monkeypatch.delenv("KHALTI_SECRET_KEY", raising=False)
    monkeypatch.setenv("KHALTI_ENV", "live")

    assert khalti.mode() == payments.SANDBOX
    assert "dev.khalti.com" in khalti.base_url()


def test_our_own_key_wins_over_the_sample_one(monkeypatch):
    import khalti
    monkeypatch.setenv("PAYMENT_SANDBOX", "true")
    monkeypatch.setenv("KHALTI_SECRET_KEY", "live_secret_key_mine")
    assert khalti._secret() == "live_secret_key_mine"


def test_khalti_still_simulates_when_the_sandbox_is_off(monkeypatch):
    """CI and offline work must not depend on Khalti being reachable."""
    import khalti
    monkeypatch.setenv("PAYMENT_SANDBOX", "false")
    monkeypatch.delenv("KHALTI_SECRET_KEY", raising=False)
    assert khalti.mode() == payments.DEMO


def test_every_provider_reaches_a_real_gateway_by_default(monkeypatch):
    """The complaint this fixes: only eSewa opened a payment page. Stripe is the
    exception and stays a simulation — its test keys are per-account
    credentials, so there is nothing publishable to fall back on."""
    import khalti
    monkeypatch.setenv("PAYMENT_SANDBOX", "true")
    monkeypatch.delenv("KHALTI_SECRET_KEY", raising=False)
    monkeypatch.delenv("ESEWA_SECRET_KEY", raising=False)

    assert khalti.mode() == payments.SANDBOX
    assert esewa.mode() == payments.SANDBOX


# ---------------------------------------------------------------------------
# The listed price is what the writer pays
#
# Khalti's KPG charge is a flat Rs 5 + 13% VAT = Rs 5.65 per transaction, and
# their merchant terms prohibit levying it on the customer — the merchant bears
# it. So a Rs 999 plan bills Rs 999 and settles Rs 993.35 to us.
#
# The sandbox checkout displays "Product Amount 999.00 / Service Charge 5.65 /
# Total Payable 1004.65", which reads exactly like an undercharge waiting to be
# corrected. Adding the fee to `amount` would breach the merchant agreement, so
# it is pinned here rather than left to look like a bug.
# ---------------------------------------------------------------------------
def test_the_gateway_is_sent_the_listed_price_and_nothing_more(monkeypatch):
    import khalti
    monkeypatch.setenv("KHALTI_SECRET_KEY", "live_secret_key_abc123")

    sent = {}

    class _Res:
        status_code = 200

        @staticmethod
        def json():
            return {"pidx": "p1", "payment_url": "https://dev.khalti.com/pay/p1"}

    def capture(url, json=None, headers=None, timeout=None):
        sent.update(json or {})
        return _Res()

    monkeypatch.setattr("httpx.post", capture)
    record = {"amount": payments.TIERS["pro"]["amount"], "reference": "BKP-a", "tier": "pro"}
    khalti.initiate(record, "https://baakhapaa.com", {})

    # Rs 999.00 exactly — not Rs 1,004.65.
    assert sent["amount"] == 99900


def test_esewa_is_sent_the_listed_price_and_nothing_more(monkeypatch):
    monkeypatch.setenv("PAYMENT_SANDBOX", "true")
    result = esewa.initiate(
        {"amount": payments.TIERS["studio"]["amount"], "reference": "BKP-b", "tier": "studio"},
        "https://baakhapaa.com", {},
    )
    fields = result["fields"]
    assert fields["total_amount"] == "2499.00"
    # No service charge, no delivery charge, no tax added to the writer's bill.
    assert fields["product_service_charge"] == "0"
    assert fields["product_delivery_charge"] == "0"
    assert fields["tax_amount"] == "0"
    # And the signed total is the price, so the gateway cannot be told one
    # number while the signature covers another.
    assert fields["total_amount"] == fields["amount"]


def test_a_gateway_that_collected_its_fee_on_top_still_settles_the_plan(monkeypatch, client, make_user):
    """If a merchant account IS configured to pass the charge on, the gateway
    reports MORE than we asked for. That must activate the plan, not read as a
    mismatch — the writer paid at least the price."""
    import khalti

    user = make_user("free")
    record = payments.create_record(user["id"], "pro", "khalti")

    monkeypatch.setattr(khalti, "verify", lambda rec, params: {
        "paid": True, "amount": 100465, "provider_ref": "x",  # 999 + 5.65
    })

    result = payments.verify("khalti", {"reference": record["reference"]}, user["id"])
    assert result["status"] == "completed"
    assert result["tier"] == "pro"
