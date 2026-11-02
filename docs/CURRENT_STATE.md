# Current state

Moved word for word from `CLAUDE.md` on 2 November 2026, to keep that file short.
Figures here are as written at the time; the counted ones are in `CLAUDE.md`.
"The top of Current State" below means the Current State section of `CLAUDE.md`.

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
- **RAG craft grounding** — `knowledge_base.json` (**47 craft entries** across
  five levels: structure, scene, dialogue, character, image — 39 that serve
  both crafts plus the six long-form video ones) →
  `load_knowledge_base.py` → `script_patterns`; `rag.retrieve_relevant_patterns()`
  injects the top-3 semantic matches into `generate_structure`. Retrieval embeds
  the entry's **problem** first, since writers arrive with a symptom, not a genre
  tag. Embeddings are local (fastembed `bge-small-en-v1.5`, 384-dim), so this
  needs no API key. Every `worked_example` is original prose — that's what keeps
  the corpus publishable by construction.
  **A Nepali complaint is translated OUT of Nepali before it is embedded**
  (`craft_query.py`). The corpus is English and the model is English, so a
  Devanagari query scored precision@1 of 16.7% — the product's differentiator
  working worst for the market it is for. The obvious fix, a Nepali gloss field
  in the corpus, was killed by measurement: `bge-small-en-v1.5` scores two
  Devanagari sentences at 0.898 same-meaning against 0.877 different-meaning, a
  0.02 gap, so it cannot read the script at all. Real-query p@1 is now **90.0%**
  (`eval_retrieval.py`, gated in CI at 0.85). Note that the headline was "88%"
  for a while on a golden set with five Nepali queries in twenty-five; widening
  it to forty put the honest figure at 71.8% before any of this landed
- **Long-form video is a fourth format** (`long_form`, `videoscript.py`) —
  8-25 minute YouTube content written section-first. `short_form` is capped at
  180 seconds and everything else is a screenplay measured in pages, so a
  twelve-minute video essay previously had to be forced through a three-act
  split or stored as a lie about its length. Sections are delimited in the
  DOCUMENT (`## HOOK - 0:15`) the way sluglines delimit scenes — structure held
  beside the text cannot survive export, cannot be diffed, and drifts on the
  first edit. `scene_sync.parser_for` switches on the project's format, so
  Outline, Corkboard, versions, comments, sharing and review all work untouched;
  a section is stored as a `scenes` row with its video fields in `draft_json`.
  **A section is not a scene** — `act_number`, `time_allocation` and INT/EXT are
  left null rather than repurposed. Runtime is words over a speaking rate
  (`SPEAKING_WPM_EN` / `SPEAKING_WPM_NE`), not pages; **the Nepali rate is not
  measured** and is a pilot question.
  **The Outline draws a retention shape for it** (`RetentionShape.jsx`,
  `lib/retention.js`) — sections proportional across the runtime with the
  conventional attention drop-offs overlaid, which answers the format's most
  common failure at a glance: a forty-second hook and a twenty-second payoff.
  **It states on its face that the curve is a convention, not a measurement**,
  and a test pins that it never asserts a fault — the same rule `MilestoneNote`
  follows. Bands carry `min-w-[24px]`, a PIXEL floor: the proportional floor in
  `retention.MIN_SHARE` guarantees nothing in pixels and rendered a 15-second
  hook 7px wide at 320px. **The craft library answers it in its own craft**
  (`rag.craft_for_format`, `applies_to`) — six long-form video entries, and a
  ONE-WAY exclusion: video entries stay out of a screenwriter's results,
  nothing is kept out of a video writer's. Story craft transfers, and narrowing
  the existing 39 by hand would be a judgement with no evidence behind it. That
  asymmetry buys the property worth having — **screenplay retrieval is
  numerically unchanged, 90.0% p@1 before and after**. CI now holds TWO floors
  (`--min-p1 0.80 --min-screenplay-p1 0.85`), because averaging a weak new
  craft into one number is how an 82% headline sat on top of a 20% reality
  last time.
  **`applies_to` is APPLIED** — checked against production 2026-09-17:
  `script_patterns` holds 45 rows, 39 carrying `('screenplay', 'video')` and 6
  carrying `('video',)`, which is exactly the shape the loader writes. (Month 4
  Day 15 added two more `('video',)` entries to `knowledge_base.json`;
  production reaches 47 only after `load_knowledge_base.py` is re-run.) This
  paragraph read "needs a MIGRATION ... a video writer gets screenplay advice"
  until then, long after the migration and the loader had both been run — a
  stale warning is worse than none, because it sends the next session to fix
  something that is not broken. The migration itself lives in
  `pgvector_script_patterns.sql` and is applied by hand in the SQL editor; a
  NEW Supabase project still needs it. See
  `docs/superpowers/specs/2026-09-14-long-form-video-design.md`
- **The course, in two tracks** (`lessons.py`, `learn.py`, `LearnPage.jsx`) —
  19 lessons, free on every tier, each graded by the craft linter rather than by
  a Next button. **The Pen** (10) teaches the script page: format, action lines,
  dialogue, finishing. **The Story** (9) teaches what the page is for, each
  lesson a technique from the corpus playbook — want vs need, the inciting
  incident as a choice, cost of pursuit, three acts, the midpoint flip, progress
  as the trap, institutional antagonists, detonating at a celebration, and
  redefining victory. Split on a lesson's `track` field because page craft and
  story craft fail independently. The linter reads pages, so its rules route
  into Pen lessons; `review.py`'s structural findings (act balance, runtime
  drift) are the only automatic route into Story, and the craft panel links the
  rest of that track by hand — no check can tell a writer their midpoint does
  not flip
- **The Pen teaches onboarding** (`ThePen.jsx`, `Onboarding.jsx`) — the course
  was the best thing in the product and sat behind a nav item nobody had reason
  to press. A guide character now asks the four questions and teaches lesson one
  **inside onboarding**: the writer produces a real scene heading, graded by the
  craft linter, before they ever see the editor. They arrive having already
  written something correct. Deliberately NOT copied from Duolingo: hearts
  (contradicts the course's "no penalty for trying"), streaks (a screenwriter
  who rests is not failing) and points (this product reports measurements, not
  scores). The Pen is a nib, not a creature — a cartoon congratulating a
  screenwriter reads as condescension
- **The course speaks Nepali** (`lessons_ne.py`) — all 19 lessons, 76 prose
  fields, served on `?lang=`. Fallback is per FIELD so a lesson added before
  anyone translates it still reads correctly. The interface had spoken Nepali
  since `i18n/strings.js`; the course had not, which was the least defensible
  English left in a product that lints Nepali dialogue
- **Structure suggests, it does not write** (2026-08-26) — the wizard used to
  generate a three-act structure straight after creating a project, so a writer
  arrived in an editor already holding scenes nobody had asked for. It now goes
  to a blank page; structure is requested from inside the editor, against
  whatever is already written
- **The Pen is on the page, not only in onboarding** (`PenPrompt.jsx`,
  `GuidePanel`) — the guide character that asks onboarding's four questions and
  teaches lesson one now also meets a writer on an empty draft, offering one
  concrete line to type (`INT. CHIYA PASAL - DAY`, inserted on click) and a way
  into the walkthrough. It matters because the wizard no longer generates a
  structure, so a new project opens genuinely empty. `GuidePanel` — what the
  prompt hands off to — carries the Pen too, its mood driven by the step's
  existing draft `check` rather than decoratively. Three constraints the browser
  taught: the prompt needs a **z-index** (the opaque screenplay page paints over
  it otherwise, and the component works while being invisible), it takes
  `pageTheme` because the app's ink tokens wash out on `#FAF9F6` paper, and
  `ThePen` takes `decorative` so only the Pen that is *speaking* gets an
  accessible name. Empty drafts only, never in focus mode, `pointer-events-none`,
  nothing to dismiss
- **Sharing lives on the work** — a Share sheet in the editor mounts the same
  `TeamPanel` Settings does, scoped to the open project (`script.project_id`,
  not `script.project.id` — that sub-object is a field subset with no id)
- **Focus mode actually focuses** — it left the whole 13-control toolbar
  standing. The toolbar is now hidden, and the page carries a status line with
  the three facts worth interrupting for: page position, THIS session's word
  count, and save state. Hiding chrome hid the save indicator, and "is my work
  saved" is what breaks focus fastest
- **Tier limits are real** — `FREE_PROJECT_LIMIT = 3` (was 1, which collided
  with the course: finishing it spent the entire allowance). `membership.SEAT_LIMITS`
  gives free 2 collaborators, pro 5, studio unlimited — enforced against the
  project OWNER's plan. This is what Studio buys; until now `PAID_TIERS` held
  both paid tiers and nothing branched on studio
- **AI credits** (`ai_budget.py`, 2026-10-28) — the monthly spend ceiling is
  shown to writers as credits (one credit = one cent of provider cost, so Pro's
  $6 is 600, Studio's $40 is 4,000) with what the remainder still covers ("about
  150 scenes or 450 frames") and the reset date. Costs per action are upper
  bounds from each route's `max_tokens`, rounded up, so a plan made from them
  never runs out early. The pricing page reads allowances from
  `GET /subscription/plans` rather than typing them. **Storyboard frames now
  spend credits** — images were the one AI cost the ceiling never counted, so a
  Pro account's scenes stopped at the limit and its boards did not. A board is
  capped at what the month's credits still pay for, and says so. The dollar
  ceiling stays the single source of truth; no migration
- **Month 4 (2026-10-28)** — `MONTH_4_REPORT.md` has the account. In short:
  a public **landing page at `/`** and a **tour at `/tour`** (both prerendered;
  the SPA fallback is now `build/app.html`), each showing the linter's REAL
  output, held to it by `tests/test_landing_hero.py`; **margin notes**
  (`PageNotes`) beside flagged lines; the **short-form layer** folded in
  (`rhythm.py`, `outlier.py`, `shorts.py`, the `short_measurements` table —
  **migration not yet applied to production**); **course mode reachable** from
  the wizard ("Kind of video"); the course, grader and editor toolbar in
  Nepali; no invented pages, acts or screenplay milestones on video.
  `scripts/walk.mjs` walks five journeys through the UI and refuses unless
  demo; `scripts/landing-check.mjs` is a CI step
- **Terms and Privacy are reachable** — `/terms` and `/privacy`, public, served
  from the root markdown through a build-time virtual module (one copy, no
  drift). Sign-up states what is being agreed to. Both documents are still
  unreviewed templates and say so in a banner
- **Invitations** (`invites.py`, FR12) — anyone can be invited, including
  someone with no account. `add_member` used to refuse an unknown address, so
  collaboration could only start between two people who had both already found
  the product. **The link does not grant access** — it only describes the offer;
  membership comes from registering with the invited address, because a link
  that granted access would be a bearer token in a forwarded chat message. No
  email is sent (there is no SMTP account and `renewals.py` shows what
  pretending otherwise costs) — the inviter passes the link on themselves.
  Pending invites occupy a seat. `project_invites` **is applied** — checked
  against production 2026-09-25, all nine columns present. This line read "a
  fourth unapplied migration" until then, long after the table existed, which
  is the same failure mode the `applies_to` paragraph above records: a stale
  warning is worse than none, because it sends the next session to fix
  something that is not broken. `check_schema.py` now watches this table too,
  so the claim is answered by the database rather than by this file
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
  when `.env` has placeholder keys (test login: `test@example.com` / `password`).
  **This machine is no longer in it — see the warning at the top of Current
  State.**

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
- ~~**Live co-editing (FR10) is the one unmet promise.**~~ — **descoped
  2026-08-26.** Collaboration in Phase 1 is asynchronous and real: sharing,
  per-project roles, attributed line-anchored comments. Simultaneous editing with
  visible cursors needs a real Supabase project and was deliberately not faked
  again; `PRD.md` US4 and both scope lists were amended to say so rather than
  leave the promise standing
- ~~Custom user-added scenes UI~~ — **closed 2026-08-20**: the Corkboard's
  "+ New scene" and the Outline's per-act add compose a slugline inline, write
  the row and the scene block together
- **Collaboration/presence was REMOVED 2026-08-13** (`CollabBar`, `realtime.js`,
  `@supabase/supabase-js`) — it showed "Solo session" to every user because it
  needs real Supabase keys. PRD US4 was reconciled with that cut on 2026-08-26
  (PROJECT_PLAN **E7**, now closed)
- **Nothing renews on its own.** Khalti and eSewa have no subscription
  primitive, so a lapsed plan stops working. `PlanNotice` warns in-app and
  `renewals.py` mails the writer who has *not* opened the app (plain SMTP, one
  reminder per expiry date, sends nothing until `SMTP_HOST` is set). What
  remains is an SMTP account and a cron entry
- ~~Real API keys / real Supabase — all verification to date is demo-mode~~ —
  **no longer true as of 2026-09-09.** `.env` now holds real Anthropic, OpenAI
  and Supabase credentials, and the app reports `PROVIDER=anthropic`,
  `MOCK_AI=False`, storyboards live and `use_mock=False`. Nobody wrote that
  down, so every doc still described demo mode and two days of testing wrote
  into the real database believing it was a local file. **Payments are the one
  thing still unproven** — the three-gateway flow is verified against
  sandbox/demo paths only, and no real money has moved
- GENERATION_ARCHITECTURE.md: the RAG layer shipped; the 4-stage
  scaffold→expansion→critic→revision pipeline is still spec-only

## Earlier wording and history

- Dark theme (**warm near-black + true gold**; defined in `tailwind.config.js`
  + `index.css`). This section described a cool indigo/slate palette until
  2026-08-25, which had not been true since the turn-2 retheme — and the
  Current State section below had been describing the real one all along, so
  the file contradicted itself.

*Rewritten most sessions, so it carries no single "updated" date — one was
here reading 2026-08-13 while everything under it was current. `git log -p
CLAUDE.md` is the honest history; `PROJECT_PLAN.md` §6/§7 has the changelog
and `HANDOVER.md` the narrative. The numbers in it are counted by
`check_docs.py`, not typed.*

Backend tests: **1319 across 87 files, none skipped, all passing**
(2026-09-17), `./venv/Scripts/python -m pytest`. It read "2 skipped" until
then, which had been wrong since the Devanagari font gate stopped skipping
— the asset is bundled and `tests/test_font_asset.py` now fails rather than
skips if anyone removes it. `check_docs.py` counts the tests but not the
skips, so that number was typed and drifted the way typed numbers do.
Frontend tests: **1585 across 80 files**, `npm run test:ci`.

**Repo:** `shubhyeahdav/baakhapaascript`, default branch **`codebase`**. This
working copy is **two nested repos** — the wrapper at `D:\AkxyaRup` (branch
`main`, holds `.claude/` + a gitlink) and this project repo (branch `master` →
`origin/codebase`). Don't target `main` with project work. Full explanation and
the push sequence: `WORKING_GUIDE.md` §1 and §3. PR #1 is closed and merged (verified against the GitHub API 2026-08-31); `feature/auth-editor-ux` was fast-forwarded into `codebase` the same day.

Verified against the deployed pair with the browser's real `Origin`: register,
login, `/auth/me`, create project, save draft, cast, lint, recommendations and
review all 200; scene sync reconciled a Devanagari draft in production Postgres;
the live login form returned the server's own 401. `DEPLOYMENT.md` holds the
runbook as followed, including the three env-var traps that cost an hour —
`KEY=VALUE` pasted into a value box, an origin with a trailing slash and a
missing `//`, and `VITE_API_URL` needing a cache-free **rebuild** because Vite
inlines it at build time.

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
