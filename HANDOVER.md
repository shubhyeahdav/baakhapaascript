# Handover — 2026-09-10, extended 09-11

Supersedes the 2026-09-08/09 handover. Its environment notes and its "what will
bite you" list still hold and are carried forward below; its test counts and its
next-session list are updated.

| It said | Actually |
|---|---|
| "869 backend across 51 files, 1060 frontend across 54" | **907 backend across 55 files**, **1105 frontend across 57** |
| "CI runs lint, dependency audit, both suites and the production build" | Plus a **third job** now: the layout audit and the editor load race, the two checks no suite can perform |
| Retrieval "88%" precision@1 | That was measured on a golden set with five Nepali queries in twenty-five. Widened to forty, the honest figure was **71.8%**. It is **90.0%** now |
| "Every component and page has a test" (CLAUDE.md) | Stopped being true as components were extracted. `AssistPanel` had none until today |

---

## 1. The thing to know before anything else

**The backend test suite takes 3.5 minutes. If it takes an hour, something is
calling out.**

`tests/conftest.py` has always neutralised `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY` and `GROQ_API_KEY` before the app is imported, with a long
comment explaining exactly why: `script_engine` picks its provider at import
time, so the day real keys landed in `.env` the suite silently started spending
money.

The OpenAI-compatible transport (`8bb9288`, 2026-09-09) introduced its own pair
— `LLM_PROVIDER` and `LLM_API_KEY` — and that guard was not extended to cover
them. With `LLM_PROVIDER=tokenrouter` and a real key in `.env`, every AI test
made a live billed call to a reasoning model that spends its whole budget
thinking and returns an empty answer. So the suite did not fail. It hung.

```
before   75 minutes, no output
after    907 passed in 213s
```

Fixed in `b4996b4`. `LLM_PROVIDER` is pinned to empty, not just the key —
breaking only the key turns every one of those tests into a boot-time
RuntimeError, which is a different lie about what the product does.

**The general lesson: this guard is a list of variable names, and a list of
names goes stale the moment somebody adds a provider.** Anything that adds one
must add it here too.

---

## 2. Environment — still NOT demo mode

Unchanged from the last handover and still the most dangerous fact about this
machine. `.env` holds real Anthropic, OpenAI, Supabase and TokenRouter keys.
Reads and writes go to the real Postgres and a generation call is billed.

```
cd baakhapaa-backend
./venv/Scripts/python -c "import database,script_engine as s; print(database.use_mock, s.PROVIDER)"
```

`/health` now answers this too, which is new and is what the audit scripts use:

```json
{"status":"ok","env":"development","demo":false,"ai_provider":"tokenrouter"}
```

`LLM_PROVIDER=tokenrouter` is currently set for testing, so **script text is
going to TokenRouter and whichever upstream it routes to**, not to Anthropic.
The boot log says so on every start. The privacy policy names Anthropic. Those
two facts have to be reconciled before anyone outside this machine uses it.

**Windows gotchas** (carried forward, all still true): `uvicorn --reload` is
unreliable here — run without it and restart manually; venv at
`baakhapaa-backend/venv`; `bcrypt` pinned to `4.0.1`; PowerShell 5.1 has **no
`&&`** — use `;`.

---

## 3. What changed on the 10th

Eight commits on `fix/craft-and-patterns-ux`.

### The craft library now answers a Nepali writer (`cce321b`)

The product's differentiator was working worst for the market it exists for. The
corpus is English, embedded by an English model, so a writer describing their
problem in Nepali got close to a guess.

That number did not exist before this session, because the golden set had five
romanised queries and no Devanagari ones at all:

```
                before   after
romanised        69.2%    84.6%      p@3  92.3% -> 100%
devanagari       16.7%    83.3%      p@3  33.3% -> 100%
chip             86.7%    93.8%
plain           100.0%   100.0%
combined         71.8%    90.0%      p@3  84.6% -> 97.5%
dialogue level      44%      78%
```

**The obvious fix was wrong, and measurement is what said so.** The plan
written down in `eval_retrieval.py` was "a Nepali gloss field embedded alongside
the English problem statement". Cosine similarities on the model retrieval
actually runs:

```
romanised <-> romanised, same meaning        0.817
romanised <-> romanised, DIFFERENT meaning   0.635
romanised <-> its own English translation    0.586   <- lower than a miss

devanagari <-> devanagari, same meaning      0.898
devanagari <-> devanagari, DIFFERENT meaning 0.877   <- a 0.02 gap
```

A romanised gloss would have worked. A Devanagari one cannot: the model cannot
read the script at all, so gloss and query would both be noise. And nothing that
leaves the query in Nepali can work, because cross-language similarity is below
the level of an unrelated sentence.

So `craft_query.py` translates the query OUT of Nepali before embedding. One
lexicon of the forty-odd words people use to say what is wrong with a script; no
API call, no second copy of the corpus. Glosses are appended, never substituted,
so an English query comes back byte-identical — that property is a test, and it
is what makes this safe in front of every retrieval call.

### The writer can mark a turning point (`19ec36f`)

The product asks writers to think in majors and minors and reads that answer in
three places — the scene rail's count, the outline's act balance,
`assign_shot_type` — and nothing could set one. A generated structure chose
once; a hand-typed scene was `minor` for ever. Since structure stopped
generating on project creation, the default path is a blank page, so **every
script was uniformly minor and the rail's major count read zero.**

The corkboard badge is now the control.

### Two more doors into the craft library (`09070db`)

The "Thin character" chip sent a query opening with "my characters sound the
same" — verbatim the `problem` of a *dialogue* entry. Retrieval returned that
entry and was right to; the chip was asking a dialogue question under a
character label. Split.

The deeper limit: six chips × three cards reach at most eighteen of thirty-nine
entries, so more than half the library was unreachable from the interface. There
is now a box to type the complaint. The backend always accepted an arbitrary
string; this stops the UI choosing the question.

### Something to say mid-draft (`291937b`)

`PenPrompt` speaks on an empty page and vanishes on the first keystroke;
`review.py` speaks at finalize. In between — where a screenplay actually gets
written — nothing, unless the writer pressed a tab they had no reason to press.

Four notes, one at a time, dismissible per script. **Only one reports a fact**
(scenes written, none marked a turning point). The other three are convention
and are documented as one — nothing in this repo can tell a writer their
midpoint does not flip, so they ask and link the lesson rather than assert a
fault. A test pins that they never assert. Whether writers find them useful or
patronising is a `PILOT.md` question; deleting an entry from the array removes
one.

### The two checks no suite can perform, in CI (`171b081`)

`responsive-audit.mjs` and `editor-load-race.mjs` existed and ran nowhere.

Both scripts **write** — they register an account and create a project. Nothing
told them where those rows would land, and pointed at this machine they went
into production Supabase, which is what `purge_test_accounts.py` exists to clean
up after. Both now refuse unless `/health` reports `demo: true`. **Verified by
running them against this machine's live backend: both refused.**
`--allow-live` is the override; CI never needs it.

Retrieval floor raised `0.80` → `0.85`. Worth noting the widened set scored
71.8% before `craft_query` — that gate would have been red, correctly, and the
old floor was only green because the set had almost no Nepali in it.

### The model's failures name themselves (`6ba50b2`)

Three different faults arrived at one message, "AI response could not be parsed
as JSON. Try again.", and only one was worth retrying.

`z-ai/glm-5.3-free` is a reasoning model, and `max_tokens` there is reasoning
PLUS output. Asked for a scene at 3000 it returns `finish_reason="length"` with
zero characters. Measured at 3000 and again at 8000: same result, twice the
cost. The empty string then travelled to `_extract_json`, which blamed the JSON
— so `finish_reason`, the one fact that explained it, was known at the call site
and thrown away there.

---

## 3b. The 11th — one bug, and what it says about the checks

**The mid-draft note broke the editor's layout, and 1105 green tests said
nothing.** Reported from a screenshot: on a blank draft the Pen's prompt sat off
the right edge of the paper, its text on the app background.

`.screenplay-container` is `display:flex` / `justify-content:center` in the
default ROW direction, so every direct child becomes a column beside the page.
It had one. `291937b` made it two. The pair got centred together, the paper
moved left, and PenPrompt — absolutely positioned across the container — stayed
put. Measured at 1100px: paper centre 550 -> 283, and 224px of prompt hanging
off the paper.

Fixed in `ba74def`, with the check split in two, which is the pattern worth
copying:

  * `ScriptPage.test.jsx` pins the CAUSE against the real component — the
    container holds exactly one in-flow child. Verified by running it against
    the broken version: 4 of 6 fail there. A regression test that has not been
    seen to fail is a guess.
  * `scripts/page-layout-check.mjs` measures the CONSEQUENCE in a real engine,
    with no server, no login and no database. It asserts it can still reproduce
    the bug before claiming the fix works, so it cannot quietly go vacuous.

Then every component changed this session was swept the same way — real
components rendered to HTML, loaded in a real browser against the real built
stylesheet, measured at 320/375 and their natural width. **No overflow
anywhere**, so nothing else regressed. Two pointer targets under the 24px WCAG
floor, both new this session, fixed in `50ee82e`: the corkboard badge kept the
size it had as a label after becoming a control (49x19), and the note's dismiss
had `tap` — which stretches vertically only — but was 2px narrow.

One false positive is worth remembering: the sweep first flagged `↻ Refresh` at
48x17. It has `tap`, and `getBoundingClientRect` measures the element, not the
pseudo-element carrying the hit area. **A check that reports every tap-ed
control as broken is a check everyone learns to ignore.** The harness reads
`::after` now.

---

## 4. What will bite you

Carried forward, still true, plus what this session added.

1. **The AI-key guard in `conftest.py` is a list of names.** See §1. Adding a
   provider means adding it there, or the suite starts spending money.
1b. **`.screenplay-container` holds exactly ONE in-flow child.** It is a flex
   ROW, so a second child moves the page out from under the Pen's prompt. See
   §3b. Anything that belongs under the page goes inside that column.
2. **All four migrations are applied** on the project in `.env`, checked
   2026-09-09. Do not re-run the email-normalisation index — `CREATE UNIQUE
   INDEX` is not idempotent and its failure reads like a data problem. A fresh
   Supabase project still needs all four.
3. **The mock DB is schemaless.** Flat JSON rows, so it accepts columns Postgres
   would reject. Three schema-drift bugs so far.
4. **Restart the backend after editing it.**
5. **CSS cannot be tested.** `vite.config.js` sets `css: false`, so every
   breakpoint is verified in a browser or not at all. Four of the five faults
   the phone found were CSS, past two green suites. The CI layout job is a
   floor, not a substitute — see 7.
6. **Test isolation:** the mock store is process-global. Tests registering an
   address must generate a unique one (`tests/test_invites.py::_address`).
7. **An audit that passes is not a page that works.** `responsive-audit.mjs`
   checks two properties, overflow and target size. It has nothing to say about
   a fixed overlay, contrast, or text too small to read — it passed the editor
   while the assist panel sat on top of it.
8. **Anything in this repo that writes should ask `/health` first.** Two scripts
   did not, and their rows are in production.

---

## 5. Next session — in order

1. **Delete the test accounts from the real database.** Dry run first:

   ```
   cd baakhapaa-backend
   ./venv/Scripts/python purge_test_accounts.py          # lists them
   ./venv/Scripts/python purge_test_accounts.py --delete # removes them
   ```

2. **Open a PR.** The branch is pushed (`fix/craft-and-patterns-ux`, 31 commits
   ahead of `codebase`) but CI watches `push` on `codebase`/`main` plus
   `pull_request` only — so the new layout job has still never run.
3. **Decide the two business questions** in `FEATURE_SUGGESTIONS.md` §A — what
   a paid tier is actually for, and whether the free cap should be measured in
   projects started or scripts finished. Both block pricing, and pricing blocks
   the merchant accounts.
3. **Set `LLM_PROVIDER` back to `anthropic`** before anyone else uses this
   machine, or reconcile the privacy policy with TokenRouter.
4. **Finish Day 5 on the device**: 44px hit areas under a thumb, focus mode
   against the collapsing address bar, the craft panel sheet and corkboard.
   Also whether 12px in the script tab is right — that was a judgement, not a
   measurement.
5. **Run the system once with real keys**, one walk from register → structure →
   write → storyboard → export.
6. **Run the five-writer pilot** (`PILOT.md`). Three things this session built
   are pilot questions, not engineering ones: the mid-draft notes, the melodrama
   chip's craft level, and whether the Ask box gets used at all.
7. **Deploy** — Railway then Vercel. Merchant accounts need a live URL.
8. **SMTP + cron for `renewals.py`.**

### Still open, smaller

- `FEATURE_SUGGESTIONS.md` is the new build queue, ordered by evidence.
- The branch has never been merged to `codebase`. Deploying from a non-default
  branch is how the wrong thing gets deployed.
- `PROJECT_PLAN.md` §6/§7 carry the changelog; `MONTH_1_REPORT.md` and
  `SESSION_SUMMARY.md` are historical records, deliberately left as written.
- The corpus fingerprints task (E6) is still blocked — the corpus is on another
  machine.
- Five corpus entries are never retrieved by any of the forty real queries.
  Four of them are dialogue-level. That is either dead weight in the corpus or a
  gap in the golden set, and nothing currently distinguishes those.
