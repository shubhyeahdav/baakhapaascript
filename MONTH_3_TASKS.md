# Month 3 — daily task list

System work only. Twenty working days, ten tasks each, ordered so nothing waits on
something later in the list.

Three things gate everything in Week 1 and are not tasks anyone can code around: an
Anthropic account with credit, a Supabase project, and a domain. Get those before Day 1.

---

## Where this stands (2026-09-16)

**155 of 200 done.** Weeks 1 to 3 are complete except for the parts that need
money spent; Week 4 is partly done.

Ten more closed on 2026-09-16, and the useful thing about them is that eight
were *already blocked-looking and were not*. Every one turned out to be
answerable without credit, an SMTP account or a merchant account — they had
simply been filed behind the tasks above them. Three of the ten found a real
defect:

- `_extract_json` returned the model's **example** instead of its answer
  whenever a model demonstrated the format first. It parsed. It was
  well-formed. Nothing downstream could have told.
- The in-app plan warning and the email reminder were both set to seven days,
  in two files, in two languages, with nothing connecting them — so "the
  notice appears before the email" was a race, not a design.
- Four different unhelpful messages for the four ways a token can fail, sitting
  next to one that said the right thing.

**Deployment is no longer a blocker** — it happened on 2026-09-15, and three
boxes on this list were still describing it as pending. That changes the shape
of what is left: it is now almost entirely things a purchase unblocks rather
than things anyone can write.

The 55 open items, by what actually holds them up:

| Blocker | Items | What it costs |
|---|---|---|
| Anthropic credit | ~10 (Day 4, most of Day 5) | The key is set; the account has no balance |
| Merchant accounts | 5 (Day 5 applications, Day 20 payment) | Company registration and bank details |
| An SMTP account | 8 (Day 17) | Nothing renews without it |
| A real phone in a hand | 3 (Day 3, Day 18) | Deliberately not emulator-answerable |
| Nothing at all | ~12 | Listed below |

Verified 2026-09-16, everything green: backend **1036 passed, 2 skipped**
(CLAUDE.md still says 907 — the suite has grown), frontend **1166 across 61
files**, the production build, and `ruff`. Two things worth knowing that the
numbers do not show:

- **The backend suite takes about twenty minutes on this machine, not the 3.5
  the docs claim.** It is not the old hang — `conftest.py` still neutralises
  `LLM_PROVIDER` and `SUPABASE_URL`, nothing calls out, and the ten slowest
  tests add up to only 22 seconds. So the time is spread thin across 1036
  tests rather than stuck in a few. Worth finding before it reaches five
  figures; the documented number is the thing to stop trusting first.
- The first run of it produced no output for twenty minutes and looked exactly
  like the documented hang. It was not hung. `pytest -q | tail` buffers
  everything until the end, so there is no way to tell the two apart — run it
  unpiped, or with `-u`, if you want to know which one you are looking at.

What is NOT blocked, and is worth doing in this order:

1. **Merge `fix/craft-and-patterns-ux` into `codebase`.** Three commits are
   unmerged and one has never been pushed anywhere. CI watches `codebase`,
   `main` and pull requests only, so none of that work has seen lint, either
   suite, the production build or the layout job.
2. Measure a Patterns request against the DEPLOYED backend (Day 10).
3. Walk the product as a new user on the deployed system, minus the AI steps,
   and check every error message says what to do next (Day 20).

Everything closed on 2026-09-11 was closed by **measuring**, and two of the eight
were closed by measuring and then not doing the thing: diversity reranking made
coverage worse, and prompt caching does not apply at this prompt size. A task
list is allowed to be finished by a negative result, and those are the cheapest
results on it — see `RECOMMENDATION_ARCHITECTURE.md`.

The same thing happened again on 2026-09-14: the pgvector RPC was measured at
178.6ms against 8.8ms for ranking in Python, so the task "switch retrieval to
the RPC" was closed by NOT switching, and the threshold that guards it moved
from a guessed 500 rows to a measured 2,500.

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

### What 2026-09-15 found

- **It is deployed.** `https://baakhapaascript.vercel.app` against
  `https://akchhyarup.up.railway.app`, on real Supabase. Ten calls verified with
  the browser's real `Origin` — register through review, all 200, scene sync
  reconciling a Devanagari draft in production Postgres, and the live login form
  returning the server's own 401, which is the assertion that matters because a
  CORS or API-URL fault never reaches a 401.
- **The deploy cost nothing at the hosts and three hours at the env vars.** All
  three failures let the service boot cleanly and then behave wrongly, with
  nothing warning anyone: `KEY=VALUE` pasted into a value box, so the allowlist
  held a literal `CORS_ORIGINS=https://...`; an origin with a trailing slash AND
  a missing `//`, wrong both ways at once, across two redeploys; and
  `VITE_API_URL` needing a cache-free rebuild, because Vite inlines it at build
  time — so the live bundle kept calling `http://localhost:8000` while the
  backend was perfectly healthy. `DEPLOYMENT.md` names all three and gives the
  two outside-in checks that catch them.
- **Every form label in the product was at 2.60:1**, against a WCAG AA floor of
  4.5. `.field-label` was `#57544B` on `#0B0B0A` — less than half the contrast a
  sighted user is entitled to, on the line that says which field you are typing
  into. Sign-up, project setup, settings, the story bible, all of it.
- **`inkMuted` passed on the background it was chosen against and failed on the
  two surfaces it is mostly painted on.** `#7E7A6F` measures 4.59:1 on `bg` and
  4.33 / 4.15 on `surface` / `elevated` — the card grounds carrying most of the
  product's secondary text, across 308 usages. Confirmed twice, once by reading
  the palette as text and once by measuring the live DOM, which agreed to the
  second decimal.
- **A dismiss control was the least visible thing in its own component.**
  `MilestoneNote`'s x is a text glyph at `text-[#6B665C]/60` over `#FAF9F6`
  paper: 2.45:1. The opacity modifier is what did it, and that is invisible in
  review — the colour it is written as passes, the colour it paints does not.
- **Why none of this was caught: no test in this repo can see a colour.**
  `vite.config.js` sets `css: false`, so jsdom never evaluates a stylesheet and
  every assertion about appearance is an assertion about class NAMES.
  `scripts/contrast-check.mjs` now reads the palette as text and does the WCAG
  arithmetic — the same trick `tests/test_pattern_schema.py` uses on the SQL —
  and runs in CI beside `page-layout-check.mjs`, needing no browser and no
  server. It carries one printed exemption, with its reason.
- **The authenticated half was audited too, against a demo backend on a
  throwaway database** — dashboard, settings, learn, new-project, storyboards,
  exports, onboarding, and the editor. Four more, all fixed: the course's answer
  box had no label (a placeholder is announced only while the field is empty,
  and this is the one field a lesson is graded on); both duration sliders
  announced as "slider, 12" with no statement of what they set; the Settings
  Upgrade pill measured 69x23, one pixel under the 24px target floor; and two
  pages jumped h1 to h3.
- **Two findings were mine, not the product's, and are worth writing down
  because the next audit will hit them again.** An accessible name comes from
  `textContent`, not `innerText` — `innerText` returns empty for an element far
  below the fold in a headless renderer, which made three perfectly well-labelled
  buttons look nameless. And contrast has to be measured against the PAINTED
  background, not the ancestor chain: `PenPrompt` sits over the screenplay page
  with a z-index without being inside it, so walking parents finds the dark
  chrome and reports the paper theme at 1.64:1 when it is really 11.41:1 on
  white. `document.elementsFromPoint` answers correctly; `closest()` does not.

---

## Week 1 — Make it real

### Day 1 · Cloud database

- [x] Create the Supabase project; copy URL and service role key into `baakhapaa-backend/.env`
- [x] Confirm the keys are uncommented and the file has no byte-order mark
- [x] Back up `baakhapaa_local.db`, then delete it — *copied to `C:/Users/User/baakhapaa_local.db.2026-09-11.bak` and verified readable (188 rows) before deleting. It was last written 7 September and had not been the store since the Supabase keys landed, so every hour it stayed was an hour somebody could mistake it for one*
- [x] Run `supabase_schema.sql` in the SQL editor
- [x] Check for duplicate email addresses differing only in case, before migrating — *none. 24 accounts, 24 distinct addresses once normalised, and every one already lowercase — so the migration that was flagged as the only one able to fail on real data is safe here*
- [x] Run the email normalisation migration; merge or delete duplicates if it fails — *applied with the rest of the schema; the duplicate check above had already shown there was nothing for it to collide with*
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

- [x] Deploy the backend to Railway, root `baakhapaa-backend` — *`https://akchhyarup.up.railway.app`*
- [x] Set `APP_ENV=production`, a fresh `JWT_SECRET`, `CORS_ORIGINS`, `DEMO_SEED=false` — *proven by the boot, not by reading the panel: `deploy_checks.collect` refuses to start on any of them being wrong, and `/health` answers `env: production, demo: false`*
- [x] Set `REQUIRE_SHIPPABLE_FONT=true` and confirm the boot survives it — *`deploy_checks.py:70` reads `if production or _truthy("REQUIRE_SHIPPABLE_FONT")`, so under `APP_ENV=production` the gate runs whether the flag is set or not. The container booted, so the bundled OFL Noto face resolved and it is not Nirmala — which is the whole point of the check, since Nirmala is not on Linux*
- [x] Confirm `--proxy-headers` is active; without it every user shares one rate-limit bucket — *inferred, not observed: `Procfile` and `railway.json` both carry `--proxy-headers --forwarded-allow-ips='*'` and Railway starts from them. Observing it directly would mean tripping the 5/min login limiter against the live API, which would lock out whoever shares the bucket if the flag is in fact missing — the exact harm being tested for*
- [x] Deploy the frontend to Vercel, root `baakhapaa-frontend` — *`https://baakhapaascript.vercel.app`, edge `bom1`*
- [x] Set `VITE_API_URL` to the Railway address — *and it took three goes. Vite inlines it at BUILD time, so setting the variable changed nothing until a cache-free redeploy; until then the live bundle carried `http://localhost:8000` and every API call from the deployed site went to the visitor's own machine while the backend sat perfectly healthy. Verified by fetching the entry bundle and grepping it for the Railway host*
- [x] Confirm the SPA rewrite works: hard-refresh `/dashboard` and check it is not a 404 — *200 on a cold anonymous request, `/login` too*
- [ ] Register an account on the deployed site from a **real phone** — *register/login is verified on the deployed pair and at a 375px viewport, but nobody has held it. This one stays open until a hand does it: the emulator cannot answer whether 9.5px Courier is readable at arm's length*
- [x] Check the security headers are present on the deployed frontend — *all five: `Strict-Transport-Security` (2yr, preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. The API still has none — noted, not a blocker*
- [x] Record the live URL somewhere the merchant applications can quote it — *`DEPLOYMENT.md` §"It is deployed", plus `CLAUDE.md`, `HANDOVER.md` and `ROADMAP.md`*

### Day 4 · First real-key walk

- [ ] Add credit to the Anthropic account
- [ ] Generate a structure on the deployed system and read what comes back
- [x] Fix whatever `_extract_json` fails on; real models add preamble — *done without spending a token: the shapes models produce were run at it directly (`tests/test_extract_json_shapes.py`). Four failed and one was worse than a failure — when a model demonstrates the format before answering it emits TWO fenced blocks, and the old code took the first, so it returned the model's EXAMPLE, parsed and well-formed and wrong, with nothing downstream able to notice. Also fixed: a preamble containing a brace moved the start of the span into the prose; trailing commas and `//` comments now repair. Single quotes and smart quotes deliberately do NOT repair — deciding which apostrophes are delimiters means mangling dialogue, and a parse error is recoverable where corrupted prose is not*
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
- [x] Re-run the full frontend suite - *1195 across 62 files, 2026-09-17*
- [x] Re-run the production build - *clean, 1.26s, 2026-09-17*
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

- [x] Run `pgvector_script_patterns.sql` against Supabase
- [x] Confirm the table, the index and the `match_script_patterns` function exist — *all three, 2026-09-15: `check_schema.py` reports "present, craft-filtered".*
- [x] Re-run the loader so embeddings land in the vector column
- [x] Switch retrieval from fetch-all-and-rank to the RPC
- [x] Keep the Python cosine path as the fallback when the RPC is unavailable
- [x] Confirm the dimension guard still refuses a mismatched stored vector
- [x] Re-run the eval and confirm the number did not move
- [x] Measure retrieval latency before and after
- [x] Add a test that a database error still returns an empty list rather than raising
- [x] Commit with both numbers in the message

### Day 9 · Try a better model

- [x] Record the current embedding model and dimension
- [x] Try a larger sentence-transformer and re-embed the corpus
- [x] Re-run the eval; keep the change only if precision@1 improves
- [x] Measure the cost in load time and memory
- [x] If it improves, update the dimension in the pgvector schema — *moot: bge-base scored identically on p@1 for 4.6x the embedding time, so the 384-dim model stays and the schema is already right.*
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
- [x] Measure how long a Patterns request takes on the deployed system — ***2.5 seconds.*** *Measured 2026-09-16 against `akchhyarup.up.railway.app` through the route the editor calls, ten runs on a throwaway account that was deleted afterwards: median 2504ms, 3470ms for the first, 2207ms median after it, three patterns returned every time. The network is not the bulk of it — `/health` is 262ms on a reused connection and 428ms on a fresh one — so roughly two seconds is spent inside the request.*
  *I first wrote that this made Railway 200x slower than this machine. That was wrong and worth recording as wrong: the 8.8ms I compared it against was `rag.retrieve_relevant_patterns`, a library call, not the endpoint. The endpoint also reads the project's format, reads the recommendation log, checks script access, and calls `get_patterns_by_technique` — each a separate uncached round trip to Supabase, in sequence. One uncached select from here measures ~175ms, so four or five of them IS about two seconds, on any host. The server is not slow; the endpoint is chatty.*
  *One of those round trips is now gone: `get_patterns_by_technique` was running its own `select("*")` over all 45 rows WITH their 384-dimension embeddings — about 185KB — to do an exact match on a name, ignoring the corpus cache three functions above it in the same file. 175.7ms to 0.0ms, identical results. The others are still there and are the next thing to look at.*
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
- [x] Deploy — *2026-09-15, with the first deploy. `46e5dda` has been on `codebase` since 2026-09-03, so the escalation shipped with it*
- [x] Write down what the loop cannot see, so nobody assumes it can

---

## Week 4 — Durability

### Day 16 · Get images out of the database

- [x] Create a Supabase Storage bucket for storyboard frames
- [x] Upload generated images to it instead of storing data URIs
- [x] Store the object path in `storyboard_frames.image_url`
- [x] Keep reading existing data URIs so old boards still work
- [x] Confirm the production package still embeds frames from storage
- [x] Confirm the export SSRF guard still applies to storage URLs
- [x] Measure the row size before and after
- [x] Add a test for both storage shapes
- [x] Delete images when their storyboard is deleted
- [x] Commit — *`fb8a96c`, 2026-09-15*

### Day 17 · Make renewals happen

- [ ] Obtain an SMTP account and set `SMTP_HOST`, user, password and `MAIL_FROM`
- [x] Run `renewals.py --dry-run` and read the list it would mail — *`{'expiring': 0, 'lapsed': 0, 'skipped': 7}` against the real database on 2026-09-16. Nobody is owed a reminder because nobody has a time-boxed plan yet: all seven accounts are free or Stripe-NULL. Empty is the correct answer here and it is worth having seen it*
- [ ] Send one reminder to yourself and check it arrives and reads well
- [x] Confirm nobody is mailed twice for the same expiry date — *`test_a_warning_already_sent_is_not_repeated` and `test_lapsing_after_a_renewal_is_a_new_reminder` in `tests/test_renewals.py`: the send is recorded on the user row, and a renewal makes the next lapse a new notice rather than a suppressed one*
- [ ] Schedule it daily
- [x] Confirm a lapsed plan actually reads as free everywhere — *three tests, each a different place it could have been missed: `test_a_lapsed_plan_reads_as_free` (the tier function), `test_expired_pro_user_is_refused_paid_features` (the gate), and `test_auth_me_reports_the_effective_tier_not_the_stored_one` (what the client is told). The stored `subscription_tier` is never read directly*
- [x] Test the whole expiry path with a backdated row — *`tests/test_expiry_end_to_end.py`, ten tests. `test_payments.py` already checked that `effective_tier()` returns free for an expired row; that is the unit, this is the consequence — a route reading `subscription_tier` directly would pass every existing test and still serve a lapsed account for ever. Covers both directions (lapsed refused, inside-month not refused, so an over-eager fix that refuses everybody fails too), the NULL-expiry Stripe case, studio dropping to free rather than pro, the free project limit coming back, and the boundary. All pass, so the gates are correct — this is a verification, not a fix*
- [x] Confirm the in-app notice appears before the email does — ***it did not.*** *Both windows were seven days: `renewals.WARN_DAYS` and `WARN_WITHIN_DAYS` in `PlanNotice.jsx`, written months apart in two languages with nothing connecting them, so they fired on the same day and which one a writer met first was a race between opening the app and the cron running. The banner now warns at 14 days, and `tests/test_renewal_ordering.py` reads the JSX and fails if that number ever stops being the larger one. The ordering is the point: a writer who uses the product should hear it from the product, and the email is for the person the banner cannot reach*
- [x] Add a test for the once-per-expiry rule — *already covered: `test_renewals.py::test_a_warning_already_sent_is_not_repeated` and `::test_lapsing_after_a_renewal_is_a_new_reminder`*
- [ ] Commit

### Day 18 · The screen most of Nepal owns

- [x] Open the editor on a 375-pixel screen and write for five minutes
- [x] Fix the screenplay column, which is too narrow to hold a slugline
- [x] Check the rail, the craft panel and the corkboard at that width — *and three of the four views were not there at all. See below*
- [ ] Confirm focus mode fills the screen on a phone with a collapsing address bar - *the cause was found and fixed on 2026-09-17 without a phone, so this is now a confirmation rather than a discovery. The editor shell was Tailwind's `h-screen` = `height: 100vh`, and on a phone `100vh` is the LARGE viewport - the height the page would have with the address bar collapsed. While the bar shows, that shell overhangs the screen, and it is `overflow-hidden`, so the overhang cannot be scrolled to. `.screenplay-container` is `flex-1` inside it and inherits the overhang, so `scrollCaretIntoView` could park the caret underneath the address bar. `.zen-page` already used the `vh`/`dvh` fallback pair and said why; the box containing it did not, and fixing the inner element alone could not help because its height resolves against the outer one. Now `.app-viewport`, pinned by a test*
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
- [x] ~~Confirm the cache is actually hit rather than silently invalidated~~ — *moot; prompt caching does not apply at this prompt size. Closed as a negative result rather than left hanging*
- [ ] Time a storyboard on the deployed system
- [ ] Tune `STORYBOARD_CONCURRENCY` against the provider's rate limit
- [x] Add a per-account monthly spend ceiling
- [ ] Commit with the measured numbers

### Day 20 · Ready for writers

- [ ] Take one real payment, with real money, through Khalti or eSewa
- [ ] Confirm the tier is granted from the stored payment row - *the CODE property is proven and only the gateway's real behaviour is not: `test_checkout_records_the_price_before_the_user_leaves` pins that the row exists before the user leaves, and `test_underpayment_does_not_grant_the_tier` pins that the amount is checked against the price we recorded rather than the one the user comes back holding. What real money would add is whether the gateway reports what we assume it reports*
- [ ] Confirm a refund or failure leaves the tier untouched - *failure is covered (`test_an_unreachable_gateway_leaves_the_payment_pending`, `test_underpayment_does_not_grant_the_tier`). Refund was covered by NOTHING until 2026-09-16 - a refunded plan kept working indefinitely - and is now `payments.refund()` with 11 tests. Note the box is mis-worded: a refund must NOT leave the tier untouched, it subtracts the days it bought and lets `effective_tier` demote on the past expiry. The exception is a NULL expiry, which means Stripe owns the renewal*
- [ ] Walk the whole product once as a new user, on the deployed system
- [ ] Fix anything that blocks finishing a script
- [x] Confirm every error message tells the writer what to do next — *audited all 48 of them. Most bare “X not found” messages are a DELIBERATE choice, not an oversight: `require_script_access` returns 404 rather than 403 so ids cannot be probed, and making those friendlier would undo it. Seven had no such excuse and are fixed: the four different ways a token could fail (“Missing or invalid token”, “Invalid token”, “Invalid or expired token” twice) all now say “Your session has ended. Sign in again to keep writing”, which is what all four meant and what a writer meets mid-draft; “Email already registered” now names the next step; and `apply_whitelist` now lists the fields it would have accepted instead of reporting its own conclusion*
- [x] Run both suites and the production build — *2026-09-16: backend 1036 passed 2 skipped, frontend 1166 across 61 files, production build clean, `ruff` clean. Re-run after any further work; this is the gate, not a one-off*
- [ ] Recapture the screenshots for the Month 3 report
- [x] Re-run the eval and record the closing number — *2026-09-16, against the live corpus: combined real queries **91.3% p@1**, 97.8% p@3, n=46; screenplay alone **90.0%**, n=40; video **100%**, n=6; self-retrieval sanity 100%, n=45. Both CI floors clear. Five entries are still never retrieved by any real query — not a regression, but the lead worth following if anyone wants the number higher*
- [ ] Invite the five pilot writers

---

## Carried, not scheduled

These are real and none of them blocks a writer. They go in the month after.

- Corpus fingerprints; blocked until the script corpus is on this machine
- The four-stage generation pipeline in `GENERATION_ARCHITECTURE.md`, still specification only
- A real Postgres in CI, and a migration tool instead of hand-run SQL
- Application-level encryption of script text; a design decision, not a feature
- Streaming for the suggestions route, which returns short output and gains least
- ~~Normalising `generate-structure`~~ - **already done**, found stale 2026-09-17.
  The route reads `req.project_id` first and `api.js` sends it in the body; the query
  form survives only as a compatibility path and says so in the docstring
