# Month 3 — daily task list

System work only. Twenty working days, ten tasks each, ordered so nothing waits on
something later in the list.

Three things gate everything in Week 1 and are not tasks anyone can code around: an
Anthropic account with credit, a Supabase project, and a domain. Get those before Day 1.

---

## Week 1 — Make it real

### Day 1 · Cloud database

- [ ] Create the Supabase project; copy URL and service role key into `baakhapaa-backend/.env`
- [ ] Confirm the keys are uncommented and the file has no byte-order mark
- [ ] Back up `baakhapaa_local.db`, then delete it
- [ ] Run `supabase_schema.sql` in the SQL editor
- [ ] Check for duplicate email addresses differing only in case, before migrating
- [ ] Run the email normalisation migration; merge or delete duplicates if it fails
- [ ] Run the Google sign-in column migration
- [ ] Run the `subscription_expires_at` / `renewal_notices_json` migration
- [ ] Run the `project_invites` migration
- [ ] Verify all eight tables exist and are empty

### Day 2 · Boot against Postgres

- [ ] Point the backend at Supabase and start it
- [ ] Read every complaint `deploy_checks.py` makes and fix each, not the check
- [ ] Register a fresh account and confirm the row lands in Postgres, not SQLite
- [ ] Create a project, save a draft, confirm `scene_sync` writes scene rows
- [ ] Run `load_knowledge_base.py` against Postgres, then restart the backend
- [ ] Confirm `script_patterns` holds 29 rows
- [ ] Open the Patterns tab and confirm retrieval returns results from Postgres
- [ ] Run the backend suite once end to end and record the number
- [ ] Note anything that behaved differently from the mock database
- [ ] Commit any fixes with the difference described in the message

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

- [ ] Re-run `eval_retrieval.py` against Postgres and confirm the baseline is unchanged
- [ ] Add ten more focus-chip style queries to the golden set
- [ ] Add five queries written the way a beginner would phrase them
- [ ] Add five in romanised Nepali, since the product lints it
- [ ] Split the report by craft level so the weak ones are visible per run
- [ ] Record which entries never appear in any result
- [ ] Record which entries appear in almost every result
- [ ] Commit the widened golden set with the new baseline
- [ ] Write the baseline into `RECOMMENDATION_ARCHITECTURE.md`
- [ ] Add the harness to CI so a knowledge-base edit that hurts retrieval fails the build

### Day 7 · Rewrite the weak entries

- [ ] List the entries whose `problem` field reads like a technique rather than a symptom
- [ ] Rewrite each `problem` as the complaint a stuck writer would actually type
- [ ] Do the dialogue entries first; they score worst at 57%
- [ ] Reload the knowledge base and restart the backend
- [ ] Re-run the eval and record the change
- [ ] Revert any rewrite that made the number worse
- [ ] Check the over-retrieving scene entries for problems that are too general
- [ ] Narrow those, reload, re-measure
- [ ] Commit each rewrite batch separately so a regression is bisectable
- [ ] Update the `script-rag` skill if the guidance on writing entries has changed

### Day 8 · Move to pgvector

- [ ] Run `pgvector_script_patterns.sql` against Supabase
- [ ] Confirm the table, the index and the `match_script_patterns` function exist
- [ ] Re-run the loader so embeddings land in the vector column
- [ ] Switch retrieval from fetch-all-and-rank to the RPC
- [ ] Keep the Python cosine path as the fallback when the RPC is unavailable
- [ ] Confirm the dimension guard still refuses a mismatched stored vector
- [ ] Re-run the eval and confirm the number did not move
- [ ] Measure retrieval latency before and after
- [ ] Add a test that a database error still returns an empty list rather than raising
- [ ] Commit with both numbers in the message

### Day 9 · Try a better model

- [ ] Record the current embedding model and dimension
- [ ] Try a larger sentence-transformer and re-embed the corpus
- [ ] Re-run the eval; keep the change only if precision@1 improves
- [ ] Measure the cost in load time and memory
- [ ] If it improves, update the dimension in the pgvector schema
- [ ] Try retrieving five and reranking to three by craft level
- [ ] Re-run the eval on that
- [ ] Try weighting the `technique` field alongside `problem`
- [ ] Keep whichever combination scores best and revert the rest
- [ ] Write down what did not work, so it is not retried next month

### Day 10 · Close the loop

- [ ] Confirm the eval gate runs in CI and fails on a regression
- [ ] Publish the before-and-after numbers in the repository
- [ ] Check the Patterns tab returns the improved results in the browser
- [ ] Confirm the free tier still gets retrieval with no API call
- [ ] Measure how long a Patterns request takes on the deployed system
- [ ] Cache the embedding model load if the first request is slow
- [ ] Add ten new craft entries in the weakest level
- [ ] Reload, re-measure, keep only what helps
- [ ] Re-run both suites
- [ ] Merge and deploy

---

## Week 3 — Craft features

### Day 11 · Improve a line, not a scene

- [ ] Pass the editor's current selection to the improve route
- [ ] Fall back to the whole scene when nothing is selected
- [ ] Return only the rewritten selection, not the surrounding scene
- [ ] Replace the selection in place, preserving the undo stack
- [ ] Keep the streaming path working for a selection
- [ ] Add a test that an empty selection still improves the scene
- [ ] Add a test that the rest of the draft is untouched
- [ ] Confirm the craft linter's diagnosis still leads the prompt
- [ ] Try it on a real line and read what comes back
- [ ] Commit

### Day 12 · Character consistency

- [ ] Add a check comparing each character's lines against their `voice` field
- [ ] Flag two characters whose measures are within a small margin of each other
- [ ] Flag a character whose vocabulary ratio suggests a verbal tic
- [ ] Surface the flags inside the Cast view, not in a separate panel
- [ ] Keep it deterministic; no API call
- [ ] Write the finding in the writer's language, not in statistics
- [ ] Add tests for each rule
- [ ] Run it against the sample screenplay and sanity-check the output
- [ ] Link each flag to the craft entry that addresses it
- [ ] Commit

### Day 13 · Remember what was recommended

- [ ] Add a table recording script, technique, first shown, times shown, resolved
- [ ] Write the migration and add it to the deployment guide
- [ ] Record a row when a pattern is shown
- [ ] Mark it resolved when the linter stops flagging that technique
- [ ] Add tests for both transitions
- [ ] Confirm nothing is written for an anonymous or read-only viewer
- [ ] Keep the write off the request path if it slows the response
- [ ] Backfill nothing; the history starts now
- [ ] Add a query for resolution rate per technique
- [ ] Commit

### Day 14 · Use what it remembers

- [ ] Stop showing a technique the writer has already resolved
- [ ] Rank a technique shown before and still unresolved above a new one
- [ ] Show one recommendation with strong evidence rather than three of equal weight
- [ ] Keep the other two reachable behind a single control
- [ ] Confirm the free tier still gets all of this
- [ ] Add tests for the ranking rules
- [ ] Check the panel still loads in under a second
- [ ] Try a full writing session and see whether the advice stops repeating
- [ ] Adjust the thresholds based on what that session showed
- [ ] Commit

### Day 15 · Escalate to a lesson

- [ ] Surface a lesson only when a card has been shown twice and not resolved
- [ ] Route through the existing rule-to-lesson map
- [ ] Make the escalation visible in the craft panel, not a separate notification
- [ ] Add a test that a first showing never escalates
- [ ] Add a test that a resolved technique never escalates
- [ ] Confirm the Story track is still reachable directly
- [ ] Check the lesson opens in place rather than navigating away
- [ ] Run both suites
- [ ] Deploy
- [ ] Write down what the loop cannot see, so nobody assumes it can

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
- [ ] Test the whole expiry path with a backdated row
- [ ] Confirm the in-app notice appears before the email does
- [ ] Add a test for the once-per-expiry rule
- [ ] Commit

### Day 18 · The screen most of Nepal owns

- [ ] Open the editor on a 375-pixel screen and write for five minutes
- [ ] Fix the screenplay column, which is too narrow to hold a slugline
- [ ] Check the rail, the craft panel and the corkboard at that width
- [ ] Confirm focus mode fills the screen on a phone with a collapsing address bar
- [ ] Refresh the project list when the command palette opens
- [ ] Add a jump-to-scene action to the palette
- [ ] Check every tap target is large enough to hit
- [ ] Run the frontend suite
- [ ] Deploy and re-check on a real phone
- [ ] Commit

### Day 19 · Cost and speed

- [ ] Measure the real cost of one script from the provider dashboard
- [ ] Compare it against the $0.44 estimate and correct the estimate
- [ ] Lower `max_tokens` where the output is routinely shorter than the cap
- [ ] Re-measure and confirm quality did not drop
- [ ] Add prompt caching to the stable part of the prompt
- [ ] Confirm the cache is actually hit rather than silently invalidated
- [ ] Time a storyboard on the deployed system
- [ ] Tune `STORYBOARD_CONCURRENCY` against the provider's rate limit
- [ ] Add a per-account monthly spend ceiling
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
