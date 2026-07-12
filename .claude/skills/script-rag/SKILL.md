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
  "title_ref": "Film Name (Year)",
  "source_type": "movie",            // movie | webseries | short
  "genre": "thriller",
  "origin_tradition": "Korean",       // Hollywood, Bollywood, TVF-style, K-drama, ...
  "one_line_takeaway": "The single transferable structural lesson, one sentence.",
  "structural_pattern": "2-4 sentences describing the beat structure mechanics."
}
```

2. Reload: `./venv/Scripts/python.exe load_knowledge_base.py`

That's it — the loader validates, embeds, and upserts (replaces by
`title_ref`, so re-running or editing is always safe). Malformed entries are
skipped with a printed reason; the batch never aborts. It ends with canned
retrieval probes — a `WARN` there means retrieval quality regressed.

**Hard rule:** entries contain structural analysis in original language ONLY —
never copyrighted script text, dialogue quotes, or long plot recaps. The
loader rejects fields over 600 chars as a guard. What makes a good entry: the
`one_line_takeaway` should be a *transferable technique* ("let the inciting
opportunity be something the protagonist wants"), not a plot summary, because
that field is what gets embedded and matched against new requests.

## Using retrieval in code

```python
from script_engine import retrieve_relevant_patterns   # re-exported from rag.py

patterns = retrieve_relevant_patterns(
    genre="sports underdog", tone="gritty",
    theme_description="a young woman defies her family to box",
    top_k=3,
)
# -> [{title_ref, genre, origin_tradition, one_line_takeaway,
#      structural_pattern, similarity}, ...] sorted by similarity
```

Design invariants to preserve when modifying this code:

- **Retrieval never breaks generation.** `retrieve_relevant_patterns` catches
  everything and returns `[]`; `generate_structure` proceeds ungrounded. Keep
  it that way — a missing model download must not 500 the endpoint.
- **Query text = `"{genre} | {tone} | {theme}"`**, entry text =
  `"{genre} | {origin_tradition} | {one_line_takeaway}"` (see
  `rag.pattern_to_text`). Titles are deliberately NOT embedded so matching is
  structural, not fame-based.
- **Injection happens in Stage-1 (structure) only** via
  `rag.format_patterns_for_prompt`, which instructs Claude to adapt techniques
  and never echo titles. Don't add retrieval to scene/improve/suggest calls
  without a reason — it bloats tokens for little gain.
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
