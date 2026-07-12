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
    """The text that gets embedded for a knowledge-base entry:
    genre + origin_tradition + one_line_takeaway combined (title deliberately
    excluded so retrieval matches structure, not fame)."""
    return (
        f"{entry.get('genre', '')} | {entry.get('origin_tradition', '')} | "
        f"{entry.get('one_line_takeaway', '')}"
    )


def _cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


def retrieve_relevant_patterns(genre, tone, theme_description, top_k=3):
    """Embed the current request and return the top_k most semantically
    similar stored patterns — regardless of exact genre tag. Returns a list of
    {title_ref, genre, origin_tradition, one_line_takeaway, structural_pattern,
    similarity}. Never raises: any failure returns [] so generation proceeds
    ungrounded rather than breaking."""
    try:
        from database import supabase
        rows = supabase.table(TABLE).select("*").execute().data
        if not rows:
            return []
        qtext = f"{genre} | {tone} | {theme_description}"
        qvec = embed_texts([qtext])[0]
        scored = []
        for r in rows:
            emb = r.get("embedding")
            if isinstance(emb, str):  # real Supabase returns vector as string
                emb = json.loads(emb)
            if not emb:
                continue
            scored.append((_cosine(qvec, emb), r))
        scored.sort(key=lambda t: t[0], reverse=True)
        return [
            {
                "title_ref": r.get("title_ref"),
                "genre": r.get("genre"),
                "origin_tradition": r.get("origin_tradition"),
                "one_line_takeaway": r.get("one_line_takeaway"),
                "structural_pattern": r.get("structural_pattern"),
                "similarity": round(sim, 4),
            }
            for sim, r in scored[:top_k]
        ]
    except Exception as e:
        print(f"RAG retrieval unavailable ({e}); generating without pattern context.")
        return []


def format_patterns_for_prompt(patterns) -> str:
    """Compact prompt block for generate_structure. Titles are shown to the
    model as opaque provenance labels only; instructions forbid echoing them."""
    if not patterns:
        return ""
    lines = [
        "\nProven structural patterns from analyzed films/series — ground your "
        "beat structure in these techniques. Never mention these titles or "
        "copy any dialogue; adapt the structural ideas to the request:"
    ]
    for i, p in enumerate(patterns, 1):
        lines.append(
            f"{i}. [{p['genre']} · {p['origin_tradition']}] {p['one_line_takeaway']} "
            f"Structure: {p['structural_pattern']}"
        )
    return "\n".join(lines) + "\n"
