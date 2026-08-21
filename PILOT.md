# Creator pilot — protocol

Five writers, one script each, start to finish. The point is not feedback in
general. It is to answer six questions the build cannot answer about itself,
and to replace the assumptions in `DEPLOYMENT.md`'s cost model with numbers.

Run this **after** the real-key smoke run and the deploy, and **before** taking
money from anyone who is not in the pilot.

---

## What the pilot is for

Everything in this product has been verified against mocks, sandboxes, or me.
None of it has been verified against a writer. These are the things that only a
writer can settle:

1. **Does the craft layer say anything useful?** The linter and the pattern
   recommendations are the free tier's entire proposition and the reason
   somebody would choose this over Final Draft. If a writer reads three
   recommendations and shrugs, there is no product.
2. **What does a month actually cost us?** The cost model assumes 2 / 6 / 20
   storyboards a month for light / normal / heavy users. Those are guesses.
   The heavy column is the one that decides whether Rs 999 works.
3. **Is Rs 999 the right number in Nepal?** Nobody has tested price against
   this market.
4. **Does anyone finish?** Onboarding → structure → draft → storyboard →
   export is a long road. Where people stop is more informative than what they
   say about it.
5. **Does the Nepali craft layer work on Nepali writing?** The linter reads
   Devanagari and romanised Nepali. It has never been pointed at a real
   bilingual draft written by somebody who thinks in both.
6. **Does a payment work for a person who is not us?** One real Khalti
   payment, by somebody else, on their own phone.

---

## Who

Five, not more. Enough to see a pattern, few enough to talk to all of them.

- Two who have finished a script before (they will judge the craft layer
  hardest, and they are the ones who could pay).
- Two who have not (the free tier exists for them; watch where they get stuck).
- One who works mainly in Nepali (question 5 depends on it).

At least three on a mid-range Android phone, because that is what the market
uses and nothing has been tested on one.

---

## Setup

Give each writer a **Pro account, free, for the month**, so cost data is real
and nobody is deciding about money while also learning the tool. Ask one of the
two experienced writers to make one real Khalti payment of Rs 999 at the end —
that is question 6, and it needs to be a real card and a real phone.

Tell them plainly: this is a pilot, it will break, and their scripts are theirs
and are not used to train anything. That is now true in the Terms; say it out
loud anyway.

---

## What to measure, not ask

Instrument first, interview second. What people say about software and what
they do with it diverge.

| Question | Measure |
|---|---|
| Cost | Storyboards generated per user per month; frames per board; AI generate/improve calls |
| Completion | How many reach a finalized script and an export |
| Where they stop | Last action before a gap of more than three days |
| Craft value | Whether recommendations are opened, and whether a flagged line changes afterwards |
| Nepali | Lint flags raised on Devanagari/romanised lines, and whether they were acted on |

The last one is the interesting one: the linter naming a problem is worthless
if the writer does not then change the line.

**Nothing in the table needs an analytics vendor.** Every number is already in
the database — `payments`, `versions`, `scenes`, and the lint endpoint. Write
one query script rather than adding a tracker; that also keeps the privacy
claim in §1 of the Privacy Policy true.

---

## What to ask, at the end

Four questions, in person, after they have finished or stopped.

1. Show me the last thing you wrote in it. *(What they open tells you what they
   used it for.)*
2. What did you do somewhere else that you expected to do here?
3. Was there a moment it told you something about your script you did not
   already know? *(This is question 1. If nobody has a moment, the craft layer
   is decoration.)*
4. Rs 999 a month. Too much, about right, or would you not pay at all? Ask it
   after they have used it, never before.

Do not ask what features they want.

---

## What would make this a failed pilot

Decide now, so the answer is not negotiated afterwards:

- **Nobody can name a moment for question 3.** The craft layer is the
  differentiator; if it does not land, price and features are beside the point.
- **A heavy user costs more than Rs 500 a month in images.** The frame cap or
  the model has to change before launch.
- **Fewer than two of five reach an export.** The road is too long.
- **The Khalti payment does not complete on a real phone.**

---

## After

Update, in this order: the cost model in `DEPLOYMENT.md` with measured
frequencies; `ROADMAP.md` with what the stopping points imply; and the pricing
if question 4 says so. Then decide about launch — not before.
