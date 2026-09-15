# Hypotheses — what we predict, and what would prove us wrong

The method, in one sentence: **write down the number that would make you stop,
before you run the test.** That is the whole of it. In four randomised trials
across 759 firms, the founders taught to do this earned more — not by picking
better ideas, but by killing wrong ones ~10 percentage points more often, and
sooner. (Camuffo et al., *Strategic Management Journal* 45(6), 2024.)

This file is the instrument. `ROADMAP.md` holds what to build; `PILOT.md` holds
how the pilot is run. This holds what we **believe and have not checked**.

## Rules

1. No hypothesis without a **number** and a **date**. "Writers will like it" is
   not a hypothesis.
2. The kill criterion is written **before** the test, never after. Renegotiating
   it afterwards is how a project survives its own disproof.
3. When a test comes back, write the result here even when it is uncomfortable.
   Especially then.
4. A dead hypothesis is a good outcome. It is months not spent.

---

## Already covered — do not duplicate

`PILOT.md` §"What would make this a failed pilot" already states four kill
criteria in the correct form: the craft moment, the Rs 500 image cost, two of
five reaching export, and the real Khalti payment. `PILOT.md` §"What to measure,
not ask" holds their instrumentation. Those are live; they are not repeated here.

---

## Open — nothing currently tests these

These are the beliefs the product is built on that **no test, pilot question or
metric currently touches**. Each is a real risk to revenue.

| # | We believe | Kill criterion | Test | By |
|---|---|---|---|---|
| H1 | Writers come back after week one | Fewer than 3 of 5 pilot writers open the app in week 2 without being prompted | Last-action timestamps, already in `versions` | End of pilot |
| H2 | The retention curve flattens — some writers keep using it, rather than everyone leaking away | No cohort holds steady for 3 consecutive weeks | One query over `versions` by user by week | Pilot + 4 weeks |
| H3 | Some free users will pay | Zero free→paid upgrades in the first 60 days of open signup | `payments` rows where the user had a prior free period | Launch + 60 days |
| H4 | Rs 999 is the right price, not just a price | Untestable at one price point — **this is the gap** | Van Westendorp on the pilot five, then a **sequential** price change to a later cohort. Not an A/B split — see "Methods that fit this scale" | Before open launch |
| H5 | The craft corpus works as an acquisition channel | 12 published pieces produce fewer than 20 signups | The 39 entries are original prose and publishable (see `ROADMAP.md`, content engine) | Launch + 90 days |
| H6 | The course drives activation, not just goodwill | Fewer than half of course-finishers then create a project and write in it | `lessons` completion joined to first non-empty draft | Launch + 30 days |

### Notes on the open set

**H4 is the important one.** A single price is an assertion, not a measurement.
`PILOT.md` question 4 asks writers what they think of Rs 999 *after* using it,
which is the right question and still not a test — what people say about price
and what they pay diverge. Price is also the steepest lever available: on the
standard analysis a 1% price change moves operating profit roughly 3× as hard as
a 1% volume change. Testing it is cheap and reversible. Nothing else on this list
returns as much for as little work.

The *method* for H4 was wrong in the first draft of this file: it said to split
users into two price groups and compare. That cannot work here — see below.

**H6's kill criterion may be too generous, and the fix is known.** In a Kenyan
RCT (J-PAL / IPA with Sama), digital training **on its own** produced no increase
in employment, earnings or hours at 2.5 years. Training *plus a referral into
actual work* raised earnings **37%** (60% for women). The active ingredient was
the connection to the outcome, not the skill. Our 19 lessons are training. What
makes them pay off is the shortest possible path from the last lesson into a real
project, a real draft and a real export — not a certificate. Onboarding already
does half of this; the end of the course does not.

**H1 and H2 come before H5.** Acquisition into a leaking product rents users
rather than gains them. Median B2B SaaS net revenue retention now sits near 82%
(ChartMogul, ~3,500 companies); above 100% NRR, companies grow at roughly double
the rate of those below. Retention is what decides whether growth compounds at
all — so it is measured first, and channel work waits.

**No paid advertising hypothesis appears here deliberately.** Below a few hundred
conversions a month there is no way to run a holdout, and without a holdout a
paid channel cannot be distinguished from a coincidence. eBay's randomised
shutoff found brand-keyword ads produced no measurable lift and negative average
returns (Blake, Nosko & Tadelis, *Econometrica* 83(1), 2015); Gordon et al.
(*Marketing Science* 38(2), 2019) showed across 500M observations that the
observational methods every ad dashboard uses fail to recover the experimental
truth. Ads are an expense until they can be measured.

---

## Methods that fit this scale

**A/B testing does not work here, and will not for a long time.** A conventional
split test at 95% significance and 80% power, looking for a 5–10% effect, needs
roughly 50,000–500,000 users. At a 2% conversion rate, detecting a 10% relative
lift needs on the order of 200,000 users *per arm*. With five pilot writers, or
fifty, or five hundred, a split test cannot distinguish a real effect from noise
— it will still produce a confident-looking number, which is worse than none.

Use the method that matches the number of people you actually have:

| People you have | What works | What it answers |
|---|---|---|
| 1–10 | **Watch them use it.** Nielsen & Landauer's model: 5 users surface ~85% of the problems that affect ≥31% of users | Where it breaks, what confuses them |
| 1–10 | **Van Westendorp price questions.** Validated against the incentive-compatible Becker-DeGroot-Marschak mechanism, so it is better than a raw opinion — still hypothetical, so treat it as a range, not a price | Roughly what band Rs 999 sits in |
| 10–100 | **Sequential change.** Move one thing, watch the next cohort, compare to the last. Only trust large effects | Whether a big change helped |
| 100+ | Cohort retention curves start to mean something | Whether growth can compound |
| 10,000+ | A/B testing becomes available | 5% effects |

Two consequences worth stating plainly:

- **Only hunt large effects.** A 40% change in activation is visible at small n;
  a 5% change is not, at any n you will have this year. Do not spend the year on
  button colours — the arithmetic says you cannot even read the result.
- **n = 5 is enough to find problems, never enough to compare options.** Five
  writers will tell you what is broken. They cannot tell you which of two prices
  earns more. Different questions, different methods; the pilot answers the first.

## Calibration — what "earning online" actually looks like

Not a hypothesis; a reference point, so the targets in this file stay honest.

Earnings on every open digital platform follow a steep power law, and the tail is
most of it. Across the creator economy the top 10% took **62%** of ad payments in
2025, up from 53% in 2023, while **median** creator earnings *fell* from $3,500 to
$3,000 a year. Roughly half of Substack creators earned under **$500** in 2025.
On Steam, games grossing over $50m took 52% of all platform revenue. Bootstrapped
software is the same shape: median micro-SaaS revenue is around **$500/month**,
and $1K MRR typically takes 12–18 months (MicroConf).

Two things follow. First, Rs 999 × a small number of Nepali screenwriters is a
realistic target and a rare one — most products in this distribution earn nothing
at all, so reaching a few paying writers is already the upper half. Second, any
plan whose arithmetic needs us to land in the top decile is not a plan.

For completeness, because it is the most common thing sold as "earning online":
of Brazilians who day-traded persistently for more than 300 days, **97% lost
money**, 1.1% earned more than minimum wage, and the authors found no evidence of
learning with experience (Chague, De-Losso & Giovannetti, 2020). It is not a
funding strategy for this or anything else.

## Weekly review

Same day every week. Fifteen minutes. Never skipped — the habit is the point,
not the polish. Randomly assigned Indian plants that adopted this kind of routine
recording raised productivity 17% in year one (Bloom et al., *QJE* 128(1), 2013),
and none of what they adopted was clever.

Start it now, while the numbers are still zero. It is far easier to install on an
empty dashboard than on a busy one.

```
## Week of YYYY-MM-DD

Signups:        _    (prev _)
Activated:      _    ← wrote something, not just registered
Paying:         _
Churned:        _
Revenue:        Rs _

Hypothesis moved:   H_ — evidence / killed / unchanged
One thing shipped:  _
One thing learned:  _
Next week's test:   _
```

Every number above is already in the database — `payments`, `versions`,
`scenes`, the lint endpoint. Write one query script rather than adding an
analytics vendor; that also keeps §1 of the Privacy Policy true.

---

## Sources

Every number in this file, so it can be checked rather than trusted.

- Camuffo et al. (2024), *SMJ* 45(6) — scientific approach, 4 RCTs, 759 firms:
  https://sms.onlinelibrary.wiley.com/doi/full/10.1002/smj.3580
- Bloom, Eifert, Mahajan, McKenzie & Roberts (2013), *QJE* 128(1) — +17%
  productivity from routine management practice: https://www.nber.org/papers/w16658
- J-PAL / IPA with Sama, Kenya — training alone: no effect; training + referral:
  +37% earnings: https://www.povertyactionlab.org/evaluation/impact-tech-training-and-job-referrals-youth-kenya
- Nielsen & Landauer (1993) — 5 users find ~85% of problems:
  https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/
- NN/g on the limit of that rule — 5 is for finding problems, not comparing:
  https://www.nngroup.com/articles/5-test-users-qual-quant/
- Chague, De-Losso & Giovannetti (2020) — day trading, 97% lose:
  https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3423101
- Blake, Nosko & Tadelis (2015), *Econometrica* 83(1) — paid search, ~0 lift:
  https://www.nber.org/papers/w20171
- ChartMogul SaaS Retention Report — NRR benchmarks: https://chartmogul.com/reports/
- MicroConf, State of Independent SaaS — bootstrapped medians:
  https://microconf.com/state-of-indie-saas

Creator-economy distribution figures are from aggregator reports, not peer
review. Treat the shape (steep power law) as solid and the exact percentages as
approximate.

## Log

Newest last. One entry per resolved hypothesis, and one per weekly review.

*(empty — first entry goes here)*
