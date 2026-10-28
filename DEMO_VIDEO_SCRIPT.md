# Investor demo video — script and sources

68 seconds, narrated, built from real product footage rather than mockups.
Every on-screen and spoken claim is listed below with where the number comes
from, and there is a list at the end of things this video deliberately does
**not** say.

Why that matters more than usual here: the product is further along
technically than it is commercially. It is deployed, it is heavily tested, and
it has a real technical moat — and it has no revenue, no completed payment,
and no writer trial. An investor finds all three out in the first meeting. A
demo that implies otherwise spends the credibility the honest version earns.

---

## How it is made

| | |
|---|---|
| **Narration** | Kokoro-82M (Apache 2.0) through ONNX Runtime, voice `af_heart`, run locally — nothing uploaded, no service signed into |
| **Cards** | Animated HTML recorded by Playwright at wall-clock time, so keyframes and counting numbers are real motion |
| **Footage** | Playwright screen recording of the application running in demo mode |
| **Cut** | ffmpeg |

**The voice is the clock.** `voice/lines.json` records each narration line's
real duration, and every visual segment is cut to it. Nothing is timed by
hand, so the picture cannot drift off the voice. That is also why there are no
crossfades between beats — a crossfade eats real time at each join and the
audio would walk away from the picture a little more at every one. The cards
animate themselves in, so the transition is already there.

### Rebuild

```bash
C:/addeity-video/.venv-tts/Scripts/python.exe scripts/demo/voice.py
```
```bash
node scripts/demo-motion.mjs && node scripts/demo-video.mjs && node scripts/demo-assemble.mjs
```

---

## The beats

### 1 · The gap — 3.8s, card

> *"Nepal writes. Its writing tools do not read Nepali."*

The product's founding observation, phrased as a statement about software —
which is checkable — rather than about market size, which we have not measured.

### 2 · Nepali, checked in Nepali — 9.9s, card then footage

> *"Baakhapaa does. The craft linter reads Devanagari. It finds the line that
> states a feeling instead of playing it, and it does that without a single AI
> call."*

Footage: the Craft panel on a Devanagari draft, reporting **3 high, 3 medium**
— a greeting opening the scene, two lines stating the grievance out loud, an
emotional parenthetical, an unfilmable action line.

**Source.** `linter.py` + `POST /scripts/lint`. Rules are built from each craft
entry's `warning_sign`. Zero AI cost is a property of the implementation —
there is no provider call on this path.

**Worth knowing.** This claim was only half true until 2026-10-12. The linter's
regexes were bilingual but the parser routing lines to them was ASCII-only, so
a screenplay with Devanagari character cues produced no dialogue elements and
therefore no dialogue findings at all. Fixed in `fa61b7f`; the footage is of
the fixed build.

### 3 · Craft, retrieved not generated — 10.4s, card then footage

> *"Craft comes from a library of forty-five techniques, matched to the page by
> meaning. The embeddings run on this machine. No API key, nothing per query."*

**Sources.** 45 entries counted from `knowledge_base.json` on 2026-10-12 — 17
structure, 9 dialogue, 7 scene, 7 character, 5 image. Local embeddings:
fastembed `bge-small-en-v1.5`, 384-dim. Every worked example is original prose,
which is what keeps the corpus publishable by construction.

### 4 · Why it is hard to copy — 19.3s, animated card

> *"The obvious fix was to add a Nepali field to that library. We tested the
> model first. On two sentences in Devanagari it scores 0.898 for the same
> meaning, and 0.877 for different ones. A gap of 0.02. It cannot read the
> script at all."*

Two bars grow to almost exactly the same length. That is the argument, made
before the sentence finishes explaining it.

### 5 · The fix we measured — 7.4s, counting card

> *"Translating out of Nepali before embedding lifted retrieval accuracy from
> sixteen percent to ninety percent."*

The number counts 16 → 90 on screen.

**Sources (4 and 5).** `craft_query.py`, `eval_retrieval.py`,
`.github/workflows/ci.yml` (`--min-p1 0.80 --min-screenplay-p1 0.85`). The
combined figure went 71.8% → 90.0%; screenplay retrieval measured 90.0% before
long-form video existed and 90.0% after, which is the property the one-way
craft exclusion protects.

**Why this is the strongest pair of beats.** It is the one claim a competitor
cannot shortcut. The result is counter-intuitive, it cost a measurement to
find, and the measurement is in CI.

### 6 · Unit economics — 8.3s, card then footage

> *"So the free tier costs nothing to serve. And it takes Khalti and eSewa,
> because Stripe cannot collect from most Nepali cards."*

Footage: the pricing page with all three gateways.

**Careful wording.** "Costs nothing to serve" is about AI spend, the dominant
variable cost in this category. It is not a claim about hosting.

### 7 · Where it stands — 9.1s, closing card

> *"It is deployed, with two and a half thousand tests behind it. No completed
> payment yet, and no writer trial. That is what we are raising for."*

**Sources.** 1,187 backend tests across 80 files and 1,415 frontend across 70,
collected 2026-10-12 — 2,602 together. Deployed 2026-09-15: Vercel, Railway,
real Supabase; register, login, `/auth/me`, create project, save draft, cast,
lint, recommendations and review all verified 200 against the deployed pair.

---

## What this video does not claim

Each is unmeasured or untrue today, and each is the kind of thing an investor
checks.

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

## Two limitations of the build, stated plainly

**Pronunciation is verified by transcription, not by ear.** `voice.py` reads
every line back with `onnx-asr` and reports what moved. That caught four
mispronounced proper nouns on the first run — Kokoro said the product's own
name as "baka padas", Devanagari as "dave agri", Khalti as "quality" and eSewa
as "esua" — and they are now respelled phonetically for the model. But
Whisper-base does not know those words either, so the check can confirm the
sentence is intelligible and cannot certify the four names sound right.
**Listen to beats 2, 6 and 7 before showing this to anyone.**

**The footage is demo mode.** Mock AI, local SQLite, placeholder storyboards.
This machine otherwise runs against production Supabase with live keys, so the
recorder refuses to start unless `/health` reports `demo: true` — the same gate
`responsive-audit.mjs` uses. Nothing in the recording touched production and no
AI call was billed. Everything shown is real product behaviour; none of it is
real user data.
