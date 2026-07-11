# Script-Generation System — Architecture Spec

**Stack:** FastAPI · Supabase (Postgres + pgvector + Edge Functions) · Claude API.
No fine-tuning, no external ML providers, no new infrastructure.
**Embeddings:** Claude has no embedding endpoint, so all vectors come from
Supabase's built-in Edge Function AI (`Supabase.ai` Session, model `gte-small`,
**384 dimensions**) — part of the Supabase platform, zero extra vendors, free.

---

## PART 1 — Generation Pipeline

Four chained Claude calls behind one endpoint. Every intermediate artifact is
persisted for debugging and product analytics.

```
POST /generate {topic, platform, tone, length, genre?, tradition_pref?}
  └─ retrieve_patterns()  ── RAG (Stage 1 only)
  └─ Stage 1  Scaffold    ── beat-sheet JSON
  └─ Stage 2  Expansion   ── full script + beat map
  └─ Stage 3  Critic      ── scores JSON
  └─ Stage 4  Revision    ── only if critic fails
  └─ log to `generations` table, return script
```

### Per-stage contract

| Stage | Model | Temp | max_tokens | Output |
|---|---|---|---|---|
| 1 Scaffold | claude-sonnet-5 | 0.8 | 1 500 | beat-sheet JSON only |
| 2 Expansion | claude-sonnet-5 | 0.7 | 3 000 shorts / 5 000 scene+webseries | script + `<beat_map>` |
| 3 Critic | claude-sonnet-5 | 0.0 | 1 200 | critique JSON |
| 4 Revision (conditional) | claude-sonnet-5 | 0.4 | same as Stage 2 | final script |

JSON stages (1, 3) use tool-use/structured output so parsing can't drift; on a
parse failure, retry **once** with the parser error appended, then 422.
Estimated cost/generation: 15–25k tokens ≈ **$0.05–0.10** — fine margins for a
paid tool.

### Stage 1 — Scaffold (JSON only, no prose)

Common envelope:

```json
{
  "platform": "shorts | scene | webseries",
  "topic": "...", "tone": "...", "target_length": "...",
  "beats": [ ... platform-specific ... ]
}
```

**Shorts (15–90 s)** — each beat: `beat_name` (hook / escalation / core_payoff
/ twist? / soft_cta), `start_sec`, `end_sec`, `retention_function`
(stop_scroll / open_loop / payoff / rewatch_trigger / share_trigger),
`content_summary`. The hook beat additionally carries `hook_type` ∈
{pattern_interrupt, bold_claim, question, visual_shock, relatable_pain,
curiosity_gap}.

**Scene/movie** — beats: setup, inciting_incident, rising_tension, crisis,
resolution. Each: `dramatic_question`, `what_changes`, `subtext_guidance`,
`approximate_screen_time`.

**Web series** — scene beats **plus** top-level `episode_hook_type` ∈
{revelation, imminent_danger, impossible_decision, unexpected_arrival,
betrayal, unanswered_question} and `season_arc_position` ∈
{setup, midpoint, finale}. The finale position relaxes the cliffhanger
requirement; setup/midpoint scaffolds must end on the stated hook mechanism.

RAG context (see Part 3.4) is injected **only here**.

### Stage 2 — Expansion

Input: scaffold JSON. Hard rules in the prompt: follow the scaffold **exactly**
— no beats added, removed, or reordered. Style by platform:

- **Shorts:** punchy fragmented voiceover lines + `[visual: …]` directions,
  timed to each beat's `start_sec–end_sec`.
- **Scene/webseries:** standard screenplay format (sluglines, action, dialogue)
  with dialogue written to the scaffold's `subtext_guidance` (characters say
  less than they mean).

Output ends with a strippable block the API removes before returning to users:

```
<beat_map>
{"hook": [1,4], "escalation": [5,11], ...}   // beat_name → [start_line, end_line]
</beat_map>
```

### Stage 3 — Critic

Input: scaffold + draft + beat map. Temperature 0. Output:

```json
{
  "beats": [
    {"beat_name": "hook",
     "fidelity": 4, "efficiency": 3, "platform_fit": 5,
     "fix": "Efficiency: lines 2–3 restate the claim; cut line 3 and land the number in line 2."}
  ],
  "overall_score": 84,
  "pass_threshold_met": true
}
```

- Each beat scored **1–5** on fidelity (matches scaffold intent), efficiency
  (no wasted lines for the duration), platform_fit (format/retention/dramatic
  conventions).
- `fix` is required for any beat with any dimension **< 4**, and must be one
  specific actionable edit (line-referenced), not general advice.
- `overall_score = round(100 × mean(all dimension scores) / 5)`.
- `pass_threshold_met = overall_score ≥ 80 AND min(any score) ≥ 3`.

The critic's rubric is static prompt text — **no RAG here** (see 3.4).

### Stage 4 — Revision (conditional)

Runs only when `pass_threshold_met == false`. Input: draft + critique JSON.
Prompt rules: apply each `fix` exactly as written; beats whose scores are all
≥ 4 must be reproduced verbatim. **One pass, no loop** — the critic is not
re-run for gating (optionally re-run once for logging). A revision loop is the
classic cost/latency trap and a solo maintainer doesn't need it: one targeted
pass captures ~all of the gain.

### Orchestration (FastAPI)

```python
async def generate_script(req: GenerateRequest) -> GenerateResult:
    ctx      = await retrieve_patterns(req)                     # Part 3.3
    scaffold = await stage_scaffold(req, ctx)                   # Claude #1
    draft, beat_map = await stage_expand(scaffold)              # Claude #2
    critique = await stage_critic(scaffold, draft, beat_map)    # Claude #3
    final = draft if critique.pass_threshold_met \
            else await stage_revise(draft, critique)            # Claude #4
    gen_id = await log_generation(req, ctx, scaffold, draft, critique, final)
    return GenerateResult(id=gen_id, script=strip_beat_map(final),
                          scaffold=scaffold, critique=critique)
```

Audit table:

```sql
create table generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  platform text not null,
  request jsonb not null,
  retrieved_ids uuid[] not null,       -- which patterns grounded it
  scaffold jsonb not null,
  draft text not null,
  critique jsonb not null,
  final text not null,
  revised boolean not null,
  created_at timestamptz default now()
);
```

---

## PART 2 — RAG Data Layer

~100–120 sources at launch (movies across Hollywood / Bollywood / Tamil /
Malayalam / Japanese / Korean / other international; web series weighted
toward TVF-style Indian; shorts grouped by content category). Each source is
reduced — by a separate one-at-a-time analysis prompt — to **structural
pattern data only**. No copyrighted script or dialogue text is ever stored;
the loader enforces this mechanically (Part 3.5).

Analysis JSON (one file per source):

```json
{
  "source_type": "movie | webseries | short",
  "title_ref": "Parasite (2019)",
  "genre": "thriller",
  "origin_tradition": "Korean",
  "episode_hook_type": null,
  "season_arc_position": null,
  "beats": [
    {"beat_name": "inciting_incident",
     "approximate_position": "12%",
     "function": "collides two class worlds through a job referral",
     "technique_used": "opportunity disguised as favor; the audience knows more than the family",
     "one_line_takeaway": "let the inciting incident be something the protagonist *wants*, so complicity drives tension"}
  ]
}
```

`source_type → platform` is a fixed 1:1 mapping (movie→scene, short→shorts,
webseries→webseries), so platform is **not stored separately** — it's derived
in code. One less column to keep consistent.

---

## PART 3 — System Design (decided before any data loads)

### 3.1 Supabase schema — one unified pair of tables

**Decision: one unified `pattern_sources` table with a `source_type`
discriminator, plus one `pattern_beats` child table.** Not separate tables per
source_type.

Why: at 100–120 rows (≈800–1 500 beats) *any* layout is fast; the deciding
factors are query simplicity and schema-drift risk. Separate per-type tables
mean three copies of every index, three RPCs, and UNION queries the moment you
want cross-platform inspiration (which the retrieval design explicitly uses).
A discriminator column + one partial index each costs nothing and scales past
500 sources (~5 000 beats) without change. Two *granularity* tables (source vs
beat) exist because they embed different text and serve different retrieval
roles — that's a real modeling difference; source_type is not.

```sql
create extension if not exists vector;

create table pattern_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('movie','webseries','short')),
  title_ref text not null unique,          -- maintainer label, e.g. "Parasite (2019)"
  genre text not null,                     -- validated against a code-side vocab (see 3.6)
  origin_tradition text not null,
  episode_hook_type text,                  -- webseries only
  season_arc_position text
    check (season_arc_position is null
           or season_arc_position in ('setup','midpoint','finale')),
  beats jsonb not null,                    -- the full beats array, verbatim
  summary_text text not null,              -- exactly what was embedded (enables re-embeds)
  embedding vector(384) not null,          -- gte-small via Supabase Edge Function
  embedding_model text not null default 'gte-small',
  created_at timestamptz default now()
);

create table pattern_beats (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references pattern_sources(id) on delete cascade,
  source_type text not null,               -- denormalized for filter-then-search
  genre text not null,
  origin_tradition text not null,
  beat_name text not null,
  approximate_position text,
  function text not null,
  technique_used text not null,
  one_line_takeaway text not null,
  embed_text text not null,
  embedding vector(384) not null,
  created_at timestamptz default now()
);

-- Vector indexes. At this scale exact scan is already instant; HNSW is created
-- up front so nothing changes at 500+ sources.
create index on pattern_sources using hnsw (embedding vector_cosine_ops);
create index on pattern_beats   using hnsw (embedding vector_cosine_ops);

-- Metadata filters used by every retrieval call
create index on pattern_sources (source_type, genre);
create index on pattern_beats   (source_type, beat_name);
```

### 3.2 Embedding strategy

**Both levels, different jobs:**

- **Source-level embedding** (one per work) grounds the *shape* of a scaffold:
  ```
  {source_type} | {genre} | {origin_tradition}
  [| hook: {episode_hook_type} | arc: {season_arc_position}]
  beats: {beat_name}: {function} ({technique_used}); …   -- all beats, in order
  ```
- **Beat-level embedding** (one per beat) grounds specific *techniques*
  (a hook mechanism, an inciting-incident move):
  ```
  {source_type} {genre} {origin_tradition} | {beat_name} @ {approximate_position}
  | function: {function} | technique: {technique_used} | takeaway: {one_line_takeaway}
  ```

`title_ref` is **never** embedded (retrieval should match structure, not fame),
and the composed string is persisted in `summary_text`/`embed_text` so a future
model swap is a mechanical re-embed replay, not a re-analysis.

**Filter-then-search, hard.** pgvector evaluates `WHERE` before the vector
`ORDER BY`, so metadata filters (source_type, genre, tradition) shrink the
candidate set to exactly the eligible rows and similarity ranks only those.
Search-then-filter is strictly worse here: with ~40 rows per platform, a top-k
over the whole table then filtered can return fewer than k usable rows and
spends its similarity budget on ineligible platforms. Cross-platform
inspiration is *deliberate*, so it gets its own filtered pool (3.3) rather
than leaking in through soft filtering.

### 3.3 Retrieval logic — concrete

**Per generation call: 6 source patterns + 6 beat techniques.**
(≈1.2–1.8k injected tokens — meaningful grounding, no bloat.)

- **Pool A — exact platform:** top **4** `pattern_sources` where
  `source_type = map(platform)`, ranked by boosted score.
- **Pool B — cross-platform:** top **2** where `source_type != map(platform)`
  (a K-drama slow-burn can inform a web series hook; a movie crisis can inform
  a short's twist).
- **Beat pool:** top **6** `pattern_beats` filtered to the beat names that
  matter for the platform (shorts → hook, twist; scene/webseries →
  inciting_incident, crisis; webseries additionally episode-hook carriers).

**Weighting exact metadata vs mismatched similarity** — one scoring formula,
applied inside each pool via SQL:

```
score = cosine_sim
      + 0.15 · (source_type matches target)      -- pool A only, by construction
      + 0.10 · (origin_tradition = preference)
      + 0.05 · (genre = requested genre)
```

The +0.15 platform term means a platform-matched source beats a mismatched one
unless the mismatch is ≥ 0.15 closer in cosine similarity — a big real gap.
Pooling A/B separately guarantees minimum platform-matched representation no
matter what.

```sql
create or replace function match_patterns(
  q vector(384), want_type text, want_genre text, want_tradition text,
  same_platform boolean, k int
) returns table (id uuid, title_ref text, beats jsonb, score float)
language sql stable as $$
  select s.id, s.title_ref, s.beats,
         (1 - (s.embedding <=> q))
       + 0.10 * (s.origin_tradition = want_tradition)::int
       + 0.05 * (s.genre = want_genre)::int as score
  from pattern_sources s
  where (s.source_type = want_type) = same_platform
  order by score desc
  limit k * 2          -- overfetch ×2 for dedupe (below)
$$;
```

**Redundancy control:** overfetch ×2, then greedy dedupe in Python — walk
candidates in score order, **skip any candidate whose embedding cosine
similarity to an already-selected item exceeds 0.90**, and cap at **2 sources
per (origin_tradition, genre) pair**; stop at k. O(k²) on ≤12 items — no MMR
machinery needed.

```python
async def retrieve_patterns(req) -> RagContext:
    qvec  = await embed(f"{req.platform} {req.genre or ''} {req.tone} {req.topic}")
    a     = await rpc_match_patterns(qvec, map_type(req.platform), req.genre,
                                     req.tradition_pref, same_platform=True,  k=4)
    b     = await rpc_match_patterns(qvec, map_type(req.platform), req.genre,
                                     req.tradition_pref, same_platform=False, k=2)
    beats = await rpc_match_beats(qvec, beat_names_for(req.platform), k=6)
    return RagContext(sources=dedupe(a, k=4) + dedupe(b, k=2),
                      beats=dedupe(beats, k=6))
```

Injected into Stage 1 as compact bullets (`title_ref` shown to the model as an
opaque label only; instructions say "ground structure in these patterns; never
reference the sources in output").

### 3.4 Pipeline injection points

**Stage 1 only.** Rationale per stage:

- **Stage 1 (scaffold): yes.** Structure is decided here; this is the only
  place pattern grounding changes the outcome.
- **Stage 2 (expansion): no.** Its one job is fidelity to the scaffold; extra
  patterns invite beat drift — the exact failure mode Stage 3 exists to catch.
- **Stage 3 (critic): no.** The scaffold already encodes the grounding, so the
  critic checking *against the scaffold* transitively checks against the
  patterns. Platform conventions live in a static rubric (~200 tokens,
  cacheable) rather than per-call retrieval. Injecting RAG here would re-pay
  the token cost on every call for near-zero score change.
- **Stage 4 (revision): no.** It applies specified fixes; new context is noise.

One retrieval per generation, one injection site — cheapest token profile that
still grounds every downstream stage.

### 3.5 Data loading pipeline

`load_patterns.py <dir>` — idempotent batch loader for one-at-a-time analysis
JSONs.

```
for each *.json in dir (batch of any size):
  1. VALIDATE  — pydantic model (enums for source_type/season_arc_position/
                 beat_name sets; genre + tradition against the code-side vocab).
  2. COPYRIGHT GUARD — reject if any beat field > 300 chars, or contains a
                 quoted span > 8 words (structural analysis never needs either).
  3. COMPOSE   — summary_text + per-beat embed_texts.
  4. EMBED     — POST texts to the Supabase Edge Function in batches of 32
                 (gte-small, 384-dim); retry a failed batch once.
  5. UPSERT    — pattern_sources on conflict (title_ref) do update; delete +
                 reinsert that source's pattern_beats (safe replay).
  6. On any per-file failure: move file to rejected/, append one line to
                 rejects.log (file, stage, error), CONTINUE — never abort batch.
```

**Lightweight spot-check (not full manual review), runs after every batch:**

1. **Auto-invariants** over everything loaded: beat_count in range (short 3–6,
   movie/webseries 5–9); `approximate_position` monotonically non-decreasing;
   webseries rows have both hook/arc fields, others have neither; embeddings
   non-null.
2. **Duplicate probe:** each new source's nearest neighbor similarity must be
   < 0.98 — catches accidentally re-analyzed or re-labeled duplicates.
3. **5 canned retrieval probes** with known expected hits (e.g. "shorts
   curiosity-gap educational hook" must surface at least one
   hook-driven-educational short in its top 3). Any probe miss → warn.
4. **Random sample of 5** loaded rows printed for a 2-minute eyeball.

Total maintainer effort per 30-file batch: minutes.

### 3.6 Scalability check — what changes at 500+ sources

Flagged now so nothing needs rebuilding:

| Area | At 100–120 | At 500+ (≈5 000 beats) | Rework needed? |
|---|---|---|---|
| Schema | unified tables | unchanged | **None** |
| Vector search | HNSW already created | unchanged; HNSW params fine to ~100k rows | **None** |
| Filter-then-search | exact, instant | unchanged | **None** |
| Retrieval k, dedupe | 6+6, greedy | unchanged (k doesn't grow with corpus) | **None** |
| Loader | batch, idempotent | unchanged; runtime scales linearly | **None** |
| **Genre/tradition vocab** | code-side pydantic enum | free-text drift becomes real; **move vocab into a lookup table + FK** | Small, planned |
| **Embedding model** | gte-small (384-d) is the quality ceiling | if retrieval quality plateaus, swap model = bump `embedding_model`, replay stored `summary_text`/`embed_text` through the new embedder, rebuild index. One script, no re-analysis | The one deliberate lever |
| Curation | all sources always eligible | add a `quality_tier smallint default 1` column **now** (unused until needed) so weak early analyses can be down-weighted later without a migration | Column added up front |

The only architectural bet that could force rework is the embedding model —
and persisting the exact embedded text turns that from a rebuild into an
hour-long replay. Everything else is sized past 500 sources on day one.

---

## Product surface (ties into existing app)

- `POST /generate` — JWT-protected; tier-gated (free: shorts only, N/month;
  pro/studio: all platforms) using the existing `subscription_tier` field.
- `GET /generations/{id}` — returns script + scaffold + critique (the critique
  doubles as a user-facing "why this works" breakdown — a sellable feature).
- The `generations` table is the analytics base: pass-rate by platform, most
  retrieved patterns (which sources earn their place), revision rate.
