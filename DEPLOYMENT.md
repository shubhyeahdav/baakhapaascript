# Deployment

Written 2026-08-20, alongside the work that made it possible. `ROADMAP.md` weeks
1–3 are the reason this file exists: the build has never run outside demo mode
and has never been deployed, and neither of those is feature work.

Read `.env.example` alongside this — it documents every variable. This file
covers the order to do things in and the things that only bite in production.

---

## The one change that makes this safer than it was

Everything below used to be a line in a markdown file asking a human to remember
something. `deploy_checks.py` now enforces it: set **`APP_ENV=production`** and
the backend **refuses to boot** if any of these is wrong.

| Check | Why it refuses rather than warns |
|---|---|
| `CORS_ORIGINS` unset | The dev fallback allows **any** `http://localhost:*` origin. In production that lets any page on a victim's machine call the API with their credentials. |
| `DEMO_SEED=true` | Creates `test@example.com` with a password published in the repo. |
| No `SUPABASE_URL`/`KEY` | The app falls back to a local SQLite file. On any container host that file is erased on every redeploy — every user and every script with it. |
| No redistributable Devanagari font | Every Nepali PDF renders as blank boxes. Windows' Nirmala resolving is treated as a failure: it is Microsoft's, absent from Linux, and not ours to ship. |

`APP_ENV` defaults to `development`, so none of this changes how the app runs
locally. Warnings (plain-http origins, unset `FRONTEND_URL`) print and continue.

---

## Order

### 1. Supabase

Create a project and run `baakhapaa-backend/supabase_schema.sql`. On an existing
database, the `ALTER TABLE` blocks in that file are the migrations. **There are
four, and they must be run in this order** — this section named only the last
until 2026-08-26, so a runbook followed before then under-ran the schema.

**1. Google sign-in** (`supabase_schema.sql`, top of file). Existing rows read as
`'password'`, so this downgrades nobody:

```sql
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password';
ALTER TABLE users ADD COLUMN google_sub TEXT UNIQUE;
```

**2. Email normalisation.** This is the only migration that can fail on real
data. If the `UPDATE` raises a unique violation, two rows hold the same address
in different cases — merge or delete one before retrying, and do that before the
index is created, not after:

```sql
UPDATE users SET email = lower(trim(email));
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));
```

**3. Invitations** (added 2026-08-27). Lets somebody be invited before they have
an account — the membership is granted when they register with that address:

```sql
CREATE TABLE IF NOT EXISTS project_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  token TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  claimed_by UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_project_invites_email ON project_invites(lower(email));
CREATE INDEX IF NOT EXISTS idx_project_invites_project ON project_invites(project_id);
```

**4. Payments and renewals.** Both idempotent:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS renewal_notices_json TEXT;
```

A NULL `subscription_expires_at` means "not time-boxed" — Stripe owns that
renewal — which is why adding the column downgraded nobody.

> There is no migration tool here, and the local SQLite mock has already produced
> three schema-drift bugs (`HANDOVER.md`). Getting a real Postgres into CI and
> adopting a migration tool is the right fix, and is worth doing before the next
> schema change rather than after it.

Take the **service role** key, not the anon key. The backend is the only thing
that talks to Postgres; row-level security is not what is protecting this data,
ownership checks in `auth.py` are.

### 2. Backend → Railway

Root directory `baakhapaa-backend`. `railway.json` and `Procfile` are both
present and both already carry the start command:

```
uvicorn main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'
```

**Both flags matter.** slowapi keys rate limits on `request.client.host`, which
behind a proxy is *the proxy* — without `--proxy-headers` every user in the
world shares one 5/minute login bucket, and the first person to mistype a
password locks out everyone else. And uvicorn ignores `X-Forwarded-For` unless
the immediate peer is trusted, which is what `--forwarded-allow-ips` says. `'*'`
is correct only because the platform is the only thing that can reach the port;
on a host where that is not true, name the proxy's IP instead.

Minimum environment:

```
APP_ENV=production
JWT_SECRET=<python -c "import secrets; print(secrets.token_urlsafe(48))">
SUPABASE_URL=...
SUPABASE_KEY=...
CORS_ORIGINS=https://baakhapaa.com,https://www.baakhapaa.com
FRONTEND_URL=https://baakhapaa.com
REQUIRE_SHIPPABLE_FONT=true
DEMO_SEED=false
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
```

Health check is `/health`.

`MAX_STORYBOARD_FRAMES` (default 24) is a spend ceiling, not a UI limit: it is
the number to multiply by your image price for the worst case of one click.

### 3. Frontend → Vercel

Root directory `baakhapaa-frontend`. `vercel.json` sets the build, the security
headers, and the SPA rewrite. **The rewrite is not optional** — the app ships one
`index.html` and routes client-side, so without it a hard refresh on
`/dashboard`, or any shared `/pricing` link, is a 404 from the CDN.

The frontend is **Vite**, not Create React App (migrated in `11287cd`). Set
**`VITE_API_URL`** to the Railway URL; `REACT_APP_API_URL` is still read as a
fallback in `src/services/api.js` but is legacy and should not be used for a new
deploy. Either way it is baked in at build time, so changing it requires a
redeploy, not a restart.

### 4. Payments

See the section below. Nothing else blocks a deploy; this blocks revenue.

### 4b. Renewal reminders

Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` (any
transactional provider — plain SMTP, no SDK), then schedule:

```
python renewals.py
```

Once a day is enough; the job is idempotent and records what it sent against
the expiry date it was about, so running it twice mails nobody twice. Check who
it would reach before you arm it:

```
python renewals.py --dry-run
```

With no `SMTP_HOST` it prints what it would have sent and delivers nothing. It
never reports a send that did not happen — a mailer that silently succeeds is
worse than one that is obviously off, because nobody learns that nobody was
told.

### 5. First run

Register a real account, then walk it: structure → write → finalize →
storyboard → export. This has never been done outside demo mode. Expect
breakage in the real-Claude JSON path (`script_engine._extract_json` already
anticipates preamble and sign-off) and in Supabase client behaviour the local
mock does not reproduce.

---

## Payments

Three gateways, chosen per checkout, behind one interface (`payments.py`).

### Three modes, not two

| Mode | What happens | Proves |
|---|---|---|
| `live` | Real credentials, production host, real money | Everything |
| `sandbox` | The gateway's own **test host**. Real HTTP, real redirect, real signature checking, no money | That the integration actually works |
| `demo` | No credentials. Loops back to our own return URL and contacts nobody | Nothing about the gateway |

The distinction matters because `demo` is the one state in which the integration
is never exercised — no gateway ever sees a request, so a wrong field name or a
malformed redirect survives indefinitely.

**With no keys at all, both Nepali gateways run in `sandbox` and really open
their payment pages.** eSewa uses its published UAT pair (`EPAYTEST`); Khalti
uses the sandbox key printed in its own documentation samples. Verified
2026-08-20: eSewa renders its login at `rc-epay.esewa.com.np` for NPR 999.00,
and Khalti returns a live `pidx` and renders `test-pay.khalti.com` with all four
payment options.

Stripe is the exception and stays a simulation: `sk_test_` keys are per-account
credentials, not publishable ones, so there is nothing to fall back on. The
pricing page says so rather than just reading as broken.

⚠️ **The Khalti fallback is a documentation sample, not a designated shared
credential** the way `EPAYTEST` is. It may be rotated or disabled without
notice, and any sandbox payment made with it lands in whichever test merchant
account owns it. Get your own from test-admin.khalti.com and set
`KHALTI_SECRET_KEY` before relying on it for anything.

Sandbox payer credentials: Khalti ID `9800000000`–`5`, MPIN `1111`, OTP `987654`
(wallet only — e-banking and card do not work in Khalti's test environment).
eSewa: `9806800001`–`5`, password `Nepal@123`, token `123456`.

`PAYMENT_SANDBOX=false` forces the offline simulation everywhere; the test suite
pins it, because a unit test must not depend on a third party being up.

**The listed price is what the writer pays. The gateway fee is ours.**

Khalti's KPG gateway charge is a flat Rs 5 per transaction plus 13% VAT — the
Rs 5.65 the sandbox shows beside a Rs 999 payment. Khalti's merchant terms
prohibit levying it on the customer, so the merchant bears it: a Rs 999 plan
charges the writer Rs 999 and settles Rs 993.35 to us.

This is also what the code already does — `amount` is the tier price and
nothing is added to it — so the rule to protect is *not adding the fee later*.
`test_payments.py` pins it: sending the customer a bill of Rs 1,004.65 would
breach the merchant agreement, and it is the kind of "helpful" change that
looks like correcting an undercharge.

The pricing page shows the mode per gateway — "Sandbox — real gateway, no real
money" reads differently from "Simulated — no gateway contacted", and it should.

| Provider | Reaches | Notes |
|---|---|---|
| Khalti | Wallet, mobile banking, connectIPS, cards | Cleanest API of the three. `KHALTI_SECRET_KEY`, `KHALTI_ENV=live`. Hosts: `dev.khalti.com` / `khalti.com`. |
| eSewa | Nepal's most widely held wallet | Signed browser form POST, not an API session. `ESEWA_PRODUCT_CODE`, `ESEWA_SECRET_KEY`, `ESEWA_ENV=live`. Hosts: `rc-epay` / `epay`. |
| Stripe | International cards | Declines most Nepali cards. An `sk_test_` key is a real sandbox; only `sk_live_` moves money. |

### The return URL is a path, not a query string

Every gateway appends its own parameters to the URL we hand it — Khalti adds
`?pidx=…&status=…`, eSewa adds `?data=<base64>` — and eSewa's documentation does
not say what it does when the URL already carries a query string. So the
provider goes in the **path**: `/payment/return/{provider}`, with the query
string left entirely to them. The older `?provider=` route is still mounted so a
payment in flight during a deploy still lands somewhere that works.

eSewa's `success_url` and `failure_url` are deliberately the same URL. Which one
the browser arrives at is not evidence of anything — the gateway is asked either
way — and trusting the landing URL would be trusting the browser.

Both Nepali gateways default to their **sandbox** hosts. Defaulting to live
would mean a misconfigured deploy takes real money from real people while it is
being tested.

### Getting the merchant accounts

Neither of these can be done from code. Both take days, not minutes, because a
human reviews the application.

**Khalti** — apply at [khalti.com/payment-gateway](https://khalti.com/payment-gateway/).
They will ask for company registration (or sole-proprietor registration), PAN,
a bank account in the business's name, and the website URL. You need the site
live first, so do this after the Vercel deploy. Two dashboards come out of it:
`test-admin.khalti.com` for a sandbox key and `admin.khalti.com` for the live
one. Set `KHALTI_SECRET_KEY` to the test key first and leave `KHALTI_ENV`
unset — the code stays on the sandbox host until you set it to `live`, so a
half-finished setup cannot take real money.

Note their fee: flat Rs 5 + 13% VAT per transaction, borne by you. Their
merchant terms prohibit charging it to the writer.

**eSewa** — apply through their merchant onboarding; same paperwork. Until the
account exists the code runs against eSewa's published UAT pair, which is a
real sandbox and enough to prove the integration. Set `ESEWA_PRODUCT_CODE` and
`ESEWA_SECRET_KEY` when they issue them, and `ESEWA_ENV=live` only when you
intend to take real money.

**Stripe** — self-service, minutes not days, but it will not settle to a Nepali
bank account. It is for international cards only; treat it as the fallback it
is.

**Order that avoids waiting on yourself:** deploy the frontend → apply to both
gateways with the live URL → keep selling nothing until the keys arrive → set
sandbox keys and walk a payment → switch `*_ENV=live` last.

### The structural thing to know

**Only Stripe has subscriptions.** Khalti and eSewa take one payment, once. So:

- A plan bought through them sets `users.subscription_expires_at` 30 days out
  (`SUBSCRIPTION_DAYS`), and lapses to free when it passes.
- A Stripe subscription leaves that column NULL — Stripe owns the renewal, and a
  date we set would fight it.
- NULL therefore means "not time-boxed", which is why adding the column
  downgraded nobody.
- **Nothing renews on its own.** A Khalti/eSewa user must come back and pay
  again, and there is currently no reminder telling them to. That is the first
  thing to build once real payments are live.

Every tier check reads `payments.effective_tier()`, so an expired month reads as
free everywhere — not just on the pricing page.

### Why a payment row is written before the user leaves

A user comes back from Khalti holding nothing but a `pidx`. If the tier came
from that returning request, anyone could return claiming `studio`. Instead the
intended tier and price are recorded up front; the return trip can only *select*
a row, never describe one. The gateway is then asked directly what happened, and
the amount it reports is checked against the price we recorded.

The browser's query string is a lookup key. It is never evidence.

### Stripe webhook

`POST /subscription/webhook`, with `STRIPE_WEBHOOK_SECRET` set. Subscribe to
`checkout.session.completed`. The return page verifies independently, so a
delayed webhook does not leave a paying user on the free tier — but without the
webhook, renewals after month one are invisible.

### Known edge case

Buying Pro while on Studio downgrades the tier and extends the time, because
`activate()` extends whatever expiry exists. It is the honest reading of "the
user chose Pro", but if the pilot surfaces it as confusing, that is where to
change it.

---

## Still open before launch

- **Legal.** `Terms_of_Use.md`, `Privacy_Policy.md` and
  `Data_Compliance_Checklist.md` are unreviewed templates. `DATA_HANDLING.md` is
  the accurate account of where script text actually goes — rewrite the privacy
  policy from that, not from the template.
### Cost per user

Prices checked 2026-08-21. NPR at ~139/USD.

**Images.** `gpt-image-1-mini` at `low` quality, the shipped default, is about
$0.005–0.01 per frame. `MAX_STORYBOARD_FRAMES` allows 24, so one click of
"Generate storyboard" costs roughly **$0.12–0.24 (Rs 17–33)**.

| Month | Boards | Image cost | Share of Rs 999 |
|---|---|---|---|
| Light user | 2 | Rs 35–66 | 3–7% |
| Normal user | 6 | Rs 100–200 | 10–20% |
| Heavy user | 20 | Rs 340–660 | 34–66% |

Switching the model to `gpt-image-1` at `high` quality is roughly 15x that
(~$0.167/image): a heavy user alone would run past Rs 999. The default is
deliberately the cheap one — a storyboard frame is a thinking tool, not final
art — and `STORYBOARD_IMAGE_MODEL` / `STORYBOARD_IMAGE_QUALITY` are the levers.

**Text.** Scene generation and improvement are the other billed path. Both are
Pro/Studio only, and the free tier's craft layer (linter, patterns, review,
benchmark) costs nothing per call — it runs in-process with local embeddings.

**Gateway fee.** Khalti takes a flat Rs 5 + 13% VAT = **Rs 5.65 per
transaction**, borne by us, not the writer (their merchant terms require this).
On a Rs 999 monthly plan that is 0.57% — one payment a month, so it does not
scale with usage the way images do. eSewa and Stripe rates depend on the
merchant agreement and are not known yet.

Net of the gateway fee, a Rs 999 month settles **Rs 993.35**. The heavy-user
image column above is the number that actually threatens the margin.

**What this does not cover:** nobody has watched a real writer for a month, so
the frequencies above are assumptions, not measurements. The pilot is what
turns them into numbers. Two things to decide before then:

- **The frame cap is the spend ceiling.** 24 is the number to change if the
  heavy-user column looks wrong; it is one environment variable.
- **Live co-editing (FR10).** Still unbuilt. `ROADMAP.md` recommends descoping
  it and amending the PRD rather than leaving the promise unmet.
