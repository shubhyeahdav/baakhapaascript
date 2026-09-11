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
| H4 | Rs 999 is the right price, not just a price | Untestable at one price point — **this is the gap** | Offer a second price to a separate group and compare conversion | Before open launch |
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

## Log

Newest last. One entry per resolved hypothesis, and one per weekly review.

*(empty — first entry goes here)*
