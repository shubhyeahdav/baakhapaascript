# Month 3 — daily task list

System work only. Twenty working days, ten tasks each, ordered so nothing waits on
something later in the list.

Three things gate everything in Week 1 and are not tasks anyone can code around: an
Anthropic account with credit, a Supabase project, and a domain. Get those before Day 1.

---

## Where this stands (2026-09-03)

**117 of 200 done** (2026-09-11). Weeks 2 and 3 are complete except for the parts
that need a deployed system; Week 4 is partly done.

Everything closed on 2026-09-11 was closed by **measuring**, and two of the eight
were closed by measuring and then not doing the thing: diversity reranking made
coverage worse, and prompt caching does not apply at this prompt size. A task
list is allowed to be finished by a negative result, and those are the cheapest
results on it — see `RECOMMENDATION_ARCHITECTURE.md`.

What is still genuinely blocked has not changed: deployment, Anthropic *credit*
(the key is set), an SMTP account, merchant accounts, and a real phone.

**The Supabase project now exists**, so the line below about Week 1 being blocked
on it is out of date and the four items that waited on it are unblocked — the
pgvector migration is the next one worth doing. What is still genuinely blocked
is deployment, Anthropic *credit* (the key is set), and an SMTP account.

What the work actually found, in the order it was found:

- **Real-query retrieval went from 56% to 88% precision@1**, and the win was not
  where the plan expected. Widening the golden set from 5 queries to 25 exposed
  that one entry was answering 21 of them — a default, not a retrieval. The cause
  was the query, not the corpus: `"Drama | Emotional | "` was being prefixed to
  every search, and genre and tone are near-constant, so they pulled everything
  toward whichever entry read as most generically emotional. Removing them, and
  dropping craft exposition out of the embedded text, did most of it. Ten new
  craft entries for gaps the misses exposed — a sagging middle, a dull
  protagonist, overwritten dialogue — did the rest. CI now fails on a regression.
- **A larger embedding model buys nothing here.** Measured: bge-base at 768
  dimensions scores identically on precision@1 for 4.6x the embedding time. The
  project skill claimed otherwise; it now says what was measured.
- **`pgvector_script_patterns.sql` described a table the loader could not write
  to** — seven columns missing, two NOT NULL columns nothing writes, and a check
  constraint rejecting the type every recent entry uses. It has never been run,
  so nothing caught it. Day 1 would have. `tests/test_pattern_schema.py` now
  fails if the two drift again.
- **Prompt caching does not apply at this prompt size** and is deliberately not
  implemented. The stable prefix measures 131 tokens against a 1024-token
  minimum. Adding `cache_control` would read like an optimisation and cache
  nothing; the measurement is in the docstring so nobody adds it later.
- **The screenplay page held 35 of 61 columns on a phone.** Not a narrow page —
  a different format, where every line of dialogue wraps. Fixed by sizing the
  font to the column count. Two header controls were under the 24px WCAG floor.

### What 2026-09-09 found

- **Three of the editor's four views did not exist on a phone.** Corkboard,
  Outline and Cast render as children of the scene rail, and the rail is
  `hidden lg:flex` — so below 1024px they were hidden outright, along with the
  switcher that reaches them. Measured: zero of four switches at 375px, four at
  1280px. The rail now takes the whole width when the writer is reading rather
  than writing. `29f1a96`.
- **The command palette's project list was loaded once per tab**, so a project
  created after the first ⌘K was missing until a reload — from the fastest route
  to a project. `97d102f`.
- **The email-normalisation migration is safe on this data.** No duplicates
  differing only in case, and nothing that is not already lowercase.

Blocked, and not by anything that can be coded around:

- ~~**All of Week 1** waits on a Supabase project~~ — **done.** `SUPABASE_URL`
  and `SUPABASE_KEY` are set and the app runs against the real Postgres. Two
  things came with that and are worth knowing: nobody updated the docs, so two
  days of testing wrote into the real database believing it was a local file
  (see `HANDOVER.md` §1); and the first thing real Supabase broke was
  concurrency — `httpx.RemoteProtocolError: Server disconnected` on about one
  request in eight, fixed by giving PostgREST an HTTP/1.1 client (`f7b84d3`).
- **Days 4, 5, 20** wait on deployment and on Anthropic credit.
- **Day 17** waits on an SMTP account.
- Four items inside Weeks 2 and 4 wait on the same Supabase project: running the
  pgvector migration, measuring retrieval latency against Postgres, moving
  storyboard images into Storage, and taking a real payment.

---

## Week 1 — Make it real

### Day 1 · Cloud database

- [x] Create the Supabase project; copy URL and service role key into `baakhapaa-backend/.env`
- [x] Confirm the keys are uncommented and the file has no byte-order mark
- [x] Back up `baakhapaa_local.db`, then delete it — *copied to `C:/Users/User/baakhapaa_local.db.2026-09-11.bak` and verified readable (188 rows) before deleting. It was last written 7 September and had not been the store since the Supabase keys landed, so every hour it stayed was an hour somebody could mistake it for one*
- [x] Run `supabase_schema.sql` in the SQL editor
- [x] Check for duplicate email addresses differing only in case, before migrating — *none. 24 accounts, 24 distinct addresses once normalised, and every one already lowercase — so the migration that was flagged as the only one able to fail on real data is safe here*
- [ ] Run the email normalisation migration; merge or delete duplicates if it fails
- [x] Run the Google sign-in column migration
- [x] Run the `subscription_expires_at` / `renewal_notices_json` migration
- [x] Run the `project_invites` migration
- [x] Verify all eight tables exist and are empty — *fifteen, not eight; `postgres_smoke.py` checks every one*

### Day 2 · Boot against Postgres

> `python postgres_smoke.py` runs steps 2 to 7 of this day in one command and
> refuses to run against the SQLite mock. Written 2026-09-04 because every
> environment to date has been the mock, which is what let the pgvector schema
> drift undetected — and because ten hand-checked steps each fail in a way that
> looks like the step before it.


- [x] Point the backend at Supabase and start it
- [x] Read every complaint `deploy_checks.py` makes and fix each, not the check
- [x] Register a fresh account and confirm the row lands in Postgres, not SQLite
- [x] Create a project, save a draft, confirm `scene_sync` writes scene rows
- [x] Run `load_knowledge_base.py` against Postgres, then restart the backend
- [x] Confirm `script_patterns` holds 39 rows (was 29 when this was written; ten craft entries were added on 2026-09-03)
- [x] Open the Patterns tab and confirm retrieval returns results from Postgres
- [x] Run the backend suite once end to end and record the number
- [x] Note anything that behaved differently from the mock database
- [x] Commit any fixes with the difference described in the message

### Day 3 · Deploy

- [ ] Deploy the backend to Railway, root `baakhapaa-backend`
- [ ] Set `APP_ENV=production`, a fresh `JWT_SECRET`, `CORS_ORIGINS`, `DEMO_SEED=false`
- [ ] Set `REQUIRE_SHIPPABLE_FONT=true` and confirm the boot survives it
- [ ] Confirm `--proxy-headers` is active; without it every user shares one rate-limit bucket
- [ ] Deploy the frontend to Vercel, root `baakhapaa-frontend`
- [ ] Set `VITE_API_URL` to the Railway address
- [ ] Confirm the SPA rewrite works: hard-refresh `/dashboard` and check it is not a 404
- [ ] Register an account on the deployed site from a phone
- [ ] Check the security headers are present on the deployed frontend
- [ ] Record the live URL somewhere the merchant applications can quote it

### Day 4 · First real-key walk

- [ ] Add credit to the Anthropic account
- [ ] Generate a structure on the deployed system and read what comes back
- [ ] Fix whatever `_extract_json` fails on; real models add preamble
- [ ] Generate a scene and confirm it streams rather than arriving at once
- [ ] Improve a scene and confirm the rewrite streams too
- [ ] Ask for suggestions and confirm the response shape is handled
- [ ] Generate a storyboard and time it; confirm it is under two minutes
- [ ] Export a production package and confirm the frames embed
- [ ] Export a PDF containing Devanagari and confirm the glyphs render
- [ ] Record the measured cost of one full script from the provider dashboard

### Day 5 · Fix what the walk found

- [ ] Triage every fault from Day 4 into fix-now or write-down
- [ ] Fix the ones that stop a writer finishing a script
- [ ] Add a test for each fix before fixing it
- [ ] Re-run the full backend suite
- [ ] Re-run the full frontend suite
- [ ] Re-run the production build
- [ ] Redeploy and repeat the walk from Day 4 in under ten minutes
- [ ] Apply to Khalti with the live URL, company registration and bank details
- [ ] Apply to eSewa with the same
- [ ] Merge the working branch into `codebase` and push

---

## Week 2 — Make retrieval good

Baseline is 20% precision@1 on real queries. Everything this week is measured against it.

### Day 6 · Widen the measurement

- [x] Re-run `eval_retrieval.py` against Postgres and confirm the baseline is unchanged
- [x] Add ten more focus-chip style queries to the golden set
- [x] Add five queries written the way a beginner would phrase them
- [x] Add five in romanised Nepali, since the product lints it
- [x] Split the report by craft level so the weak ones are visible per run
- [x] Record which entries never appear in any result
- [x] Record which entries appear in almost every result
- [x] Commit the widened golden set with the new baseline
- [x] Write the baseline into `RECOMMENDATION_ARCHITECTURE.md`
- [x] Add the harness to CI so a knowledge-base edit that hurts retrieval fails the build

### Day 7 · Rewrite the weak entries

- [x] List the entries whose `problem` field reads like a technique rather than a symptom
- [x] Rewrite each `problem` as the complaint a stuck writer would actually type
- [x] Do the dialogue entries first; they score worst at 57%
- [x] Reload the knowledge base and restart the backend
- [x] Re-run the eval and record the change
- [x] Revert any rewrite that made the number worse
- [x] Check the over-retrieving scene entries for problems that are too general
- [x] Narrow those, reload, re-measure
- [x] Commit each rewrite batch separately so a regression is bisectable
- [x] Update the `script-rag` skill if the guidance on writing entries has changed

### Day 8 · Move to pgvector

- [ ] Run `pgvector_script_patterns.sql` against Supabase
- [ ] Confirm the table, the index and the `match_script_patterns` function exist
- [ ] Re-run the loader so embeddings land in the vector column
- [x] Switch retrieval from fetch-all-and-rank to the RPC
- [x] Keep the Python cosine path as the fallback when the RPC is unavailable
- [x] Confirm the dimension guard still refuses a mismatched stored vector
- [ ] Re-run the eval and confirm the number did not move
- [ ] Measure retrieval latency before and after
- [x] Add a test that a database error still returns an empty list rather than raising
- [ ] Commit with both numbers in the message

### Day 9 · Try a better model

- [x] Record the current embedding model and dimension
- [x] Try a larger sentence-transformer and re-embed the corpus
- [x] Re-run the eval; keep the change only if precision@1 improves
- [x] Measure the cost in load time and memory
- [ ] If it improves, update the dimension in the pgvector schema
- [x] Try retrieving five and reranking to three by craft level — *measured and **rejected**. Rank 1 left untouched, the other two filled preferring an unseen level: p@1 and p@3 both unchanged at 90.0% / 97.5%, and coverage got **worse** — 32 of 39 entries reached against 34. Forcing level diversity pulls in the same few entries that sit near the top across many levels; the natural top-3 varies more. Written up in `RECOMMENDATION_ARCHITECTURE.md` because it will look like an obvious win again next month*
- [x] Re-run the eval on that — *above; all forty real queries, not a sample*
- [x] Try weighting the `technique` field alongside `problem`
- [x] Keep whichever combination scores best and revert the rest
- [x] Write down what did not work, so it is not retried next month

### Day 10 · Close the loop

- [x] Confirm the eval gate runs in CI and fails on a regression
- [x] Publish the before-and-after numbers in the repository
- [x] Check the Patterns tab returns the improved results in the browser
- [x] Confirm the free tier still gets retrieval with no API call
- [ ] Measure how long a Patterns request takes on the deployed system — *blocked on deployment; the server-side half is 0.007s locally once warm*
- [x] Cache the embedding model load if the first request is slow — *it was: 0.96-1.37s for the first embed against 0.005s for every one after, measured in a fresh process three times. `rag.warm_model()` now runs in a daemon thread at startup. End to end through the app: first retrieval **0.686s -> 0.007s**, boot not slower (3.59s vs 4.31s). `RAG_WARM_MODEL=false` turns it off and the suite sets exactly that*
- [x] Add ten new craft entries in the weakest level
- [x] Reload, re-measure, keep only what helps
- [x] Re-run both suites
- [ ] Merge and deploy

---

## Week 3 — Craft features

### Day 11 · Improve a line, not a scene

- [x] Pass the editor's current selection to the improve route
- [x] Fall back to the whole scene when nothing is selected
- [x] Return only the rewritten selection, not the surrounding scene
- [x] Replace the selection in place, preserving the undo stack
- [x] Keep the streaming path working for a selection
- [x] Add a test that an empty selection still improves the scene
- [x] Add a test that the rest of the draft is untouched
- [x] Confirm the craft linter's diagnosis still leads the prompt
- [ ] Try it on a real line and read what comes back
- [ ] Commit

### Day 12 · Character consistency

- [x] Add a check comparing each character's lines against their `voice` field
- [x] Flag two characters whose measures are within a small margin of each other
- [x] Flag a character whose vocabulary ratio suggests a verbal tic
- [x] Surface the flags inside the Cast view, not in a separate panel
- [x] Keep it deterministic; no API call
- [x] Write the finding in the writer's language, not in statistics
- [x] Add tests for each rule
- [x] Run it against the sample screenplay and sanity-check the output — *0 findings on `docs/samples/march.txt`, which is a pass rather than a silence: AARATI (30 lines), KANCHHA (15) and BABA (15) all clear `MIN_LINES`, and a synthetic cast of two characters given identical dialogue does fire `voices_collapsed` with its technique attached*
- [x] Link each flag to the craft entry that addresses it
- [x] Commit

### Day 13 · Remember what was recommended

- [x] Add a table recording script, technique, first shown, times shown, resolved
- [x] Write the migration and add it to the deployment guide
- [x] Record a row when a pattern is shown
- [x] Mark it resolved when the linter stops flagging that technique
- [x] Add tests for both transitions
- [x] Confirm nothing is written for an anonymous or read-only viewer
- [x] Keep the write off the request path if it slows the response
- [x] Backfill nothing; the history starts now
- [x] Add a query for resolution rate per technique
- [x] Commit

### Day 14 · Use what it remembers

- [x] Stop showing a technique the writer has already resolved
- [x] Rank a technique shown before and still unresolved above a new one
- [x] Show one recommendation with strong evidence rather than three of equal weight
- [x] Keep the other two reachable behind a single control
- [x] Confirm the free tier still gets all of this
- [x] Add tests for the ranking rules
- [x] Check the panel still loads in under a second — *server side only, which is the half that can be measured without a deploy: 0.686s -> 0.007s after the warm-up. The round trip and the render are still unmeasured and belong with the deployed measurement above*
- [ ] Try a full writing session and see whether the advice stops repeating
- [ ] Adjust the thresholds based on what that session showed
- [ ] Commit

### Day 15 · Escalate to a lesson

- [x] Surface a lesson only when a card has been shown twice and not resolved
- [x] Route through the existing rule-to-lesson map
- [x] Make the escalation visible in the craft panel, not a separate notification
- [x] Add a test that a first showing never escalates
- [x] Add a test that a resolved technique never escalates
- [x] Confirm the Story track is still reachable directly
- [x] Check the lesson opens in place rather than navigating away
- [x] Run both suites — *backend 869 across 51, frontend 1068 across 54*
- [ ] Deploy
- [x] Write down what the loop cannot see, so nobody assumes it can

---

## Week 4 — Durability

### Day 16 · Get images out of the database

- [ ] Create a Supabase Storage bucket for storyboard frames
- [ ] Upload generated images to it instead of storing data URIs
- [ ] Store the object path in `storyboard_frames.image_url`
- [ ] Keep reading existing data URIs so old boards still work
- [ ] Confirm the production package still embeds frames from storage
- [ ] Confirm the export SSRF guard still applies to storage URLs
- [ ] Measure the row size before and after
- [ ] Add a test for both storage shapes
- [ ] Delete images when their storyboard is deleted
- [ ] Commit

### Day 17 · Make renewals happen

- [ ] Obtain an SMTP account and set `SMTP_HOST`, user, password and `MAIL_FROM`
- [ ] Run `renewals.py --dry-run` and read the list it would mail
- [ ] Send one reminder to yourself and check it arrives and reads well
- [ ] Confirm nobody is mailed twice for the same expiry date
- [ ] Schedule it daily
- [ ] Confirm a lapsed plan actually reads as free everywhere
- [x] Test the whole expiry path with a backdated row — *`tests/test_expiry_end_to_end.py`, ten tests. `test_payments.py` already checked that `effective_tier()` returns free for an expired row; that is the unit, this is the consequence — a route reading `subscription_tier` directly would pass every existing test and still serve a lapsed account for ever. Covers both directions (lapsed refused, inside-month not refused, so an over-eager fix that refuses everybody fails too), the NULL-expiry Stripe case, studio dropping to free rather than pro, the free project limit coming back, and the boundary. All pass, so the gates are correct — this is a verification, not a fix*
- [ ] Confirm the in-app notice appears before the email does
- [x] Add a test for the once-per-expiry rule — *already covered: `test_renewals.py::test_a_warning_already_sent_is_not_repeated` and `::test_lapsing_after_a_renewal_is_a_new_reminder`*
- [ ] Commit

### Day 18 · The screen most of Nepal owns

- [x] Open the editor on a 375-pixel screen and write for five minutes
- [x] Fix the screenplay column, which is too narrow to hold a slugline
- [x] Check the rail, the craft panel and the corkboard at that width — *and three of the four views were not there at all. See below*
- [ ] Confirm focus mode fills the screen on a phone with a collapsing address bar
- [x] Refresh the project list when the command palette opens — *`97d102f`*
- [x] Add a jump-to-scene action to the palette — *`97d102f`*
- [x] Check every tap target is large enough to hit
- [x] Run the frontend suite — *1068 across 54 files*
- [ ] Deploy and re-check on a real phone
- [x] Commit

### Day 19 · Cost and speed

- [ ] Measure the real cost of one script from the provider dashboard
- [ ] Compare it against the $0.44 estimate and correct the estimate
- [x] Lower `max_tokens` where the output is routinely shorter than the cap
- [ ] Re-measure and confirm quality did not drop
- [x] Add prompt caching to the stable part of the prompt — *measured and **deliberately not implemented**: the stable prefix is 131 tokens against Anthropic's 1024-token minimum, so `cache_control` would read like an optimisation and cache nothing. The measurement is in `script_engine`'s docstring so nobody adds it later*
- [ ] ~~Confirm the cache is actually hit rather than silently invalidated~~ — *moot; there is no cache, see above*
- [ ] Time a storyboard on the deployed system
- [ ] Tune `STORYBOARD_CONCURRENCY` against the provider's rate limit
- [x] Add a per-account monthly spend ceiling
- [ ] Commit with the measured numbers

### Day 20 · Ready for writers

- [ ] Take one real payment, with real money, through Khalti or eSewa
- [ ] Confirm the tier is granted from the stored payment row
- [ ] Confirm a refund or failure leaves the tier untouched
- [ ] Walk the whole product once as a new user, on the deployed system
- [ ] Fix anything that blocks finishing a script
- [ ] Confirm every error message tells the writer what to do next
- [ ] Run both suites and the production build
- [ ] Recapture the screenshots for the Month 3 report
- [ ] Re-run the eval and record the closing number
- [ ] Invite the five pilot writers

---

## Carried, not scheduled

These are real and none of them blocks a writer. They go in the month after.

- Corpus fingerprints; blocked until the script corpus is on this machine
- The four-stage generation pipeline in `GENERATION_ARCHITECTURE.md`, still specification only
- A real Postgres in CI, and a migration tool instead of hand-run SQL
- Application-level encryption of script text; a design decision, not a feature
- Streaming for the suggestions route, which returns short output and gains least
- Normalising `generate-structure`, which takes its project id as a query parameter while
  every other route uses a body
