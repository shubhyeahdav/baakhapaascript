# How the short-form tools work, and what none of them does

Research for the scripting system. Completed 2026-10-06.

Two tasks on the list could not be done from here and are briefed at the end:
trialling the competitors needs accounts and card details, and watching twenty
shorts needs eyes. Everything else is answered below.

---

## 1–3. How the existing tools actually work

### The outlier tools

**1of10** is the purest version of the category. It overlays a multiplier badge
on YouTube — a video flagged when it takes **6x to 100x its own channel's
average** — plus views-per-hour to catch a breakout early, performance tags,
bookmarks, filters and competitor tracking. Its Pro tier adds AI idea
generation that "remixes proven outlier formats", **a title generator and a
thumbnail generator**.

**OutlierKit** does benchmarked outlier detection and adds keyword research,
trend discovery, psychographic analysis, sponsor intelligence and monetisation
context.

**vidIQ and TubeBuddy** both detect outliers but **not on Shorts**.

Three things are worth extracting from that.

**They agree on the definition.** An outlier is views against the channel's own
baseline, not raw views. That is the right definition and the product uses it:
raw views find big channels, the ratio finds a video that beat the person who
made it, and only the second is something a hook can be credited with.

**They all stop at the same place.** Find the outlier, show its multiple,
surround it with context. Then they hand you the video.

**Everything they generate is packaging.** Titles. Thumbnails. Formats to
remix. Not one of them generates or measures the words that get spoken.

### The craft being taught

From public interviews rather than paid material. The useful part is
structural, and it contradicts the obvious model:

> Not hook → body → conclusion. Instead "hook, there's a dance, and in that
> dance you have context and conflict" — **set up → rehook, set up → rehook**,
> ending on a final hook built to drive shares.

Supporting principles: **curiosity loops, plural** — several unanswered
questions planted through the video rather than one at the front; **deliberate
rhythm** — short, medium and long sentences mixed, with monotony named as a
retention killer; and **platform-native pacing**, because slow podcast-clip
pacing fails regardless of content quality.

---

## 4. The mechanism, as six stages

| Stage | What it owes the next |
|---|---|
| **Positioning** | What this creator is for. Narrows every idea downstream. |
| **Ideas** | Candidates filtered against positioning, from curated inputs. |
| **Hook** | A curiosity gap opened in the first seconds. |
| **Script** | The set-up/rehook dance — loops opened before the last closes. |
| **Rhythm** | Varied sentence length and platform-native pacing. |
| **Analysis** | What the posted video did, fed back into the next hook. |

The existing tools serve stage 2 and the packaging around it. **Stages 4, 5 and
6 are unserved.**

---

## 5. What every competitor shows

- Outlier multiple against channel baseline
- Views, views-per-hour, growth spikes
- Thumbnail and title, and generators for both
- Keyword, trend, sponsor and monetisation context
- Competitor channel tracking, bookmarks, filters

## 6. What none of them shows

- **Where the hook closes** — in seconds
- **Where the second loop opens** — the rehook interval, the structural claim
  the whole craft rests on
- **Sentence-length variance** — whether the rhythm is varied or flat
- **Delivery speed**, and how much is front-loaded
- **Any comparison between an outlier's structure and the draft you are
  writing**

In one line: **the category optimises packaging and never touches the script.**

### Why the gap exists — and why it is defensible

Titles and thumbnails are metadata, fetchable from a public API with a key.
Scripts require a transcript, and transcripts are behind a wall:
`captions.download` on YouTube demands OAuth from the video's **owner** and
returns 403 to anyone else; TikTok's Research API requires non-profit academic
affiliation; Instagram's publishing and discovery endpoints need Business
Verification.

So the gap is not an oversight. It is where the easy data stops. Any tool that
crosses it properly owns ground the metadata tools cannot reach by adding a
feature.

---

## 7. The gap, provable with numbers

> **Every tool in this category measures the packaging. None measures the
> script.**

The proof is already runnable. Two drafts of the same idea and near-identical
length, measured by `draft.py`:

| | words | sentence-length σ | longest monotone run |
|---|---|---|---|
| Varied rhythm | 34 | **6.22** | 1 |
| Flat rhythm | 28 | **0.00** | 4 |

"Vary your sentence length" is advice in every short-form course on the market.
Here it is a number that separates two scripts, and **no competitor reports
it.**

That is the whole wedge, and it needs no vendor, no API key and no money.

---

## What the system becomes

Three layers, in build order:

**1 — The draft meter.** Rhythm, monotone runs, estimated spoken length,
opening shape. Works on the first sentence typed. **Built** —
`draft.py`, 17 tests.

**2 — The outlier measurer.** Hook close, first rehook, delivery speed,
front-load, outlier ratio against channel median. **Built** — `measure.py`,
21 tests. Needs timestamped transcripts, which is the one paid input.

**3 — The feedback loop.** The creator enters views and retention after
posting; the system correlates hook shape against result. **Not built.** This
is the layer no course can imitate, because a course cannot see what happened
after you posted.

### The rule that holds across all three

Every record is numbers, booleans or nothing. No transcript text, no draft
text, enforced by a test rather than a comment — a record carrying one phrase
would make the corpus unshippable, and it would do so silently.

Every figure states whether it is a **measurement** or a **convention**. The
150 wpm narration rate is a convention and says so. The rehook detector is a
labelled proxy, blind to a rehook carried by image. That honesty is what
separates this from the advice it replaces.

---

## The two tasks that need you

**Trial OutlierKit and 1of10** — a week each, free tiers where available. The
question is not what they show; this document has that. It is **where you get
frustrated**: the moment you have the outlier on screen and still do not know
what to write. Note that moment precisely.

**Watch 20 outlier shorts in one niche.** For each, write down only: when the
first sentence ends, when something turns or a question arrives, and whether
the sentence lengths feel varied or flat. Twenty rows. If the rehook interval
clusters, that is the first real number this product owns — and it costs
nothing but an afternoon.
