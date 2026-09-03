"""RAG retrieval layer: semantic search over analyzed script patterns.

Embeddings are computed locally with fastembed (BAAI/bge-small-en-v1.5,
384-dim ONNX — no API key, no torch), so retrieval works identically in demo
mode and against real Supabase. Storage goes through the `database.supabase`
abstraction: local SQLite persistence in demo mode, the real `script_patterns`
table (see pgvector_script_patterns.sql) when Supabase keys are set.

At the current library size (tens to a few hundred entries) retrieval fetches
all rows and ranks by cosine in Python — exact, dependency-free, and identical
across both storage modes. Past ~500 entries, switch to the
match_script_patterns RPC included in the migration file.
"""
import json
import os

_model = None  # lazy: first call downloads/loads the ONNX model (~130 MB cached)

EMBED_MODEL_NAME = "BAAI/bge-small-en-v1.5"
TABLE = "script_patterns"


def _get_model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        _model = TextEmbedding(model_name=EMBED_MODEL_NAME)
    return _model


def embed_texts(texts):
    """Embed a list of strings -> list of 384-float lists."""
    return [list(map(float, v)) for v in _get_model().embed(texts)]


def pattern_to_text(entry: dict) -> str:
    """The text that gets embedded for a craft entry.

    Two fields, both of which describe the SYMPTOM: `problem` is how a writer
    would state the complaint, and `warning_sign` is how it looks on the page.
    A query is a complaint, so the closer the stored text is to a complaint,
    the better the match. The technique name is carried along because it is
    what a returning writer searches for by name.

    What is deliberately NOT embedded, and why — each of these was measured on
    the golden set in `eval_retrieval.py` before being removed:

      * `how_it_works` is craft exposition. It is the longest field in the
        entry, it explains the fix rather than the fault, and including it
        diluted the symptom until one entry with an unusually generic problem
        statement was answering most of the library's queries.
      * `craft_level` and `genre` are tags. A writer does not type "dialogue
        craft, Drama"; embedding those words gave every entry in a level a
        shared lump of text that made them harder to tell apart, not easier.

    Removing them, together with the query change in
    `retrieve_relevant_patterns`, moved real-query precision@1 from 56% to 72%
    and precision@3 from 76% to 88%.
    """
    problem = entry.get("problem") or entry.get("one_line_takeaway", "")
    return (
        f"{problem} {problem} "
        f"{entry.get('technique', '')} "
        f"{entry.get('warning_sign', '')}"
    ).strip()


def _pattern_payload(row: dict, similarity=None) -> dict:
    """The shape every retrieval path returns, however the row was found."""
    return {
        "title_ref": row.get("title_ref"),
        "genre": row.get("genre"),
        "origin_tradition": row.get("origin_tradition"),
        "craft_level": row.get("craft_level"),
        "technique": row.get("technique"),
        "problem": row.get("problem"),
        "how_it_works": row.get("how_it_works"),
        "how_to_apply": row.get("how_to_apply"),
        "worked_example": row.get("worked_example"),
        "warning_sign": row.get("warning_sign"),
        # Legacy field kept so older callers/rows keep working.
        "one_line_takeaway": row.get("technique") or row.get("one_line_takeaway"),
        "similarity": similarity,
    }


def get_patterns_by_technique(names) -> list:
    """Fetch craft entries by exact `technique` name — no embedding involved.

    When the linter fires it has already identified the technique that fixes
    the flag, because every rule was derived from a craft entry's
    `warning_sign`. Running semantic search at that point is a lossy way to
    look up something you already know the name of: it costs an embedding pass
    and can return the wrong entry. Exact match cannot.
    """
    wanted = [n for n in names if n]
    if not wanted:
        return []
    try:
        from database import supabase
        rows = supabase.table(TABLE).select("*").execute().data or []
        by_name = {r.get("technique"): r for r in rows if r.get("technique")}
        seen, out = set(), []
        for n in wanted:
            if n in by_name and n not in seen:
                seen.add(n)
                out.append(_pattern_payload(by_name[n], similarity=1.0))
        return out
    except Exception as e:
        print(f"RAG exact lookup unavailable ({e}).")
        return []


def _cosine(a, b):
    """Cosine similarity, or 0.0 for vectors that cannot be compared.

    The length guard is load-bearing. `zip` stops at the shorter sequence, so a
    stored embedding of the wrong dimensionality — a partially written blob, or
    a row left behind by a different embedding model — would have its dot
    product computed over the overlap while both magnitudes were computed over
    the full vectors. The result is not an error: it is a plausible-looking
    score that can sort to the top and put the wrong craft pattern in front of a
    writer. Refusing to score it is the honest answer.
    """
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


# Past this many rows, ranking every entry in Python on each request stops
# being free. The pgvector RPC does the same work in the database against an
# HNSW index. The threshold is not a cliff — exact scan at a few hundred rows
# is still milliseconds — so this is about where the two paths cross, not about
# where the current one breaks.
RPC_THRESHOLD = int(os.getenv("RAG_RPC_THRESHOLD", "500"))
RPC_NAME = "match_script_patterns"


def _rpc_search(supabase, qvec, top_k):
    """Server-side similarity search, or None if it is not available.

    Returns None rather than raising for every reason it can fail, and there
    are several that are all normal: the local SQLite mock has no `rpc` method
    at all, a Supabase project may not have had `pgvector_script_patterns.sql`
    run against it, and the function may exist at a different signature. None
    means "use the Python path", which is exact and always correct — the RPC is
    a performance choice, never a correctness one.
    """
    rpc = getattr(supabase, "rpc", None)
    if rpc is None:
        return None
    try:
        res = rpc(RPC_NAME, {"query_embedding": qvec, "match_count": top_k}).execute()
    except Exception as e:
        print(f"RAG: {RPC_NAME} unavailable ({e}); ranking in Python instead.")
        return None
    rows = getattr(res, "data", None)
    if not rows:
        return None
    return [_pattern_payload(r, similarity=round(float(r.get("similarity") or 0), 4))
            for r in rows]


def retrieve_relevant_patterns(genre, tone, theme_description, top_k=3):
    """Embed the current request and return the top_k most semantically
    similar stored patterns — regardless of exact genre tag. Returns a list of
    payload dicts sorted by similarity. Never raises: any failure returns [] so
    generation proceeds ungrounded rather than breaking."""
    try:
        from database import supabase
        rows = supabase.table(TABLE).select("*").execute().data
        if not rows:
            return []
        # Only the symptom is embedded. `genre` and `tone` are accepted because
        # every caller has them and the signature predates the measurement, but
        # concatenating them into the query was the single largest defect in
        # retrieval: they are near-constant across requests ("Drama",
        # "Emotional"), they carry no information about what the writer is
        # stuck on, and they pulled every query toward whichever entry read as
        # most generically emotional. One entry was coming back for 21 of 25
        # real queries. Dropping the prefix took that to 8 and moved
        # precision@1 from 56% to 72%. Measured in `eval_retrieval.py`.
        qvec = embed_texts([theme_description])[0]

        if len(rows) >= RPC_THRESHOLD:
            hit = _rpc_search(supabase, qvec, top_k)
            if hit is not None:
                return hit

        scored = []
        for r in rows:
            emb = r.get("embedding")
            if isinstance(emb, str):  # real Supabase returns vector as string
                emb = json.loads(emb)
            if not emb:
                continue
            scored.append((_cosine(qvec, emb), r))
        scored.sort(key=lambda t: t[0], reverse=True)
        return [_pattern_payload(r, similarity=round(sim, 4)) for sim, r in scored[:top_k]]
    except Exception as e:
        print(f"RAG retrieval unavailable ({e}); generating without pattern context.")
        return []


def format_patterns_for_prompt(patterns) -> str:
    """Compact prompt block for generate_structure. Titles are shown to the
    model as opaque provenance labels only; instructions forbid echoing them."""
    if not patterns:
        return ""
    lines = [
        "\nCraft techniques drawn from analyzed exceptional writing — apply "
        "these mechanically to the beats you produce. Never mention these "
        "labels or reproduce their examples verbatim:"
    ]
    for i, p in enumerate(patterns, 1):
        tech = p.get("technique") or p.get("one_line_takeaway") or ""
        lines.append(f"{i}. {tech}")
        if p.get("how_it_works"):
            lines.append(f"   Why it works: {p['how_it_works']}")
        if p.get("how_to_apply"):
            lines.append(f"   Apply: {p['how_to_apply']}")
    return "\n".join(lines) + "\n"
