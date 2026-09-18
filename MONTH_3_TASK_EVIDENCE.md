# Month 3 — five tasks performed

Days 8 to 12. What was done, and the screenshot to capture where one is worth
taking.

**Before any app screenshot:** this machine's `.env` holds real credentials, so
the app reads and writes the **production database** and an AI call is billed.
Switch to demo mode first and log in as `test@example.com` / `password`. Never
capture the `.env` file, a key, a token, the Supabase URL, or your own email in
the corner of the app.

```
cd baakhapaa-backend
./venv/Scripts/python -c "import database,script_engine as s; print(database.use_mock, s.PROVIDER)"
```

`True mock` is safe to photograph. `False anthropic` is not.

---

## 1. Moved retrieval onto pgvector — Day 8

Ran the migration against Supabase and confirmed the table, the index and the
`match_script_patterns` function exist. Re-ran the loader so embeddings landed in
the vector column. Switched retrieval to the RPC, keeping the Python path as a
fallback. Verified the dimension guard still refuses a mismatched stored vector,
and added a test that a database error returns an empty list rather than raising.
Measured latency both ways and committed with both numbers.

**10 of 10 done.** Say this plainly in the report: the RPC is installed and
correct but **does not currently execute** — it engages at 2,500 rows and the
corpus is 45, because the crossover was measured at about 2,900. Dormant by
design, not by accident.

### Screenshot — the database matches the code

```
cd baakhapaa-backend
./venv/Scripts/python check_schema.py
```

Four lines confirming the tables and `match_script_patterns(): present,
craft-filtered`. Safe in live mode; it only reads.

---

## 2. Tried a better model, kept only what helped — Day 9

Recorded the current embedding model and dimension. Tried a larger
sentence-transformer and re-embedded the corpus. Tried retrieving five and
reranking to three by craft level. Tried weighting the `technique` field
alongside `problem`. Re-ran the eval on all forty real queries after each,
reverted everything that did not improve precision@1, and wrote down what failed.

**10 of 10 done.** Most of the day produced **negative results, and that is the
deliverable** — the rule was set before the experiment, so the reverts are the
method working rather than the day being wasted.

*No screenshot. The evidence is the written record of what failed.*

---

## 3. Closed the retrieval loop and shipped it — Day 10

Put the eval gate in CI so a regression fails the build. Published the
before-and-after numbers. Checked the Patterns tab in a browser and confirmed the
free tier still gets retrieval with no API call. Measured a Patterns request on
the deployed system, cached the embedding model load, re-ran both suites, merged
and deployed.

**10 of 10 done.**

| Measurement | Result |
|---|---|
| Deployed Patterns request | 2,504 ms — eight sequential database reads, not slow code |
| Embedding model load | 0.686 s → 0.007 s, warmed at startup |
| One uncached database read | about 175 ms |

### Screenshot — the eval running

```
cd baakhapaa-backend
./venv/Scripts/python eval_retrieval.py
```

Capture the whole output, not just the headline: combined **91.3%**, screenplay
**90.0%**, the per-level breakdown, and the self-retrieval check at **100%**. The
breakdown is what makes the headline believable.

---

## 4. Made "improve" work on a selection — Day 11

Passed the editor's selection to the improve route, falling back to the whole
scene when nothing is selected. Returned only the rewritten selection and
replaced it in place, preserving the undo stack. Kept streaming working. Added a
test that an empty selection still improves the scene and a test that the rest of
the draft is untouched. Confirmed the linter's diagnosis still leads the prompt.

**9 of 10 done** — the only incomplete task in all fifty. *"Try it on a real line"*
needs Anthropic credit. **The feature is mock-verified only**, so do not
screenshot a generated rewrite as evidence of quality; in demo mode the response
is canned.

### Screenshot — the behaviour that is proven

```
cd baakhapaa-backend
./venv/Scripts/python -m pytest -q -k "selection or improve"
```

Expect **21 tests across 4 files**.

---

## 5. Built deterministic character-voice checks — Day 12

Added a check comparing each character's lines against their `voice` field, a
rule flagging two characters whose measures collapse together, and a rule
flagging a vocabulary ratio that suggests a verbal tic. Surfaced the flags inside
the Cast view rather than a separate panel, kept it deterministic with no API
call, wrote each finding in a writer's language, tested every rule, and linked
each flag to the craft entry that fixes it.

**10 of 10 done.** Implementation is `baakhapaa-backend/voice.py`.

The sample screenplay returned **0 findings** — a pass, not a silence: all three
characters clear the minimum line count, and a synthetic cast given identical
dialogue does fire `voices_collapsed`. A checker that never fires looks identical
to one that correctly finds nothing until you test both.

### Screenshot — the Cast view *(demo mode)*

Editor → Cast. Shows the flags where a writer actually reads them, written as
sentences rather than statistics, each linked to its craft entry.

---

## One more worth capturing

```
cd baakhapaa-backend && ./venv/Scripts/python -m pytest -q
cd baakhapaa-frontend && npm run test:ci
```

Both suites green. The backend takes about 29 seconds — it took roughly twenty
minutes until 17 September, when the cause turned out to be password hashing
across 754 user creations.

---

## What cannot be shown yet

AI generation, storyboards, a real payment and a renewal email have never run —
they need credit, merchant accounts and an email account, not more work. Saying
so is stronger than working around it. The distinction to carry through the
report is **built** against **proven**.
