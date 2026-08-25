# Curated Short-Form Hook Corpus

Built 2026-08-05 from [`benxh/tiktok-hooks-finetune`](https://huggingface.co/datasets/benxh/tiktok-hooks-finetune)
(46,605 rows, MIT licence). Reproduce with `curate_hooks.py`.

Research context and the evidence this is interpreted against: [`../HOOKS_RESEARCH.md`](../HOOKS_RESEARCH.md).

## Files

| File | Rows | What it is |
|---|---|---|
| **`hook_templates.csv`** | **126** | **Start here.** Fill-in-the-blank templates ranked by usability |
| `hooks_curated.csv` | 8,285 | Curated core — cleaned, deduped, archetype-labelled, all languages |
| `hooks_manifest.json` / `usability_manifest.json` | — | Provenance, counts, known limits |
| `curate_hooks.py` / `categorize_by_usability.py` | — | The pipelines, re-runnable |

### Cuts that are not stored, because they are derivable

Three files used to sit here and were removed: together they were 24,486 lines
of CSV in git for information already present in the two above. Regenerate any
of them in seconds:

| Was | Rows | How to get it back |
|---|---|---|
| `hooks_curated_en.csv` | 7,484 | The `lang == "en"` rows of `hooks_curated.csv`. One filter. |
| `hooks_by_usability.csv` | 8,285 | `python categorize_by_usability.py` — the same rows plus seven computed columns |
| `hooks_review_queue.csv` | 8,714 | `python curate_hooks.py` re-emits it. It is the **uncurated** residue and still contains OCR noise; it was never safe to use as-is |

## Columns

`hook`, `archetype`, `tier`, `om`, `om_pct`, `views`, `likes`, `comments`,
`shares`, `words`, `word_band`, `lang`, `main_category`, `subcategory`,
`year`, `username`, `permalink`.

**`om`** (outlier_multiplier) is the column that matters: views ÷ that
creator's baseline views. It is **creator-relative**, so it does not reward a
hook simply for belonging to a large account — which is the flaw in every
"average views by hook type" study cited in the research doc. `om_pct` is its
percentile rank; `tier` buckets that into baseline / strong / high /
exceptional.

Rank by `om` or `om_pct`. **Do not rank by `views`.**

---

## The finding that shaped this pipeline

**`text_hook` is OCR-extracted on-screen text from the opening frame, not an
authored hook field.** The dataset card does not say this. It became obvious
on inspection: the raw column contains literal OCR-failure strings ("There is
no text in this image."), app UI chrome ("Effects Filters Trim Music
BeatSync"), device menu dumps, brand wordmarks, and mid-sentence fragments.

So the dominant curation task was junk removal, not classification.
**Only 17.8% of raw rows survive as clean, archetype-labelled hooks.**

That is also why this corpus is 8,285 and not 10,000+. The source does not
contain 10,000 clean authored hooks; loosening the filters to reach a round
number would just re-import the noise. The core plus the review queue is
16,999 rows, and triaging the queue is the cheapest way to grow the core.

## Pipeline

```
46,605 raw
  -2,592  >26 words (caption/transcript, not a hook)
  -2,498  <1k views
  -1,257  OCR-failure strings
  -5,698  no function words (label soup)
  -4,404  brand wordmark / bare label
  -2,634  mid-sentence fragments
  … plus hashtag spam, UI chrome, dangling tails, ALLCAPS labels
  -1,603  duplicate hook text (kept the highest-om instance)
  -6,206  creator cap, max 60 per account (923 creators, one had 297)
= 8,285 curated core + 8,714 review queue
```

---

## Results

### Hook length vs performance

| Words | n | Median `om` | Median views |
|---|---|---|---|
| **0–2** | 166 | **7.78** | 70,600 |
| 3–5 | 1,234 | 5.69 | 45,750 |
| 6–10 | 3,699 | 5.75 | 27,600 |
| 11–26 | 3,186 | 5.91 | 21,300 |

Very short hooks (0–2 words) clearly outperform — consistent with the Content
Labs finding that visually self-evident niches peak at near-zero text.

**But the strong version of that claim does not survive.** On the looser v2
filter the decline was monotonic across all four bands; after strict junk
removal only the 0–2 band separates, and 3–5 / 6–10 / 11–26 are flat within
noise. Median *views* still decline monotonically, but views are the
confounded metric. **Report: "very short hooks outperform." Do not report
"shorter is always better."**

### Archetype distribution

21 archetypes, regex-labelled. Ranked by median `om`:

| Archetype | n | Median `om` | Median views | Med. words |
|---|---|---|---|---|
| authority | 38 | 22.94 | 140,200 | 11.5 |
| product_showcase | 112 | 7.89 | 24,900 | 11 |
| story_teaser | 75 | 7.81 | 38,800 | 9 |
| benefit_promise | 56 | 7.14 | 21,350 | 10 |
| contrarian | 14 | 7.05 | 13,600 | 11 |
| outcome_proof | 509 | 6.85 | 22,600 | 12 |
| demonstration | 698 | 6.51 | 25,450 | 9 |
| shock_statement | 220 | 6.32 | 30,800 | 9 |
| listicle | 685 | 6.27 | 32,200 | 9 |
| imperative | 293 | 6.24 | 45,300 | 7 |
| question | 2,508 | 5.66 | 32,550 | 8 |
| quote_dialogue | 646 | 5.55 | 19,800 | 10 |
| relatable_identity | 34 | 5.52 | 29,650 | 11 |
| pov_realism | 1,202 | 5.42 | 19,000 | 11.5 |
| direct_address | 367 | 5.31 | 27,000 | 8 |
| reveal_tease | 449 | 5.12 | 20,900 | 8 |
| problem_solution | 51 | 4.87 | 9,307 | 10 |
| comparative | 114 | 4.87 | 43,850 | 11 |
| curiosity_gap | 86 | 4.60 | 18,100 | 10 |
| warning_mistake | 17 | 4.54 | 7,359 | 11 |
| invitation | 111 | 4.53 | 23,400 | 7 |

> ⚠️ **Ignore the `authority` row.** n = 38, and spot-checking shows it is
> also mis-labelled — several matches are POV lines that happened to contain a
> credential word. Its 22.94 is an artifact. This is the same n≈40 trap the
> research doc flags in the OpusClip study; it appears here too, and the
> honest response is to discard the row rather than headline it.
>
> Treat any archetype with n < 100 as indicative only: `contrarian` (14),
> `warning_mistake` (17), `relatable_identity` (34), `benefit_promise` (56),
> `problem_solution` (51), `curiosity_gap` (86), `story_teaser` (75).
>
> The rows with enough n to trust: `question` (2,508), `pov_realism` (1,202),
> `demonstration` (698), `listicle` (685), `quote_dialogue` (646),
> `outcome_proof` (509).

Note the same inverse pattern the research doc reports: the two highest-volume
archetypes (`question`, `pov_realism`) sit in the *lower* half by median `om`.
Saturated patterns underperform.

---

---

# Creator-usability recut

`archetype` is a linguistic label. A creator doesn't think "I need a
quote_dialogue hook" — they think *"what is my video trying to do, and can I
shoot it with what I have?"* `categorize_by_usability.py` recuts the same
8,285 rows on those axes.

## The axes

**`intent` — the job the video does**

`TEACH` · `SELL` · `PROVE` · `RELATE` · `PROVOKE` · `ENTERTAIN`

Derived from archetype, then overridden by lexical signals — necessary because
`question` (n=2,508) spans several jobs.

**`production` — what you physically have to shoot**

| Value | `effort` | Meaning |
|---|---|---|
| `TEXT_ON_BROLL` | 1 | Text over footage. No performance needed. |
| `TALKING_HEAD` | 2 | Say it to camera. |
| `SKIT_OR_POV` | 3 | Act a scenario. |
| `SCREEN_DEMO` | 3 | Show a screen or process. |
| `TRANSFORMATION` | 4 | Two states — before/after. |

**`funnel`** — `REACH` / `NURTURE` / `CONVERT`.

**`usability`** — `0.55 × om_percentile + 0.25 × is_template + 0.20 × (1 − effort)`.
Performance, discounted by how expensive it is to make and boosted if it's
reusable. **These weights are an editorial choice, not a measurement** — re-weight
them for your users.

## What the recut shows

### Intent

| Intent | n | Median `om` | Median views | Share |
|---|---|---|---|---|
| PROVE | 643 | **6.82** | 31,700 | 7.8% |
| TEACH | 1,461 | **6.28** | 28,600 | 17.6% |
| SELL | 348 | 6.21 | 22,650 | 4.2% |
| PROVOKE | 3,240 | 5.62 | 30,600 | **39.1%** |
| ENTERTAIN | 662 | 5.53 | 25,200 | 8.0% |
| RELATE | 1,931 | 5.51 | 20,400 | **23.3%** |

The saturation pattern again: the two **biggest** buckets (PROVOKE, RELATE —
62% of the corpus between them) are the two **weakest** performers. Proving
something and teaching something are rarer and do better.

### Production — the most actionable result

| Production | Effort | n | Median `om` | Median views |
|---|---|---|---|---|
| TRANSFORMATION | 4 | 32 | 6.37 | 16,700 |
| SCREEN_DEMO | 3 | 1,153 | 6.28 | 22,600 |
| **TEXT_ON_BROLL** | **1** | **3,966** | **5.88** | **33,900** |
| TALKING_HEAD | 2 | 1,494 | 5.64 | 22,600 |
| SKIT_OR_POV | 3 | 1,640 | 5.62 | 21,050 |

**Text over b-roll is the best effort-to-return trade in the corpus.** It is
the cheapest thing to make (effort 1), the most common (48%), and it earns the
**highest median views of any format** — 50% more than talking head or skit,
which both cost more to produce. Skits are the worst deal: high effort,
bottom-of-table return.

Ignore the TRANSFORMATION row — n = 32.

### Funnel

`CONVERT` 6.50 › `NURTURE` 6.28 › `REACH` 5.57. Hooks aimed at selling or
proving outperform pure reach plays on creator-relative lift.

## The templates

126 mined stems, each recurring across **≥5 hooks and ≥3 distinct creators** —
the creator threshold is what separates a real pattern from one brand's voice.

Best of the trustworthy set (≥10 instances):

| Template | Intent | Usability | Hooks / creators | Median `om` |
|---|---|---|---|---|
| `how to make a [...]` | TEACH | 75.5 | 16 / 13 | 12.82 |
| `pov when you [...]` | RELATE | 74.6 | 17 / 11 | 13.91 |
| `this is your sign to [...]` | PROVOKE | 73.6 | 23 / 19 | 7.38 |
| `me when i [...]` | RELATE | 72.2 | 10 / 10 | 16.19 |
| `how to create a [...]` | TEACH | 69.4 | 10 / 7 | 20.09 |
| `are you a [...]` | PROVOKE | 65.8 | 10 / 10 | 10.37 |
| `how to make your [...]` | TEACH | 63.9 | 13 / 10 | 7.92 |
| `how do you [...]` | PROVOKE | 63.9 | 26 / 23 | 4.10 |
| `how to get a [...]` | TEACH | 63.9 | 11 / 10 | 9.06 |
| `why are you [...]` | RELATE | 63.5 | 12 / 6 | 11.14 |

> Templates with fewer than 10 instances rank high on `om` but are unstable —
> `pov you find [...]` shows `om` 49.72 on 8 hooks, `how to keep [...]` shows
> 37.04 on 7. Treat them as leads, not conclusions. Sort by `instances` and
> `creators` before `median_om` if you want the safe set.

Note `how to …` dominates TEACH and is the single most reliable family in the
corpus — it recurs widely, across many creators, at consistently high lift.

## Extra caveats for this recut

Everything in "Limits" below still applies, plus:

- **`production` was inferred from wording — no video was watched.** A hook
  saying "how to" is *assumed* to need a screen demo. Treat it as a hint.
- **The usability weights are editorial.** Nothing measures the cost of a skit
  versus a talking head; `effort` is a judgement call.
- **`usability` bands are absolute cuts** on a bounded score, so `top` is
  intentionally thin (23 rows). Use the score, not the band, for ranking.
- PROVOKE is a large, coarse bucket because `question` lands there by default.

## Limits — read before using

1. **Winners-only. There is no control group.** 99% of raw rows have
   `om` ≥ 1.36; median 3.98×. Every hook here beat its creator's baseline.
   You can ask "what do winning hooks look like"; you **cannot** ask "does
   archetype X beat archetype Y", because the losers were never sampled.
2. **`om`'s exact baseline is not reconstructable** from the shipped columns.
   Best fit is `views / creator_min` at a ratio of ~1.51 with a tight IQR
   (1.504–1.534), implying the true baseline sits below the minimum visible
   here. It is creator-relative — the precise denominator is unknown.
3. **Not organic creator content.** 923 accounts, all brand/app marketing,
   organised under an app-store category taxonomy (Health & Fitness,
   Photo & Video, Productivity, Utilities…). Skews commercial.
4. **~19 months stale.** Uploads run 2019-09-30 → 2025-01-26, bulk in 2023–24.
   Given that hook effectiveness decays with saturation, treat archetype
   rankings as historical.
5. **No retention data.** `views` is a downstream proxy. The 3-second hold
   rate that actually drives distribution is not in any public dataset.
6. **Archetype labels are regex-derived, not human-validated.** First match
   wins, so ordering biases assignment. `authority` demonstrates the failure
   mode.
7. **Residual OCR bleed remains in the core** — a minority of rows carry
   subscriber counts, watermarks or UI text alongside real hook copy.
8. **English-dominant** (7,484 of 8,285). No Nepali or Hindi coverage at all —
   the gap most relevant to Baakhapaa, and one this source cannot fill.

## Licence and use

Source is MIT, so commercial use is permitted. But these are **real hooks
written by real accounts**, and each row carries a `permalink` to the original
video. Use them as *evidence for a pattern* — cite them in an `evidence`
field — and keep any shipped `worked_example` original prose, consistent with
the rule already applied to `knowledge_base.json`. Do not ship scraped hook
strings as product output.

## Next step

Cluster the core with the repo's existing fastembed model to derive archetypes
from the data instead of from regex, then fold ~120 pattern entries into
`knowledge_base.json` under a `hook` level. See `../HOOKS_RESEARCH.md` §6.
