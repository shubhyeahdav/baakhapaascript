# Month 4 — proposal

**Baakhapaa: AI-powered pre-production intelligence system**
Weeks 13 to 16 · An extension beyond the original twelve

The original proposal ran twelve weeks and those weeks are spent. This asks for
four more, and the case has to be made on what the twelve produced rather than
on what was planned.

## Where the twelve weeks landed

**Built:** every planned feature. A cloud database with its migrations applied,
a deployed application on real infrastructure, a craft linter that reads
Nepali, retrieval measured at 91.3% on real queries, a nineteen-lesson course
in two languages, four export formats, three payment gateways, roles and
sharing, and a fourth content format nobody asked for.

**Proven:** less. No AI generation has run against the deployed system. No
storyboard. No real money has moved. No renewal email has been sent. No writer
outside this project has finished a script in it.

That gap between built and proven is the whole subject of this month.

**161 of 200 Month 3 tasks closed. Of the 39 open, 29 are not engineering** —
they are four purchases and a person holding a phone. That number is the
strongest argument for this extension and also its largest risk: most of what
remains is not work I can do alone.

## What Month 4 delivers

One sentence: **the product stops being something that was built and becomes
something that was used.**

Concretely, by week 16:

1. Every unproven path has run once, on the deployed system, and the result is
   written down.
2. Five writers have taken a real project from blank page to export.
3. The proposal's own success measure — one script completed without falling
   back to manual methods — is demonstrated or disproved.
4. A short-form scripting system exists as a measured layer inside the product
   rather than as a separate product.

## What this month cannot promise, and why

**A real payment may not happen.** Khalti and eSewa require company
registration and a business bank account, and each application is reviewed by a
person. The application can be submitted in week 1; approval is not mine to
schedule.

**The legal documents remain unreviewed.** They need a Nepal-qualified lawyer.
This has been open for two months and no amount of working harder closes it.

**Everything in Week 1 depends on four purchases.** If the Anthropic credit,
the SMTP account and the merchant applications do not happen in the first days,
weeks 2 and 3 do not happen either. This is stated here rather than discovered
in week 3.

---

## Week 13 — Unblock, and ship what is already built

### Day 1 · The four purchases

- [ ] Enable international transactions on a Nepali card — the single highest-value hour in the month
- [ ] Add Anthropic credit. A scene improve costs about one cent; the whole pilot fits in a few dollars
- [ ] Obtain an SMTP account and set `SMTP_HOST`, user, password and `MAIL_FROM`
- [ ] Submit the Khalti application with the live URL, company registration and bank details
- [ ] Submit the eSewa application with the same
- [ ] Record what each actually cost, so Month 5 can budget rather than estimate

### Day 2 · Finish the long-form writing surface

- [ ] Review Task 6, which is committed and unreviewed
- [ ] Tasks 7 and 8 — the video keymap and the video completions
- [ ] Task 9 — the scaffold, essay and course modes
- [ ] Run both suites

### Day 3 · Tasks 10 to 14

- [ ] Task 10 — the pacing readout in the status line
- [ ] Task 11 — section-kind craft and the `## PROOF` guide copy
- [ ] Task 12 — the prose page, and no retention curve on a lesson
- [ ] Task 13 — verify the typewriter band against wrapped text, in a browser
- [ ] Task 14 — full-suite gate, recount the documentation numbers

### Day 4 · Merge and deploy

- [ ] Merge `feature/first-draft-gate` and `feature/long-form-writing-surface`
- [ ] Push and confirm all three CI jobs green
- [ ] Deploy, and verify the first-draft gate against the live site
- [ ] Confirm every existing script still opens — each one carries the old status and meets the gate once

### Day 5 · The landing page

- [ ] Build a real page at `/` — today it redirects to a sign-in form
- [ ] State what the product is, who it is for, and one measured proof
- [ ] Nepali and English
- [ ] Terms and Privacy reachable without opening a menu

> This is a dependency, not polish. TikTok's API review **explicitly rejects**
> applications whose site is "a one-page landing or login page", and the same
> judgement is made by every writer who hears about the product and types the
> URL.

---

## Week 14 — Move built to proven

### Day 6 · The first real generation

- [ ] Generate a structure on the deployed system and read what comes back
- [ ] Generate a scene; confirm it streams rather than arriving at once
- [ ] Improve a line — the one task left open from Month 3, waiting only on credit
- [ ] Ask for suggestions; confirm the response shape is handled

### Day 7 · Storyboards and cost

- [ ] Generate a storyboard on the deployed system and time it
- [ ] Export a production package; confirm the frames embed
- [ ] Export a PDF containing Devanagari; confirm the glyphs render
- [ ] Record the measured cost of one full script from the provider dashboard
- [ ] Correct the cost estimate against what was actually charged

### Day 8 · Renewals, end to end

- [ ] Send one reminder to yourself; check it arrives and reads well
- [ ] Confirm the in-app notice appears before the email does
- [ ] Schedule the job daily
- [ ] Confirm nobody is mailed twice for the same expiry

### Day 9 · Walk the product as a stranger

- [ ] Register on the deployed site from a **real phone**
- [ ] Take one project from blank page to export without touching the code
- [ ] Write down every point of confusion, in order, without fixing anything
- [ ] Check focus mode fills the screen with the address bar showing

### Day 10 · Fix what stops a writer finishing

- [ ] Triage Day 9's list into fix-now and write-down
- [ ] Add a test for each fix before fixing it
- [ ] Re-run both suites, redeploy
- [ ] Repeat Day 9's walk in under ten minutes

---

## Week 15 — The pilot

### Day 11 · Prepare

- [ ] Invite the five writers, with the invitation flow rather than by hand
- [ ] Instrument what `PILOT.md` says to measure rather than ask
- [ ] Write the one-page brief each writer gets
- [ ] Confirm the free tier carries them end to end without a paid call

### Days 12 to 14 · Run it

- [ ] Daily: read what the instrumentation says, not what people say
- [ ] Daily: triage anything that blocks a writer finishing, same day
- [ ] Do not add features during the pilot — a moving product cannot be measured
- [ ] Keep a defect log with the writer and the step, not just the bug

### Day 15 · What the pilot found

- [ ] Did one script complete without falling back to manual methods
- [ ] Which of `PILOT.md`'s four kill criteria fired, if any
- [ ] Which of `HYPOTHESES.md`'s six unmeasured beliefs now has a number
- [ ] Write it down before deciding what it means

---

## Week 16 — The scripting system, and the report

### Day 16 · The niche, measured by hand

- [ ] Watch 20 outlier shorts in one niche. Record three things each: when the first sentence ends, when something turns, whether the rhythm is varied or flat
- [ ] If the rehook interval clusters, that is the first number this product owns
- [ ] Trial OutlierKit and 1of10; note where you get frustrated, not what they show

### Day 17 · The rhythm meter, in the editor

- [ ] Wire `draft.py` into the short-form editor — sentence-length variance and monotone runs, live
- [ ] Report, never judge: no "good" or "bad", no score
- [ ] Test that no output key is a verdict

### Day 18 · Paste an outlier, measure it

- [ ] Decide the ingestion model: creator pastes a link, or a corpus is bought
- [ ] Measure a pasted video with `measure.py` and show it beside the draft
- [ ] Keep the rule: numbers leave the measurement, transcripts never do

### Day 19 · The loop that compounds

- [ ] Creator enters views and retention after posting
- [ ] Correlate hook shape against result, with the sample size attached
- [ ] This is the only thing on the list a course cannot imitate

### Day 20 · Close the month

- [ ] Re-run the retrieval eval and record the closing number
- [ ] Recapture the figures from the running system
- [ ] Write the Month 4 report against this document
- [ ] State plainly what is still built-but-unproven

---

## Carried, not scheduled

- A Nepal-qualified lawyer for the Terms and Privacy Policy
- Whether Rs 999 holds against a market anchored nearer Rs 499
- Invitation-only or open launch
- Encryption of script text — a design decision, and harder to retrofit after a pilot than to decide before one

## How to judge this month

Not by tasks closed. Month 3 closed 161 and the product is still unproven.

Judge it by four facts that are true or false on 31 October:

1. A writer who is not me finished a script in it.
2. Real money moved through a Nepali gateway.
3. An AI generation ran on the deployed system and the output was read.
4. The product's own measurements told us something we did not already believe.

Three of the four depend on purchases made in the first days of the month.
