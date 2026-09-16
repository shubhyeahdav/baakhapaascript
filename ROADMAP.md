# Roadmap — demo mode to live product

Written 2026-08-18, from the state of the running system rather than from the
docs. `PROJECT_PLAN.md` holds the historical changelog; this holds what is left.

## The one-line summary

The build is **ahead of the proposal on features, and as of 2026-09-15 it is
deployed** — `https://baakhapaascript.vercel.app` against
`https://akchhyarup.up.railway.app`, on real Supabase. That closes the sentence
this file opened with for a month.

What has *not* been proven is now a shorter and sharper list: **no AI generation
and no storyboard has run against the deployed backend, and no real money has
moved.** Every path verified on the deploy was one that costs nothing. That
fact, not the remaining feature list, is what decides whether this launches.

## Against the proposal's own FR table

| FR | Requirement | State |
|----|-------------|-------|
| 01–03 | Parameters, three-act 33/33/34, scene breakdown | Shipped (+ a short-form beat grammar that was never scoped) |
| 04–05 | AI generation and improvement | Shipped — **mock-verified only** |
| 06 | Bilingual output | Shipped. Devanagari PDF closed 2026-08-18; Noto Sans Devanagari bundled under OFL |
| 07 | Review before finalization | Shipped (`review.py`) — timing, character names, act balance |
| 08–09 | Storyboard generation and controls | Shipped — camera notes, shot-type override, reorder, redraw |
| 10 | Real-time collaboration | **Descoped 2026-08-26 to async collaboration.** Sharing, per-project roles and attributed line-anchored comments are shipped and are what Phase 1 promises. Live cursors need a real Supabase project and a conflict-resolution design; `PRD.md` US4 and its scope lists were amended to match, rather than leaving the promise unmet |
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

### Weeks 1–3 · Deploy and automate — **DONE 2026-09-15**
**Config work done 2026-08-20, and run against real hosts 2026-09-15 — see
`DEPLOYMENT.md`, which now records the deploy as it went rather than as
planned.**
- ~~GitHub Actions running both suites~~ — done, `.github/workflows/ci.yml`
- ~~`CORS_ORIGINS`, `--proxy-headers`, `REQUIRE_SHIPPABLE_FONT`~~ — no longer
  reminders. `APP_ENV=production` makes `deploy_checks.py` refuse the boot if any
  of them is wrong, and `Procfile`/`railway.json` carry the proxy flags
- ~~frontend → Vercel, backend → Railway, a real Supabase project, four
  migrations~~ — all done. The migrations were applied and the schema was then
  checked against the live database column by column, which found nineteen gaps
  a static read of the SQL had missed
- What the deploy actually cost was not the hosts. It was three env-var traps
  that both platforms accept silently: `KEY=VALUE` pasted into a value box, an
  origin carrying a trailing slash and a missing `//`, and `VITE_API_URL`
  needing a cache-free rebuild because Vite bakes it in at build time.
  `DEPLOYMENT.md` names all three and gives the two checks that catch them from
  outside

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
| ~~Live co-editing: build or descope~~ | — | **Resolved 2026-08-26: descoped to async collaboration.** `PRD.md` US4, the in-scope list and the out-of-scope list now say so. Sharing, roles and attributed comments are what ships |
| ~~Khalti, eSewa, or both~~ | — | **Resolved 2026-08-20: both**, behind one interface. Stripe kept for international cards |
| ~~NPR pricing per tier~~ | — | **Resolved: Rs 999 Pro / Rs 2,499 Studio per month.** Still unchecked against the cost model below |
| Invite-only or open launch | Decides waitlist vs funnel | Invite-only for a month — one developer cannot absorb open signup plus a bug queue |
| ~~NFR03: what we claim about encryption~~ | — | **Resolved 2026-08-26: state it truthfully.** `PRD.md` §7 now says TLS in transit, provider-managed disk encryption at rest, and **no application-level encryption of `scripts.content`**. Building that encryption remains open, and has to be designed before launch rather than retrofitted — it changes what diffing, search and export can do. `DATA_HANDLING.md` is the full account |
| Who reviews the legal docs | Unreviewed templates | Budget for a lawyer now; this is the one item that cannot be compressed later |

## Known non-blockers, carried forward

- **E6 corpus fingerprints** — blocked; the script corpus is on another machine
- ~~**Custom user scenes UI** (C2) — the API supports it, no UI~~ — **done.**
  The Corkboard has "+ New scene" and the Outline a per-act add, both composing
  a slugline inline and writing the row and the scene block together;
  `Corkboard.test.jsx` covers it
- ~~**NewProject still uses the old Sidebar** — shell split half-applied~~ —
  **done.** `Sidebar.jsx` no longer exists in the repository and nothing
  imports it; `NewProject` is on `TopNav` like everything else. The only
  surviving mention is a comment explaining the switch
- Marketing plan: see the shared plan artifact, and §"content engine" — the
  **45** craft entries are original prose and are publishable as short-form
  content by construction

*Checked 2026-09-16. Three of the four "carried forward" items had already been
done, one of them nearly a month earlier, and the corpus count was 29 when it
is 45. A list of known non-blockers is only useful if somebody occasionally
asks it whether it is still true — so: two closed, one still genuinely blocked,
one number corrected.*
