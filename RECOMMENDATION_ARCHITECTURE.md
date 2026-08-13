# Recommendation Architecture — Discussion, Research & Decisions

**Scope:** how Baakhapaa recommends craft to a writer, why the original RAG
design underperformed, what the research showed, and where ML does and does not
earn its place. Focused on **structure recommendations**, with the scene- and
dialogue-level paths covered where they differ.

Companion docs: `SCRIPT_CORPUS_PLAN.md` (corpus strategy),
`GENERATION_ARCHITECTURE.md` (the 4-stage generation spec, still unimplemented),
`PROJECT_PLAN.md` §4 (build queue).

---

## 1. The question that started this

> *"I have 1000+ scripts but the RAG model isn't that effective — should I use
> NLP or ML to improve the recommendation system?"*

The framing contains a category error worth naming, because it misdirects the
fix: **RAG is NLP, and the embedding model already in use is ML.** `bge-small-en-v1.5`
is a trained transformer. So "switch from RAG to ML" is not a move — there is no
lever there to pull.

The real question is narrower and answerable: *what is the retrieval keyed on,
and is that key carrying any signal?*

---

## 2. Diagnosis — why retrieval underperformed

Two causes, established by reading the code rather than by intuition. Neither is
fixed by a larger or better embedding model.

### 2.1 Corpus size (n = 29)

`retrieve_relevant_patterns()` returns `top_k=3` from a 29-row library. **Every
query returns roughly 10% of the corpus.** At that size cosine similarity cannot
discriminate — the same handful of entries surface regardless of input, which is
exactly what `HANDOVER.md` recorded as "a few sources still dominate some
queries."

No model change fixes n=29. This is a corpus problem wearing a retrieval costume.

### 2.2 Query and document are different registers

This is the deeper fault and the cheaper fix.

`rag.pattern_to_text()` deliberately embeds each entry's **problem** — *"my
dialogue is on the nose"* — repeated once for weight. That is a good decision,
and the docstring explains why: writers arrive with a symptom, not a genre tag.

But `POST /scripts/recommendations` was querying with:

```python
theme = (req.scene_text or "")[-1500:]
```

Raw screenplay prose. So the system was asking *"which **diagnosis** is most
similar to this **chunk of dialogue**?"* Those occupy different regions of
embedding space. `bge-small` is trained for query→passage retrieval where both
sides are topical text; here what survives the comparison is **surface topic**,
not craft symptom. A scene set in a chiya pasal retrieves entries that happen to
mention tea and family.

The corpus was already problem-shaped. The query was draft-shaped. Aligning them
is retrieval fundamentals, and it required no new model.

---

## 3. Research performed

### 3.1 Codebase analysis

Read end-to-end: `rag.py`, `script_engine.py`, `scripts.py`, `linter.py`,
`screenplay.py`, plus `SCRIPT_CORPUS_PLAN.md` and `HANDOVER.md`.

Material findings:

- `screenplay.statistics()` already states it uses "the same vocabulary as the
  corpus fingerprints, so a script can be compared against library medians
  without a translation layer." **The measuring tape for the user's draft
  existed; the corpus-side ruler did not.** No `film_fingerprints` table, nothing
  computed from any script.
- Every `linter.py` rule was derived from a craft entry's `warning_sign`, so a
  flag already carries the exact `technique` that fixes it. This turned out to be
  the key to the retrieval fix (§5.2).
- `script_patterns` was **empty** in the local demo DB. Retrieval returned `[]`
  and looked broken while being correct. `load_knowledge_base.py` requires a
  **backend restart** — the mock DB caches rows at startup.
- The corpus is **not on this machine**. No `raw_scripts_TEMP/`, no
  `D:\AkxyaRup` (D: holds 0.2 GB). `CLAUDE.md`'s repo topology describes a
  different machine. All corpus tooling was therefore built to be runnable
  elsewhere and verified against a synthetic corpus with known properties.

### 3.2 Community research — what writers actually complain about

Reddit blocks Anthropic's crawler, so the Stage 32 screenwriting lounge was used
(real threads, not SEO listicles). Ranked by recurrence:

| # | Pain point | Evidence |
|---|---|---|
| 1 | **Feedback is vague and unactionable** | A paid Black List eval described as "far too vague," a "canned answer"; reader appeared to skip sections |
| 2 | **Notes contradict each other** | "genuine love and hate" that "messed me up for a long time and sent me in circles"; a Full Consider from one consultant, harsh rejection from another |
| 3 | **Cost** | Coverage $99–several hundred; contests $20–99 to enter, then *more* for notes |
| 4 | **Knows something is wrong, can't name or fix it** | Notes landed on "pieces I inherently knew were shortcomings, but didn't have a clear way to articulate what was missing or how to go about attacking it" |
| 5 | **Cannot self-diagnose** | "I can do it more successfully in other people's work, but not my own" |
| 6 | **Rule overload** | Forums are "50% obsessing over pseudo-rules" |
| 7 | **Prose habits leak in** | "give too much info", writing "too deep"; characters talk "at one another instead of to each other" |

**Sampling caveat.** Stage 32 skews toward writers who pay for coverage and enter
contests. Baakhapaa's stated audience — young Nepali storytellers, many
first-timers — likely cannot access paid coverage at all. That makes #3 and #5
*sharper* for them and #1 less relevant. Treat this as evidence about the shape
of screenwriter frustration, not as our users' priority order.

### 3.3 How the findings map to the product

Pain #4 is the strongest signal in the research. A writer who *feels* a problem
but cannot articulate or attack it is describing the `knowledge_base.json` schema
field for field:

| Writer's need | Schema field |
|---|---|
| name what's wrong | `problem` |
| understand why it's wrong | `how_it_works` |
| know how to attack it | `how_to_apply` |
| see what fixed looks like | `worked_example` |
| recognise it next time | `warning_sign` |

Pain #2 is the **strongest differentiator and it is not being marketed**.
`linter.py` already guarantees "the same draft always produces the same flags."
Against human coverage that sends writers in circles, **determinism is the
feature**.

---

## 4. Architecture — three layers, not one

The instinct is "put the 1000 scripts in RAG." That is wrong three ways: it is
copyright infringement in a commercial product, a 500K-character script embeds
to mush, and a random dialogue chunk cannot answer a craft question. The scripts
become a **reference distribution** instead.

| Layer | What it is | Cost | ML content |
|---|---|---|---|
| **1 — Measurement** | Parse the draft, compute shape metrics, compare against corpus percentiles | $0 | None. Statistics. |
| **2 — Diagnosis** | Deterministic rules from `warning_sign` fields | $0 | None. Regex + parse tree. |
| **3 — Retrieval** | Exact technique lookup, then semantic fallback | $0 (local embeddings) | Embedding model only |

Generation (Claude) sits above all three and is Pro-tier. Layers 1–3 are free,
which is what makes the free tier viable at zero marginal cost.

### 4.1 Where ML earns its place

| Approach | Verdict | Reasoning |
|---|---|---|
| Feature statistics + percentiles | **Do first** | Not ML. Highest value per hour. Unlocked by the corpus. |
| Fix retrieval's query side | **Do second** | Small change, large effect, no new model. |
| Act-break / structural segmentation | **Deferred** | The one genuine ML-shaped problem (sequence segmentation), but there are no labels. Heuristics first. |
| Train a "is this scene good" classifier | **No** | No labels, subjective target, 1000 is small for training. Worse: it would learn "resembles the corpus," and a Hollywood-skewed corpus is the wrong target for a Nepali storytelling platform. |
| Larger embedding model | **No** | Bottleneck is corpus size and query shape, not model capacity. |

### 4.2 Scale notes for a 1000-script corpus

- **Techniques saturate; measurements do not.** The 400th film teaches almost no
  new transferable move, but every film sharpens the distribution. So: run **all
  1000** through Layer 1 (free, factual), and a diversity-curated **150–250**
  through Layer 2 craft extraction.
- Layer-2 expansion at 1000 films costs roughly **$60–180**, not the $5–15
  `SCRIPT_CORPUS_PLAN.md` estimated for 117.
- Do not conflate 1000 scripts with 1000 corpus rows. Even fully expanded the
  craft library lands at ~150–300 entries, so `rag.py`'s brute-force cosine
  remains fine — its own "switch to the RPC past ~500" note is not triggered.

---

## 5. Structure recommendations specifically

### 5.1 How structure retrieval works today

Two paths, split by tier in `POST /scripts/generate-structure`:

**Free — `script_engine.rag_only_structure()`**
Five fixed beats, each querying the library for the problem *that beat* solves:

```python
BEAT_PROBLEMS = {
  "opening":    "my character introduction is static and described rather than shown in action",
  "inciting":   "the inciting incident feels passive, things just happen to the protagonist",
  "rising":     "the middle sags, complications do not compound, tension resets each scene",
  "crisis":     "my confrontation is on the nose and melodramatic...",
  "resolution": "the ending feels unearned and the emotional payoff does not land",
}
```

Each beat runs `retrieve_relevant_patterns(..., top_k=1)`. This is the correct
shape — guidance attached to a beat is *about* that beat, rather than three tips
applied off-by-one — and it works because the query is already a problem
statement, matching how the corpus is embedded.

**Paid — `script_engine.generate_structure()`**
Retrieves `top_k=3`, formats via `format_patterns_for_prompt()`, injects into the
Claude prompt as technique instructions with an explicit rule never to echo the
labels or reproduce examples.

Both share `_act_split()` — the 33/33/34 shape, with act three taking the
remainder so the three always sum to the requested runtime rather than drifting
by a tenth of a minute from independent rounding.

### 5.2 The change made — diagnosis before similarity

Because every linter rule derives from a craft entry's `warning_sign`, **a flag
already names the technique**. Running semantic search at that point is a lossy
way to look up something whose name you already have: it costs an embedding pass
and can return the wrong entry. Exact match cannot.

New order in `POST /scripts/recommendations`:

1. **Exact** — `rag.get_patterns_by_technique()` on the linter's flagged
   techniques, worst severity first. No embedding.
2. **Semantic** — fill remaining slots, querying with the flags' *message* text
   (symptom register, matching the corpus) rather than raw draft prose.
3. **Fallback** — no flags at all → last 1500 chars, the original behaviour.

The response now carries `diagnosed[]` and a `source` field (`"diagnosis"` or
`"similarity"`), so the UI can state *why* — "because line 7 states the emotion
out loud" — instead of presenting three tips with no reason. That is the direct
answer to pains #1 and #4.

**Measured, on a deliberately melodramatic draft:**

```
source: diagnosis
  line 3  unfilmable_interiority -> Convert inner state into something the camera can see
  line 7  on_the_nose            -> Let them fight about the small wrong thing
  line 6  directed_emotion       -> Put the feeling into a physical thing that changes hands
```

Every returned pattern traces to a specific line. A clean draft correctly falls
back to `source: similarity`.

### 5.3 The structural claim — retrieval is the wrong tool before a draft

**This is the central architectural conclusion for structure.**

Before a draft exists, the entire query is genre + tone — two tokens of signal.
Nothing can make that specific, so structure guidance at generation time is
*necessarily* generic. That is not a bug in the retrieval; it is the information
content of the input.

After a draft exists there are thousands of words. But the right move is **not**
to embed them. It is to *measure* them:

```
parse  ->  measure  ->  diagnose  ->  retrieve on the named symptom
```

Retrieval answers *"what technique might help?"*. Only measurement against a
distribution can answer *"is this actually unusual?"* — because that is a claim
about a population, not about a text. Structure is precisely the domain where
the second question matters:

> "Your act one runs to 42% of runtime. Across 63 dramas in the library the
> median is 27% and the 90th percentile is 33%."

Defensible, concrete, $0 per query, and impossible without the corpus.

**Consequence:** structure recommendations should migrate from *retrieve at
generation time* (weak signal, generic output) to *measure at draft time* (strong
signal, specific output). Retrieval stays for the scene- and dialogue-level
problems, where the linter gives it a real key.

### 5.4 Why act breaks are deliberately not inferred

`SCRIPT_CORPUS_PLAN.md` proposed inferring act boundaries from scene-length
rhythm and cast convergence with a confidence flag. **This was not implemented,
on purpose.**

Inferring act breaks without labelled data is guesswork, and a confident-looking
wrong boundary is worse than no boundary — it would produce authoritative advice
about a structure the script does not have. `scene_length_curve` (mean scene
length per decile of runtime, normalised) lets shape be compared across a 95-page
short and a 140-page feature without claiming to know where act one ends.

Revisit when there is a labelled set to validate against. This is the one place
where a trained sequence model would be the right tool.

---

## 6. What was built

| Module | Role |
|---|---|
| `fingerprint.py` | Measures one screenplay. Builds on `screenplay.statistics()` rather than forking it — the shared vocabulary is the whole design; the moment the two sides compute "scene length" differently, every comparison silently lies. |
| `benchmark.py` | Fingerprints → percentile verdicts, genre-conditioned when the cohort supports it |
| `build_fingerprints.py` | CLI over a corpus directory |
| `POST /scripts/benchmark` | Endpoint, all tiers, gated on draft size |

```bash
python build_fingerprints.py path/to/extracted_scripts -o corpus_fingerprints.json
```

Organise as `corpus/<genre>/film.txt` to unlock genre cohorts. **Output contains
no screenplay text** — only measurements — so it is safe to commit while the
source directory must never be.

### 6.1 Design rules encoded in `benchmark.py`

- **Percentile, not pass/fail.** "Longer than 94% of the corpus" invites a
  decision; "too long" picks a fight the writer may win.
- **Silence is a result.** Only the top/bottom 10% produce a note. A report that
  flags everything gets switched off and teaches nothing about which choice is
  actually the outlier.
- **Never compare a short to a feature.** Only length-independent ratios are
  benchmarked (`COMPARABLE_METRICS`); raw counts are excluded.
- **Say n.** Cohorts below `MIN_COHORT = 12` are suppressed. A percentile from
  six films is noise wearing a lab coat.

### 6.2 Gating — "after first draft"

Gate on what the parser can see, never on the writer declaring themselves
finished — nobody clicks "I'm done":

| Threshold | Value | Purpose |
|---|---|---|
| `BENCHMARK_MIN_SCENES` | 8 | endpoint opens |
| `BENCHMARK_MIN_DIALOGUE_LINES` | 25 | endpoint opens |
| `MIN_SCENES_FOR_VALID_FINGERPRINT` | 15 | corpus row counts toward a distribution |
| `MIN_DIALOGUE_FOR_VALID_FINGERPRINT` | 40 | corpus row counts toward a distribution |

Corpus thresholds are stricter than draft thresholds by design: a thin *draft*
should still get measured and shown progress; a thin *corpus row* is usually a
scan or novelisation and would poison the distribution.

Note the product split this creates, which matches the tools' actual
capabilities: the **linter runs during writing** (`linter.py` works on partial
drafts by design), the **benchmark runs after a draft**. Free tier keeps a live
feature; the after-draft report becomes an event.

### 6.3 A bug the tests caught

The first `_percentile_of()` counted ties as "at or below." Several metrics have
a mass point — `lead_presence_pct` is 1.0 for any script whose protagonist is in
every scene, which is most of them. A draft sitting exactly on that mass point
scored the **100th percentile and was flagged as an outlier for being completely
ordinary**.

Fixed with midrank percentile (ties count as half), which puts such a draft at
0.5 where it belongs. Regression test:
`test_value_equal_to_corpus_is_never_an_outlier`.

Found by running the pipeline against a synthetic corpus with known properties,
not by reading the code — worth noting as a method.

---

## 7. Open items

| Item | Status |
|---|---|
| Run `build_fingerprints.py` on the real 1000-script corpus | **Blocked** — corpus is on another machine |
| Layer-2 craft expansion (29 → ~150–250 entries) | Not started; ~$60–180 |
| Act-break inference | Deliberately deferred pending labelled data |
| `rag.py` retrieval quality has no automated test | Open — embedding model excluded from the suite, so corpus-quality claims are manual one-offs that no test re-checks |
| Group `/scripts/recommendations` output by `craft_level` | Done for `/scripts/lint`; not yet for recommendations |
| Frontend has zero tests | Open — `test:ci` passes vacuously via `--passWithNoTests` |

---

## 8. Summary of the argument

1. The retrieval was not underperforming because of its algorithm. It was
   underperforming because of **what it retrieved over** (29 entries) and **what
   it was keyed on** (prose against diagnoses).
2. 1000 scripts cannot enter the corpus as text — legally or usefully. They
   enter as a **distribution**.
3. The "only after first draft" instinct is not a limitation. It is what makes
   the problem well-posed: it replaces a two-token query with a measurable
   artefact.
4. ML earns its place in exactly one unbuilt place — structural segmentation —
   and even there, only once labels exist.
5. The moat is not generation. Anyone can generate. **Only Baakhapaa has
   measured this corpus.**
