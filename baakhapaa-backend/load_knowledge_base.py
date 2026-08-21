"""One-command knowledge-base loader:

    ./venv/Scripts/python.exe load_knowledge_base.py

Reads knowledge_base.json, embeds every entry (genre + origin_tradition +
one_line_takeaway), and upserts into the script_patterns table via the same
database abstraction the app uses — local SQLite in demo mode, real Supabase
(pgvector) when keys are set. Re-running after editing knowledge_base.json is
safe: rows are replaced by title_ref. Malformed entries are skipped with a
report instead of aborting the batch.
"""
import json
import os
import sys

from database import supabase
import rag

REQUIRED = ("title_ref", "source_type", "craft_level", "genre", "origin_tradition",
            "technique", "problem", "how_it_works", "how_to_apply",
            "worked_example", "warning_sign")
VALID_TYPES = {"movie", "webseries", "short", "craft"}
VALID_LEVELS = {"structure", "scene", "dialogue", "character", "image"}
KB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "knowledge_base.json")


def validate(entry, idx):
    if not isinstance(entry, dict):
        return f"entry {idx}: not an object"
    for f in REQUIRED:
        if not entry.get(f) or not isinstance(entry[f], str):
            return f"entry {idx} ({entry.get('title_ref', '?')}): missing/invalid '{f}'"
    if entry["source_type"] not in VALID_TYPES:
        return f"entry {idx} ({entry['title_ref']}): source_type must be one of {VALID_TYPES}"
    if entry["craft_level"] not in VALID_LEVELS:
        return f"entry {idx} ({entry['title_ref']}): craft_level must be one of {VALID_LEVELS}"
    # Copyright guard: entries hold original analysis and original worked
    # examples only — never transcribed dialogue from a source work.
    for f in ("problem", "how_it_works", "how_to_apply", "worked_example", "warning_sign"):
        if len(entry[f]) > 900:
            return f"entry {idx} ({entry['title_ref']}): '{f}' too long — original analysis only"
    return None


def main():
    with open(KB_PATH, encoding="utf-8") as fh:
        entries = json.load(fh)

    good, rejects = [], []
    for i, e in enumerate(entries):
        err = validate(e, i)
        (rejects.append(err) if err else good.append(e))

    print(f"knowledge_base.json: {len(entries)} entries — {len(good)} valid, {len(rejects)} rejected")
    for r in rejects:
        print(f"  REJECT {r}")
    if not good:
        sys.exit("Nothing valid to load.")

    print("Embedding (first run downloads the model, ~130 MB cached)...")
    vectors = rag.embed_texts([rag.pattern_to_text(e) for e in good])

    for entry, vec in zip(good, vectors, strict=True):
        supabase.table(rag.TABLE).delete().eq("title_ref", entry["title_ref"]).execute()
        supabase.table(rag.TABLE).insert({
            **{k: entry[k] for k in REQUIRED},
            "embed_text": rag.pattern_to_text(entry),
            "embedding": vec,
        }).execute()

    total = len(supabase.table(rag.TABLE).select("*").execute().data)
    print(f"Loaded {len(good)} entries; table now holds {total} patterns.")

    # Lightweight spot-check: two canned probes with expected top-3 hits
    # Probes are stated as writing PROBLEMS, matching how the app queries.
    probes = [
        ("drama", "emotional", "my dialogue is on the nose, characters say exactly what they feel", "dialogue"),
        ("drama", "emotional", "this scene feels flat, nothing changes in it", "scene"),
        ("drama", "emotional", "my characters all sound the same and feel predictable", "character"),
        ("comedy skit", "punchy", "my short loses viewers halfway through", "structure"),
    ]
    for genre, tone, theme, want_level in probes:
        top = rag.retrieve_relevant_patterns(genre, tone, theme, top_k=3)
        levels = [p.get("craft_level") for p in top]
        status = "OK " if want_level in levels else "WARN"
        print(f"  probe [{status}] want={want_level:9} got={levels} :: {top[0]['technique'] if top else '-'}")


if __name__ == "__main__":
    main()
