"""Build the corpus fingerprint file from a directory of screenplays.

    python build_fingerprints.py <corpus_dir> [-o corpus_fingerprints.json]

Reads every .txt/.fountain/.fdx-as-text file under <corpus_dir>, measures it,
and writes one JSON array of fingerprints. **No screenplay text is written to
the output** — only measurements — so the result is safe to commit while the
source directory must never be.

Genre is taken from the immediate parent folder when the corpus is organised
that way (corpus/drama/film.txt -> genre "drama"), which is what makes
genre-conditioned benchmarking possible. Flat directories still work; those
rows just benchmark against the whole corpus.

Run it wherever the scripts live — it needs nothing from the app but
`screenplay.py` and `fingerprint.py`.
"""
import argparse
import json
import sys
from pathlib import Path

import fingerprint

TEXT_SUFFIXES = {".txt", ".fountain", ".fdx", ".md"}


def iter_scripts(root: Path):
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in TEXT_SUFFIXES:
            yield path


def read_text(path: Path) -> str:
    """Screenplay dumps come from many extractors with inconsistent encodings,
    so fall back rather than dropping a file over one bad byte."""
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except (UnicodeDecodeError, ValueError):
            continue
    return ""


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("corpus_dir", help="Directory of extracted screenplay text files")
    ap.add_argument("-o", "--out", default="corpus_fingerprints.json")
    ap.add_argument("--genre-from-parent", action="store_true", default=True,
                    help="Use the parent folder name as the genre label (default)")
    args = ap.parse_args(argv)

    root = Path(args.corpus_dir)
    if not root.is_dir():
        print(f"error: {root} is not a directory", file=sys.stderr)
        return 2

    rows, skipped = [], []
    for path in iter_scripts(root):
        text = read_text(path)
        if not text.strip():
            skipped.append((path.name, "unreadable"))
            continue

        genre = path.parent.name if (args.genre_from_parent and path.parent != root) else ""
        fp = fingerprint.fingerprint(text, title_ref=path.stem, genre=genre)
        rows.append(fp)
        if not fp["valid"]:
            skipped.append((path.name, f"only {fp['scene_count']} scenes / {fp['dialogue_lines']} dialogue lines"))

    Path(args.out).write_text(json.dumps(rows, indent=2), encoding="utf-8")

    valid = [r for r in rows if r["valid"]]
    print(f"Scanned {len(rows)} files -> {len(valid)} valid fingerprints ({args.out})")

    by_genre = {}
    for r in valid:
        by_genre[r["genre"] or "(unlabelled)"] = by_genre.get(r["genre"] or "(unlabelled)", 0) + 1
    if by_genre:
        print("\nCohorts (>=12 needed for genre-specific benchmarking):")
        for g, n in sorted(by_genre.items(), key=lambda kv: -kv[1]):
            mark = "ok " if n >= 12 else "too small"
            print(f"  {n:5d}  {g:<28} {mark}")

    if skipped:
        print(f"\n{len(skipped)} file(s) excluded — these are scans, prose, or bad extractions:")
        for name, why in skipped[:15]:
            print(f"  - {name}: {why}")
        if len(skipped) > 15:
            print(f"  ... and {len(skipped) - 15} more")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
