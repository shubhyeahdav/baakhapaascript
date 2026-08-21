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
    """The text that gets embedded for a craft entry.

    Leads with the PROBLEM, because that is how writers actually search — they
    arrive with "this scene feels flat", not with a genre tag. Weighting the
    problem statement (repeated once) over the technique keeps retrieval on the
    writer's symptom rather than on subject matter, which was the failure mode
    of the earlier genre+takeaway embedding.
    """
    problem = entry.get("problem") or entry.get("one_line_takeaway", "")
    return (
        f"{problem} {problem} "
        f"{entry.get('technique', '')} "
        f"{entry.get('craft_level', '')} craft. "
        f"{entry.get('how_it_works', '')} "
        f"{entry.get('genre', '')} {entry.get('origin_tradition', '')}"
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
