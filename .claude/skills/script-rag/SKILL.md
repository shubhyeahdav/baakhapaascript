---
name: script-rag
description: How Baakhapaa's RAG script-generation system works and how to operate it — the knowledge_base.json pattern library, local fastembed embeddings, the script_patterns table, retrieve_relevant_patterns(), and how retrieved patterns are injected into generate_structure(). Use this skill whenever the task touches script/structure generation quality, adding or editing film/web-series/short analyses, knowledge_base.json, load_knowledge_base.py, rag.py, embeddings, pgvector, semantic retrieval, or "why did generation pull these patterns" questions — even if the user doesn't say "RAG".
---

# Baakhapaa Script-Generation RAG

Structure generation is grounded in real analyzed patterns, not generic AI
theory: every `generate_structure()` call embeds the request, retrieves the 3
most semantically similar structural analyses from the pattern library, and
injects them into the Claude prompt. Retrieval is **semantic**, not tag-based —
a "boxing underdog" request pulls Rocky's structure even though no entry has
that genre tag.

## The pipeline (all paths relative to `baakhapaa-backend/`)

```
knowledge_base.json          # human-editable pattern library (source of truth)
      │  python load_knowledge_base.py     (one command, idempotent)
      ▼
script_patterns table        # demo mode: local SQLite via database.py
                             # real mode: Supabase pgvector (pgvector_script_patterns.sql)
      │  rag.retrieve_relevant_patterns(genre, tone, theme, top_k=3)
      ▼
script_engine.generate_structure()   # injects patterns into the Claude prompt
```

Embeddings are computed **locally** with fastembed (`BAAI/bge-small-en-v1.5`,
384-dim ONNX). No API key, no torch — retrieval works fully in demo mode.
First run downloads ~130 MB to the fastembed cache; subsequent runs are fast.

## Adding new pattern analyses (the common task)

1. Append an entry to `knowledge_base.json`:

```json
{
  "title_ref": "Complicity engine (Korean thriller tradition)",
  "source_type": "movie",             // movie | webseries | short
  "craft_level": "structure",         // structure | scene | dialogue | character | image
  "genre": "thriller",
  "origin_tradition": "Korean",       // Hollywood, Bollywood, TVF-style, K-drama,
                                      // Malayalam, ... or "screen craft" when the
                                      // technique belongs to no single tradition
  "technique": "Make the inciting opportunity something the protagonist wants",
  "problem": "My inciting incident feels like something that happens TO the protagonist...",
  "how_it_works": "Why the technique works, in mechanism terms.",
  "how_to_apply": "The concrete steps a writer takes on their own page.",
  "warning_sign": "The symptom on the page that says you need this.",
  "worked_example": "Original prose showing it, never quoted script text."
}
```

**`problem` is the most important field.** `rag.pattern_to_text` embeds it
**twice**, ahead of everything else, because writers search by symptom — "this
scene feels flat" — not by genre tag. Write it as the complaint a stuck writer
would actually type. That field decides whether the entry is ever retrieved.

**`warning_sign` is the second most important**, and it is embedded too. It is
what the fault looks like on the page, which is the same register a query
arrives in. Write it as an observation someone could make about a draft, not as
advice.

Two failure modes worth knowing before you write one. An entry whose `problem`
is phrased generally will be returned for questions it does not answer — that
is how one entry came to answer most of the library. And an entry whose
`problem` duplicates another's will make both unreachable, because neither wins
cleanly. Check both by running `eval_retrieval.py` after `load_knowledge_base.py`.

Two fields have jobs outside retrieval: `warning_sign` is what the **craft
linter** turns into a rule, and `craft_level` is what routes a finding to a
**lesson**. An entry missing either still embeds and retrieves, so the loss is
silent — the entry simply never lints and never teaches.

2. Reload: `./venv/Scripts/python.exe load_knowledge_base.py`

That's it — the loader validates, embeds, and upserts (replaces by
`title_ref`, so re-running or editing is always safe). Malformed entries are
skipped with a printed reason; the batch never aborts. It ends with canned
retrieval probes — a `WARN` there means retrieval quality regressed.

**Hard rule:** entries contain structural analysis in original language ONLY —
never copyrighted script text, dialogue quotes, or long plot recaps. The
loader rejects fields over 600 chars as a guard. What makes a good entry: the
`technique` should be a *transferable move* ("let the inciting opportunity be
something the protagonist wants"), never a plot summary — and `problem` should
be the symptom that move cures, written the way a stuck writer would say it,
because that is the field retrieval actually matches on.

## Using retrieval in code

```python
from script_engine import retrieve_relevant_patterns   # re-exported from rag.py

patterns = retrieve_relevant_patterns(
    genre="sports underdog", tone="gritty",
    theme_description="a young woman defies her family to box",
    top_k=3,
)
# -> [{title_ref, genre, origin_tradition, craft_level, technique, problem,
#      how_it_works, how_to_apply, warning_sign, worked_example, similarity}, ...]
#    sorted by similarity
```

Design invariants to preserve when modifying this code:

- **Retrieval never breaks generation.** `retrieve_relevant_patterns` catches
  everything and returns `[]`; `generate_structure` proceeds ungrounded. Keep
  it that way — a missing model download must not 500 the endpoint.
- **Query text is the symptom ALONE.** It used to be
  `"{genre} | {tone} | {theme}"`, and that was the single largest defect in
  retrieval: genre and tone are near-constant across requests, so they said
  nothing about what the writer was stuck on while pulling every query toward
  whichever entry read as most generically emotional. One entry was answering
  21 of 25 golden-set queries. `genre` and `tone` remain in the signature
  because eight callers pass them; they never reach the embedder.
- **Entry text is symptom-only too**: the doubled `problem`, the `technique`,
  and the `warning_sign` (see `rag.pattern_to_text`). `how_it_works`,
  `craft_level`, `genre` and `origin_tradition` were each measured and removed
  — craft exposition and bare tags diluted the complaint the query is made of.
  Titles are deliberately not embedded, so matching is structural rather than
  fame-based.
- **Every change here is measured before it is kept.** `eval_retrieval.py` runs
  a 64-case golden set — 25 real queries in three styles (focus chips, beginner
  phrasing, romanised Nepali) plus 39 self-retrieval sanity checks that are
  reported apart and never averaged in. CI fails the build if real-query
  precision@1 drops below the committed floor. Run it before and after touching
  anything in this pipeline.
- **Injection reaches structure, scene generation AND improve** via
  `rag.format_patterns_for_prompt`, which instructs Claude to adapt techniques
  and never echo titles. It was structure-only until 2026-08-19; `generate_scene`
  and `improve` now receive patterns and the story bible as well, because a
  writer had filled in the most useful thing you can give a generator and it was
  being dropped.
- **A focus phrase is not a draft.** `POST /scripts/recommendations` takes
  `scene_text` (the draft, the only thing ever diagnosed) and `focus` (the
  symptom, which steers retrieval only). They were one field until 2026-08-31,
  so the editor's focus chips were linted as though the writer had typed the
  complaint, and the panel reported the result as "found in your draft, line 1".
- The backend logs `RAG patterns for structure: [...]` on every generate call
  (also in demo mode) — first place to look when debugging relevance.

## Demo mode vs real Supabase

- **Demo (placeholder keys):** patterns persist in the local SQLite store
  through the same `database.supabase` abstraction as everything else.
  Retrieval fetches all rows and cosine-ranks in Python — exact and instant
  at this scale.
- **Real Supabase:** run `pgvector_script_patterns.sql` in the SQL editor
  first (creates the table, HNSW index, and a `match_script_patterns` RPC).
  The loader and retrieval code are unchanged. Past ~500 entries, switch
  retrieval to the RPC instead of fetch-all (the SQL file documents the call).

## Gotchas

- The mock DB's `delete()` is deferred to `execute()` so
  `table.delete().eq(...)` works like real Supabase. Never "fix" it back to
  eager deletion — that wipes whole tables in demo mode.
- Embedding model changes mean re-embedding everything: bump
  `rag.EMBED_MODEL_NAME`, update `vector(384)` dims in the SQL if they differ,
  and re-run the loader (it replays cleanly).
- Retrieval quality ceiling is the small 384-dim model. If relevant entries
  stop surfacing as the library grows, the intended fix is a larger embedding
  model + reload — not prompt hacks.
- Full architecture rationale (retrieval counts, injection points, scaling
  plan): see `GENERATION_ARCHITECTURE.md` at repo root.
