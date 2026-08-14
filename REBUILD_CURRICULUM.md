# Rebuild Curriculum — Learn Baakhapaa by Building It Again

A staged path to understanding this system completely, by **rebuilding it from
zero in a separate folder**, using Claude as a tutor rather than a contractor.

Three docs sit next to this one and do different jobs:

| Doc | Job |
|---|---|
| `LEARNING_GUIDE.md` | Read and navigate the code that already exists |
| `AI_ASSISTED_BUILD_GUIDE.md` | The evidence-backed method for working with AI |
| **this file** | Rebuild each layer yourself, in order, until you own it |

---

## The one rule that decides whether this works

**If Claude writes the code and you read it, you will not learn this.**

That is not a moral position, it is a mechanical one. Reading code produces
recognition — "yes, that looks right" — and recognition feels identical to
understanding while being a different thing entirely. You find out which one you
have the first time something breaks at 1am and there is nothing to recognise.

`AI_ASSISTED_BUILD_GUIDE.md` documents the measured version of this: developers
using AI tools ran **19% slower** while believing they were 20% faster. The gap
between felt and actual competence is the thing to defend against.

So the method for every stage below is the same three beats:

1. **Ask for the shape, not the code.** *"Explain how JWT auth works and what
   the pieces are. Do not write the implementation."*
2. **Write it yourself.** Badly is fine. Stuck is fine — ask about the specific
   stuck point, not for the whole file.
3. **Then diff against this repo.** Open the real file. Where it differs from
   yours, ask *why* — that question is where the actual learning happens,
   because this codebase's differences are mostly hard-won.

Use Claude as the person who explains and reviews. Never as the person who types.

---

## Setup

Build in a **fresh folder**, not this repo. You want your own mistakes.

```bash
mkdir baakhapaa-rebuild && cd baakhapaa-rebuild && git init
```

Commit at the end of every stage. When a stage goes wrong you want a floor to
stand on, and the commit history becomes your record of what you actually did.

Keep this repo open in a second window as the reference implementation.

---

## Stage 1 — A server that answers

**Build:** a FastAPI app with `/health`, run it, call it from the browser.

**Concepts:** HTTP verbs, status codes, JSON, what a route is, what ASGI means,
why `/docs` exists for free.

**Read here:** `main.py` — the whole file. It is short on purpose. Notice it
does nothing but wire routers together and print startup warnings.

**Ask Claude:** *"What does uvicorn actually do, and what is the difference
between it and FastAPI?"* Most people conflate them for months.

**You understand it when** you can explain why `main.py` prints a warning about
mock mode at startup rather than checking on every request.

---

## Stage 2 — Identity

**Build:** register, login, a token, and one route that requires it.

**Concepts:** password hashing (never encryption), bcrypt cost, JWT structure
(header.payload.signature), why the signature matters, `Authorization: Bearer`.

**Read here:** `auth.py`, top to bottom. This file is the densest security
teaching in the project. Three decisions to interrogate:

- **It refuses to boot without a strong `JWT_SECRET`.** Why is a hard crash the
  correct behaviour, rather than a warning and a default?
- **`require_script_access()` returns 404, not 403.** Ask why. The answer — that
  403 confirms the id exists to someone probing for it — is a whole category of
  thinking about information leaks.
- **`_timing_equalizer_hash()`.** The login path verifies against a dummy hash
  when the email is unknown. Work out what attack that stops before reading the
  comment. This one is genuinely subtle and it is the best single example in the
  codebase of a bug you cannot see by looking at output.

**You understand it when** you can explain why hashing a password on the
*frontend* would be useless.

---

## Stage 3 — Data that persists

**Build:** projects — create, list, get, update, delete — owned by a user.

**Concepts:** schemas vs models, validation at the boundary, primary/foreign
keys, and the single most common web vulnerability class: mass assignment.

**Read here:** `models.py` (Pydantic as a wall, not decoration), `projects.py`,
`updates.py`, `database.py`.

Two things to sit with:

- **`updates.apply_whitelist()`.** Why does accepting a raw `dict` from the
  client and passing it to an UPDATE let someone change their own `user_id`?
- **`database.py`'s mock `delete()` defers to `execute()`.** The comment says
  reverting it wipes whole tables. Understand why: `table.delete().eq(...)` must
  not delete at `.delete()` time, because that is not what the real Supabase
  client does. Faking an API means matching its *semantics*, not just its shape.

**You understand it when** you can name three fields that must never appear in
an update whitelist, and say why for each.

---

## Stage 4 — A UI that talks to it

**Build:** login page, dashboard, project list. Real auth against your Stage 2/3
backend.

**Concepts:** components, `useState`/`useEffect`, controlled inputs, routing,
React context, and the axios interceptor pattern.

**Read here:** `services/api.js` first — every backend call in the app lives in
one file, which is the pattern worth stealing. Then `context/AuthContext.jsx`,
then `pages/LoginPage.jsx`.

Note the interceptor in `api.js`: a 401 sends you to `/login` **except** on
`/auth/` routes. Work out what breaks without that exception. (A failed login
returns 401, which would reload the page and wipe the error message you were
trying to show.)

**You understand it when** you can trace one click from `LoginPage.jsx` to
`auth.py` and back, naming every file it passes through, without looking.

---

## Stage 5 — Calling an LLM

**Build:** send a prompt, get a three-act structure back as JSON, store it.

**Concepts:** system vs user prompts, tokens, temperature, structured output,
and the fact that **model output is untrusted input**.

**Read here:** `script_engine.py`.

- **`_extract_json()`.** The docstring lists four measured cases and which
  failed. Models write "Here it is:" before the JSON and "Let me know!" after.
  Anything parsing LLM output must survive that.
- **Provider precedence** (Anthropic → Groq → mock). Why does a mock mode make
  the whole project developable without a key, and why is that worth the branch?
- **`_act_split()`.** Act three takes the *remainder* rather than its own
  rounded 34%, so the three always sum to the runtime asked for. Rounding drift
  is a small bug that a test would catch and a human never would.
- **Every AI call is wrapped to a 503.** Providers fail. Callers need a status,
  not a stack trace.

**You understand it when** you can list three ways a valid API call still
returns something your code cannot use.

---

## Stage 6 — Retrieval (RAG)

**Build:** a small library of craft entries, embed them, retrieve the closest to
a query.

**Concepts:** embeddings as coordinates, cosine similarity, why brute force is
correct at small n, chunking, and — the important one — **what you embed
determines what you can find**.

**Read here:** `rag.py`, then `RECOMMENDATION_ARCHITECTURE.md` §2 and §5.

The central lesson of this project is here. `pattern_to_text()` embeds each
entry's **problem**, repeated for weight, because writers arrive with a symptom
("this feels flat") not a genre tag. But the endpoint was querying it with raw
screenplay prose — so it compared *diagnoses* against *dialogue*, two different
registers, and what survived was surface topic. A tea-shop scene retrieved
entries mentioning tea.

Sit with that until it is obvious. It is the most transferable idea in the
codebase: **retrieval quality is a property of the query/document relationship,
not of the model.**

**You understand it when** you can explain why swapping in a bigger embedding
model would not have fixed it.

---

## Stage 7 — Determinism beats AI

**Build:** a screenplay parser, then rules over the parse tree.

**Concepts:** classification by shape, parse trees, rules engines, and knowing
when *not* to use a model.

**Read here:** `screenplay.py`, then `linter.py`.

This is the stage most people skip and it is the one that matters most
commercially. The linter uses **no AI at all** — regex over a parse tree — and
it is arguably the product's strongest feature, because:

- it costs nothing per run, so it works on the free tier
- it is instant
- **it is deterministic**, and the research in
  `RECOMMENDATION_ARCHITECTURE.md` §3.2 found writers' second-biggest complaint
  is human notes that contradict each other and send them "in circles"

Then notice how Stage 6 and Stage 7 connect: every linter rule was derived from
a craft entry's `warning_sign`, so **a flag already names the technique that
fixes it**. That turns retrieval into an exact dictionary lookup and skips the
embedding pass entirely.

**You understand it when** you can name a feature in some product you use that
would be better as rules than as a model.

---

## Stage 8 — Measurement

**Build:** compute metrics over a script; compare one script to a set.

**Concepts:** feature extraction, distributions, percentiles, cohorts, sample
size, and the difference between a claim about a text and a claim about a
population.

**Read here:** `fingerprint.py`, `benchmark.py`, `tests/test_fingerprint.py`.

Four design rules encoded there, each worth understanding as a general principle:

- **Percentile, not pass/fail.** "Longer than 94% of the corpus" invites a
  decision; "too long" picks a fight the writer may win.
- **Silence is a result.** Only the outer 10% produce a note. A report that
  flags everything gets switched off.
- **Never compare a short to a feature.** Only length-independent ratios.
- **Always report n.** A percentile from six films is noise wearing a lab coat.

Then read `test_value_equal_to_corpus_is_never_an_outlier`. The first version
counted ties as "at or below," so a script sitting exactly on a mass point
scored the 100th percentile and got flagged as an outlier **for being completely
ordinary**. Midrank fixed it. That bug was found by running the thing against
generated data with known properties — not by reading the code. Learn the
method, not just the fix.

**You understand it when** you can explain why act breaks are deliberately *not*
inferred here.

---

## Stage 9 — Making it a product

**Build:** tiers, gates, exports, tests.

**Concepts:** authorization vs authentication, metered cost, whitelists at the
API rather than the UI, file generation, and unicode/font handling.

**Read here:** `auth.require_tier`, `projects.enforce_project_limit`,
`storyboard.py`, `export_service.py`.

The lesson to extract from the storyboard gate: **UI-only gating is not
gating.** Generation was authorised by "is logged in" alone and looped once per
scene at image-generation rates — roughly $3.20 from one free-tier click,
repeatable, on a plan costing about $7/month. And note the shape of the fix:
gate the *spend*, not the *access*, so a user who downgrades still sees the
board they already paid for.

Also read `export_service.py` on fonts. Devanagari does not render in the built-in
PDF font, which breaks a product promise for bilingual writers — and it is
*still* the project's open blocker, waiting on a font file.

**You understand it when** you can find, in any codebase, a paid feature whose
only gate is a hidden button.

---

## After the stages

Rebuild one feature this repo does **not** have, from spec to tests, without
copying: **note reconciliation** — let a writer paste notes from several readers,
tag each by craft level, and show where readers agree. It is specced in
`PROJECT_PLAN.md`, nobody sells it, and it has no reference implementation here
to lean on. That is the point.

---

## Prompt patterns that teach instead of deliver

| Instead of | Ask |
|---|---|
| "Write the auth module" | "What are the pieces of JWT auth and what does each one prevent? No code." |
| "Fix this error" | "What is this error telling me? Don't fix it — I want to try first." |
| "Is this right?" | "Review this for correctness only. Do not rewrite it. Tell me what breaks and under what input." |
| "Add tests" | "What are the load-bearing cases here? I'll write them." |
| *(after writing your version)* | "Here's mine, here's the repo's. Why does the repo do X differently?" |

Two habits from `AI_ASSISTED_BUILD_GUIDE.md` that apply doubly when learning:

- **Clear context between stages.** A session carrying Stage 4 while you do
  Stage 7 does both worse.
- **Ask for evidence, not assurance.** Test output, the command that ran, what
  it returned. This is also how you learn what "verified" means.

---

## Honest scope

Stages 1–4 are standard web development; any good tutorial covers them and this
project is a fine worked example. **Stages 5–8 are the ones with no tutorial**,
and they are where this codebase has something to teach that most projects
don't: what to do when your data source is a model that lies, when your corpus
is legally untouchable, and when the honest answer is a number rather than a
paragraph.

Budget most of your time there.
