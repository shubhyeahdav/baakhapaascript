# Tasks Performed

Month 3, Days 8 to 12. Five pieces of work, what each produced, and what to
screenshot.

**In one line:** the system that suggests screenwriting craft to a user was made
faster, measurably more accurate, and permanently protected against getting worse
— and two new writing tools were built that cost nothing to run.

---

## 1. Made the craft suggestions faster and harder to break

**Day 8. Complete.**

The product suggests writing techniques by searching a library of craft advice
for whatever problem a writer describes. That search was moved onto the
database's own search engine, which is built for it, with the previous method
kept as an automatic backup if the new one is ever unavailable.

Two safeguards were added at the same time. If a piece of stored data is
corrupted, the system now refuses to score it rather than producing a
confident-looking but wrong suggestion. And if the database is unreachable, the
product carries on without suggestions instead of failing.

Suggestion quality was re-measured afterwards and confirmed **unchanged** — the
point of the work was speed and safety, not a quality change.

**Worth stating plainly:** the new search engine is installed and correct but is
not yet in use. It only becomes faster than the old method once the craft library
is about sixty times larger than it is today, so the system correctly continues
using the simpler method until then. This was measured, not assumed.

> **Screenshot A** — the report confirming the database is correctly set up and
> the new search function is installed. One screen, four lines.

---

## 2. Tested a more powerful AI model, and rejected it

**Day 9. Complete.**

A larger, more expensive language model was tested against the current one, along
with three different ways of ranking results. Each was measured against forty
real writer questions.

The rule was agreed **before** the experiment: keep a change only if it improves
accuracy. Most did not, so most were reverted, and what failed was written down
so the same ideas are not retried next month.

**This is the deliverable.** A day that ends in reverts and a written record is
not a wasted day — it is the reason the same experiments are not repeated, and it
is why the accuracy figures the product reports can be trusted.

> No screenshot. The evidence is the written record of what was tried and
> rejected.

---

## 3. Made suggestion quality a permanent standard

**Day 10. Complete.**

Accuracy is now checked automatically every time anyone changes the system, and
a change that makes suggestions worse is **blocked before it can reach a user**.
Two separate standards are enforced rather than one average, because an average
can hide a weak area behind a strong one.

Response time was also measured against the live system for the first time, and
a delay was traced to the product asking the database too many separate
questions rather than to slow code. That was reduced by half.

| What was measured | Result |
|---|---|
| Suggestions that are correct | 91% |
| Live response time | 2.5 seconds, now roughly halved |
| First-use delay | removed — 0.7 seconds down to almost nothing |

> **Screenshot B** — the accuracy report. It shows the headline figure of 91%
> together with the breakdown behind it. Capture the whole screen rather than
> the headline alone: the breakdown is what makes the figure credible.

---

## 4. Let a writer improve one line instead of a whole scene

**Day 11. Nine of ten steps complete.**

Previously the assistant rewrote an entire scene. A writer can now highlight a
single line and have only that line rewritten, with the rest of their work left
untouched and their undo history intact. The rewrite is guided by a diagnosis of
what is actually wrong with the line rather than a general instruction.

**The one incomplete step in all fifty:** trying it on a real line and reading
what comes back. This needs paid AI credit, which has not been purchased. The
feature is built and tested, but **has never run against a real AI model**, and
the report should say so in those words.

> **Screenshot C** — the automated tests passing, which prove the safe
> behaviour: that nothing outside the highlighted text is ever altered.
> A screenshot of a rewrite would not be honest evidence here, because without
> credit the response shown is a canned placeholder rather than real output.

---

## 5. Built a character-voice checker that costs nothing to run

**Day 12. Complete.**

The product can now tell a writer when two characters sound the same as each
other, or when one character has developed a repetitive verbal habit. It checks
each character's dialogue against the description the writer gave them.

It uses **no AI**, so it costs nothing per use, works instantly, and gives the
same answer every time. Findings appear in the cast list where writers already
work, are written as plain sentences rather than statistics, and each links to
the craft lesson that fixes the problem.

Tested against a sample screenplay, it correctly reported **no problems** — and
a deliberately broken test case, two characters given identical dialogue, was
correctly flagged. Both were checked, because a tool that never reports anything
looks identical to one that is working properly.

> **Screenshot D** — the cast list showing a flagged character, the plain-English
> explanation, and the link to the lesson that addresses it.

---

## One more screenshot worth taking

> **Screenshot E** — the full automated test suite passing. There are roughly
> 2,400 automated checks across the product. This run used to take twenty
> minutes; a cause was found on 17 September and it now takes under thirty
> seconds, so it can be run on every change rather than occasionally.

---

## What cannot be demonstrated yet

Four things are built but have never been shown working, and none of them is
waiting on further development:

| Feature | What it is waiting for |
|---|---|
| AI scene writing | Paid AI credit |
| Storyboard image generation | Paid image credit |
| A completed customer payment | Merchant accounts with the payment providers |
| Subscription reminder emails | An email sending account |

Stating these plainly is stronger than working around them. The distinction that
should run through the report is **built** against **proven**: every planned
feature exists, and a smaller set has been demonstrated end to end.

---

**Overall: 49 of 50 tasks complete.** The one outstanding item requires a
purchase, not further work.
