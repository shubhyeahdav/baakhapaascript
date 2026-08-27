# Script Corpus → System + Beginner Course — Plan

**Status: plan only. Nothing implemented.** Decide, then build.

Covers two questions: (1) how the 117 downloaded screenplays should feed the
product, and (2) what beginner course to build from them.

---

## 0. Corpus reality check (measured, not assumed)

`raw_scripts_TEMP/extracted_scripts/` — 117 files, median 139,443 chars:

| Tier | Count | What it is | Use |
|---|---|---|---|
| Strong | **77** | ≥40 sluglines, ≥80 character cues — clean screenplay format | Full pipeline |
| Usable | **5** | ≥15 sluglines, partial structure | Full pipeline, flag quality |
| Prose / scan | **35** | 8 Google-Drive scans (`ACFrOg*`), `3_Idiots` (a *published novelisation*, 493K chars — not a screenplay), and PDFs where extraction destroyed line structure (*Arrival*, *Anatomy of a Fall*, *Amelie*, *Booksmart*) | Re-extract or exclude |

**82 usable now (70%).** Enough to build the whole system. The 35 are a
Phase-4 clean-up, not a blocker.

---

## 1. The rule everything else follows

**No screenplay text ever enters the product.** Not in the database, not in
embeddings, not in prompts, not in the repo.

This isn't only legal caution — it's also correct engineering:

- **Legally:** you intend to sell this. Storing 117 copyrighted screenplays in
  a commercial product is infringement, and `raw_scripts_TEMP/knowledge_base.json`
  (19 MB of full text) is exactly that file. It must never be loaded or pushed.
- **Retrievally:** a 500K-character blob embeds to mush. Chunking doesn't save
  it — a random chunk of someone's dialogue can't answer "why does my scene
  feel flat?" You'd be embedding *expression* when you need *technique*.
- **Economically:** embedding 117 full scripts is pointless spend for worse
  results than 150 hand-shaped craft entries.

**What you extract instead: measurements and techniques.** Scene counts, act
positions and pacing ratios are *facts about* a work, not the work. A
technique written in your own words is your IP. Both are safe, and both are
more useful than the raw text.

---

## 2. Three data layers (not one)

The instinct is "put scripts in RAG." The right design is three separate
layers with different shapes, uses and costs.

### Layer 1 — Structural fingerprints (computed, free, factual)

One row per film, produced by a parser. No AI, no cost, no copyright surface.

```
film_fingerprints
  title_ref, genre_folder, tradition
  scene_count            e.g. 112
  median_scene_pages     e.g. 1.3
  longest_scene_pages    e.g. 6.1
  int_ext_ratio          e.g. 0.62
  day_night_ratio        e.g. 0.55
  character_count        e.g. 24
  speaking_top3_share    e.g. 0.71   (dialogue concentration)
  dialogue_action_ratio  e.g. 1.8
  act1_end_pct           e.g. 0.24   (inferred, see below)
  midpoint_pct           e.g. 0.51
  protagonist_absent_pct e.g. 0.08
  scene_length_curve     [ ... ]     (normalised, for shape comparison)
```

Act breaks are *inferred*, not guessed: look for the scene-length rhythm
change, cast-convergence points, and location churn. Mark them
`confidence: high|low` and let low-confidence rows be corrected by hand.

**Why this layer is the sleeper feature.** It unlocks *benchmarking*, which
nothing else on the market offers a Nepali creator:

> "Your act one runs to 42% of your runtime. Across the 14 dramas in the
> library the median is 27%, and none exceed 33%. Your inciting incident is
> probably late."

That is concrete, defensible, costs nothing per query, and is impossible
without a corpus. It's the single strongest argument for having downloaded
these scripts at all.

### Layer 2 — Craft techniques (Claude-assisted, one-time cost)

Grows the existing `baakhapaa-backend/knowledge_base.json` from **29 → ~150**
entries, same schema (`technique`, `problem`, `how_it_works`, `how_to_apply`,
`worked_example`, `warning_sign`, `craft_level`).

**Do not send full scripts to Claude.** For each film send:
- its Layer-1 fingerprint,
- the slugline list (functional labels, not expression),
- and 3–5 *short* excerpts you select as craft exemplars.

Ask for 2–3 transferable techniques per film, with **original** worked
examples rewritten into Kathmandu idiom. Output is your analysis, not their
text.

Cost: ~82 calls × 15–30K tokens ≈ **$5–15 one-time**. Trivial.

Quality gate — reject any entry where:
- the `worked_example` paraphrases the source's actual plot,
- the `technique` is a plot summary rather than a transferable move,
- the `problem` isn't a symptom a writer would actually recognise in their own draft.

### Layer 3 — Course content (authored, derived from 1 + 2)

Lessons anchored to Layer-2 techniques and benchmarked with Layer-1 data.
Covered in §4.

---

## 3. The craft linter — the piece that makes it a product

Every craft entry already carries a `warning_sign`: *"action lines contain
'thinks', 'realises', 'feels'"*, *"a character says something like 'you never
supported my dreams' out loud"*, *"your scene opens with a greeting"*.

**Those are machine-detectable.** A rules engine over the user's draft can
flag them with zero AI cost:

| Rule | Detection | Links to technique |
|---|---|---|
| Unfilmable interiority | regex `thinks\|realises\|remembers\|feels` in action | Externalise the internal |
| On-the-nose emotion | phrase list: "you never", "I feel like you", "my dreams" | Displacement argument |
| Greeting/goodbye scene edges | first/last line matches greeting set | Enter late, leave early |
| Over-long action block | paragraph > 4 lines | Action lines with a POV |
| Dialogue slab | speech > 5 lines without interruption | Unfinished sentence |
| Slugline malformed | not `INT./EXT. LOCATION - TIME` | Format basics |
| Act-one overrun | scene positions vs Layer-1 medians | Structure benchmark |

Value: **instant, free, deterministic, and explains itself** by linking each
flag to the technique that fixes it — including a worked example. It works on
free tier, which makes the course viable without Claude spend, and it's the
natural spine of the exercises.

This is the highest-leverage thing in this plan relative to effort.

---

## 4. The beginner course

**Audience:** someone who has never written a screenplay. Assume they don't
know what a slugline is.

**Promise:** *"In two tracks you'll write your first complete short film script."*

*(Amended 2026-08-26: the course was 14 lessons in four modules and is now 19
in two tracks. **The Pen** — the page, the scene, finishing — teaches the script
itself. **The Story** teaches what the page is for, and holds nine lessons drawn
from the analysed corpus's technique playbook. The split is deliberate: page
craft and story craft fail independently, and a writer whose pages are clean can
still have no story.)*

**Design principle:** every lesson ends with the user *writing something* that
the app can immediately respond to. A course that only presents information
will not be finished by anyone.

### Shape

```
Module → Lesson → Concept (2 min) → Corpus proof → Exercise → Feedback → Technique unlocked
```

- **Concept** — one idea, plain language, ~200 words.
- **Corpus proof** — a Layer-1 measurement, never a quotation.
  *"Across 77 scripts the median scene is 1.4 pages. Beginners average 4."*
- **Exercise** — small and concrete (half a page).
- **Feedback** — craft linter (free) or Claude critique (paid).
- **Unlock** — the relevant technique is added to the user's Patterns tab, so
  the course visibly grows their toolkit.

### Curriculum (19 lessons, two tracks)

The modules below are **The Pen**. **The Story** adds nine: want versus need, the
inciting incident as a choice, every win must cost something, three acts, the
midpoint flip, progress is the trap, pressure not villains, break it where it is
safest, and redefining what winning means.

**Module 1 — The page (lessons 1–3)**
1. What a screenplay is: page = minute; the four elements. *Exercise: format one slugline + one action line correctly.* Linter checks format.
2. Action lines: only what the camera sees. *Exercise: rewrite 3 interiority lines.* Linter flags "thinks/feels".
3. Dialogue on the page: cues, parentheticals, restraint. *Exercise: 6-line exchange.* Linter flags slabs.

**Module 2 — The scene (4–7)**
4. A scene is a change, not a conversation (charge test). *Exercise: name start/end charge of your idea.*
5. Enter late, leave early. *Exercise: cut a given scene's first and last third.*
6. Crossed purposes. *Exercise: two characters, incompatible wants, one page.*
7. Subtext: nobody says what they want. *Exercise: rewrite lesson 6 with the wants unstated.* Linter flags on-the-nose.

**Module 3 — Story (8–11)**
8. Want vs need. *Exercise: write both for your protagonist, in two sentences.*
9. Inciting incident — they must *choose*. *Exercise: rewrite a passive incident as a choice.*
10. Three acts and where the walls fall. *Exercise: 8-beat outline.* Benchmarked against Layer 1.
11. Antagonist as pressure, not villain (the Baakhapaa default). *Exercise: give the blocking character one scene where they're right.*

**Module 4 — Finish (12–14)**
12. Image and the object that carries emotion. *Exercise: choose your object, plant it.*
13. Write the draft. *Milestone: 8–12 pages.*
14. Rewrite: read aloud, cut 10%. *Exercise: submit before/after length.* Linter verifies the cut.

**Graduation:** a finished short + a benchmark report comparing its shape to
the corpus median for its genre.

### Tier fit (uses the split already built)

| | Free | Pro/Studio |
|---|---|---|
| All 19 lessons + exercises, both tracks | ✅ | ✅ |
| Craft linter feedback | ✅ (deterministic, $0) | ✅ |
| Claude critique of exercises | ❌ | ✅ |
| Benchmark report | first lesson only | ✅ full |
| Technique unlocks | ✅ | ✅ |

The course costs nothing to serve on free tier and is a genuine retention
hook — which is exactly what a freemium product needs.

---

## 5. Phases, effort, sequencing

| Phase | Work | Effort | Depends on |
|---|---|---|---|
| **P1** | Parser → Layer-1 fingerprints for the 82 usable scripts; `film_fingerprints` table | **M** (~1 day) | nothing |
| **P2** | Craft linter rules engine + link each rule to its technique | **M** | craft entries (exist) |
| **P3** | Layer-2 expansion 29 → ~150 entries via fingerprint-driven analysis | **M** + $5–15 | P1 |
| **P4** | Benchmark endpoint + UI ("your shape vs the corpus") | **M** | P1 |
| **P5** | Course: content authoring + lesson/progress model + UI | **L** (biggest) | P2, P3 |
| **P6** | Re-extract the 35 prose/scan files (OCR) or formally exclude | **S** | — |

**Recommended order: P1 → P2 → P3 → P4 → P5.**

P1 and P2 are cheap and unlock everything else. P2 alone visibly improves the
existing editor before any course exists. P5 is the largest single piece —
don't start it until P2/P3 prove the feedback loop actually helps.

---

## 6. Decisions needed from you

1. **Course audience** — Baakhapaa users as a product feature (assumed here),
   or personal learning only? Changes P5 entirely.
2. **Course language** — English, Nepali, or bilingual? Affects authoring cost
   most.
3. **Corpus growth** — freeze at 117, or keep adding? If growing, P1's parser
   should be a repeatable command rather than a one-off script.
4. **The 35 broken files** — worth OCR effort, or exclude? Note *3 Idiots* is a
   published novelisation and should be excluded from text processing
   regardless; it's also the largest copyright exposure in the folder.
5. **Benchmark visibility** — free teaser or paid-only? I'd make one benchmark
   free as the upgrade hook.

---

## 7. Explicitly not doing

- ❌ Embedding full scripts (illegal to ship, poor retrieval, wasted spend)
- ❌ Loading `raw_scripts_TEMP/knowledge_base.json` into the app
- ❌ Chunk-and-embed of screenplay text — a dialogue chunk is both copyrighted
  expression and semantically useless for craft questions
- ❌ Quoting or paraphrasing source dialogue in lessons or worked examples
- ❌ Committing `raw_scripts_TEMP/` (now gitignored — the outer repo pushes to
  a public remote, so this was a live exposure)
