# Investor demo video — script and sources

A 100-second demo of Baakhapaa, built from real product footage rather than
mockups. Every on-screen claim is listed below with where the number comes
from, and there is a list at the end of things this video deliberately does
**not** say.

Why that matters more than usual here: the product is further along
technically than it is commercially. It is deployed, it is heavily tested, and
it has a real technical moat — and it has no revenue, no completed payment,
and no writer trial. An investor finds all three of those out in the first
meeting. A demo that implies otherwise spends the credibility that the honest
version earns.

---

## Structure

| # | Time | Beat | What is on screen |
|---|---|---|---|
| 1 | 0:00–0:11 | The gap | Title card |
| 2 | 0:11–0:26 | Writing Nepali, checked in Nepali | Live editor footage |
| 3 | 0:26–0:40 | Craft, retrieved not generated | Live Patterns panel |
| 4 | 0:40–0:52 | The course teaches, the linter grades | Live course footage |
| 5 | 0:52–1:04 | A fourth format: long-form video | Live Outline + retention shape |
| 6 | 1:04–1:18 | Why it is hard to copy | Numbers card |
| 7 | 1:18–1:30 | Unit economics and payments | Numbers card |
| 8 | 1:30–1:40 | Where it stands, honestly | Closing card |

---

## 1 · The gap (0:00–0:11)

> **Nepal writes. Its writing tools do not read Nepali.**
>
> Screenwriting software checks craft in English.
> A Devanagari page is just characters it cannot parse.

**Source.** This is the product's founding observation, not a market
statistic — so it is phrased as a statement about software, which is checkable,
rather than about market size, which we have not measured.

---

## 2 · Writing Nepali, checked in Nepali (0:11–0:26)

Footage: a scene typed in Devanagari; the craft linter returns findings.

> **The craft linter reads Devanagari and romanised Nepali.**
> On-the-nose dialogue. Emotional parentheticals. Greetings that open a scene
> on nothing.
>
> Deterministic. No AI call. Works on a half-written page.

**Source.** `baakhapaa-backend/craft_linter.py` + `POST /scripts/lint`. Rules
are built from each craft entry's `warning_sign`; the Nepali matching is
pinned by the backend suite. Zero AI cost is a property of the
implementation — there is no provider call on this path.

---

## 3 · Craft, retrieved not generated (0:26–0:40)

Footage: the editor's Patterns tab returning craft against the open draft.

> **45 craft entries. Retrieved by meaning, not by keyword.**
>
> Embedded locally — no API key, no per-query cost.
> Every worked example is original prose.

**Sources.**
- 45 entries: counted from `baakhapaa-backend/knowledge_base.json` on
  2026-10-12 — 17 structure, 9 dialogue, 7 scene, 7 character, 5 image.
- Local embeddings: fastembed `bge-small-en-v1.5`, 384-dim.
- Original prose: this is what keeps the corpus publishable by construction,
  and it is the reason the corpus can be shown at all.

---

## 4 · The course teaches, the linter grades (0:40–0:52)

Footage: a lesson, an answer typed, the linter's response.

> **19 lessons. Free on every tier.**
> Graded by the craft linter, not by a Next button.
>
> Two tracks, because page craft and story craft fail independently.

**Source.** `lessons.py` — 19 lessons, 10 on the Pen track, 9 on the Story
track, counted 2026-10-12. Free on every tier is enforced in `learn.py`.
All 19 are also served in Nepali (`lessons_ne.py`).

---

## 5 · A fourth format (0:52–1:04)

Footage: a long-form video project — sections, the Outline, the retention shape.

> **Long-form video is a first-class format, not a screenplay in disguise.**
>
> Sections live in the document, so they survive export, diff and reorder.
> Runtime is words over a speaking rate — not pages.

**Source.** `videoscript.py`, `scene_sync.parser_for`. The retention shape
states on its own face that the curve is a convention rather than a
measurement, and a test pins that it never asserts a fault — that caption
stays visible in the footage on purpose.

---

## 6 · Why it is hard to copy (1:04–1:18)

> **The obvious fix did not work, and we measured that.**
>
> A Nepali craft query scored **16.7%** precision@1.
> A Nepali gloss field looked like the answer — so we tested the embedding
> model first. On two Devanagari sentences it scores **0.898** same-meaning
> against **0.877** different-meaning. A 0.02 gap. It cannot read the script.
>
> Translating out of Nepali before embedding took real-query precision@1 to
> **90.0%**. CI fails below 0.85.

**Sources.** `craft_query.py`, `eval_retrieval.py`,
`.github/workflows/ci.yml` (`--min-p1 0.80 --min-screenplay-p1 0.85`). The
combined figure went 71.8% → 90.0%; screenplay retrieval measured 90.0%
before long-form video existed and 90.0% after, which is the property the
one-way craft exclusion was built to protect.

**Why this is the strongest slide.** It is the one claim a competitor cannot
shortcut. The result is counter-intuitive, it cost a measurement to find, and
the measurement is in CI.

---

## 7 · Unit economics and payments (1:18–1:30)

> **The free tier costs nothing to serve.**
> Craft retrieval runs on local embeddings. Linting, review, camera notes and
> the whole course are deterministic.
>
> **Khalti and eSewa, not just Stripe** — Stripe cannot collect from most
> Nepali cards.

**Sources.** `payments.py`, `khalti.py`, `esewa.py`. Free-tier gating is in
place server-side: `generate-scene` / `improve` / `suggest` return 403 on
free, and `generate-structure` gives free users a RAG-grounded skeleton.

**Careful wording.** "Costs nothing to serve" is about AI spend, which is the
dominant variable cost in this category. It is not a claim about hosting.

---

## 8 · Where it stands (1:30–1:40)

> **Deployed. 2,602 automated tests.**
>
> Not yet proven: no completed payment, no writer trial, legal documents
> unreviewed.
>
> **Baakhapaa** · baakhapaascript.vercel.app

**Sources.** 1,187 backend tests across 80 files and 1,415 frontend tests
across 70 files, collected 2026-10-12 — 2,602 together. Deployed 2026-09-15:
frontend on Vercel, backend on Railway, real Supabase; register, login,
`/auth/me`, create project, save draft, cast, lint, recommendations and review
all verified 200 against the deployed pair.

---

## What this video does not claim

Each of these is either unmeasured or untrue today, and all of them are the
kind of thing an investor checks.

| Not claimed | Why |
|---|---|
| Any revenue figure | There is none |
| Any user or retention number | Nothing measures retention yet — see `HYPOTHESES.md` |
| That payments work | Verified against sandbox and demo paths only; no real money has moved |
| Free→paid conversion | Untested, and the price itself is untested |
| Market size for Nepali screenwriting | Not researched to a standard worth showing an investor |
| That AI generation is proven | The real Claude path has never run against the deployed backend |
| That the legal documents are reviewed | They are templates, and the app says so in a banner |
| "AI-powered" as the headline | The defensible part is retrieval and deterministic craft checking. Leading with AI invites the comparison we lose and hides the one we win |

---

## Production notes

- Footage is recorded from the real application running locally in **demo
  mode** — mock AI, local SQLite, placeholder storyboards. This machine
  otherwise runs against production Supabase with live keys, so the recording
  harness forces demo mode through the environment rather than trusting it.
  Nothing in this recording touched production data and no AI call was billed.
- No audio. Every point is on screen, which is also what the product's own
  marketing rule requires.
- Cards are rendered in the product's real theme tokens — warm near-black
  `#0B0B0A` and gold `#D4A843`, Spectral and Mukta — so the video and the app
  do not look like two different products.

### Rebuild

```
node scripts/demo-video.mjs          # records footage + renders cards
node scripts/demo-video-assemble.mjs # ffmpeg assembly
```
