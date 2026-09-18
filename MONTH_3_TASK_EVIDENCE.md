# Month 3 — tasks performed, and the screenshot for each

A plain record of work done, with the evidence to capture for each item. No
design, no styling: this is meant to be read, copied into a report, and used as
a capture checklist.

Two kinds of evidence appear below.

- **Terminal** — a command you run and photograph. These are the strongest
  evidence in this project, because they show a number being produced rather
  than a number being claimed.
- **Screen** — a page in the running app.

---

## Before capturing anything: put the machine in demo mode

**This is the most important instruction in this document.**

This machine's `.env` holds real Anthropic, OpenAI and Supabase credentials.
`database.use_mock` is `False`, so the app reads and writes the **production
database**, and an AI call is **billed**. Taking app screenshots in that state
creates junk accounts and junk projects in the live database, and any generation
screenshot costs money.

Check which mode you are in:

```
cd baakhapaa-backend
./venv/Scripts/python -c "import database,script_engine as s; print(database.use_mock, s.PROVIDER)"
```

`False anthropic` means live. For screenshots you want `True mock`, which you
get by pointing the backend at a `.env` with placeholder keys and
`DEMO_SEED=true`. Demo mode gives you a local SQLite database, canned AI
responses and placeholder storyboard frames — everything looks right and nothing
is real or billed. Log in with `test@example.com` / `password`.

**Never capture:** the `.env` file, any terminal that printed a key, the Supabase
project URL, a JWT, or the account email in the corner of the app. Use the demo
account for every screen.

---

## Day 8 — Move retrieval onto pgvector

### Tasks performed

1. Ran `pgvector_script_patterns.sql` against Supabase.
2. Confirmed the table, the index and the `match_script_patterns` function exist.
3. Re-ran the loader so embeddings landed in the vector column.
4. Switched retrieval from fetch-all-and-rank to the RPC.
5. Kept the Python cosine path as the fallback when the RPC is unavailable.
6. Confirmed the dimension guard still refuses a mismatched stored vector.
7. Re-ran the eval and confirmed the number did not move.
8. Measured retrieval latency before and after.
9. Added a test that a database error returns an empty list rather than raising.
10. Committed with both numbers in the message.

**Status: 10 of 10 done.**

### State this honestly in the report

The RPC is installed and correct but **does not currently execute**. It engages
at 2,500 rows and the corpus is 45, because the crossover where pgvector beats
in-process ranking was measured at roughly 2,900 rows. Below that, ranking in
Python is faster. The migration was the right work and the switch is real; the
path is dormant by design, not by accident.

### Screenshot 8A — the database matches the code *(terminal)*

```
cd baakhapaa-backend
./venv/Scripts/python check_schema.py
```

Shows four lines confirming `projects`, `script_patterns`, `payments` and
`match_script_patterns(): present, craft-filtered`. This is tasks 1 and 2 in one
frame. Safe to run in live mode — it only reads.

### Screenshot 8B — the guards exist *(terminal)*

```
cd baakhapaa-backend
./venv/Scripts/python -m pytest tests/test_rag_retrieval.py -q
```

Covers tasks 6 and 9 — the dimension guard and the database-error path are both
in this file. **Expect 44 tests passing.** Capture the summary line; if the
count is far off, you are not running what this document describes.

---

## Day 9 — Try a better model, keep only what helps

### Tasks performed

1. Recorded the current embedding model and dimension.
2. Tried a larger sentence-transformer and re-embedded the corpus.
3. Re-ran the eval; kept the change only if precision@1 improved.
4. Measured the cost in load time and memory.
5. Updated the dimension in the pgvector schema where it improved.
6. Tried retrieving five and reranking to three by craft level.
7. Re-ran the eval on that — all forty real queries, not a sample.
8. Tried weighting the `technique` field alongside `problem`.
9. Kept whichever combination scored best and reverted the rest.
10. Wrote down what did not work, so it is not retried.

**Status: 10 of 10 done.**

### State this honestly in the report

Most of this day produced **negative results**, and that is the deliverable. The
work was an experiment with a pre-committed rule — keep it only if precision@1
improves — and most of it was reverted under that rule. A day that ends in
reverts and a written record is not a wasted day; it is the only thing that
stops the same ideas being retried every month.

### Screenshot 9A — the recorded failures *(document)*

Capture the "what did not work" section. Pair it with the entry added on
18 September to `FEATURE_SUGGESTIONS.md` under B3, which marks a standing
recommendation **"TESTED, AND IT DOES NOT WORK. Do not retry it."** after four
new craft entries moved the number from 71% to 71%.

---

## Day 10 — Close the loop and ship it

### Tasks performed

1. Confirmed the eval gate runs in CI and fails on a regression.
2. Published the before-and-after numbers in the repository.
3. Checked the Patterns tab returns the improved results in the browser.
4. Confirmed the free tier still gets retrieval with no API call.
5. Measured how long a Patterns request takes on the deployed system.
6. Cached the embedding model load.
7. Added ten new craft entries in the weakest level.
8. Reloaded, re-measured, kept only what helped.
9. Re-ran both suites.
10. Merged and deployed.

**Status: 10 of 10 done.**

### Numbers to quote

| Measurement | Result |
|---|---|
| Deployed Patterns request | 2,504 ms median over ten runs |
| Cause | eight sequential uncached database reads, not slow code |
| Reads after the fix | four in production steady state |
| Embedding model load | 0.686 s → 0.007 s after warming at startup |
| One uncached database read | roughly 175 ms |

### Screenshot 10A — the CI gate *(document)*

`.github/workflows/ci.yml`, the line reading:

```
python eval_retrieval.py --min-p1 0.80 --min-screenplay-p1 0.85
```

Two floors, not one. Worth one sentence in the report: averaging a weak new
craft into a single number is how an 82% headline once sat on top of a 20%
reality, so the screenplay floor is enforced separately.

### Screenshot 10B — the eval running *(terminal)*

```
cd baakhapaa-backend
./venv/Scripts/python eval_retrieval.py
```

Capture the whole output, not just the headline. It shows combined **91.3%**,
screenplay **90.0%**, the per-craft-level breakdown, the self-retrieval sanity
check at **100%**, and the corpus-coverage list. The breakdown matters: it is
what makes the headline believable.

### Screenshot 10C — the Patterns tab *(screen, demo mode)*

Editor → Patterns tab, with a scene on the page. Shows task 3, and shows the
free tier receiving craft recommendations with no AI call behind them.

---

## Day 11 — Improve a line, not a scene

### Tasks performed

1. Passed the editor's current selection to the improve route.
2. Fell back to the whole scene when nothing is selected.
3. Returned only the rewritten selection, not the surrounding scene.
4. Replaced the selection in place, preserving the undo stack.
5. Kept the streaming path working for a selection.
6. Added a test that an empty selection still improves the scene.
7. Added a test that the rest of the draft is untouched.
8. Confirmed the craft linter's diagnosis still leads the prompt.
9. **Not done:** try it on a real line and read what comes back.
10. Committed.

**Status: 9 of 10 done. The tenth is the only incomplete task in Days 8–12.**

### State this honestly in the report

Task 9 is blocked on Anthropic credit, not on work. Nothing here has run against
a real model on the deployed system, so **this feature is mock-verified only**
and the report should say so in those words. Do not screenshot a generated
rewrite as though it demonstrates quality — in demo mode the response is canned,
and captioning it otherwise would misrepresent it.

### Screenshot 11A — the behaviour that IS proven *(terminal)*

```
cd baakhapaa-backend
./venv/Scripts/python -m pytest -q -k "selection or improve"
```

Covers tasks 6 and 7 — that an empty selection still improves the scene, and
that the rest of the draft is untouched. **Expect 21 tests across 4 files.**
This is real evidence. A screenshot of canned output is not.

---

## Day 12 — Character consistency

### Tasks performed

1. Added a check comparing each character's lines against their `voice` field.
2. Flagged two characters whose measures fall within a small margin.
3. Flagged a character whose vocabulary ratio suggests a verbal tic.
4. Surfaced the flags inside the Cast view, not a separate panel.
5. Kept it deterministic — no API call.
6. Wrote the finding in the writer's language, not in statistics.
7. Added tests for each rule.
8. Ran it against the sample screenplay and sanity-checked the output.
9. Linked each flag to the craft entry that addresses it.
10. Committed.

**Status: 10 of 10 done.** Implementation is `baakhapaa-backend/voice.py`.

### The sanity check is worth explaining

Task 8 produced **0 findings** on `docs/samples/march.txt`. That is a pass, not
a silence, and the report should say why: all three characters clear the minimum
line count, so the rules ran and found nothing — and a synthetic cast of two
characters given identical dialogue **does** fire `voices_collapsed` with its
craft technique attached. A checker that never fires and a checker that
correctly finds nothing look identical until you test both.

### Screenshot 12A — the Cast view *(screen, demo mode)*

Editor → Cast. Shows tasks 4, 6 and 9 in one frame: flags in the Cast view
rather than a separate panel, written as a sentence rather than a statistic, each
linked to the craft entry that fixes it.

### Screenshot 12B — the rules under test *(terminal)*

```
cd baakhapaa-backend
./venv/Scripts/python -m pytest -q -k "voice"
```

**Expect 20 tests across 2 files.**

---

## Cross-cutting evidence

These are not tied to one day but are the strongest single frames in the set.

### Screenshot X1 — both suites green *(terminal)*

```
cd baakhapaa-backend && ./venv/Scripts/python -m pytest -q
cd baakhapaa-frontend && npm run test:ci
```

Backend takes about 29 seconds. It took roughly twenty minutes until
17 September, when the cause was found to be password hashing at cost factor 12
across 754 user creations — worth a line in the report, because the project's own
notes had called that runtime "unexplained, not broken" and told people to budget
for it.

### Screenshot X2 — the production build *(terminal)*

```
cd baakhapaa-frontend && npm run build
```

### Screenshot X3 — documentation counted, not typed *(terminal)*

```
cd baakhapaa-backend && ./venv/Scripts/python check_docs.py
```

Prints the counted test and corpus totals and compares them to what `CLAUDE.md`
claims. It runs in CI, so a stale number fails the build. This has caught its own
drift four times.

### Screenshot X4 — the deployed application *(screen)*

`https://baakhapaascript.vercel.app` — the public landing or sign-in page.
Safe to capture; no account needed and nothing is written.

---

## Screenshots that cannot be taken yet, and what to show instead

| Wanted | Why not | Show instead |
|---|---|---|
| AI scene generation on the deployed system | No Anthropic credit; has never run | The tests that pin the request and response shape |
| A generated storyboard | No image API credit | The frame controls and the shot list in demo mode |
| A completed Khalti or eSewa payment | No merchant account; no real money has moved | The checkout page reaching the gateway's real sandbox |
| A renewal reminder email | No SMTP account | `renewals.py` and the test that proves one reminder per expiry |

Stating these four gaps plainly is stronger than working around them. The
distinction the report should carry throughout is **built** against **proven** —
every item of the original scope exists in code, and a smaller set has been
demonstrated end to end.

---

## Capture checklist

- [ ] Backend switched to demo mode; `use_mock` prints `True mock`
- [ ] Logged in as `test@example.com`, not as the owner account
- [ ] No `.env`, key, token or project URL visible in any frame
- [ ] Terminal frames include the command as well as the output
- [ ] Eval screenshot shows the full breakdown, not only the headline
- [ ] Every "not done" item labelled as blocked, with what unblocks it
- [ ] Machine returned to live mode afterwards, if anything else needs it
