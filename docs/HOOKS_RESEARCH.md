# Viral Hooks for Short-Form Content — Evidence Review

Research date: 2026-08-05. Scope: what is actually measured about short-form
video hooks, what curated datasets exist, and how to build a 10,000+ hook
corpus on real data.

> **Revision note (same day):** an earlier draft of this document claimed no
> public dataset of 10,000+ hooks with performance metrics existed. **That was
> wrong.** At least one — 46,600 hooks with view counts, MIT-licensed — is
> public and directly usable. §1 and §5 are rewritten accordingly.

---

## 0. The scoping answer, first

**A curated 10,000+ hook dataset with real engagement metrics does exist.**
The largest directly-on-point one is **`benxh/tiktok-hooks-finetune`** on
Hugging Face: **46,600 rows**, each with an isolated `text_hook` field plus
views, likes, comments, shares, category, subcategory and language. MIT
licensed. That is 4.6× the size you asked for, already extracted to the hook
level, and free.

Beyond it sit several much larger corpora where the hook has to be *derived*
from captions or transcripts rather than read off a column — up to 6.65M rows
(TikTok-10M) and 1M videos with raw video/audio/title (MicroLens).

So there are really three tiers of source, and choosing between them is the
actual decision:

| Tier | What it gives you | Best example | Size |
|---|---|---|---|
| **1. Hook-level, labelled** | `text_hook` isolated + metrics | `benxh/tiktok-hooks-finetune` | 46.6k |
| **2. Caption/transcript-level** | Hook must be derived from text | `lingbow/tiktok-video-engagement-200k` | 210k |
| **3. Raw multimodal** | Hook must be derived from video | MicroLens | 1M videos |

The mechanics evidence (§2) and the taxonomy studies (§3) remain the
interpretive layer on top. What changed is that you no longer have to
*generate* a corpus to reach 10,000 — you can start from measured ones.

---

## 1. The datasets (the actual answer to the question)

### 1.1 `benxh/tiktok-hooks-finetune` — the direct hit

- **46,600 rows**, Parquet, **MIT license** (commercial use permitted).
- **Fields:** `username`, `main_category`, `subcategory`, `text_hook`,
  `length`, `views`, `likes`, `comments`, `shares`, `outlier_multiplier`,
  `uploaded_at`, `ad_link`, `caption`, `platform`, `text_hook_lang`,
  `caption_lang`, plus three pre-built `conversations*` columns for
  fine-tuning (hook→caption, caption→hook, both).
- **Ranges:** views 11 → 216M; likes 0 → 12.4M; shares 0 → 4.4M;
  `text_hook` 0–135 chars.
- **Categories:** Entertainment, Business, Health & Fitness, Travel, Books,
  Education, Finance, Photo & Video, Social Networking, with fine subcategories.
- **Languages:** predominantly English, but Spanish, French, Korean, Kazakh,
  Kurdish, Danish and others are tagged — `text_hook_lang` makes
  non-English filtering trivial.

> **Verified by inspection 2026-08-05** — the dataset was downloaded and
> profiled; see [`hooks/README.md`](hooks/README.md) and
> [`hooks/curate_hooks.py`](hooks/curate_hooks.py). Three claims in the first
> draft of this section were wrong and are corrected below.

**`text_hook` is OCR-extracted on-screen text from the opening frame, not an
authored hook field.** The dataset card never says so. It is unmistakable in
the data: literal OCR-failure strings ("There is no text in this image."),
app UI chrome ("Effects Filters Trim Music BeatSync FaceTrack"), device menu
dumps, brand wordmarks and mid-sentence fragments. **Only 17.8% of rows
survive as clean, usable hooks.** This is the single most important fact about
the dataset and it changes the effort estimate substantially — the work is
junk removal, not classification.

**`outlier_multiplier` is creator-relative — confirmed, and it is the reason
to use this dataset.** It measures views ÷ that creator's baseline views, so
it does not reward a hook for belonging to a large account. That is precisely
the control the vendor studies in §3 lack. Its exact denominator is *not*
reconstructable from the shipped columns: the best fit is `views/creator_min`
at a median ratio of 1.513 with a strikingly tight IQR (1.504–1.534),
implying the true baseline sits below the lowest value visible here.

**It is not floored at 1.0 — but it is winners-only anyway.** Actual minimum
is **0.374**, and only 2 of 46,605 rows fall below 1.0. The 1st percentile is
1.36 and the median is **3.98**. So the earlier hypothesis was wrong on the
mechanism and right on the consequence: the median row beat its creator's
baseline fourfold, the losers were never sampled, and **no causal "archetype X
beats Y" claim is supportable** from it.

**`ad_link` is just the video permalink, not an ad marker.** Every row is a
`tiktok.com/@user/video/…` URL and the embedded username matches the
`username` column 100% of the time. My inference from the column name was
wrong.

**The commercial skew is real, but the evidence is the creator set.** 923
accounts, mean 50.5 videos each — a narrow, heavily-repeated sample of brand
and app-marketing accounts (letterboxd, holidayguru, finalroundai…) filed
under an app-store category taxonomy. Provenance traces to a dataset posted to
X ([@iamgdsa](https://x.com/iamgdsa/status/1884294758484611336)), re-processed
with language classification the author flags as rough. No documented sampling
frame.

**Staleness:** uploads span 2019-09-30 → 2025-01-26, concentrated in 2023
(14,400) and 2024 (20,972), with only 1,211 from 2025. As of August 2026 that
is **~19 months stale** — material in a domain where §3.1 shows effectiveness
decays with saturation.

### 1.2 `lingbow/tiktok-video-engagement-200k` — richest features, **licence-blocked**

- **210k videos**, plus `creator_daily` (278k) and `engagement_daily`
  (6.07M rows) — the daily tables allow genuine time-series analysis.
- **Fields:** `desc`, `hashtags`, **`transcript`**, `word_count`,
  `emoji_count`, `question_count`, music metadata, engagement, and six
  sentiment scores (anger, joy, surprise, sadness, disgust, fear).
- Date range **24 June – 3 July 2024** — a 10-day window, so seasonally narrow.
- **License: CC-BY-NC-4.0 — non-commercial.**

> ⚠️ **Baakhapaa has paid Pro/Studio tiers. This dataset cannot be used in the
> product.** It is fine for internal research and for validating a taxonomy;
> nothing derived from it can ship. Flagging this explicitly because the
> transcript + sentiment fields make it the most tempting one in the list.

### 1.3 `The-data-company/TikTok-10M` — largest general corpus

- **~6.65M rows**, 50+ columns: `description`, hashtags/challenges, music,
  `play_count` (to 314M), `digg_count` (to 22M), comments, shares, duet/stitch
  flags, ad status, POI/location.
- Collected **March–June 2025**.
- **License: "other"** (non-standard) — read it before any commercial use.
- No isolated hook field; you'd derive hooks from `description`.

### 1.4 Academic / research-grade

- **MicroLens** — 1B interactions, 34M users, **1M short videos with raw
  titles, cover images, audio and full video**. Purpose-built to beat
  ID-only benchmarks like KuaiRec. The only option if you want to study
  *visual* hooks (§3.2) rather than text.
- **`openinterx/UGC-VideoCap`** — 1,000 TikToks with three-stage
  human-in-the-loop annotation across audio-only, visual-only and joint
  audio-visual semantics. Small, but the annotation quality is the highest
  available and it directly covers the non-verbal hook layer.
- **VK-LSVD** (arXiv 2602.04567) — large-scale industrial short-video
  recommendation dataset.
- **Kaggle** — `yakhyojon/tiktok` (19,382 rows, engagement only);
  `tarekmasryo/youtube-shorts-and-tiktok-trends-2025` (~50k records,
  cross-platform Shorts + TikTok; verify whether metrics are scraped or
  synthetic before relying on it).

### 1.5 What none of them have

No public dataset carries **per-video retention curves** — the 3-second hold
rate that §2 shows is the actual algorithmic currency. Views are a
*downstream* proxy for retention, contaminated by follower count, posting
time and algorithmic luck. `outlier_multiplier` is the closest available
substitute. This is the one genuine gap, and it is not closeable from outside
the platforms.

---

## 2. Mechanics (platform-published and well-replicated)

### 2.1 The decision window is ~1–3 seconds

- **~71%** of viewers decide within 3 seconds whether to keep watching —
  the most-cited number in the space, though see §6 on its sourcing.
- TikTok for Business: **63%** of its highest click-through videos hook
  inside the first 3 seconds.
- OpusClip puts the algorithm's *first* distribution decision at ~**1.5s**,
  before a spoken hook has finished.
- Meta reportedly uses a **1.0-second** early-retention signal for Reels
  delivery.

Practical consequence: on Reels a spoken hook is often too slow. The frame at
0.3s does work before any words are parsed.

### 2.2 Retention thresholds that map to distribution

| 3-second retention | Reported outcome |
|---|---|
| > 85% | Viral-candidate band |
| 70–85% | ~**2.2×** total views vs. lower-retention peers |
| 60–70% | Minimum viable for algorithmic promotion |
| < 60% | Minimal promotion |
| < 50% | Hook is failing |

For Reels, clips holding **>60%** at 3s reportedly out-reach clips holding
**<40%** by **5–10×**. Order-of-magnitude guidance, not calibrated constants.

### 2.3 TikTok first-party creative effects

From TikTok's own marketing-science blog — describes *ads*, and TikTok has an
obvious interest in the direction of findings, but it's the most authoritative
source available:

- **90%** of ad-recall impact captured in the first **6 seconds**.
- Product visible on screen: **+65%** brand affinity, **+25%** recall.
- CTA cards: **+45%** recall, **+19%** likeability.
- **88%** say sound is vital to the experience.
- **77%** appreciate brands using trends/memes/challenges.
- **74%** say TikTok-first creative catches their attention; it drives
  **3.3×** more actions than repurposed cross-platform creative.

### 2.4 Length envelopes

TikTok **21–34s** (steep completion decline past 45s); YouTube Shorts
**15–30s**; Reels **7–30s**. Across all three, hook quality dominates length.

### 2.5 The psychological substrate

Loewenstein's **information-gap theory** (1994): curiosity arises from
*awareness* of a gap between what you know and what you want to know, and the
discomfort is motivating enough to change behaviour. His three conditions map
onto why hooks fail:

1. The viewer must **already know enough** to sense something is missing — a
   hook aimed at total novices in a technical niche opens no gap.
2. The gap must feel **specific** — "this changes everything" opens nothing;
   "the one setting that halves your render time" opens a gap.
3. The gap must feel **bridgeable** — if closing it looks like 40 minutes of
   work, the viewer scrolls.

Kang et al. found curiosity correlates with reward-related brain activity and
predicts better recall of the answer 1–2 weeks later — the gap-then-close
structure is a retention-of-meaning effect, not only an attention trick.

---

## 3. Taxonomy studies (vendor-run, directionally useful)

### 3.1 OpusClip — 34,635 clips, Jan–Mar 2026

AI classification against a proprietary 40+ subcategory taxonomy; metric is
**average TikTok views at 7 days**; paid-promoted clips excluded.

**By average views:**

| Hook type | Avg. 7-day views | n |
|---|---|---|
| Project / Product / Outcome Showcase | 6,037 | **40** |
| Comparative Showdown ("X vs Y") | 5,306 | 240 |
| Direct Audience Engagement | 4,776 | 323 |
| Expert Explainer Setup | — | 2,626 |

**By frequency:**

| Hook type | n | Avg. views |
|---|---|---|
| Shock / Surprise | 7,722 | 1,973 |
| Direct Address / Question | 6,792 | 1,768 |
| Intriguing Statement | 4,282 | 1,932 |

> **The inverse relationship is the real finding.** The three *most common*
> hook types average ~1,700–2,000 views; the three *highest-performing*
> average ~4,800–6,000. Commoditised hooks — shock openers, "did you know"
> questions, vague intrigue — are exactly the underperformers. Consistent with
> habituation: a hook pattern decays as it saturates the feed.

> **Caution:** the #1 row rests on **n = 40**. One outlier moves that mean
> substantially. The n=240 and n=323 rows are the defensible ones.

Parent categories (15+): Product/Project Showcase, Comparative Showdown,
Direct Audience Engagement, Absurd Statement, Process Explainer, Question
Opener, Story/Anecdote Teaser, Personal Anecdote, Unexpected Discovery Reveal,
Rare Event/Achievement, Normative Statement, Unconventional Challenge/Test,
Problem/Solution Setup, Expertise/Authority, Intriguing Statement.

### 3.2 The Content Labs — 3,600 videos, 120 accounts, 6 niches

**Hook word count scales with the niche's consideration level:**

| Niche | Words in top hook | Top clip plays |
|---|---|---|
| Food | 1 | 210.9M |
| Fashion | 0 | 92.4M |
| Fitness | 0 | 175.5M |
| Real estate | 4 (a price) | 23.7M |
| Personal finance | 8–10 | 12.1M |

Low-consideration, visually self-evident content peaks with **zero or
near-zero text** — the visual *is* the hook. High-consideration content
(money, property) needs verbal framing because the image carries no stakes.

Their five parents: minimal/zero-text, curiosity gap, pattern interrupt,
emotional trigger, authority/premium signal. Minimal/zero-text won food,
fashion and fitness; emotional trigger won beauty; curiosity gap won finance.

**Structural implication for any hook library:** roughly half the winning
hooks in this sample had *no text at all*. A corpus of pure text lines — which
is what `benxh/tiktok-hooks-finetune` is — structurally cannot represent them.
Entries need a **first-frame spec and a sound-entry spec**, not just copy.
This is the main thing the 46.6k dataset does *not* give you.

### 3.3 Convergent third-party ranking

A larger cross-platform read (OpusClip ~1.95M clips; UGC Copilot ~50M
AI-generated ads) reports **Unpopular Opinion**, **POV Realism** and
**Specific Outcome** framings producing **35–45% higher 3-second retention**
than generic product reveals.

### 3.4 Peer-reviewed modelling work

- **arXiv 2512.21402** — rubric-based VLM framework for short-form
  edutainment; curated YouTube Shorts dataset; clusters unsupervised
  audiovisual features into interpretable engagement factors. High-engagement
  videos skew toward energetic music, rapid cuts, expressive narration and
  strong narrative hooks. Under review; no hook-level effect sizes.
- **arXiv 2501.01422** — multimodal feature extraction for popularity
  prediction. **arXiv 2507.00950** — SMP Challenge 2025 winning solution,
  useful as a feature-engineering reference.
- Biometric work (facial expression + skin conductance, n=64, 13 videos) —
  tiny, but the only causal-ish design in the pile.

---

## 4. Getting to 10,000+ — measured first, generated second

With §1 available, the honest construction is a **hybrid**, and the ordering
matters:

**Step 1 — mine, don't generate. ✅ DONE.** See
[`hooks/README.md`](hooks/README.md). The 46,605 raw rows yielded **8,285
curated, archetype-labelled hooks** plus an **8,714-row review queue**, ranked
by creator-relative `om` rather than raw views.

Note the shortfall against the 10,000 target: after removing OCR noise the
source simply does not contain 10,000 clean authored hooks. Loosening the
filters to hit a round number would only re-import the junk. Triaging the
review queue is the cheapest route to growing the core; steps 2–3 below cover
the rest.

**Step 2 — cluster to recover a taxonomy.** Embed `text_hook` with the
fastembed model already in the repo, cluster, and label clusters against the
§3.1 taxonomy. This is the step that converts a flat list into something
retrievable — and it lets you *check* the vendor taxonomy against independent
data rather than trusting it.

**Step 3 — generate only to fill gaps.** Coverage will be thin in verticals
your users care about (Nepali-language, regional film/web-series promo,
South-Asian creator niches). Fill those by parameterised expansion:

```
hook = archetype × syntactic_frame × vertical × specificity_slot × modality
```

15 archetypes × 8 frames = 120 templates × 40 verticals = 4,800 × 3
modalities (text-on-screen / spoken VO / visual-only) ≈ **14,400 specs**.
Past that you're generating noise, not variety. Label generated rows so they
never get confused with mined ones.

**Quality gates on the generated portion:**

1. **Loewenstein filter** — reject anything failing specificity or
   bridgeability (§2.5). Kills most "this changes everything" output.
2. **Saturation penalty** — down-rank archetypes in the high-volume /
   low-performance quadrant (§3.1).
3. **Word-count band by vertical** — 0–2 words for visually-evident verticals,
   6–10 for high-consideration (§3.2).
4. **Modality completeness** — every entry carries first-frame and sound-entry
   specs.
5. **Decay stamping** — every entry dated. Hook patterns saturate; an undated
   library is stale within two quarters and can't be pruned.

---

## 5. What to stay sceptical about

- **Views are not retention.** Every public dataset measures views, which are
  a downstream proxy contaminated by follower count, posting time and luck.
  The 3-second hold rate that actually drives distribution (§2.2) is not in
  any of them. `outlier_multiplier` is the best available substitute.
- **`benxh` provenance is undocumented.** No sampling frame, rough language
  classification by the author's own admission, likely skewed toward app-
  marketing UGC ads. Sample it before trusting it.
- **The 1.0 floor probably means no control group.** Verify before any
  comparative claim (§1.1).
- **Licences differ and one is disqualifying.** MIT (`benxh`) is fine.
  **CC-BY-NC (`lingbow`) cannot ship in a paid product.** TikTok-10M is
  "other" — read it.
- **Vendor studies sell something.** OpusClip sells clip generation, Content
  Labs sells hook tooling, TikTok sells ads. Every published finding favours
  the seller, and I found no independent replication of the §2.2 table.
- **"Average views" is confounded** and none of the vendor studies report
  controlling for creator size.
- **n = 40 is not a finding** (§3.1).
- **The 71% figure has no traceable primary source** — it propagates across
  dozens of blogs uncited. Directionally plausible, formally unverified.
- **No causal identification in the vendor layer.** Nobody publishes
  randomised hook A/Bs on matched content. The mined datasets at least permit
  observational modelling with creator-level controls, which is better.
- **Recency decay is real.** §3.1's inverse relationship is itself evidence
  that hook effectiveness is a function of saturation, so any static library
  degrades.

---

## 6. Recommended build path for Baakhapaa

Maps onto the existing RAG rather than adding a parallel system.

1. **Pull `benxh/tiktok-hooks-finetune`** (MIT — safe for the product).
   Profile it first: confirm the `outlier_multiplier` definition, check the
   1.0 floor, measure how much is app-ad content.
2. **Extend `knowledge_base.json` with a `hook` level**, alongside the current
   structure / scene / dialogue / character / image levels.
3. **Keep the problem-first embedding convention.** Writers arrive with a
   symptom — "my reel dies in 2 seconds", not "give me a comparative-showdown
   hook" — which is exactly why the existing corpus embeds `problem` first.
4. **Store patterns, not strings.** ~120 pattern entries derived from
   clustering (§4 step 2), with instances generated on demand. Indexing 46,600
   raw strings would swamp retrieval; 120 parameterised patterns is smaller,
   fresher, and prunable as archetypes saturate.
5. **Entry shape:** `archetype`, `problem`, `mechanism` (why it opens a gap),
   `first_frame_spec`, `sound_entry_spec`, `word_count_band`, `vertical_fit[]`,
   `saturation_score`, `evidence` (n + source + date), `worked_example`.
6. **Originality by construction.** Archetype names and mechanics are
   uncopyrightable facts. Mined hooks are evidence for a *pattern* — cite them
   in `evidence`, but keep every `worked_example` original prose, same rule as
   the existing corpus. Don't ship scraped hook strings as product content.
7. **Cost.** Retrieval-only, local fastembed, no Claude call needed to serve a
   hook recommendation — fits the free tier.

---

## Sources

**Datasets**
- [benxh/tiktok-hooks-finetune — 46.6k hooks + metrics, MIT](https://huggingface.co/datasets/benxh/tiktok-hooks-finetune)
- [lingbow/tiktok-video-engagement-200k — transcripts + sentiment, CC-BY-NC](https://huggingface.co/datasets/lingbow/tiktok-video-engagement-200k)
- [The-data-company/TikTok-10M — ~6.65M rows](https://huggingface.co/datasets/The-data-company/TikTok-10M)
- [openinterx/UGC-VideoCap — 1k human-annotated TikToks, multimodal](https://huggingface.co/datasets/openinterx/UGC-VideoCap)
- [MicroLens — 1M videos with raw text/audio/image/video](https://github.com/westlake-repl/MicroLens)
- [Kaggle: TikTok User Engagement Data (19,382 rows)](https://www.kaggle.com/datasets/yakhyojon/tiktok)
- [Kaggle: YouTube Shorts & TikTok Trends 2025](https://www.kaggle.com/datasets/tarekmasryo/youtube-shorts-and-tiktok-trends-2025)
- [VK-LSVD industrial short-video dataset (arXiv 2602.04567)](https://arxiv.org/pdf/2602.04567)

**Taxonomy & mechanics**
- [Best TikTok Hooks 2026 — 34,635 clips (OpusClip)](https://www.opus.pro/blog/tiktok-hooks-that-go-viral-2026)
- [50+ TikTok Video Hooks — full taxonomy + per-category n (OpusClip)](https://www.opus.pro/research/best-video-hooks-tiktok)
- [TikTok Hooks That Actually Go Viral — 3,600 videos, 6 niches (The Content Labs)](https://thecontentlabs.app/guides/tiktok-hooks)
- [Creative Best Practices for TikTok Ads (TikTok For Business, first-party)](https://ads.tiktok.com/business/en/blog/creative-best-practices-top-performing-ads)
- [Ideal TikTok Length & Format for Retention (OpusClip)](https://www.opus.pro/blog/tiktok-length-format-retention-data)
- [Instagram Reels Hook Formulas That Drive 3-Second Holds (OpusClip)](https://www.opus.pro/blog/instagram-reels-hook-formulas)
- [Audience Retention Benchmarks 2026 (Retensis)](https://retensis.com/blog/audience-retention-benchmarks-2026)

**Academic**
- [Understanding Virality: Rubric-based VLM Framework (arXiv 2512.21402)](https://arxiv.org/abs/2512.21402)
- [Multi-Modal Video Feature Extraction for Popularity Prediction (arXiv 2501.01422)](https://arxiv.org/abs/2501.01422)
- [MVP: SMP Challenge 2025 Video Track winner (arXiv 2507.00950)](https://arxiv.org/pdf/2507.00950)
- [Golman & Loewenstein — Information-Gap Theory (CMU)](https://www.cmu.edu/dietrich/sds/docs/golman/Information-Gap%20Theory%202016.pdf)
