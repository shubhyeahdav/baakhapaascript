# What has been built — 2026-07-05 to 2026-09-07

135 commits over nine weeks. This is the record of what was done and, where it
matters, what it was done instead of.

It is organised by phase rather than by date, because the work came in bursts
with a theme each. Every claim here is checkable in `git log`.

**Where it stands today**

| | |
|---|---|
| Source | 23,441 lines (11,564 backend, 11,877 frontend) |
| Tests | 21,426 lines — 853 backend across 51 files, 1,058 frontend across 44 |
| Craft library | 39 entries across five levels |
| Course | 19 lessons, two tracks, in English and Nepali |
| Documentation | 32 markdown files at the repository root |
| Payment gateways | three (Khalti, eSewa, Stripe) |
| Never yet done | deployed, taken real money, run outside demo mode until 2026-09-07 |

---

## Phase 1 · Foundation (5–16 July, 38 commits)

The app existed and mostly worked; this phase made it trustworthy.

- Auth with JWT, register and login, protected routes
- Project CRUD, script editor, version history, comment threads
- **Demo mode** — mock database, mock AI, placeholder storyboards, so the whole
  product runs with no keys at all. This is what made every later phase testable
- **Security audit** (`AUDIT_REPORT.md`) — ownership checks on every script
  route, returning 404 rather than 403 so an id cannot be probed;
  mass-assignment whitelists on project and frame updates; dead code removed
- `JWT_SECRET` became a boot requirement rather than a default
- Local persistence moved to SQLite so restarts stop erasing accounts
- Stripe checkout for Pro and Studio
- **Retheme** to warm near-black and gold, replacing the indigo system
- Bento dashboard, shared top navigation, command palette (⌘K)
- Structure generation split into two steps: preview first, scenes added one at
  a time, so a writer is never handed scenes they did not ask for

Fixed along the way: an invalid Claude model id, a bcrypt/passlib version
conflict that broke every login, and opening a project from the dashboard.

## Phase 2 · The craft library (20 July – 4 August, 4 commits)

Small in commits, large in consequence. The RAG corpus was rebuilt from
structural analyses into a **craft library**: each entry a transferable
technique, the problem it solves stated the way a stuck writer would say it,
plus how it works, how to apply it, a warning sign and an original worked
example. Embeddings are local (fastembed, 384-dim), so retrieval costs nothing
per use and works with no API key.

Two project skills were written so the pipeline could be operated without
rediscovering it: `script-rag` and `script-structure`.

## Phase 3 · The craft layer (13–17 August, 12 commits)

The phase that made this a screenwriting tool rather than a text box with an AI
button.

- **Craft linter** — deterministic diagnostics built from every entry's warning
  sign. Zero AI cost, works on a partial draft, so it is free on every tier
- **Measurement layer** — fingerprints and corpus benchmarking, gated on draft
  size rather than on a writer pressing "done"
- **The course** — lessons graded by the linter rather than by a Next button
- Recommendations keyed on **diagnosis** rather than prose similarity: a linter
  flag already names the technique that fixes it
- Screenplay parser, type-ahead format completion, a shortcuts dropdown
- Short-form as a first-class format with its own beat spine, because running a
  30-second video through a three-act split produces advice about act breaks
- Eight classes of duplication collapsed across the backend
- The first frontend tests, and CI that fails on a missing Devanagari font

## Phase 4 · Deployable, and sellable in Nepal (21–25 August, 18 commits)

- **Khalti and eSewa alongside Stripe.** Stripe cannot collect from most Nepali
  cards, which made the billing system untestable against its own market. A
  payments row is written *before* the writer leaves for the gateway, because
  they return holding only a reference — taking the tier from that request
  would let anyone return claiming Studio
- **Production preflight** (`deploy_checks.py`) — `APP_ENV=production` turns
  documented deploy settings into boot requirements
- Legal documents corrected against what the product actually does
- Renewal warnings in-app and by email, since neither Nepali gateway renews
- **Nepali phonetic input**, and the interface translated
- Import from Final Draft, Fountain, Word, text and PDF — everything the system
  is best at is a form of *reading* a screenplay, and all of it was behind
  typing an existing script in again
- Create React App replaced with **Vite**
- Devanagari in PDF export, with a bundled OFL font and a test that fails if it
  is removed
- First mobile pass on the editor

## Phase 5 · Coverage and correction (27–31 August, 11 commits)

- The last 26 untested frontend files brought under test
- Invitations for people who do not yet have an account
- The course translated to Nepali — 19 lessons, 76 prose fields
- **The pricing page stopped overpromising**: Studio advertised real-time
  collaboration that had been cut, a seat cap nothing enforced, and priority
  support with no channel. Tests now pin the specific untrue sentences
- A real defect found by using the product: the craft panel was analysing the
  *focus chip's own text* and reporting the result as "found in your draft,
  line 1" — a line in a string the writer never typed

## Phase 6 · Measurement (1–3 September, 13 commits)

- **Streaming generation** — words instead of a spinner
- **Retrieval measured for the first time.** The first harness reported 82.4%;
  it was wrong, because 29 easy self-retrieval cases were being averaged with 5
  real ones. Reported apart, the real number was **20%**
- `FADE IN:` was being counted as a scene, contaminating every corpus percentile
- Page geometry rebuilt so page breaks fall where a screenplay breaks
- The Cast view — every character's dialogue read end to end
- Corkboard and Outline moved to where the reading happens
- **Month 2 report** written, rewritten eight times, and delivered

## Phase 7 · Month 3 (3–7 September, 23 commits)

### Retrieval: 20% → 88%

The largest single result in the project, and the plan was wrong about where it
would come from.

Widening the golden set from 5 real queries to 25 revealed that **one entry was
answering 21 of them** — a default, not a retrieval. The cause was not the
corpus. `"Drama | Emotional | "` was being prefixed to every search, and those
are near-constant across requests, so they pulled everything toward whichever
entry read as most generically emotional.

| | before | after |
|---|---|---|
| real-query precision@1 | 56.0% | **88.0%** |
| beginner-phrased queries | 40.0% | **100%** |
| romanised Nepali | 40.0% | **80%** |
| entries never returned | 6 of 29 | **2 of 39** |

Ten craft entries were added for gaps the misses exposed. CI now fails the build
if retrieval regresses.

**Measured and deliberately not done:** a larger embedding model (identical
precision for 4.6× the cost) and prompt caching (the stable prefix is 131 tokens
against a 1024 minimum — it would have cached nothing).

### Craft features

- **Improve a highlighted line**, not the scene around it — refusing to guess
  when the selected words appear twice
- **Voice findings** — what the Cast numbers mean, including the page against
  what the writer wrote in the story bible
- **A craft panel with memory** — stops repeating advice already taken, leads
  with one card rather than three
- **A lesson offered on the second telling**, never the first

### Money and mobile

- **Monthly spend ceiling.** Pro is Rs 999 and bought unmetered generation;
  nothing stopped one account generating continuously
- **The screenplay page held 35 of 61 columns on a phone** — not a narrow page, a
  different format where every line of dialogue wraps. Now 61
- **The editor header was 817px of controls in a 375px viewport**, scrolling
  sideways for 2.7 screens with Finalize 877px off the end. Now fits exactly
- **The bundle was one 476 kB chunk.** Split per route: `/login` went to 84.9 kB
  gzipped, −42%

### The first real database

- `pgvector_script_patterns.sql` **described a table the loader could not write
  to** — seven columns missing, two NOT NULL columns nothing writes, a check
  constraint rejecting the type every recent entry uses. It had never been run,
  and the SQLite mock creates columns on demand, so nothing caught it
- `postgres_smoke.py` runs the first-boot checklist as one command and refuses
  to run against the mock
- Connected to real Postgres on 2026-09-07. Schema present, pgvector RPC
  answering, migration clean on a fresh database

---

## What is still not true

Stated plainly, because every one of these has been reported as done at some
point in a document somewhere.

- **Nothing is deployed.** No Railway, no Vercel, no domain
- **No real money has moved.** All three gateways are verified against sandbox
  and demo paths only
- **The writes to Postgres have never succeeded** — the key currently in `.env`
  is the `anon` key, which row-level security correctly refuses
- **Nothing renews on its own.** Khalti and eSewa have no subscription
  primitive, and there is no SMTP account
- **No writer outside this project has used it.** The pilot has not started
- **The legal documents are unreviewed templates** and say so in a banner
- **The branch is 45+ commits ahead of `codebase`** and has never been merged

---

## The two lessons that cost the most to learn

**Measure before changing anything whose point is a number.** Retrieval's
obvious fix was not the effective one; the defect was in the query, not the
corpus. A bigger model — the fix the project's own documentation recommended —
bought nothing at all. Neither would have been visible without a baseline.

**A mock that agrees with everything teaches nothing.** The SQLite store creates
columns on demand and enforces no constraints, which is why a broken schema, a
missing column and a wrong check constraint all survived months of green tests.
Every one of them surfaced within an hour of pointing at real Postgres.
