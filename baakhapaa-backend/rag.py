"""RAG retrieval layer: semantic search over analyzed script patterns.

Embeddings are computed locally with fastembed (BAAI/bge-small-en-v1.5,
384-dim ONNX — no API key, no torch), so retrieval works identically in demo
mode and against real Supabase. Storage goes through the `database.supabase`
abstraction: local SQLite persistence in demo mode, the real `script_patterns`
table (see pgvector_script_patterns.sql) when Supabase keys are set.

At the current library size (tens to a few thousand entries) retrieval fetches
all rows ONCE, holds them in memory, and ranks by cosine in Python — exact,
dependency-free, and identical across both storage modes. Past the measured
crossover it switches to the match_script_patterns RPC included in the
migration file. See RPC_THRESHOLD for where that crossover actually is, which
is nowhere near where this file used to guess.
"""
import json
import time
import os

_model = None  # lazy: first call downloads/loads the ONNX model (~130 MB cached)

import craft_query

EMBED_MODEL_NAME = "BAAI/bge-small-en-v1.5"
TABLE = "script_patterns"

# Which craft a pattern is for. An entry that does not say applies to both,
# which is what every entry written before long-form video existed means: story
# craft transfers, and a want, a turn, a cost and a payoff are the same in a
# video essay as in a film.
#
# The exclusion runs ONE WAY. Video-only entries stay out of a screenwriter's
# results, because that is the direction with a real failure behind it — a
# screenwriter asking about a sagging middle should not be told about retention
# curves. Nothing is excluded from a video writer's results, because narrowing
# the existing 39 by hand would be a craft judgement with no evidence behind it
# while shrinking the pool that produces the current numbers.
DEFAULT_APPLIES_TO = ("screenplay", "video")
SCREENPLAY_CRAFT = "screenplay"
VIDEO_CRAFT = "video"


def craft_for_format(project_format) -> str:
    """Which craft a project's format is written in."""
    return VIDEO_CRAFT if project_format == "long_form" else SCREENPLAY_CRAFT


def _serves(row: dict, craft: str) -> bool:
    applies = row.get("applies_to") or DEFAULT_APPLIES_TO
    if isinstance(applies, str):
        # Postgres hands a text[] back as a string on some client versions.
        try:
            applies = json.loads(applies)
        except (ValueError, TypeError):
            applies = DEFAULT_APPLIES_TO
    return craft in applies


def _get_model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        _model = TextEmbedding(model_name=EMBED_MODEL_NAME)
    return _model


def embed_texts(texts):
    """Embed a list of strings -> list of 384-float lists."""
    return [list(map(float, v)) for v in _get_model().embed(texts)]


def warm_model():
    """Load the embedding model now, off the request path.

    Measured on this machine, fresh process, three runs:

        import rag        0.02s
        first embed       1.37 / 0.96 / 0.96s   <- the model loading
        second embed      0.005s

    So the first person to open the Patterns tab after a restart waits about a
    second for something every later request gets for five milliseconds. On the
    free tier that tab IS the product — retrieval is the whole of what a free
    user gets — so the slowest request in the system was the first impression.

    Called from a daemon thread at startup rather than at import: loading it at
    import would move the same second onto the boot, and a deploy that takes a
    second longer to accept traffic is worse than one that takes a second longer
    to be fast. Failure is swallowed on purpose — a warm-up that cannot run is
    not a reason to refuse the boot, it is a reason for the first request to be
    slow, which is exactly where this started.
    """
    try:
        _get_model().embed(["warm"])
        return True
    except Exception as e:  # noqa: BLE001 - see docstring
        print(f"RAG warm-up skipped ({e}); the first retrieval will load the model.")
        return False


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
        "applies_to": row.get("applies_to") or list(DEFAULT_APPLIES_TO),
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
# being free and the pgvector RPC does the same work in the database against an
# HNSW index. This is where the two paths CROSS, not where the current one
# breaks — and it was 500 on a guess for months, which was wrong by about six
# times in the direction that would have made the product slower.
#
# Measured 2026-09-14 against the real Supabase project, 15 runs, medians:
#
#     embed the query alone                        6.1 ms
#     retrieve, warm cache (rank 45 in Python)     8.8 ms   <-- what ships
#     RPC round trip                             178.6 ms
#     retrieve, cold cache (fetch all + rank)    344.5 ms
#
# So at today's 45 entries the RPC is TWENTY TIMES SLOWER than what it was
# proposed to replace, and it is not close. The in-memory corpus cache already
# removed the cost the RPC was meant to remove — the 611ms fetch — and what is
# left on the Python side is 2.7ms of arithmetic against 178.6ms of network.
#
# Ranking scales cleanly at 61.8 us/row (measured 45 to 5000 rows, linear), so
# the crossover with one round trip is about 2,900 rows. Set just under it: the
# cached corpus also has to be re-fetched every CACHE_TTL, and that cost grows
# with the library too, which pulls the real crossover down rather than up.
RPC_THRESHOLD = int(os.getenv("RAG_RPC_THRESHOLD", "2500"))
RPC_NAME = "match_script_patterns"

# The RPC signature is applied to real databases BY HAND in the SQL editor, so
# a project can sit for a long time on an older one. Falling back is correct
# and should be quiet: warn the first time, then stop, rather than printing a
# line on every retrieval.
_rpc_warned = False


# The corpus, held in memory between requests.
#
# Retrieval measured 484ms against real Supabase, and it is not the model:
# embedding a query is 5ms, fetching the corpus is 611ms. Every Patterns
# request — free on every tier, and sitting on the writing path — was
# re-downloading all 39 rows WITH their 384-dimension embeddings, about 185KB,
# and re-parsing each one out of the string PostgREST returns for a `vector`.
# The corpus changes when `load_knowledge_base.py` runs and at no other time.
#
# A TTL rather than a permanent cache, because the loader can be run against a
# database this process is not restarted for; five minutes of staleness in a
# craft suggestion costs nothing, and the loader calls `invalidate_corpus_cache`
# for the case where it is in-process.
#
# `RAG_CACHE_TTL=0` disables it. `tests/conftest.py` sets exactly that: the RAG
# suite clears and reseeds `script_patterns` around every test, so a cache that
# survived a clear would make "an empty library returns nothing" pass or fail
# depending on what ran before it.
CACHE_TTL = float(os.getenv("RAG_CACHE_TTL", "300"))
_corpus_cache = {"rows": None, "at": 0.0}


def invalidate_corpus_cache():
    """Forget the cached corpus. Called by the loader after it writes."""
    _corpus_cache["rows"] = None
    _corpus_cache["at"] = 0.0


def _corpus(supabase):
    """Every pattern row, with its embedding already parsed into a list.

    Parsing here rather than per request is the other half of the saving: the
    embeddings come back from PostgREST as strings, and 39 of them is 39 JSON
    parses of 384 floats on a path that runs while somebody is typing.
    """
    now = time.monotonic()
    if CACHE_TTL > 0 and _corpus_cache["rows"] is not None \
            and now - _corpus_cache["at"] < CACHE_TTL:
        return _corpus_cache["rows"]

    rows = supabase.table(TABLE).select("*").execute().data or []
    for r in rows:
        emb = r.get("embedding")
        if isinstance(emb, str):
            try:
                r["embedding"] = json.loads(emb)
            except (ValueError, TypeError):
                r["embedding"] = None

    # An empty read is not cached. It is the shape a misconfigured database and
    # an unloaded one both have, and caching it would hold that answer for five
    # minutes after somebody fixed it.
    if CACHE_TTL > 0 and rows:
        _corpus_cache["rows"] = rows
        _corpus_cache["at"] = now
    return rows


def _rpc_search(supabase, qvec, top_k, craft=None):
    """Server-side similarity search, or None if it is not available.

    `craft` is passed to the database, not applied afterwards. Filtering the
    rows the RPC returns would be worse than not filtering at all: the function
    is asked for the top three and a post-filter can only shrink that, so a
    screenwriter whose three nearest entries happened to be video craft would
    be told the library has nothing for them. The narrowing has to happen
    before the LIMIT, which means it has to happen in SQL.

    Returns None rather than raising for every reason it can fail, and there
    are several that are all normal: the local SQLite mock has no `rpc` method
    at all, a Supabase project may not have had `pgvector_script_patterns.sql`
    run against it, and the function may exist at the OLD two-argument
    signature, which is what every project migrated before 2026-09-14 has.
    None means "use the Python path", which is exact and always correct — the
    RPC is a performance choice, never a correctness one.
    """
    global _rpc_warned
    rpc = getattr(supabase, "rpc", None)
    if rpc is None:
        return None
    try:
        res = rpc(RPC_NAME, {"query_embedding": qvec, "match_count": top_k,
                             "filter_craft": craft}).execute()
    except Exception as e:
        if not _rpc_warned:
            _rpc_warned = True
            print(f"RAG: {RPC_NAME} unavailable ({e}); ranking in Python "
                  "instead. Run pgvector_script_patterns.sql to get the "
                  "faster path back. This is logged once.")
        return None
    rows = getattr(res, "data", None)
    if not rows:
        return None
    return [_pattern_payload(r, similarity=round(float(r.get("similarity") or 0), 4))
            for r in rows]


def retrieve_relevant_patterns(genre, tone, theme_description, top_k=3, craft=SCREENPLAY_CRAFT):
    """Embed the current request and return the top_k most semantically
    similar stored patterns — regardless of exact genre tag. Returns a list of
    payload dicts sorted by similarity. Never raises: any failure returns [] so
    generation proceeds ungrounded rather than breaking."""
    try:
        from database import supabase
        rows = _corpus(supabase)
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
        # Nepali is translated out of the query before it is embedded, never
        # after. `bge-small-en-v1.5` cannot separate two Devanagari sentences
        # at all (0.898 same-meaning against 0.877 different-meaning, a 0.02
        # gap), and a romanised query sits closer to an unrelated romanised
        # sentence than to its own English translation. An English query is
        # returned byte-identical, so this cannot move the English scores.
        # Measured in craft_query's docstring and gated by eval_retrieval.py.
        query_text, _glossed = craft_query.normalise(theme_description)
        qvec = embed_texts([query_text])[0]

        # The RPC narrows by craft itself now. It did not until 2026-09-14,
        # and the guard here read `craft == SCREENPLAY_CRAFT` — which was
        # exactly backwards, because screenplay is the craft that DOES narrow.
        # Measured against the real database, the unfiltered function answered
        # a screenwriter's question about a weak opening with a long-form video
        # entry in FIRST place. Latent, since 45 rows is far below the
        # threshold, but it was one large corpus away from being real.
        if len(rows) >= RPC_THRESHOLD:
            hit = _rpc_search(supabase, qvec, top_k, craft)
            if hit is not None:
                return hit

        # Narrow to the craft being written BEFORE scoring, so a filtered-out
        # entry cannot take a slot from one that serves this writer.
        rows = [r for r in rows if _serves(r, craft)]

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
