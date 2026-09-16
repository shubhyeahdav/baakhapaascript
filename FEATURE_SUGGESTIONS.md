# Feature suggestions — 2026-09-10

Ordered by evidence, not by size. Every item says what it is based on, and
whether that is something measured or something judged. The distinction matters
more than usual here: this product has twice shipped a number that turned out to
be an artefact of how it was measured, and both times the fix was cheap and the
month of believing it was not.

Three categories:

- **§A — yours to decide.** Business questions. I have laid out options and said
  which way the evidence points, and deliberately not acted.
- **§B — measured.** Something in the repository produces a number that says
  this is worth doing.
- **§C — judged.** Real gaps found by reading the product, but nothing measures
  them yet. Treat as pilot material.

---

## §A Yours to decide

### A1. What is a paid tier actually for?

**Today:** free gets the craft library, the linter, the course, structure
skeletons, 3 projects and 2 collaborators. Pro/Studio adds AI generation,
`improve`, `suggest`, Word/package export, storyboards, and more seats.

**The problem:** the free tier contains everything this product is *good at*.
The craft library, the Nepali-aware linter and the nineteen-lesson course are
the differentiators — nobody else has them — and they are all free. What is paid
is scene generation, which every AI writing tool has and most do more cheaply,
and which costs you money per call.

So the current split gives away the moat and charges for the commodity.

**Three ways out:**

| | What changes | Why it might be right | Why it might not |
|---|---|---|---|
| **1. Charge for volume, not features** | Everything is available to everyone; free gets N generations a month | Nobody hits a wall that makes the product look worse than it is. The thing you charge for is the thing that costs you money | Nepali writers on free will never convert if N is generous, and N is a number you'd be guessing |
| **2. Charge for the work, not the writing** | Free writes; paid produces — storyboards, the production package, `.fdx`, collaborators | Matches how the money actually arrives in this industry: nobody pays to draft, they pay when something is going into production | A student finishing a short is your best evangelist and gets nothing to show for it |
| **3. Charge for the craft layer** | The library, the benchmark and the course become paid; generation gets cheaper or free | Charges for the thing that is genuinely yours | Contradicts the course's own design — "no penalty for trying" — and the free craft layer is the reason to open the app daily |

**Where the evidence points:** option 2. It is the only one whose paywall lands
on a moment a writer already understands as a spend, and it needs no invented
number. But this is a market judgement about Nepali screenwriters and I do not
have it. **Blocks:** pricing, and therefore the merchant accounts.

### A2. The free cap counts projects started, not scripts finished

`FREE_PROJECT_LIMIT = 3`. A writer who abandons two false starts has one attempt
left at the thing they came for. The product's own pitch is that most of its
users have never finished a screenplay — so false starts are not misuse, they
are the population.

**Options:** cap finished scripts instead; let a project be deleted to reclaim
its slot (it already can be — `DELETE /projects/{id}` exists and the dashboard
calls it, so the cap is already softer than it looks); or drop the project cap
and cap exports.

**Where the evidence points:** cap exports, not projects. It is the same
principle as A1 option 2 and it makes A1 and A2 one decision instead of two.
**Note:** whichever way this goes, the current cap is *already* reclaimable by
deletion, which nothing tells the writer. That is a one-line fix regardless.

---

## §B Measured

### B1. Five corpus entries are never retrieved, and four are dialogue

```
Answer a question with an action instead of a line          (dialogue)
End on a feeling that won't settle, not a cliffhanger       (image)
First appearance should be a decision, not a description    (character)
Give the character one trait that argues with another       (character)
Let one character finish the other's sentence wrongly       (dialogue)
```

Over forty real queries, nothing surfaces these. Dialogue is also the weakest
craft level after this session's work (78%, against 100% for structure and
scene) and the second-largest slice of the corpus (9 of 39).

**But the finding is ambiguous and should not be acted on blind.** Either those
entries' `problem` statements do not match how writers complain — a corpus fix —
or the golden set has no query for what they address — an eval fix. Nothing
currently distinguishes those two, and guessing wrong makes retrieval worse
while the number goes up.

**Do this first:** write one query per never-retrieved entry, in the voice of a
writer with that symptom, and add them to the golden set. If they retrieve their
entry, the corpus is fine and the eval had a hole. If they do not, rewrite the
`problem` field. Half a day, and it is the difference between fixing something
and moving a number.

### B2. The corpus is English, and a Nepali writer can now reach it

Verified today: **0 of 39 entries contain any Devanagari.**

`craft_query.py` means a writer can now state their problem in Nepali and get
the right card. That card's `worked_example` is English prose. So the product
now understands the question and answers in the wrong language — which is a
better failure than before, and still a failure.

The course already solved this: `lessons_ne.py` carries all 19 lessons and 76
prose fields, with fallback **per field**, so a lesson translated late still
reads correctly. The same shape works here.

**Scope:** `worked_example` and `how_to_apply` are the two fields a writer reads
and acts on; `problem` and `warning_sign` must stay English because they are
what gets embedded. So this is 78 fields, not 39 entries × 11.

**One entry makes the case on its own:** "Use the Nepali/English switch to mark
distance and sincerity" is a technique about code-switching in Kathmandu
dialogue, and its worked example is in English.

### B3. `image` is the thinnest and weakest level

4 entries of 39, and 67% p@1 — the only level below 78%. Both failures are the
same complaint in two scripts ("the emotion is only in dialogue, not on screen")
and both put the right card at rank 2.

Worth knowing before acting: that case was passing at **0.6536 against 0.6502**
before this session — a 0.003 margin. It was a coin flip, not a robust pass. The
honest reading is that four entries is too few to separate, not that retrieval
regressed. **Add image-level entries before tuning anything.**

### B4. The AI-key guard in `conftest.py` is a list of names — **DONE 2026-09-16**

It went stale within a day of a new provider landing and cost 75 minutes a run.
It will go stale again the next time.

**Fixed as proposed, plus two.** `pytest_sessionstart` now asserts three things
and stops the session with `pytest.exit` if any fails:

| | Why this one |
|---|---|
| `script_engine.PROVIDER == "mock"` | The 75-minute hang. Checked first: a run that hangs produces no output to read, so it is the least diagnosable |
| `storyboard_engine.MOCK_AI` | The expensive half — one board is up to 24 billed images, and the name-list never covered `OPENAI_API_KEY` for images at all |
| `database.use_mock` | Already happened: 853 tests ran against production Postgres. It surfaced only because the key in use could not write. With a service_role key they would have passed, and deleted real data doing it |

The env pinning at the top of `conftest.py` stays — that is the mechanism that
makes the invariant true. This is the net that catches the next provider nobody
remembered to pin.

`pytest.exit` rather than a failure, because a suite that can reach a paid
provider must not run at all, not run and report.

`tests/test_live_provider_guard.py` forces each condition and checks the
reason, the ordering, and that the session actually ENDS rather than merely
noticing — a guard nobody has seen fire is indistinguishable from one that
cannot. It also pins the three attribute names the guard reads, so a rename
fails with the name in it.

---

## §C Judged

### C1. A writer can mark a turning point and cannot see the shape

`scene_type` became editable today, and three things read it — the rail's count,
the outline's act balance, the storyboard's shot choice. None of them shows the
*distribution*: where the majors fall across the running time.

That is the single most useful picture in structural screenwriting, the data is
now real, and `CompactTimeline` already exists to draw on.

### C2. The Ask box has no memory

A writer types a complaint, gets three cards, closes the panel, and the question
is gone. `seen` and `dismissed` already track which patterns a writer has been
shown — the plumbing exists — but nothing lets them get back to advice that
worked. A screenplay is written over weeks; the panel behaves as though it is
written in one sitting.

### C3. Nothing renews itself, and this is the one that costs money

Carried forward, unchanged, and it stays at the top of §C until it is done.
Khalti and eSewa have no subscription primitive, so every paid month is a fresh
chance to lapse silently. `renewals.py` is written and sends nothing until
`SMTP_HOST` is set. **What remains is an SMTP account and a cron entry** — not
engineering, and it is the difference between a paying user and a lapsed one.

### C4. Sharing requires the other person to register

`invites.py` is deliberate and right: a link that granted access would be a
bearer token in a forwarded chat. But the common case for a screenwriter is
"read this and tell me what you think", and today that costs the reader an
account.

A read-only, expiring, revocable link for a **single version snapshot** — not
the live draft — is a different security question from the one `invites.py`
answers, and worth asking separately.

### C5. The mid-draft notes are unproven

Four of them shipped today. Only one reports a fact; three are convention, and I
have said so in the code. Whether writers find them useful or patronising is not
something this repository can answer.

**They are instrumented by being deletable** — remove an entry from the array.
Put them in front of the five pilot writers and count dismissals. A note
dismissed by four of five is not a note.

### C6. The melodrama chip may be labelled wrong

"Melodramatic" is labelled `dialogue` in the golden set; retrieval answers it
with `Put the feeling into a physical thing that changes hands` (image) and
`Deny the scene privacy` (scene). Those are arguably better answers — melodrama
is fixed by staging, not by rewriting lines.

Deliberately **not** relabelled, because relabelling a test to match its output
measures nothing. A writer settles this, not me. It is the cheapest question in
`PILOT.md`: show someone both answers and ask which one helped.

---

## What I would do next, in order

1. **A1 + A2 together** — one decision, and it unblocks pricing and the
   merchant accounts.
2. ~~**B4**~~ — **done 2026-09-16.** Took about the half hour estimated.
3. **B1's diagnostic** — half a day, and it decides whether B1 is corpus work
   or eval work before anyone does the wrong one. **Now the top unblocked
   item.**
4. **C3** — an SMTP account and a cron entry. Not engineering.
5. **B2** — the largest, and the one that most changes what this product is for
   the market it is built for.

Everything in §C after C3 should wait for the pilot. Five writers will answer
C5 and C6 in an afternoon, and no amount of reasoning here will.
