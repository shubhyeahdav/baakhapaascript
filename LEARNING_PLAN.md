# Learning Plan

*Revised 2026-09-15, the day the system went live.*

A six-month plan ordered by return per hour. Each item states why it is worth
learning now, exactly what to cover, what to read or watch, an hour estimate,
and a verification task — because a skill is not learned until something works
that did not work before.

---

## What changed, and why the order changed with it

The previous version of this plan put deployment first and called it the
largest gap, on the grounds that nothing had ever run on a real host. That is
no longer true. The frontend is on Vercel, the backend on Railway, both against
real Supabase, and the core paths — register, login, project creation, draft
save, lint, recommendations, review, and scene sync against a Devanagari draft
— were verified in production.

Deploying is done. **Operating is not**, and that is a different skill. The
priorities below reflect four facts that are true today and were not true
yesterday:

1. There is a public URL with real Anthropic and OpenAI keys behind it. Mistakes
   now cost money rather than time.
2. There is somewhere to send the five pilot writers. Customer research moved
   from blocked to available.
3. The unapplied migrations now affect a production database, not a local file.
4. The expensive paths — AI generation and storyboard generation — have never
   been run against the deployed backend. The parts most likely to fail in
   production are the parts least tested there.

---

## Do this before anything else

Not a learning item. A live-system item, worth an hour today.

**The AI endpoints have no per-user rate limit.** `limiter.limit` appears three
times in the backend, all in `auth.py` — register and login. Generation,
improve, suggest and storyboard generation are gated by *tier*, which means a
free account cannot reach them, but a single Pro account can call them in a
loop against real billed keys on a public URL.

Two mitigations, in order of how quickly they can be done:

1. **Set a hard spend cap in the Anthropic and OpenAI dashboards.** Five
   minutes, and it is the only control that cannot be bypassed by a bug in your
   own code.
2. **Add a per-user rate limit to the generation routes**, the way `auth.py`
   already does it. The pattern is in the repo; this is not new work, it is
   applying existing work in one more place.

Do the first one today regardless of everything else on this page.

---

## The order, at a glance

| # | Skill | Hours | Why now |
|---|---|---|---|
| 1 | Production operations and observability | 35–40 | Live system, no monitoring, no rollback practice |
| 2 | PostgreSQL and migrations | 30–35 | Unapplied migrations now affect production data |
| 3 | Object storage and file lifecycle | 12–15 | Base64 images now sitting in production Postgres |
| 4 | Customer research | 8 + fieldwork | There is finally a URL to send writers to |
| 5 | Applied statistics | 25–30 | An inflated metric has already been produced once |
| 6 | Design fundamentals | 40–50 | Layout correctness checked by scripts, not judgement |
| — | Career skills (§7) | ongoing | Best return per hour on this document |

About 155 hours. At 6 hours a week that is the six-month sequence in §9.

---

## 1. Production operations and observability

**Hours: 35–40 · Priority: highest**

**Why.** Deploying taught you the deploy. It did not teach you the week after
the deploy. Right now, if a user hits an error at 2am, nothing tells you it
happened, nothing records what it was, and there is no rehearsed way back to
the last good version. The three env-var traps that cost an hour during the
deploy — a `KEY=VALUE` pair pasted into a value box, an origin with a trailing
slash and a missing `//`, and `VITE_API_URL` needing a cache-free rebuild —
are all instances of one concept you have now met the hard way and should learn
properly: **configuration is an input, and build-time inputs are not runtime
inputs.**

**Topic checklist**

- [ ] Build-time vs runtime configuration — why a Vite variable is baked into the bundle and a server variable is not, and why that means the frontend needs a rebuild and the backend needs a restart
- [ ] Twelve-factor config: environment variables, and why config must not live in the image
- [ ] Structured logging — log levels, request IDs, and logging the fields you will want to filter on later
- [ ] Error tracking: capturing an exception with its stack and the request that caused it (Sentry's free tier is the usual starting point)
- [ ] Uptime monitoring and health checks — the difference between "the process is alive" and "the app works"
- [ ] Metrics worth having: request rate, error rate, p95 latency
- [ ] Rollback: getting back to the previous version in minutes, rehearsed before you need it
- [ ] Cost control: provider spend caps, per-user rate limits, and knowing your monthly ceiling
- [ ] Secret rotation — what you would do if a key leaked, written down before it does
- [ ] Reading a CORS failure correctly; why the browser's error message names the wrong cause
- [ ] Connection behaviour of a hosted database: pooling, idle timeouts, cold starts

**Resources**

| Type | Resource |
|---|---|
| Course | A Docker fundamentals course (Bret Fisher's is the usual pick) — still worth it for reproducible environments. **Skip Kubernetes** |
| Course | *The Missing Semester of Your CS Education* (MIT, free) — shell, scripting, git internals |
| Book | *The Linux Command Line*, William Shotts (free PDF) |
| Reading | Google's SRE book, chapters on monitoring and on postmortems (free online) — read those two chapters, not the whole book |
| Docs | Railway and Vercel docs on logs, environment variables and rollbacks |

**Verify**

1. An uncaught exception in production reaches you without a user reporting it.
2. A deliberate bad deploy rolled back in under five minutes, by a method you
   have actually performed once.
3. You can reconstruct from logs alone what happened during a failed request.
4. You can state your maximum possible monthly AI spend, and point at the
   control that enforces it.
5. **Run the AI and storyboard paths against the deployed backend** — they are
   the least-tested, most expensive parts of the system, and the only ones that
   have never executed in production.

---

## 2. PostgreSQL and schema migrations

**Hours: 30–35**

**Why.** Five schema-drift defects so far, and migrations still applied by hand
in a SQL editor — including `pgvector_script_patterns.sql`, which gates the
`applies_to` column. Until it is applied and the loader re-run, a long-form
video writer gets screenplay advice. That was a local annoyance last week. It
is now production behaviour, affecting whoever you send the URL to.

**Topic checklist**

- [ ] Data types, and why `TEXT` vs `VARCHAR(n)` rarely matters in Postgres
- [ ] Primary keys, foreign keys, `ON DELETE` behaviours — `CASCADE`, `RESTRICT`, `SET NULL`
- [ ] `NOT NULL`, `UNIQUE`, `CHECK` — pushing invariants into the database rather than enforcing them in application code
- [ ] Indexes: B-tree, partial, composite; why column order in a composite index matters
- [ ] `EXPLAIN ANALYZE` — reading a plan, recognising a sequential scan
- [ ] Transactions and isolation levels; what a failed transaction rolls back
- [ ] Migrations as versioned, ordered, forward-only files, applied by a tool rather than by hand
- [ ] Applying a migration to a database that has live data in it — additive first, backfill second, constraint last
- [ ] Connection pooling: transaction-mode vs session-mode, and why a pooled connection dies after idle
- [ ] `json` vs `jsonb`, and telling when a JSON field should have been a table

**Resources**

| Type | Resource |
|---|---|
| Course | *The Complete SQL Bootcamp* (Jose Portilla, Udemy) — the PostgreSQL version |
| Practice | pgexercises.com — every section, without reading the answers first |
| Book | *Practical SQL*, Anthony DeBarros |
| Reference | use-the-index-luke.com (free), Markus Winand |
| Docs | Supabase connection-pooling documentation |

**Verify**

1. Every outstanding migration applied to production, with the schema-check
   script reporting no drift — `pgvector_script_patterns.sql` and
   `project_invites` first, then the loader re-run.
2. The idle-disconnect `RemoteProtocolError` diagnosed and fixed at the
   connection layer, not papered over with a retry.
3. `EXPLAIN ANALYZE` run on the scene-listing query, and you can say whether it
   uses an index and why.

**Note.** Prefer the interactive exercises to the video course if you have to
choose. SQL is muscle memory; watching someone type queries does not build it.

---

## 3. Object storage and file lifecycle

**Hours: 12–15**

**Why.** Storyboard images are base64 data URIs inside database rows — now
production rows. One board can put tens of megabytes into rows read back in
full every time the board opens or an export runs. `storyboard_storage.py` is
already written and reasons correctly about the three properties it must keep;
what is missing is the operational half.

**Topic checklist**

- [ ] Buckets, objects, keys, content types
- [ ] Public vs signed URLs — and why an expiring URL is the wrong answer for a document that must stay exportable (it is the bug that caused the data URIs in the first place)
- [ ] CORS on a storage bucket, and exactly what breaks without it
- [ ] Lifecycle rules and orphan cleanup: an object store does not cascade on delete, so the deletion promise in `DATA_HANDLING.md` is not free
- [ ] Idempotent uploads and deterministic key naming
- [ ] Graceful degradation when the store is unavailable

**Resources**

| Type | Resource |
|---|---|
| Docs | Supabase Storage documentation, read completely |
| Course | Any S3 fundamentals module — concepts transfer directly |

**Verify**

1. Deleting a project removes its stored frames — confirmed by looking in the
   bucket, not by trusting the code.
2. Revoking the storage key degrades generation to the old data-URI path rather
   than failing.
3. Existing boards holding data URIs still render and still export.

---

## 4. Customer research and interviewing

**Hours: 8 reading, then fieldwork**

**Why.** This was blocked on there being nothing to show. It no longer is. The
product has been built entirely on internal judgement, and constants in shipped
code are unmeasured assumptions — the Nepali speaking rate used for runtime
estimates is a guess running in production. No course fixes this; five writers
do.

**Topic checklist**

- [ ] Asking about past behaviour, never about future intent
- [ ] Why "would you use this?" and "would you pay for this?" produce unusable answers
- [ ] Separating compliments from evidence
- [ ] Observing someone do a task instead of asking them about it
- [ ] Writing down what would falsify a belief **before** the session
- [ ] What five sessions can and cannot establish

**Resources**

| Type | Resource |
|---|---|
| Book | *The Mom Test*, Rob Fitzpatrick — ~130 pages, the highest-value book on this page |
| Free | YC Startup School talks on talking to users |
| Internal | `PILOT.md` and `HYPOTHESES.md` already state what to measure and what would kill a belief |

**Verify**

1. The five-writer pilot run as written, against the deployed URL.
2. At least one finding that contradicts something you believed beforehand. If
   nothing contradicts, the questions were leading.
3. The Nepali speaking rate measured from recordings rather than estimated.

---

## 5. Applied statistics

**Hours: 25–30**

**Why.** An inflated quality metric has already been produced here once: a
retrieval figure of 88% on a 25-query evaluation set became 71.8% when the set
widened to 40, with the system unchanged. The same class of error is about to
be repeated on retention, conversion and pricing, where the numbers will be
smaller and the priors stronger.

**Topic checklist**

- [ ] Sampling error, and why small samples flatter
- [ ] Base rates, and why they beat intuition
- [ ] Confidence intervals — what they claim and what they do not
- [ ] What a p-value is not
- [ ] Statistical power; choosing sample size *before* collecting data
- [ ] Regression to the mean
- [ ] Multiple comparisons — check twenty metrics and one will look significant
- [ ] Precision, recall, precision@k
- [ ] Guardrail metrics and pre-registering the decision rule

**Resources**

| Type | Resource |
|---|---|
| Video | **StatQuest** "Statistics Fundamentals" playlist (free, YouTube) — start here; best value on this page |
| Book | *The Art of Statistics*, David Spiegelhalter |
| Book | *Trustworthy Online Controlled Experiments* (Kohavi, Tang, Xu) — written for exactly this scale of decision |
| Book | *Statistics Done Wrong*, Alex Reinhart — the failure modes |

**Verify**

1. Before the pilot, write down the number that would make you abandon a
   feature — then hold to it when it arrives.
2. Compute a confidence interval for the retrieval figure, and quote the
   evaluation-set size every time you quote the number.
3. Given an observed conversion difference, state honestly whether the sample
   supports the conclusion.

---

## 6. Visual design fundamentals

**Hours: 40–50**

**Why.** Layout correctness is checked by purpose-written scripts, because no
test in the project can see a rendered layout (`vite.config.js` sets
`css: false`). That is a reasonable workaround, but it substitutes tooling for
judgement — and the first 80% of design takes a month while the last 20% takes
years.

**Topic checklist**

- [ ] Spacing systems, and why a consistent scale is most of what reads as "designed"
- [ ] Typographic hierarchy through size, weight and colour — not size alone
- [ ] Contrast ratios and accessible colour pairs
- [ ] Alignment, optical alignment, grid
- [ ] Designing empty, loading and error states, not only the full one
- [ ] Responsive behaviour: what stacks, what truncates, what scrolls
- [ ] Minimum sizes in **pixels**, not proportions — the retention band that rendered 7px wide at 320px is the lesson

**Resources**

| Type | Resource |
|---|---|
| Book | ***Refactoring UI***, Adam Wathan and Steve Schoger — written for developers who can build but not compose. Buy this one |
| Book | *Thinking with Type*, Ellen Lupton |
| Free | DesignCourse (YouTube), developer-oriented walkthroughs |

**Verify**

1. The narrow screenplay column issue (D1) closed by judgement, then confirmed
   by the layout script.
2. Every interactive view has a designed empty state.
3. Usable at 320px wide with no horizontal scrolling.

---

## 7. Career skills

Not technical, no computer required, and the best ratio on this document.

### 7.1 Negotiation — ~15 hours

The highest return per hour of study here, and it is not close. A weekend of
reading plus rehearsal can add 15–30% to income for a decade, on work you were
already going to do. Almost nobody studies it because it feels like a
personality trait rather than a skill.

- [ ] Anchoring, and who should name a number first
- [ ] Silence as a tool
- [ ] Calibrated questions ("how am I supposed to do that?")
- [ ] Separating positions from interests
- [ ] Knowing your walk-away point before the conversation starts
- [ ] Rehearsing the awkward sentence out loud until it is boring

**Read:** *Never Split the Difference* (Voss) first — more actionable. Then
*Getting to Yes* (Fisher & Ury) for the framework underneath.
**Course:** *Successful Negotiation* — George Siedel, University of Michigan
(Coursera, free to audit).

### 7.2 Writing plainly — ~40 hours

An amplifier on every other skill: the same idea, written clearly, is worth
several times more. Unexplained work is undervalued work.

- [ ] Cutting a draft by half without losing content
- [ ] Putting the conclusion first
- [ ] Concrete nouns and active verbs
- [ ] One idea per paragraph
- [ ] Writing for the reader's question, not your process

**Read:** *Style: Lessons in Clarity and Grace* (Joseph Williams) — the one that
actually changes your sentences. *On Writing Well* (Zinsser) for the attitude.
Julian Shapiro's free handbook for a two-hour version.
**Course:** *Writing in the Sciences* (Stanford, free) — ignore the title; it is
the best clarity course online regardless of field.
**The real work:** write something, cut it 50%, compare. That is the course.

### 7.3 Selling to strangers — ongoing

The scarcest skill among technical people, and therefore the best paid. The
hours are high because it is emotionally expensive, not because it is hard.

- [ ] Writing an email a stranger will answer
- [ ] Asking for the meeting explicitly
- [ ] Discovery: talking less than half the time
- [ ] Following up without apologising
- [ ] Hearing "no" as information

**Read:** *The Mom Test* (double duty with §4), then *SPIN Selling* (Rackham).
*Fanatical Prospecting* (Blount) if the problem is volume and nerve.
**Course:** HubSpot Academy's free sales courses are competent. Most paid sales
courses are not.

### 7.4 Financial literacy — ~40 hours

Changes which decisions you consider at all — and now that there is a live
system with a running cost, it has a direct application.

- [ ] Reading a P&L and a balance sheet
- [ ] Cash versus profit, and why a profitable business fails
- [ ] Unit economics: CAC, LTV, contribution margin — and for this product, **AI cost per active user**
- [ ] Runway and burn
- [ ] Pricing as a decision, not a number you picked

**Read:** *Financial Intelligence for Entrepreneurs* (Berman & Knight); *Simple
Numbers, Straight Talk, Big Profits* (Crabtree) for a small business.
**Course:** *Introduction to Financial Accounting* — Brian Bushee, Wharton
(Coursera, free to audit).

---

## 8. What to skip, and why

- **Another full-stack bootcamp course.** You have already built and deployed
  what those courses build toward.
- **AI / LangChain / "build your own ChatGPT" courses.** You have shipped local
  embeddings, a 40-query evaluation set, and two separate quality floors in CI.
  This category is overwhelmingly 2023 material under a current title.
- **React deep-dives.** Take the ~6 hours on the hooks mental model — stale
  closures, what re-renders and what does not — and skip the other 54.
- **Leetcode and algorithms.** Large payoff, but only for passing big-tech
  interviews. Outside that gate the ratio is poor.
- **More programming languages.** Your third teaches you almost nothing your
  second did not.
- **Kubernetes.** One process and one static build, now running fine without it.
- **Most certifications.** Priced as credentials, valued as signals, and the
  signal decays fast.
- **Prompt engineering as a discipline.** Ten hours gets 90% of it; the rest is
  domain knowledge wearing a costume.

---

## 9. Six-month sequencing

One primary focus at a time. The third column is the rule that matters:
**nothing runs without an attached deliverable.** Learning detached from
shipping does not survive the month.

| Month | Focus | Deliverable |
|---|---|---|
| 1 | Production operations | Error tracking live; rollback rehearsed; spend cap set; AI and storyboard paths verified in production |
| 2 | PostgreSQL and migrations | All outstanding migrations applied to production; idle-disconnect fixed |
| 3 | Object storage | Images out of the database; deletion actually removes them |
| 4 | Customer research | Five-writer pilot completed and written up |
| 5 | Statistics and experimentation | Pilot analysed, with sample sizes stated |
| 6 | Design fundamentals | D1 closed; empty states designed |

Career skills run alongside, in reading time — never in build time.

---

## 10. Weekly log

A plan without a log becomes a wish list within three weeks.

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

The fourth field is the one that matters. A week with nothing in it was usually
a week of reading rather than a week of learning.

---

## 11. Four rules that make this stick

1. **One course at a time.** Starting four things simultaneously is the standard
   way a list like this produces nothing.
2. **Cap it at 6 hours a week** while something is shipping in parallel. The
   failure mode is not insufficient knowledge — it is a year of feeling
   productive while nothing reaches a user.
3. **Every item has a verification task.** If you cannot name the thing that now
   works and did not before, the hours did not land.
4. **Finish or abandon, explicitly.** A half-finished course you feel guilty
   about costs more than one you dropped on purpose.
