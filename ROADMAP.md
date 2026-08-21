# Roadmap — demo mode to live product

Written 2026-08-18, from the state of the running system rather than from the
docs. `PROJECT_PLAN.md` holds the historical changelog; this holds what is left.

## The one-line summary

The build is **ahead of the proposal on features and has never run outside demo
mode**. Every deliverable to date was verified against a mock AI, a local SQLite
file and placeholder images. That fact, not the remaining feature list, is what
decides whether this launches in September.

## Against the proposal's own FR table

| FR | Requirement | State |
|----|-------------|-------|
| 01–03 | Parameters, three-act 33/33/34, scene breakdown | Shipped (+ a short-form beat grammar that was never scoped) |
| 04–05 | AI generation and improvement | Shipped — **mock-verified only** |
| 06 | Bilingual output | Shipped. Devanagari PDF closed 2026-08-18; Noto Sans Devanagari bundled under OFL |
| 07 | Review before finalization | Shipped (`review.py`) — timing, character names, act balance |
| 08–09 | Storyboard generation and controls | Shipped — camera notes, shot-type override, reorder, redraw |
| 10 | Real-time collaboration | **Partial** — sharing, roles and attributed line-anchored comments work; live cursors need a real Supabase project |
| 11 | Version history with diff | Shipped, with per-window snapshot coalescing |
| 12 | Role-based access | Shipped — Admin/Editor/Viewer per project, enforced server-side |
| 13 | Export system | Shipped — PDF, Word, `.fdx`, and a production package that is now a real shot list |
| 14 | Subscription tiers | **Built, unproven** (2026-08-20) — Khalti + eSewa + Stripe behind one interface, NPR pricing, per-payment expiry. Sandbox/demo verified only; no real money has moved. Tier names settled as free/pro/studio — the proposal is what changes |

## The remaining six weeks, from 18 August

Ordered so that everything only discoverable in production comes first —
those discoveries change estimates and nothing else does.

### Weeks 1–2 · Make it real (blocking)
Real keys in one environment; run register → structure → write → storyboard →
export. Expect breakage in the real-Claude JSON path (`script_engine._extract_json`
already anticipates preamble/sign-off) and in Supabase client behaviour that the
local mock does not reproduce.

### Weeks 1–3 · Deploy and automate (blocking)
**Config work done 2026-08-20 — see `DEPLOYMENT.md`.** What is left is running it
against a real host, which nothing here has ever done.
- ~~GitHub Actions running both suites~~ — done, `.github/workflows/ci.yml`
- ~~`CORS_ORIGINS`, `--proxy-headers`, `REQUIRE_SHIPPABLE_FONT`~~ — no longer
  reminders. `APP_ENV=production` makes `deploy_checks.py` refuse the boot if any
  of them is wrong, and `Procfile`/`railway.json` carry the proxy flags
- Still to do: frontend → Vercel, backend → Railway, a real Supabase project
  (run the `subscription_expires_at` migration at the top of `supabase_schema.sql`)

### Weeks 2–4 · Payments that work in Nepal
**Decided and built 2026-08-20: both gateways.** Khalti and eSewa ship alongside
Stripe behind one provider interface (`payments.py`), priced Rs 999 / Rs 2,499 in
NPR, and tier naming is settled as free/pro/studio — the proposal is what gets
amended, not the code and its stored `subscription_tier` values.

What is left is the part that cannot be written locally:
- Merchant accounts with Khalti and eSewa, and their live keys
- A real payment, by a real person, with real money — everything to date is
  sandbox and demo
- **Renewal reminders.** Neither Nepali gateway has a subscription primitive, so
  a plan lapses silently after 30 days. This is now the largest gap in the
  billing story and did not exist as a problem while Stripe was the only path

### Weeks 3–5 · Find out what a user costs
One storyboard is up to 24 billed images (`MAX_STORYBOARD_FRAMES`). Model a
realistic month for a heavy and a light user against NPR pricing. If a Pro user
costs more than they pay, the frame cap and tier boundaries move before launch.

### Weeks 4–6 · Creator pilot
Five writers taking real projects end to end. The PRD's success metric is one
script completed without falling back to manual methods — this is where that is
proved or disproved. Their friction list is the last backlog before launch.

### Weeks 6–7 · Launch and handover
Open signup, handover walkthrough and written notes. Legal review must have
landed: `Terms_of_Use.md`, `Privacy_Policy.md` and `Data_Compliance_Checklist.md`
are all still unreviewed templates.

## Decisions that cannot be resolved by building

| Decision | Why it blocks | Recommendation |
|---|---|---|
| Live co-editing: build or descope | FR10 promises visible cursors | Descope to async collaboration for launch and amend the PRD, rather than leaving a promise unmet |
| ~~Khalti, eSewa, or both~~ | — | **Resolved 2026-08-20: both**, behind one interface. Stripe kept for international cards |
| ~~NPR pricing per tier~~ | — | **Resolved: Rs 999 Pro / Rs 2,499 Studio per month.** Still unchecked against the cost model below |
| Invite-only or open launch | Decides waitlist vs funnel | Invite-only for a month — one developer cannot absorb open signup plus a bug queue |
| Who reviews the legal docs | Unreviewed templates | Budget for a lawyer now; this is the one item that cannot be compressed later |

## Known non-blockers, carried forward

- **E6 corpus fingerprints** — blocked; the script corpus is on another machine
- **Custom user scenes UI** (C2) — the API supports it, no UI
- **NewProject still uses the old Sidebar** — shell split half-applied
- Marketing plan: see the shared plan artifact, and §"content engine" — the 29
  craft entries are original prose and are publishable as short-form content by
  construction
