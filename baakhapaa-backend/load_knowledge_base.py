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

REQUIRED = ("title_ref", "source_type", "genre", "origin_tradition",
            "one_line_takeaway", "structural_pattern")
VALID_TYPES = {"movie", "webseries", "short"}
KB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "knowledge_base.json")


def validate(entry, idx):
    if not isinstance(entry, dict):
        return f"entry {idx}: not an object"
    for f in REQUIRED:
        if not entry.get(f) or not isinstance(entry[f], str):
            return f"entry {idx} ({entry.get('title_ref', '?')}): missing/invalid '{f}'"
    if entry["source_type"] not in VALID_TYPES:
        return f"entry {idx} ({entry['title_ref']}): source_type must be one of {VALID_TYPES}"
    # Copyright guard: structural analysis never needs long text or long quotes
    for f in ("one_line_takeaway", "structural_pattern"):
        if len(entry[f]) > 600:
            return f"entry {idx} ({entry['title_ref']}): '{f}' too long — structural analysis only"
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

    for entry, vec in zip(good, vectors):
        supabase.table(rag.TABLE).delete().eq("title_ref", entry["title_ref"]).execute()
        supabase.table(rag.TABLE).insert({
            "title_ref": entry["title_ref"],
            "source_type": entry["source_type"],
            "genre": entry["genre"],
            "origin_tradition": entry["origin_tradition"],
            "one_line_takeaway": entry["one_line_takeaway"],
            "structural_pattern": entry["structural_pattern"],
            "embed_text": rag.pattern_to_text(entry),
            "embedding": vec,
        }).execute()

    total = len(supabase.table(rag.TABLE).select("*").execute().data)
    print(f"Loaded {len(good)} entries; table now holds {total} patterns.")

    # Lightweight spot-check: two canned probes with expected top-3 hits
    probes = [
        ("comedy", "lighthearted", "students struggling with exam pressure in a small town",
         {"Kota Factory (2019, S1)", "3 Idiots (2009)", "Super 30 (2019)"}),
        ("educational", "punchy", "a counterintuitive money fact people scroll past",
         {"Hook-driven educational short (composite pattern)"}),
    ]
    for genre, tone, theme, expected in probes:
        top = rag.retrieve_relevant_patterns(genre, tone, theme, top_k=3)
        hits = {p["title_ref"] for p in top}
        status = "OK " if hits & expected else "WARN"
        print(f"  probe [{status}] '{theme[:40]}...' -> {sorted(hits)}")


if __name__ == "__main__":
    main()
