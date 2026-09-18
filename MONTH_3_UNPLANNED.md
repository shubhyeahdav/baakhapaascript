# Month 3 — work done that was not on the plan

`MONTH_3_TASKS.md` holds 200 planned checkboxes across twenty days. This is the
other half of the month: 78 commits were made between 2026-09-08 and 2026-09-18,
and a large share of them answer nothing on that list.

Compiled by reading `git log` against the plan rather than from memory. A theme
counts as unplanned when it appears in `MONTH_3_TASKS.md` either not at all, or
only inside a *result annotation* written after the fact — "video" and
"accessibility", for instance, appear in the file exactly once each, both times
describing work already done, never as a task.

**Why this document exists.** A plan that only records what it predicted makes
the month look smaller and tidier than it was, and hides the thing actually
worth reporting: most of the defects found this month were found by accident,
by work aimed at something else. That is a finding about how the defects are
distributed, not an apology for drifting off the list.

---

## A. Deliberate additions — built on purpose, never planned

### A1. Long-form video as a fourth format (12 commits, 2026-09-13 to 09-14)

`93e699f` design · `d645ac1` plan · `d362219` `f4fed65` `329417f` `382e8c2`
`4e82399` `abfac62` `4bb98d8` implementation

The largest single piece of unplanned work in the month, and a whole new
product format. `short_form` was capped at 180 seconds and everything else was
a screenplay measured in pages, so a twelve-minute video essay had to be forced
through a three-act split or stored as a lie about its length.

What made it affordable was a seam that already existed: `scene_sync.parser_for`
switches on the project's format, so Outline, Corkboard, versions, comments,
sharing and review all worked untouched. The measurable claim is that screenplay
retrieval is **numerically unchanged, 90.0% p@1 before and after** — the new
craft entries were added with a one-way exclusion rather than by re-tuning
anything that already worked.

Not on the plan in any form.

### A2. The writing framework for that format (2026-09-17, `a85f23f`)

The architecture spec covered the parser. Nothing covered the craft the page is
supposed to teach. Two modes: a video essay written for *purchased* attention,
and a course lesson written for *committed* attention, which fail in opposite
directions and therefore cannot share a structure.

### A3. Bundle splitting by route (2026-09-07, `69494cd` `184ffb5`)

Baseline recorded first, then split. No plan item asked for it.

---

## B. Defects found while doing something else

These are the ones worth counting. **Not one of them was on a list**, and
several were found by work aimed elsewhere entirely.

### B1. A column missing from the database broke EVERY project creation
`1d5b138`, and `53b35d5` records it as the **fifth** schema-drift bug of its
kind. The local mock stores rows as flat JSON and therefore agrees with any
writer, so the whole test suite passed while the feature was broken in
production. Postgres rejects the entire row for one unknown column rather than
dropping the field.

### B2. The test suite was making live, billed API calls
`b4996b4`, hardened by `9bfaabb`. `conftest.py` neutralised three API-key
variables but not `LLM_PROVIDER` / `LLM_API_KEY`, which the OpenAI-compatible
transport reads. The suite did not fail — it **hung for 75 minutes** with no
output.

### B3. The test suite was running against the production database
`a7b63ae`. Separate from B2 and found separately.

### B4. Twenty minutes of test suite was five minutes of bcrypt
`f181a6a`. The runtime had been documented as "unexplained, not broken" and
budgeted around. It had a cause.

### B5. The generator returned the model's *example* instead of its answer
`45773f5`. When a model demonstrates the format before answering, it emits two
fenced blocks; the old code took the first. It parsed, it was well-formed, and
nothing downstream could have noticed. (The plan *did* carry a task to fix
`_extract_json`, so this one is half-planned — the task existed, the specific
defect was not what anyone expected to find.)

### B6. A refunded subscription kept working indefinitely
`a37e97d`. Payment *failure* was covered by tests; money going backwards was
covered by nothing. The plan's only mention of refunds assumed the feature
already existed.

### B7. The in-app warning and the email reminder were both set to seven days
`7ca4d7e`. Two files, two languages, nothing connecting them — so "the notice
appears before the email" was a race, not a design.

### B8. A shipped `ReferenceError`, found by the linter's first run
`f6fdc90`. There had been no frontend linter.

### B9. The editor hid its own bottom edge on a phone
`036f8de`. Tailwind's `h-screen` is `height: 100vh`, and on a phone `100vh` is
the *large* viewport. This one **was** a plan item (Day 18) — listed here because
the plan expected it to need a phone to confirm, and it turned out to be legible
in the CSS.

### B10. Five things a phone found that emulation did not
`61e44ae`, `4e5c60d`. The responsive work had been signed off at a 375px
viewport.

---

## C. Guards built so a class of defect cannot recur

Unplanned, and arguably the most durable work of the month: each one converts a
defect that had already happened twice into something that cannot happen
silently again.

| guard | commit | what it stops |
|---|---|---|
| `check_schema.py` + boot-time drift report | `b19d2c5` `6218f32` | B1, and the four before it |
| Provider assertion at session start | `9bfaabb` | B2 — asserts it *cannot* reach a live provider, rather than neutralising by name |
| `check_docs.py` + a CI step | `297c89e` `f4cb2ad` | numbers in `CLAUDE.md` being typed rather than counted |
| Read-budget tests | `3e7bcce` `96e0de1` | duplicate database reads creeping back |
| Frontend linter | `f6fdc90` | B8 |
| `page-layout-check.mjs` | `171b081` `de5a7f2` | layout faults no test can see (`css: false`) |

The provider guard is the one to keep. It is the net that caught both the
75-minute hang and the production-database run, and its own test file exists to
stop a future session deleting it for being in the way.

---

## D. Performance findings — measured, not guessed

None of these were plan items; the plan's only performance task was about AI
*cost*, not about round trips.

- **The craft corpus was re-read from the database on every retrieval** —
  `f059e43`, 484ms → 9ms.
- **The recommendation log was read three times per request** — `4b36ba6`.
- **`get_patterns_by_technique` refetched all 45 rows with their 384-dimension
  embeddings to match a name** — `2a32fcf`, 175.7ms → 0.0ms.
- **Seven routes read the same project row two to four times** — `3e7bcce`,
  `96e0de1`. The worst was the autosave route, which runs on a keystroke timer.
- **The first writer of the day paid for the embedding model load** —
  `5cfe7d3`, 0.686s → 0.007s.
- **The API connection, not the bundle, is what makes the deployed app feel
  slow** — `9e0e884`. Measured: Railway `connect` spikes to 1.1s, 7.1s and 15.1s
  in roughly one attempt in four, while Vercel over the same minutes was
  0.04–0.06s every time. This is the only measured breach of a written
  requirement (**NFR01**, page loads under two seconds) and the cause is network
  path, not code.

**A correction kept on the record:** the Patterns tab measurement was first
written up as "Railway is 200× slower at identical work". That was wrong — it
compared an 8.8ms library call against a 2504ms HTTP endpoint that made four
sequential uncached round trips. Corrected in `2a32fcf`'s message.

---

## E. Work the external world asked for

- **Accessibility and metadata audit answered** — `021c651` `c1d03bd`,
  landmarks, a real 404, files that were being served as HTML.
- **Thirty-three characters of visible text without JavaScript** — `9b08552`.
  Google renders JS; no current AI search crawler does, so for ChatGPT,
  Perplexity and Claude the site was very nearly empty. Prerendering now yields
  a median of 1,388 characters.
- **Frontend dependency vulnerabilities taken to zero** — `c75b8c8`. Two
  findings, one HIGH. Both build-time only and neither shipped, but CI runs
  `npm audit --audit-level=moderate`, so the first pull request would have
  failed for reasons unrelated to whatever it carried.

---

## What this adds up to

Of 78 commits in the period, roughly **half** answer no checkbox on the plan.
The plan was not wrong; it was written to cover the features that were known
about, and it did that. What it could not contain is the category the month was
actually dominated by: **ten defects, none of them on any list, and six of them
invisible to the test suite as it stood** — because the local mock is
schemaless, because `vite.config.js` sets `css: false` so no test can see a
layout, and because a passing suite proves the code agrees with itself rather
than with Postgres.

That is the reportable finding. The guards in section C exist because the same
class of fault arrived five times before anyone built something that would
notice it.
