# Baakhapaa

AI-powered pre-production system for screenwriting and storyboarding.

## Tech Stack
- **Backend**: FastAPI (Python), Supabase (Postgres) for data, JWT auth
- **AI**: Anthropic Claude API (script generation), OpenAI DALL-E 3 (storyboard images)
- **Frontend**: React 18, React Router, Tailwind CSS, axios

## Conventions
- All secrets (Anthropic key, OpenAI key, Supabase URL/key, JWT secret) live in `.env` files — never hardcode keys. Backend: `baakhapaa-backend/.env`. Frontend: `baakhapaa-frontend/.env`.
- Every backend endpoint that calls an external AI API wraps the call in try/except and raises `HTTPException(status_code=503, ...)` on failure — AI providers are unreliable, and callers need a clean error instead of a stack trace.
- Dark theme (cool indigo/slate; defined in `tailwind.config.js` + `index.css`).
  Tokens are aliased to legacy "gold*" names for compatibility — `gold` now = indigo `#6366F1`.
  - bg `#0B0F19`, surface `#141A29`, elevated `#1E2538`, border `rgba(148,163,184,0.12)`
  - accent/`gold` `#6366F1` (bright `#818CF8`), `skyAccent` `#38BDF8`
  - text: `ink #F8FAFC`, `inkSoft #E2E8F0`, `inkMuted #94A3B8`
  - Fonts: `Fraunces` (display serif), `Inter` (UI), `Courier New` (screenplay editor only)

## Running Locally

Backend:
```
cd baakhapaa-backend && uvicorn main:app --reload
```
Runs at http://localhost:8000 (docs at `/docs`, health check at `/health`).

Frontend:
```
cd baakhapaa-frontend && npm start
```
Runs at http://localhost:3000 (often **3001** locally when 3000 is taken; backend CORS allows both).

**Windows gotchas:**
- `uvicorn --reload` is unreliable here (orphaned processes squat on port 8000). Prefer running **without** `--reload` and restart manually after backend edits. Kill stragglers: `Get-Process python | Stop-Process -Force`.
- Backend venv is at `baakhapaa-backend/venv` (use `./venv/Scripts/python`). `bcrypt` is pinned to `4.0.1` — newer breaks passlib.
- Local demo DB now **persists to SQLite** (`baakhapaa-backend/baakhapaa_local.db`) — restarts keep users/projects. Delete the file to reset.

## Project docs (all at repo root)
Start with `ONBOARDING.md` (doc map + 15-min setup), then `WORKING_GUIDE.md`
(git topology, commit/push loop, copyright rules, Claude Code setup on another
machine). Then:
- `PRD.md` — product requirements (problem, users, scope, metrics)
- `TRD.md` — technical architecture, data model, API contract, deploy plan
- `LEARNING_GUIDE.md` — beginner full-stack walkthrough
- `AUDIT_REPORT.md` — security audit findings
- `DATA_HANDLING.md` — **where script text actually goes**: what is stored, what
  leaves the server and to whom, what deletion now removes, and what is still
  open. Rewrite `Privacy_Policy.md` from this, not from the template
- `ROADMAP.md` — the remaining six weeks and the decisions that block them
- `PILOT.md` — the five-writer pilot protocol: what only a writer can settle,
  what to measure rather than ask, and what counts as a failed pilot
- `LEGAL_REVIEW.md` — what was factually wrong in the Terms and Privacy Policy
  (fixed), and what still needs a Nepal-qualified lawyer
- `DEPLOYMENT.md` — **the deploy runbook**: order of operations, the boot checks
  that now enforce production config, and how the three payment gateways work
- `HANDOVER.md` — latest session test results
- `UI_Inspiration.md` — dark-UI references (Linear/Cursor/etc.) for design prompts
- Legal (templates, unreviewed): `Terms_of_Use.md`, `Privacy_Policy.md`,
  `Data_Compliance_Checklist.md` (Nepal law), `Trademark_Check_Guide.md`

## Current State (updated 2026-08-13 — PROJECT_PLAN.md §6/§7 has the changelog, HANDOVER.md the narrative)

> **Read `HANDOVER.md` first.** Two things reliably waste a session's first hour:
> `script_patterns` is often **empty** in the local DB (run
> `load_knowledge_base.py`, then **restart the backend** — the mock DB caches at
> startup), and the **script corpus is not on this machine** (no
> `raw_scripts_TEMP/`, no `D:\AkxyaRup`; this is a single repo at
> `C:\baakhapaa` on branch `codebase`).
>
> Backend tests: **480 across 31 files, all passing** (the Devanagari font gate
> no longer skips — the asset is bundled), `./venv/Scripts/python -m pytest`.
> Frontend tests: **80 across 7 files**, `npm run test:ci`.
> **CI runs lint, dependency audit, both suites and the production build** on
> push and PR (`.github/workflows/ci.yml`), on Linux with
> `REQUIRE_SHIPPABLE_FONT=true` — the only place the Devanagari font gate is
> meaningful, since this Windows box always has Nirmala to fall back on.
> Config is documented in `baakhapaa-backend/.env.example`.
>
> **Tooling** (`requirements-dev.txt`, kept out of the runtime install):
> `ruff` (config in `ruff.toml` — a narrow, chosen rule set: defects, not style,
> so a failure always means something is wrong), `pip-audit`, `bandit`,
> `vulture`. Run: `python -m ruff check .` and
> `python -m pip_audit --ignore-vuln PYSEC-2026-1325`.

**Working (every item re-tested live, demo mode):**
- Auth (register/login/JWT, protected routes; password strength rules are client-side only)
- Project CRUD, including **delete from the dashboard** (two-step in-place
  confirm). This one mattered on the free plan: the allowance is one project and
  nothing called `DELETE /projects/{id}`, so a false start was permanent
- **Editor workspace: Script / Corkboard / Outline** (2026-08-20) — three
  readings of the same scene rows, the Final Draft / Arc Studio split. The
  Corkboard drags cards to **move the scene in the script**, not in a parallel
  list: `scene_sync` derives order from document position, so any other reorder
  would be undone by the next save. The Outline reads act balance and
  planned-vs-written runtime. Both carry the production metadata (INT/EXT, time
  of day, cast) that was already parsed off the page and shown nowhere
- **Page segmentation** (2026-08-20) — the editor was one unbroken column, so a
  writer could not tell what page they were on, and the page is the unit of
  screen time in this craft. Page rules and a `p. N / M` indicator now use
  `screenplay.PAGE_LINES`, **the same rule the PDF export lays out with**, so
  page 6 means one thing across the product. Three different page definitions
  existed before this (`statistics` at non-blank/55, `review` at its own 55, the
  PDF at 45-including-blanks); there is now one
- **Scenes reconcile on load, not only on save** — opening a hand-typed
  screenplay used to show an empty scene index, a dead timeline and an empty
  corkboard until the draft was touched. A scene cut from the draft is now
  *marked* rather than silently kept as a live scene (its row survives because a
  storyboard frame FKs to it)
- Script structure — **two-step flow**: generate-structure returns a preview only
  (suggestions persisted on the script row), scenes added one at a time via
  `POST /scripts/add-scene`; StructureTimeline panel in the editor
- AI scene generation/improve/suggest (mock-verified; real Claude path never run).
  **Grounded as of 2026-08-19**: both `generate-scene` and `improve` now receive
  the **story bible** (logline, dramatic question, theme, and each character's
  want / need / wound / voice) and **craft patterns**. Neither reached a prompt
  before — a writer filled in the most useful thing you can give a generator and
  it was dropped. The bible is loaded server-side from `script_id`, never trusted
  from the client. `improve` grounds diagnosis-first: the linter names what is
  wrong with the scene, and the technique that fixes it leads the prompt
- **The craft linter reads Nepali** — on-the-nose, emotional parentheticals and
  greetings match Devanagari and romanised Nepali as well as English. The rules
  were English-only, which left the product's whole differentiator silent on
  exactly the dialogue it tells writers to write
- **Scene sync** (`scene_sync.py`) — the `scenes` table is reconciled with the
  written draft on every save and before every storyboard generation:
  `screenplay.scene_summaries()` parses the page, rows are matched by slugline
  first and position second, and draft-derived fields land in `draft_json` so
  the structure preview's `description`/act/timing survive untouched. Rows are
  updated and appended, **never deleted** — a storyboard frame FKs to a scene id.
  This is what makes a hand-typed screenplay storyboardable and keeps the
  editor's index cards from drifting out of step with the page
- Storyboard generation (placeholder frames in demo mode; the placeholder URL
  now requests `/png` — without it placehold.co serves SVG, which ReportLab
  cannot embed, so every demo package printed "frame image not embedded").
  Frames are drawn from the draft when there is one, the structure beat when
  there isn't, and carry location / time of day / cast / the project's real genre
- Version history (Versions tab) — auto-save snapshots are **coalesced into one
  per 5-minute window** (`AUTOSAVE_SNAPSHOT_WINDOW_SECONDS`), skipped entirely
  for a no-op save or a first save over an empty page, and never coalesced
  across a manual save. **Diff view** (FR11) compares any two snapshots — ordered
  difflib hunks with line numbers and context, replacing a set-based diff that
  reported a moved line as no change at all and collapsed every blank line
- **Roles and sharing** (`membership.py`, FR12) — Admin / Editor / Viewer **per
  project**, not global: a person is usually a writer on their own work and a
  reader on someone else's. The project owner is an admin implicitly, so no data
  migration was needed. `require_script_access` / `require_project_access` take a
  `minimum` role that **defaults to editor** — forgetting to mark a route costs a
  viewer a read, never grants a write. Managed from Settings → Team Members
- Comment threads (Notes tab) — anchored to the caret line by default (type a
  number only to override), attributed to their author, ordered by page position;
  a viewer may comment, and a project admin may moderate
- **Craft linter** (`POST /scripts/lint`) — deterministic diagnostics built from
  every craft entry's `warning_sign`; zero AI cost, works on partial drafts,
  groups flags by `craft_level`
- **Measurement layer** — `fingerprint.py` / `benchmark.py` /
  `build_fingerprints.py` + `POST /scripts/benchmark`: compares a draft's shape
  against corpus percentiles. Gated on draft size, not on a user clicking
  "done". See `RECOMMENDATION_ARCHITECTURE.md`
- Screenplay parser (`screenplay.py`) + `.fdx` export
- Script export PDF / Word / **Final Draft `.fdx`** / production package.
  Every export is titled and filenamed after the project (all four used to
  download as `script.pdf` titled "Baakhapaa Script"). The **production package**
  (FR13) is now an actual production document: title page, screenplay, a shot
  list carrying slugline / cast / beat / action / camera notes per shot, and a
  storyboard section with the frames embedded. Image embedding is bounded —
  per-fetch timeout, shared budget, `EMBED_STORYBOARD_IMAGES=false` to disable —
  and degrades to a captioned frame box, which is the normal case for a board
  whose DALL-E URLs have expired.
  **Devanagari in PDF works** as of 2026-08-18: `assets/NotoSansDevanagari-Regular.ttf`
  (SIL OFL, provenance in `assets/README.md`) is bundled and wins over the
  non-redistributable Windows Nirmala fallback. `tests/test_font_asset.py` no
  longer skips — it now fails if anyone removes the asset
- **Script review before finalization** (`review.py`, FR07) — deterministic and
  free: near-duplicate character names, scenes far off their allotted time, act
  balance against 33/33/34, runtime drift. `GET /scripts/{id}/review`, also
  returned by `/finalize`. Reports, never blocks — the editor shows findings
  with "Keep writing" / "Finalize anyway"
- **Storyboard frame controls** (FR09) — shot-type override, editable camera
  notes, reorder, and redraw, in `StoryboardView`. The routes shipped with the
  first storyboard commit and nothing called them for months. Frames now arrive
  carrying their scene (slugline, cast, act) so the board can be matched to the
  script. Regenerating re-derives the description from the scene and **never
  overwrites a camera note a user edited**
- **Camera notes** (FR08) — derived per frame from shot type, sequence position,
  cast, time of day and emotional beat. Deterministic, no API call. Previously
  written as `""` on every frame ever generated
- **Payments through three gateways** (`payments.py` + `khalti.py` + `esewa.py`
  + `subscription_service.py`) — Khalti and eSewa alongside Stripe, chosen per
  checkout on the pricing page. Stripe cannot collect from most Nepali cards,
  which made the whole billing system untestable against the actual market.
  **Only Stripe has subscriptions**: Khalti and eSewa take one payment once, so
  a plan bought through them sets `users.subscription_expires_at` 30 days out and
  lapses to free when it passes. NULL means "not time-boxed" (Stripe owns the
  renewal), which is why adding the column downgraded nobody. Every tier check
  reads `payments.effective_tier()`, so an expired month reads as free
  everywhere. A `payments` row is written **before** the user leaves for the
  gateway — a user returns from Khalti holding only a `pidx`, and if the tier
  came from that request anyone could return claiming `studio`. On return the
  gateway is asked directly what happened and the amount is checked against the
  price we recorded. **Three modes, not two** (`live` / `sandbox` / `demo`):
  with no keys at all **both Nepali gateways open their real payment pages** —
  eSewa via its published `EPAYTEST` UAT pair, Khalti via the sandbox key in its
  own documentation samples (a sample, not a designated shared credential: get
  your own from test-admin.khalti.com). Stripe stays simulated because
  `sk_test_` keys are per-account, and the UI says so. `demo` is the only state
  that proves nothing, and it is labelled as such. `PAYMENT_SANDBOX=false` forces it offline
  (the test suite pins that). The return URL is a **path**
  (`/payment/return/{provider}`), never a query string: every gateway appends
  its own parameters and eSewa's docs do not say what it does when one is
  already there
- **RAG craft grounding** — `knowledge_base.json` (**29 craft entries** across
  five levels: structure, scene, dialogue, character, image) →
  `load_knowledge_base.py` → `script_patterns`; `rag.retrieve_relevant_patterns()`
  injects the top-3 semantic matches into `generate_structure`. Retrieval embeds
  the entry's **problem** first, since writers arrive with a symptom, not a genre
  tag. Embeddings are local (fastembed `bge-small-en-v1.5`, 384-dim), so this
  needs no API key. Every `worked_example` is original prose — that's what keeps
  the corpus publishable by construction
- **Freemium split** — free tier runs on RAG only, zero Claude cost:
  `POST /scripts/recommendations` (all tiers) powers the editor's Patterns tab;
  `generate-scene`/`improve`/`suggest` are Pro/Studio (403 for free);
  `generate-structure` gives free users a RAG-grounded skeleton
- Settings page (`/settings`), account dropdown, all four nav tabs routing,
  `/storyboards` + `/exports` index pages
- Command palette (⌘K), bento dashboard, warm near-black + gold retheme
  (Spectral/Mukta/Courier Prime), clickable scene cards, and the 2b compact
  timeline instrument when the structure panel is minimized
- **Production preflight** (`deploy_checks.py`) — `APP_ENV=production` turns the
  documented-but-unenforced deploy settings into boot requirements: the backend
  refuses to start on an unset `CORS_ORIGINS`, `DEMO_SEED=true`, a SQLite
  fallback database, or a Devanagari font that resolves only to Windows' Nirmala.
  Every one of those was previously a line in a markdown file asking a human to
  remember something. Defaults to `development`, so local dev is unaffected
- **Deploy artefacts** — `Procfile` + `railway.json` (both carry
  `--proxy-headers --forwarded-allow-ips='*'`, without which every user shares
  one rate-limit bucket) and `baakhapaa-frontend/vercel.json` (SPA rewrite, so a
  hard refresh on `/dashboard` is not a CDN 404, plus security headers)
- Demo mode: local SQLite DB + mock AI + placeholder storyboards + mock payments
  when `.env` has placeholder keys (test login: `test@example.com` / `password`)

**Not yet built / known broken:**
- Tier enforcement is now **complete** — AI generation, Word/package export, the
  free project limit (402), and storyboard generation are all gated server-side.
  The editor now *offers the plan* on a locked AI tab instead of printing the
  403 as an error, so the paid tabs are no longer dead ends for free users
- Login/register rate limiting (`rate_limit.py`, 5/min per IP) and the
  server-side password policy (`models.password_policy_errors`) **are done** —
  older notes below and in AUDIT_REPORT.md still list them as open
- ~~Devanagari in PDF exports~~ — **closed 2026-08-18**, font bundled. The
  narrow screenplay column CSS (D1) is still open
- **Live co-editing (FR10) is the one unmet promise.** Sharing, roles and
  attributed comments now work, so collaboration is real — but simultaneous
  editing with visible cursors needs a real Supabase project and was deliberately
  not faked again. `ROADMAP.md` recommends descoping it and amending the PRD
- ~~Custom user-added scenes UI~~ — **closed 2026-08-20**: the Corkboard's
  "+ New scene" and the Outline's per-act add compose a slugline inline, write
  the row and the scene block together
- **Collaboration/presence was REMOVED 2026-08-13** (`CollabBar`, `realtime.js`,
  `@supabase/supabase-js`) — it showed "Solo session" to every user because it
  needs real Supabase keys. This contradicts PRD US4, which still lists
  real-time collaboration as in scope; that reconciliation is PROJECT_PLAN **E7**
- **Nothing renews on its own.** Khalti and eSewa have no subscription
  primitive, so a lapsed plan stops working. `PlanNotice` warns in-app and
  `renewals.py` mails the writer who has *not* opened the app (plain SMTP, one
  reminder per expiry date, sends nothing until `SMTP_HOST` is set). What
  remains is an SMTP account and a cron entry
- Real API keys / real Supabase — **all verification to date is demo-mode**,
  payments included: the three-gateway flow is verified end to end against
  sandbox/demo paths only, and no real money has moved
- GENERATION_ARCHITECTURE.md: the RAG layer shipped; the 4-stage
  scaffold→expansion→critic→revision pipeline is still spec-only

**Project skills** (`.claude/skills/`, auto-load in this repo): `script-rag`
(operate the RAG pipeline), `script-structure` (beat grammars + the technique
playbook distilled from every analysis — use when writing or analyzing scripts).

**Repo:** `shubhyeahdav/baakhapaascript`, default branch **`codebase`**. This
working copy is **two nested repos** — the wrapper at `D:\AkxyaRup` (branch
`main`, holds `.claude/` + a gitlink) and this project repo (branch `master` →
`origin/codebase`). Don't target `main` with project work. Full explanation and
the push sequence: `WORKING_GUIDE.md` §1 and §3. PR #1 open.

**Copyright:** `raw_scripts_TEMP/` (117 screenplays, incl. a ~19MB
`knowledge_base.json` of full script text) is gitignored at the wrapper level
and must never be committed or published. Don't confuse it with the app's own
`baakhapaa-backend/knowledge_base.json` (~35KB, all original prose).

**Next priorities:** `ROADMAP.md` — the remaining six weeks, ordered so that
everything only discoverable in production comes first. The short version: the
build has never run outside demo mode, has never been deployed, has no CI, and
cannot take money in Nepal. None of those are feature work.

## Security (see AUDIT_REPORT.md; re-checked in PROJECT_PLAN.md §3 + §6)
A full audit was done. All script-related endpoints enforce ownership via
`require_script_access()` in `auth.py` (returns 404 to avoid id probing) —
re-verified 2026-07-11. Project/frame updates use field whitelists.
**Fixed:** `JWT_SECRET` is now required — the backend refuses to boot on a
missing/short/default secret (`3b66222`).
**Also fixed since the audit** (this list read as open for a while after it
wasn't): login/register rate limiting (`rate_limit.py`); a server-side password
policy (`models.password_policy_errors`, enforced in `/auth/register`); the mock
test user now requires `DEMO_SEED=true`; Word/package export and storyboard
generation are gated by `require_tier`; login equalises timing between an unknown
email and a wrong password.
**All three former pre-deploy items are now enforced rather than documented**
(2026-08-20): `APP_ENV=production` makes `deploy_checks.py` refuse the boot on an
unset `CORS_ORIGINS`, a `DEMO_SEED=true` known credential, a SQLite fallback
database, or a Devanagari font resolving only to Nirmala; and `Procfile` /
`railway.json` both carry `--proxy-headers --forwarded-allow-ips='*'`. See
`DEPLOYMENT.md`. What remains is running it — none of this has been exercised
against a real host.

## Session log (2026-07-05)
Built this session, each its own commit (`git log` for hashes):
1. Frontend redesign — split-screen login + richer dashboard (indigo cinematic theme)
2. Version History UI (Versions tab), Comment Threads UI (Notes tab)
3. Collaboration bar (Supabase presence, solo fallback), Pricing page `/pricing`
4. Demo mode — mock DB + mock AI + placeholder storyboards (no keys needed)
5. Fixes — invalid model id (`claude-sonnet-5`), login/bcrypt, opening projects
   (new `GET /scripts/project/{id}` get-or-create route), `.env` untracked + gitignored
6. Security audit → `AUDIT_REPORT.md` (ownership checks, mass-assignment whitelists,
   frontend error handling, dead-code removal)

**Design-sync (claude.ai/design):** attempted per user request to seed the theme as
design inspiration. **Blocked** — DesignSync needs interactive `/design-login` auth,
unavailable in this environment. This repo is a CRA app (no component-library `dist/`/
Storybook), so a full component sync isn't possible; only a theme/token seed would be.
Revisit from an interactive terminal or via Claude Design's "Send to Claude Code Web".
