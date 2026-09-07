# Deploy — the exact steps, in order

Written 2026-09-07. Companion to `DEPLOYMENT.md`, which explains *why*; this is
what to click and paste.

The order is dictated by the merchants: Khalti and eSewa both need a live URL on
the application form, and a human reviews it over days. So the site has to be up
before the money can start moving, which is why deploy comes before payments
rather than after.

---

## Before you start

Two accounts, both free to begin: **railway.app** and **vercel.com**. Sign in to
both with GitHub so they can see the repository.

One thing to fix first, in this order, or the backend refuses to boot:

- [ ] The `service_role` key is in `baakhapaa-backend/.env` — verify with the
      one-liner in §5 below. `anon` will not work; row-level security refuses
      every write and the failure looks like "could not create account"
- [ ] `postgres_smoke.py` passes locally
- [ ] The branch is merged into `codebase` — Railway and Vercel deploy the
      default branch, and this work is 45+ commits ahead of it

---

## 1. Backend → Railway

**New Project → Deploy from GitHub repo → this repository.**

Set the root directory to `baakhapaa-backend`. `railway.json` and `Procfile` are
already there and already carry `--proxy-headers --forwarded-allow-ips='*'`,
without which every user on earth shares one 5-per-minute login bucket and the
first person to mistype a password locks out everyone else.

Then **Variables**, and paste this block. Every one of these is read by the code;
the two marked REQUIRED are boot failures if missing, by design.

```
APP_ENV=production
JWT_SECRET=<generate a new one, 64+ random characters — NOT the local one>
SUPABASE_URL=https://shipbxhtfqkuxwffmkgd.supabase.co
SUPABASE_KEY=<the service_role key>
CORS_ORIGINS=https://<your-vercel-domain>
DEMO_SEED=false
REQUIRE_SHIPPABLE_FONT=true
ANTHROPIC_API_KEY=<yours>
OPENAI_API_KEY=<yours>
PAYMENT_SANDBOX=true
AI_MONTHLY_CEILING_PRO=6.00
AI_MONTHLY_CEILING_STUDIO=40.00
```

`CORS_ORIGINS` is a chicken and egg: you do not know the Vercel domain yet. Put
a placeholder, deploy the frontend, then come back and set it properly. Leaving
it unset is a **boot failure** in production, deliberately — the fallback allows
any `http://localhost:*` origin, which would let any page on a victim's machine
call this API with their credentials.

`JWT_SECRET` must be new. Reusing the local one means every token ever issued in
development is valid in production.

`DEMO_SEED=false` matters: `true` creates `test@example.com` / `password`, which
is a published credential on a public site.

**Verify:** `https://<railway-domain>/health` returns 200, and the deploy log
shows no `deploy_checks` complaints.

---

## 2. Frontend → Vercel

**Add New → Project → this repository.** Root directory `baakhapaa-frontend`.
Framework preset **Vite** — `vercel.json` sets it anyway, along with the SPA
rewrite, which is not optional: without it a hard refresh on `/dashboard` is a
CDN 404.

One variable:

```
VITE_API_URL=https://<your-railway-domain>
```

**Then go back to Railway** and set `CORS_ORIGINS` to the Vercel domain, and
redeploy the backend.

**Verify:** open the site, hard-refresh on `/dashboard` (must not 404), register
an account, and confirm the row appears in Supabase.

---

## 3. What to check the first time it is live

- [ ] Register, log in, log out, log back in
- [ ] Create a project and save a draft — confirm scene rows appear in Supabase
- [ ] Open the Patterns tab — retrieval must return results
- [ ] Export a PDF and check the Devanagari renders, not empty boxes
- [ ] Hard-refresh on three different routes
- [ ] Open it on a phone over mobile data, not WiFi
- [ ] Check the response headers carry `X-Frame-Options` and the rest

---

## 4. Then, and only then, the merchants

Khalti and eSewa both want: company registration, PAN, a business bank account,
and **the live URL**. Days of human review. Start both the same afternoon the
site is up.

Keep `PAYMENT_SANDBOX=true` until their live keys arrive. Flip to `live` last,
and take one real payment with real money before telling anyone the product
takes payments.

---

## 5. Verifying the Supabase key without pasting it anywhere

```bash
cd baakhapaa-backend && ./venv/Scripts/python -c "import base64,json,io,re; t=re.search(r'^SUPABASE_KEY=(.*)$',io.open('.env',encoding='utf-8').read(),re.M).group(1).strip(); p=t.split('.')[1]; p+='='*(-len(p)%4); print('role:', json.loads(base64.urlsafe_b64decode(p))['role'])"
```

Must print `service_role`. A newer Supabase project shows `secret` keys starting
`sb_secret_` instead, which also work. `anon` and `publishable` do not — they are
the browser-safe keys and row-level security refuses to write with them.

---

## 6. Email, for renewals

Nothing renews on its own. Khalti and eSewa have no subscription primitive, so a
plan bought through either lapses silently unless somebody is told.

Any SMTP provider works — Brevo, Resend and Zoho all have free tiers large
enough for this. Add to Railway:

```
SMTP_HOST=<provider host>
SMTP_PORT=587
SMTP_USER=<username>
SMTP_PASSWORD=<password>
MAIL_FROM=noreply@<your domain>
FRONTEND_URL=https://<your-vercel-domain>
```

Then, once a day:

```bash
python renewals.py
```

Run it with `--dry-run` first and read the list of people it would write to.
Until `SMTP_HOST` is set it sends nothing at all, which is the correct behaviour
for a half-configured mailer — `renewals.py` was written that way on purpose.

---

## What is deliberately not here

**Supabase Storage for storyboard images.** Frames are stored as data URIs, and a
1536x1024 PNG is over a megabyte base64'd, up to 24 per board. It works and it
will get slow. It is on the work list, not on the critical path to a first
writer.

**A custom domain.** Both platforms give you one. Buy the real domain when
somebody outside the project is going to type it.
