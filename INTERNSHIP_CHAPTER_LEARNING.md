# Chapter 5 — Learning Outcomes, and Part B: Continuing Development Plan

*Baakhapaa internship report*

> **Part A** (§5.1–§5.5) is written for submission.
> **Part B** (§5.6 onward) is a personal continuing-development plan. It is
> useful as an appendix if your institution asks for one, but it is not
> required and can be removed without affecting Part A.

---

# PART A — LEARNING OUTCOMES

## 5.1 Skills Matrix

| # | Skill area | Level at start | Level at end | Evidence in the project |
|---|---|---|---|---|
| 1 | Backend API design (FastAPI) | Novice | Working | REST endpoints for scripts, scenes, review, export, payments |
| 2 | Relational data modelling | Novice | Working | `scenes` / `storyboard_frames` foreign-key design; derived-field JSON columns |
| 3 | Text parsing and state machines | None | Working | Nine-element screenplay parser with lookahead and dialogue state |
| 4 | Authentication and authorisation | Novice | Working | JWT auth; per-project Admin / Editor / Viewer roles with default-deny |
| 5 | Third-party API integration | Novice | Working | Claude and DALL·E integration with uniform failure handling |
| 6 | Automated testing | Basic | Working | Backend and frontend suites; pure-function design for testability |
| 7 | Continuous integration | None | Basic | Lint, dependency audit, both suites, production build on push and PR |
| 8 | Application security | Novice | Working | Ownership checks, field whitelists, rate limiting, secret management |
| 9 | Internationalisation | None | Working | Devanagari rendering in PDF; per-field translation fallback |
| 10 | Information retrieval / embeddings | None | Basic | Semantic retrieval over a craft corpus, with a measured evaluation set |
| 11 | Payment integration | None | Basic | Three gateways with a verified-on-return trust model |
| 12 | Engineering judgement | — | Developed | See §5.4 |

*Adjust the "level at start" column honestly. A matrix that claims expert
everywhere is less credible than one that admits a starting point.*

---

## 5.2 Technical Skills Acquired

### 5.2.1 Backend API design

Implemented REST endpoints in FastAPI covering script management, scene
structure, deterministic review, export, and billing. The convention adopted
across the project is that **any endpoint calling an external AI provider wraps
the call and returns HTTP 503** on failure, rather than allowing a stack trace
to reach the client. AI providers are unreliable; callers need a status code
they can branch on.

Learned to treat HTTP status codes as part of the interface rather than as
decoration — 402 for a tier limit, 403 for a role failure, 404 (deliberately,
not 403) for a resource the caller does not own, so that resource IDs cannot be
probed for existence.

### 5.2.2 Relational data modelling

The central modelling decision in this project was that `storyboard_frames`
holds a foreign key to `scenes.id`. That single constraint propagates outward
into an application-level rule: **scene rows may be updated and appended but
never deleted**, because deleting one would orphan generated frames. Scenes cut
from the draft are marked rather than removed.

Also learned the practical use of a nullable JSON column (`draft_json`) for a
growing set of derived fields, avoiding a schema migration per field — and its
cost, which is that such fields are not queryable by the database.

### 5.2.3 Text parsing and state machines

Built a parser for a format in which element types are not marked and must be
inferred from shape. Key techniques learned: **lookahead** (a character cue is
distinguished from a shouted action line by whether the next line is blank),
**ordered classification** (capitalised camera and act-break lines must be
tested before the character-cue test or they become speakers), and **carried
state** (`in_dialogue` and `current_speaker`, set by a cue and cleared by a
blank line, are what allow dialogue to be attributed to a speaker).

This is documented fully in Chapter 4.

### 5.2.4 Authentication and authorisation

Implemented JWT-based authentication and a per-project role model — Admin,
Editor, Viewer — rather than global roles, because a person is typically a
writer on their own work and a reader on someone else's.

The design principle learned here is **default-deny**: the access helper takes
a `minimum` role that defaults to editor, so forgetting to annotate a route
costs a viewer a read rather than granting a stranger a write. Defaults should
fail in the safe direction.

### 5.2.5 Third-party API integration

Integrated a text generation API (Anthropic Claude) and an image generation API
(OpenAI DALL·E). Learned that the integration problem is mostly not the happy
path — it is expiry, cost, and degradation:

- generated image URLs expire, which broke exports weeks after generation and
  forced a redesign of how frames are stored;
- image embedding in exports is bounded by a per-fetch timeout and a shared
  budget, and degrades to a captioned placeholder rather than failing the
  export;
- every generation call costs money, which makes "run the test suite" a
  financially significant action if the test environment is not properly
  isolated.

### 5.2.6 Testing and continuous integration

Learned to design for testability rather than to test after the fact. Two
concrete techniques:

- **Pure functions where possible.** The parser takes text and returns
  structures with no I/O, so it can be tested exhaustively with no fixtures.
- **Deferred imports.** The reconciliation module imports the database inside
  the function body rather than at module scope, specifically so the matching
  algorithm can be unit-tested without standing up a database.

Configured CI to run linting, a dependency audit, both test suites, and a
production build on every push and pull request. Learned that CI configuration
has semantics of its own: the workflow triggers on pushes to the main branches
and on pull requests, so **pushing a feature branch alone proves nothing** — a
pull request must be opened for the checks to run.

### 5.2.7 Application security

Worked through a security review of the codebase. Measures implemented or
verified: ownership enforcement on every script endpoint; field whitelists on
update routes to prevent mass assignment; rate limiting on login and
registration; a server-side password policy (client-side rules being advisory
only); equalised response timing between an unknown email and a wrong password,
so that the login endpoint does not disclose which accounts exist; and a
required, validated JWT secret without which the application refuses to start.

The general lesson: **a security control written in a document is not a
control.** Several deployment requirements existed only as instructions in a
markdown file until they were converted into boot-time checks that refuse to
start the server when unmet.

### 5.2.8 Internationalisation

The product targets Nepali-language writers, which surfaced three classes of
problem that do not appear in English-only software:

- **Font embedding.** Devanagari does not render in PDF without an embedded
  font with the right glyph coverage, and the font must be licensed for
  redistribution — a platform font present on the development machine is not a
  solution, it only hides the failure until deployment.
- **Per-field translation fallback.** Translations fall back field by field
  rather than document by document, so content added before it is translated
  still reads correctly instead of reverting wholesale to English.
- **Language-aware text rules.** Text analysis rules written against English
  patterns are silent on other scripts. Rules were extended to match Devanagari
  and romanised Nepali.

### 5.2.9 Information retrieval

Worked with vector embeddings for semantic retrieval over a corpus of craft
guidance, including building an evaluation set and measuring precision@1. The
substantive lessons from this are recorded in §5.4, because they are about
method rather than about the technique.

### 5.2.10 Payment integration

Integrated three payment gateways. The transferable knowledge is the **trust
boundary**: a payment record is written *before* the user leaves for the
gateway, and on return the gateway is queried directly and the amount checked
against the recorded price. A user returning from a gateway carries only an
identifier; if the purchased tier were read from that returning request, any
user could return claiming the most expensive plan.

Also learned to distinguish what a gateway actually offers from what the
application needs: two of the three gateways have no subscription primitive at
all, so plans bought through them are time-boxed by the application and lapse,
rather than renewing.

---

## 5.3 Professional Skills

- **Working in an existing codebase** — reading unfamiliar code to find where a
  behaviour lives, rather than writing new code beside it.
- **Version control discipline** — one change per commit, with a message
  stating what changed and why.
- **Technical writing** — module docstrings that record the reasoning behind a
  design, not a restatement of the code. The reconciliation module's docstring
  lists the three defects it exists to remove; that is more useful to the next
  reader than any line-by-line comment.
- **Scope discipline** — recognising when a promised feature should be cut
  rather than faked. Live co-editing was descoped and the product requirements
  document amended to say so, instead of shipping a presence indicator that
  showed "Solo session" to everyone.

---

## 5.4 Engineering Judgement — the Three Most Valuable Lessons

These are the outcomes with the widest application beyond this project.

### Lesson 1 — Coherence is not correctness

Page length was defined as 45 lines when the industry standard is 55. Every
consumer of that constant — page count, runtime, act balance, corpus
comparison, the editor's page indicator — derived from the same value, so all
of them were wrong **together**, by about twenty per cent. Nothing looked
inconsistent, which is exactly why the error survived.

A value relied on throughout a system must be verified against an external
source. Checking it against the system's own outputs will always confirm it.

### Lesson 2 — Measure before building the obvious fix

Retrieval performed badly for Nepali-language queries. The obvious fix was to
add Nepali text to the corpus so that queries would match it. Measurement
killed that plan: the embedding model scores two same-meaning Devanagari
sentences at 0.898 and two different-meaning ones at 0.877 — a gap of 0.02,
meaning the model cannot distinguish them at all and does not usefully read the
script. Adding Nepali text to the corpus would have produced no improvement
after substantial work.

The implemented solution instead translates the query out of Nepali before
embedding it, and measured performance rose accordingly.

**A plausible fix and a correct fix are not the same thing, and the cheapest
way to tell them apart is a measurement taken before the work begins.**

### Lesson 3 — A metric is only as honest as its sample

A headline retrieval figure of 88% was measured on an evaluation set of 25
queries. Widening that set to 40 put the real figure at 71.8%. The system had
not changed; the measurement had simply been too small to be trusted, and the
smaller sample flattered it.

Related: when a second content type was added, the project kept **two**
separate quality floors in CI rather than one average, because averaging a weak
new category into a strong existing one is how a good headline number conceals
a bad reality.

---

## 5.5 Gaps Identified

Stated deliberately, because an honest account of what was not learned is part
of the outcome.

- **Deployment to a live host.** Deployment configuration was written and
  boot-time production checks were implemented, but the system has not been
  deployed. Everything specific to running against real infrastructure —
  process management, logs, TLS, domains, monitoring — remains unlearned.
- **Payments with real money.** The gateway flows are verified against sandbox
  and demo paths only. No real transaction has been processed.
- **Database operations at scale.** Schema changes were made, but migrations
  were applied manually rather than through a managed migration tool, and no
  work was done on indexing, query planning, or connection pooling under load.
- **Users.** The system has not been used by its intended users. All quality
  judgements to date are internal.

These gaps define the continuing-development plan in Part B.

---
---

# PART B — CONTINUING DEVELOPMENT PLAN

*Personal, not for submission. Each item states why it is needed, exactly what
to learn, what to read or watch, an hour estimate, and a verification task
performed inside this project — because a skill is not learned until something
works that did not work before.*

---

## 5.6 Priority 1 — PostgreSQL and schema migrations

**Estimated effort:** 30–35 hours
**Why:** repeated schema-drift defects, several migrations still applied by
hand, and an intermittent connection error after idle periods that is a pooling
behaviour rather than an application bug. All three are the same missing
knowledge.

**Topic checklist**

- [ ] Data types, and why `TEXT` vs `VARCHAR(n)` rarely matters in Postgres
- [ ] Primary keys, foreign keys, `ON DELETE` behaviours (`CASCADE`, `RESTRICT`, `SET NULL`)
- [ ] `NOT NULL`, `UNIQUE`, `CHECK` constraints — pushing invariants into the database
- [ ] Indexes: B-tree, partial, composite; why column order matters
- [ ] `EXPLAIN ANALYZE` — reading a query plan, recognising a sequential scan
- [ ] Transactions, isolation levels, and what a failed transaction rolls back
- [ ] Migrations as versioned, ordered, forward-only files
- [ ] Connection pooling: what a pool is, why a pooled connection dies after idle, transaction-mode vs session-mode pooling
- [ ] JSON columns: `json` vs `jsonb`, and when a JSON field should have been a table

**Resources**

| Type | Resource |
|---|---|
| Course | *The Complete SQL Bootcamp* (Jose Portilla, Udemy) — use the PostgreSQL version |
| Practice | pgexercises.com — work every section, do not read the answers |
| Book | *Practical SQL*, Anthony DeBarros |
| Reference | use-the-index-luke.com (free) — the indexing half of *SQL Performance Explained* |
| Docs | Supabase connection-pooling documentation |

**Verification tasks in this project**

1. Apply every outstanding migration to the real database, and confirm the
   schema-check script reports no drift.
2. Diagnose the idle-disconnect error properly and fix it at the connection
   layer rather than by retrying.
3. Run `EXPLAIN ANALYZE` on the scene-listing query and state whether it uses
   an index.

---

## 5.7 Priority 2 — Object storage and file lifecycle

**Estimated effort:** 12–15 hours
**Why:** storyboard images are currently held as base64 data URIs inside
database rows. A single board can put tens of megabytes into rows that are read
back in full every time the board opens or an export runs. The replacement is
in progress and needs the operational half of the knowledge.

**Topic checklist**

- [ ] Buckets, objects, keys, and content types
- [ ] Public vs signed URLs, and why an expiring URL is the wrong answer for a document that must remain exportable
- [ ] CORS on a storage bucket, and what breaks without it
- [ ] Lifecycle rules and orphan cleanup — an object store does not cascade on delete
- [ ] Idempotent uploads and deterministic key naming
- [ ] Graceful degradation when the store is unavailable

**Resources**

| Type | Resource |
|---|---|
| Docs | Supabase Storage documentation, read completely |
| Course | Any S3 fundamentals module — the concepts transfer directly |
| Reading | Your own module docstring, which already states the three required properties |

**Verification tasks**

1. Deleting a project removes its stored frames — confirmed by inspecting the
   bucket, not by trusting the code.
2. Revoking the storage key degrades generation to the old data-URI path rather
   than failing.
3. Existing boards holding data URIs still render and still export.

---

## 5.8 Priority 3 — Deployment, operations and CI

**Estimated effort:** 40–50 hours
**Why:** this is the single largest gap. Deployment artefacts and production
boot checks exist and have never been executed against a real host.

**Topic checklist**

- [ ] Linux fundamentals: processes, ports, file permissions, environment variables
- [ ] Docker: images vs containers, layers, `Dockerfile` authoring, `.dockerignore`
- [ ] Multi-stage builds, and why the runtime image should not contain the toolchain
- [ ] Environment configuration and secret handling in a hosted environment
- [ ] Reverse proxies, TLS certificates, and forwarded headers — why a proxied app that ignores forwarded headers puts every user in one rate-limit bucket
- [ ] Logs: structured logging, log levels, where logs go in a hosted environment
- [ ] Health checks, readiness, and restart behaviour
- [ ] GitHub Actions: jobs, matrices, caching, secrets, branch triggers
- [ ] Rollback: how to get back to the previous version quickly

**Resources**

| Type | Resource |
|---|---|
| Course | A Docker fundamentals course (Bret Fisher's is the usual recommendation) — skip Kubernetes entirely |
| Course | *The Missing Semester of Your CS Education* (MIT, free) — shell, scripting, git internals |
| Book | *The Linux Command Line*, William Shotts (free PDF) |
| Docs | Your hosting provider's own deployment documentation, read start to finish once |

**Verification tasks**

1. The application is reachable on a URL someone else can open.
2. The production boot checks actually fire — deliberately misconfigure one
   setting and confirm the server refuses to start.
3. A deliberate bad deploy is rolled back in under five minutes.
4. You can answer, from logs alone, what happened during a failed request.

---

## 5.9 Priority 4 — Customer research and interviewing

**Estimated effort:** 8 hours of reading, then fieldwork
**Why:** the product has been built entirely on internal judgement. Several
constants in shipped code — notably the speaking rate used for Nepali runtime
estimates — are unmeasured assumptions.

**Topic checklist**

- [ ] Asking about past behaviour rather than future intent
- [ ] Why "would you use this?" and "would you pay for this?" produce unusable answers
- [ ] Separating compliments from evidence
- [ ] Observing a task rather than asking about it
- [ ] Writing down what would falsify a belief **before** running the session
- [ ] Sample size: what five sessions can and cannot establish

**Resources**

| Type | Resource |
|---|---|
| Book | *The Mom Test*, Rob Fitzpatrick — short, and specifically about not asking the questions you will want to ask |
| Free | YC Startup School talks on talking to users |
| Internal | The project's own pilot protocol and hypothesis documents, which already state what to measure |

**Verification tasks**

1. Run the five-writer pilot as written.
2. Produce at least one finding that contradicts something you believed before
   starting. If nothing contradicts, the questions were leading.
3. Measure the Nepali speaking rate from recordings rather than estimating it.

---

## 5.10 Priority 5 — Applied statistics and experimentation

**Estimated effort:** 25–30 hours
**Why:** an inflated quality metric has already been produced once in this
project by using too small an evaluation set. The same class of error is about
to be repeated on retention, conversion, and pricing, where the numbers will be
small and the priors strong.

**Topic checklist**

- [ ] Sampling error, and why small samples flatter
- [ ] Base rates and why they dominate intuition
- [ ] Confidence intervals — what they do and do not claim
- [ ] What a p-value is not
- [ ] Statistical power, and deciding sample size before collecting data
- [ ] Regression to the mean
- [ ] Multiple comparisons: checking twenty metrics guarantees a "significant" one
- [ ] Precision, recall, precision@k — the metrics already in use here
- [ ] Guardrail metrics, and pre-registering the decision rule

**Resources**

| Type | Resource |
|---|---|
| Video | StatQuest "Statistics Fundamentals" playlist (free, YouTube) — start here |
| Book | *The Art of Statistics*, David Spiegelhalter |
| Book | *Trustworthy Online Controlled Experiments* (Kohavi, Tang, Xu) — written for exactly this scale of decision |
| Book | *Statistics Done Wrong*, Alex Reinhart — the failure modes |

**Verification tasks**

1. Before the pilot, write down the number that would make you abandon a
   feature — then hold to it.
2. Compute a confidence interval for the retrieval precision figure and state
   the evaluation-set size alongside every future quote of it.
3. Given an observed conversion difference, state honestly whether the sample
   supports the conclusion.

---

## 5.11 Priority 6 — Visual design fundamentals

**Estimated effort:** 40–50 hours
**Why:** layout correctness is currently checked by purpose-written scripts
because no test in the project can see a rendered layout. That is a reasonable
workaround, but it substitutes tooling for judgement.

**Topic checklist**

- [ ] Spacing systems and why a consistent scale reads as "designed"
- [ ] Typographic hierarchy: size, weight, and colour instead of size alone
- [ ] Contrast ratios and accessible colour pairs
- [ ] Alignment, optical alignment, and grid
- [ ] Designing the empty, loading, and error states, not only the full one
- [ ] Responsive behaviour: what stacks, what truncates, what scrolls
- [ ] Minimum sizes in pixels rather than proportions — a proportional floor guarantees nothing on a narrow screen

**Resources**

| Type | Resource |
|---|---|
| Book | *Refactoring UI*, Adam Wathan and Steve Schoger — written for developers who can build but not compose |
| Book | *Thinking with Type*, Ellen Lupton |
| Free | DesignCourse (YouTube) for developer-oriented walkthroughs |

**Verification tasks**

1. Close the outstanding narrow-column layout issue by judgement, then confirm
   with the layout script.
2. Every interactive view has a designed empty state.
3. The interface is usable at 320px wide without horizontal scrolling.

---

## 5.12 Career skills, independent of this project

These are not project gaps, but they have the highest return per hour of
anything on this document and none of them require a computer.

| Skill | Effort | Resource | Why it is worth it |
|---|---|---|---|
| Negotiation | ~15 h | *Never Split the Difference* (Voss); *Getting to Yes* (Fisher & Ury); the Michigan negotiation course on Coursera | Highest return per hour of study of anything here — it applies to work you were already going to do |
| Writing plainly | ~40 h | *Style: Lessons in Clarity and Grace* (Williams); *Writing in the Sciences* (Stanford, free) | Multiplies the value of every other skill, because unexplained work is undervalued work |
| Selling to strangers | ongoing | *The Mom Test*; *SPIN Selling* | The scarcest skill among technical people, therefore the best paid |
| Financial literacy | ~40 h | *Financial Intelligence for Entrepreneurs*; Wharton's accounting course on Coursera (free to audit) | Changes which decisions you consider at all |

---

## 5.13 Sequencing

Six months, one primary focus at a time. The rule that matters is the third
column: **no learning item runs without an attached deliverable**, because
learning detached from shipping does not survive the month.

| Month | Primary focus | Attached deliverable |
|---|---|---|
| 1 | PostgreSQL and migrations | All outstanding migrations applied; idle-disconnect fixed |
| 2 | Object storage; deployment begins | Storyboard images out of the database; Docker image builds |
| 3 | Deployment and operations | Application live on a real host with working logs |
| 4 | Customer research | Five-writer pilot completed and written up |
| 5 | Statistics and experimentation | Pilot results analysed with stated sample sizes |
| 6 | Design fundamentals | Layout issues closed; empty states designed |

Career skills in §5.12 run alongside, in reading time, not in build time.

---

## 5.14 Weekly log template

Keep this. A learning plan without a log becomes a wish list within three
weeks, and the log is also the raw material for the next report you write.

```
Week of: ____________

Focus area:
Hours spent:

Topics covered:
  -
  -

Shipped this week (what works that did not work before):
  -

What I got wrong, and what corrected me:
  -

Blocked on:
  -

Next week's single most important task:
  -
```

The fourth field is the one that matters. A week with nothing in it is usually
a week of reading rather than a week of learning.
