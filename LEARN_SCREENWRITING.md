# Learning Screenwriting — A Month With Your Own Library

Built around the 117 screenplays in `raw_scripts_TEMP/script/` (14 genre
folders) and their extracted text in `raw_scripts_TEMP/extracted_scripts/`.
Every reading assignment below is a script you already have.

---

## ⚠️ Read this first — two different `knowledge_base.json` files

There are two files with the same name and they must never be swapped:

| File | Contains | Safe to ship? |
|---|---|---|
| `raw_scripts_TEMP/knowledge_base.json` (19 MB) | **Full copyrighted screenplay text** (`content` field — 493,115 characters of *3 Idiots* alone) | **NO — personal study only** |
| `baakhapaa-backend/knowledge_base.json` (~60 KB) | Original structural analysis, no source text | Yes — this is the app's RAG corpus |

Reading these scripts to learn is exactly what screenwriters do and is fine.
But **never** load the 19 MB file into the app: it would put copyrighted text
into a product you intend to sell, and it would wreck retrieval anyway
(embedding a 500K-character blob returns noise). Keep `raw_scripts_TEMP/`
out of the repo — verify it stays gitignored.

---

## Part 1 — The only reading method that works

Reading a screenplay passively teaches almost nothing. You already know what
happens in these films; the value is in **how the page produces the effect**.

### The two-pass method

**Pass 1 — read it like an audience.** Once, fast, no notes. Mark only where
you felt something: bored, tense, moved, surprised. A tick in the margin.
That's it. You are collecting *symptoms*.

**Pass 2 — autopsy the marks.** Go back to each mark and answer three
questions in writing:

1. **What changed here?** (a relationship, what someone knows, the power in
   the room)
2. **What did the writer withhold?** (the unsaid thing, the delayed reveal,
   the scene they refused to show you)
3. **How few words did it take?** Count the lines. You will be shocked.

Pass 2 on three marks is worth more than reading five scripts straight
through.

### Reverse-engineer the beat sheet
For one script per week, produce a one-line-per-scene list: `scene number ·
location · what changes`. A 110-page film gives ~50 lines. When you're done
you can see the whole architecture on two pages — where act two turns, how
long the setup ran, where the writer let the audience breathe. **This single
exercise teaches more structure than any book.**

### Time yourself against the page
Screenplay convention: **one page ≈ one minute**. Open any script in your
folder and check where the inciting incident falls. In `whiplash-2014` and
`get-out-2017` you'll find it lands far earlier than you'd guess. Note the
page number every time. You are calibrating an internal clock.

---

## Part 2 — The craft ladder, mapped to your shelf

Learn in this order. Each rung is useless without the one below it.

### Rung 1 — Structure (what happens, in what order)
Best teachers in your folder:
- `underdog/rocky-1976` — the cleanest three-act skeleton ever written. Read
  it first, always.
- `twist/parasite-2019` — a midpoint that flips the genre register
  mid-sentence. Watch where comedy becomes dread.
- `drama/whiplash-2014` — relentless escalation; almost no fat.
- `ensemble/little-miss-sunshine-2006` — how to run six arcs and converge them.

### Rung 2 — The scene (the unit you'll actually write)
- `drama/marriage-story-2019` — the argument scene, and how long a writer can
  hold one room.
- `hindi/the-lunchbox-2013` — scenes built almost entirely from absence and
  routine.
- `twist/knives-out-2019` — every scene is an interrogation with a hidden
  objective.

**The test for any scene you write:** name the emotional charge in one word at
the start and one word at the end. If they match, the scene is decorative.

### Rung 3 — Dialogue and subtext (what they don't say)
- `hindi/Masaan` — restraint, silence, and class pressure carried in ordinary
  exchanges. The closest model to Baakhapaa's register in your whole library.
- `japanese/The-Shoplifters` — a family that never states its bond, so you feel
  it constantly.
- `other/a-separation-2011` — everybody is telling a defensible partial truth.
  A masterclass in conflicting legitimate wants.
- `drama/good-will-hunting-1997` — for contrast: dialogue that is more overt.
  Notice what it gains and what it costs.

### Rung 4 — Character (why we care)
- `recent/past-lives-2023` — want vs need, held across decades.
- `drama/moonlight-2016` — character revealed in three time-separated pieces.
- `hindi/Dangal` — a blocking father who is never a villain. Study this one for
  Baakhapaa: the institutional-pressure antagonist done properly.

### Rung 5 — Image and economy (what the camera does instead of dialogue)
- `other/Aftersun-Read-The-Screenplay` — meaning almost entirely in image and
  omission. Read it late; it will frustrate you early.
- `drama/nomadland-2020` — sparse action lines that still carry a voice.
- `hindi/T_U_M_B_B_A_D` — image-driven mythmaking, and a strong South Asian
  visual grammar.
- `japanese/Rashomon+(Continuity+Script)` — a continuity script; read it to see
  how differently a shooting document reads from a spec script.

---

## Part 3 — The month plan

**Commitment: 60–90 minutes a day, six days a week.** One rest day. If you
miss a day, skip it — never double up, that's how people quit.

Each week: **2 scripts read · 5 daily exercises · 1 weekend deliverable.**
By day 28 you will have written a complete short film script.

> Set up first: a folder `writing/` with `beatsheets/`, `exercises/`, and
> `drafts/`. Everything you write goes in it, dated. You will re-read this in
> month three and the progress is the motivation.

---

### WEEK 1 — Structure and the shape of a story
*Read: `underdog/rocky-1976`, then `drama/whiplash-2014`*

| Day | Work (60–90 min) |
|---|---|
| 1 | Read *Rocky* Pass 1. No notes. Mark feelings only. |
| 2 | *Rocky* Pass 2 on your three strongest marks. Write the three answers for each. |
| 3 | **Reverse beat-sheet *Rocky*** — one line per scene, whole film. Two pages. |
| 4 | On your beat sheet, mark: inciting incident, midpoint, low point, climax. Note the **page number** of each. Compare to the 25%/50%/75% rule of thumb. |
| 5 | Read *Whiplash* Pass 1 + beat-sheet act one only. Compare its inciting-incident page to *Rocky*'s. |
| 6 | **Deliverable: a beat sheet for your own short** — 8–12 beats, one line each. Genre and world are yours. No prose yet. |
| 7 | Rest. |

**What you're learning:** stories have load-bearing walls. You can feel them
now and place them on purpose.

---

### WEEK 2 — The scene as a unit of change
*Read: `drama/marriage-story-2019`, then `hindi/the-lunchbox-2013`*

| Day | Work |
|---|---|
| 8 | Read the *Marriage Story* argument sequence. Track who holds power line by line — literally annotate "A" or "B" down the margin. |
| 9 | Read three *Lunchbox* scenes. For each: what does the writer refuse to show? |
| 10 | **Charge exercise:** take five scenes from your week-1 beat sheet and label start-charge → end-charge in one word each. Fix any that don't move. |
| 11 | Write ONE scene from your beat sheet (2 pages max). Rule: enter late, leave early. No greetings, no goodbyes. |
| 12 | Rewrite that same scene with a **third person present who must not learn the truth**. Notice what it does to the dialogue. |
| 13 | **Deliverable: three scenes** from your beat sheet, 2 pages each. Each must have a clean turn. |
| 14 | Rest. |

**What you're learning:** a scene is a transaction, not a conversation.

---

### WEEK 3 — Dialogue, subtext, and your own voice
*Read: `hindi/Masaan`, then `other/a-separation-2011`*

| Day | Work |
|---|---|
| 15 | Read *Masaan*. Pass 1. This is your register — pay attention to how much is carried by what is NOT said. |
| 16 | *Masaan* Pass 2. Find three exchanges where a character answers a question that wasn't asked. Copy the *structure* of the exchange (not the words) into your notes. |
| 17 | **On-the-nose surgery:** take your week-2 scenes and delete every line where a character states a feeling. Replace with an action or a deflection. The scene should survive. |
| 18 | Read *A Separation*'s central dispute. Write out each character's legitimate position in one sentence. Neither may be wrong. |
| 19 | **Code-switch exercise (Baakhapaa-specific):** write a 1-page scene where a character speaks English while performing and Nepali when the mask drops. Exactly one switch. Make it land on the truest line. |
| 20 | **Deliverable: rewrite all three week-2 scenes** with subtext. Nobody states their want. |
| 21 | Rest. |

**What you're learning:** dialogue is what people do to each other with words,
not what they inform each other of.

---

### WEEK 4 — Image, restraint, and a finished draft
*Read: `other/Aftersun-Read-The-Screenplay`, skim `hindi/T_U_M_B_B_A_D`*

| Day | Work |
|---|---|
| 22 | Read *Aftersun*. Count how often emotion arrives through an object or a frame rather than a line. |
| 23 | **Externalise:** go through your draft and delete every action line containing "thinks", "feels", "realises". Replace with a physical action. |
| 24 | Choose ONE object to carry your story's emotion. Plant it early doing nothing. Let it move at the climax. |
| 25 | Write the remaining scenes. Rough is fine. Finish the draft. |
| 26 | **Read your whole draft aloud.** Every line you stumble on is a bad line. Mark, don't fix. |
| 27 | Fix the marks. Cut 10% of the total length — this is not optional and it will be the single biggest improvement. |
| 28 | **Deliverable: complete short script, 8–12 pages.** Then write half a page on what you'd do differently. |

**What you're learning:** finishing. The gap between people who write and
people who talk about writing is exactly one finished draft.

---

## Part 4 — Self-assessment (use before showing anyone)

Run this on any draft. Every "no" is a specific, fixable defect.

- [ ] Can I state my protagonist's **want** (external, concrete) and **need**
      (relational, denied) in two different sentences?
- [ ] Does every scene **change** something? (charge test)
- [ ] Does my inciting incident happen because the protagonist **chose**
      something, or because something happened *to* them?
- [ ] Is my antagonist **right** at least once?
- [ ] Have I deleted every stage direction that can't be photographed?
- [ ] Does any character say the theme out loud? (delete it)
- [ ] Read aloud: where did I stumble?
- [ ] Is it 10% shorter than the first draft?

---

## Part 5 — Using Baakhapaa itself as your practice tool

The app's **Patterns** tab is a craft index of 29 techniques keyed to the
*problem* they solve. Its intended use while learning:

1. Paste or write your scene in the editor.
2. Hit the chip that names your symptom — *Feels flat*, *On the nose*,
   *Thin character*, *Melodramatic*.
3. Each result gives you **Do this** (steps) and **On the page** (a worked
   example in Kathmandu idiom).
4. Apply exactly one technique. Rewrite. Compare.

That loop — symptom → named technique → targeted rewrite — is the fastest
improvement mechanism in this whole document, because it stops you rewriting
blindly.

**Feed the library as you learn.** Every time you finish a script from
`raw_scripts_TEMP/` and find a technique worth keeping, add it to
`baakhapaa-backend/knowledge_base.json` using the entry template in the
`script-structure` skill, then run:

```
cd baakhapaa-backend && ./venv/Scripts/python load_knowledge_base.py
```

Write it as a **transferable technique**, never a plot summary, and write your
own worked example. Your month of study compounds into the product.

---

## Appendix — What each folder is best for

| Folder | Read it for |
|---|---|
| `underdog/` | Clean three-act architecture; earned endings (*Rocky*, *Creed*, *Moneyball*) |
| `twist/` | Information control — what the audience knows and when (*Parasite*, *Memento*, *Se7en*) |
| `drama/` | Scene craft and character interiority (*Whiplash*, *Marriage Story*, *Moonlight*) |
| `hindi/` | **Your closest register** — family pressure, class, restraint (*Masaan*, *Lunchbox*, *Dangal*, *Tumbbad*) |
| `japanese/` | Silence, routine, accumulated feeling (*Shoplifters*, *Spirited Away*, *Rashomon*) |
| `korean/` | Tonal shifts and moral catastrophe (*Oldboy*, *Memories of Murder*) |
| `other/` | World cinema economy (*A Separation*, *City of God*, *Roma*, *Aftersun*) |
| `comedy/` | Escalation mechanics and comic structure (*Groundhog Day*, *Get Out*) |
| `horror/` | Dread through withholding and pacing (*Hereditary*, *A Quiet Place*) |
| `scifi/` | Concept discipline — one rule, followed honestly (*Arrival*, *Ex Machina*, *Her*) |
| `ensemble/` | Multi-arc convergence (*Little Miss Sunshine*, *Magnolia*, *Pulp Fiction*) |
| `a/`, `e/` | Action architecture and set-piece construction (*Die Hard*, *Mad Max*, *Heat*) |
| `recent/` | Contemporary voice and what's selling now (*Past Lives*, *Anatomy of a Fall*) |

**If you only read five:** *Rocky* (structure) → *Whiplash* (escalation) →
*Masaan* (your register) → *A Separation* (conflicting truths) → *Aftersun*
(image and omission).

---

## Month two and beyond

- **Repeat the cycle** with a new genre folder and a longer form (20–30 pages).
- **Type out a scene you love, word for word.** Sounds pointless; it isn't —
  it puts rhythm in your hands rather than your head.
- **Beat-sheet one film a week, forever.** It's 45 minutes and it never stops
  paying.
- **Find one reader** who will tell you where they got bored. Not whether they
  liked it — *where they got bored*. That's the only note that matters early.
