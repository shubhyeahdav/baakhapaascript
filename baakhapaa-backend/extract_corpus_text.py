"""Extract plain text from a directory of screenplay PDFs.

    python extract_corpus_text.py <pdf_dir> <out_dir>

Step zero of the corpus pipeline: `build_fingerprints.py` measures text, and a
downloaded script library is PDFs. This turns one into the other.

**The output is still copyrighted screenplay text.** Point `out_dir` somewhere
outside the repo and keep it there. Only the *fingerprints* — measurements, no
text — are safe to commit.

Extraction quality varies wildly and that matters more than it sounds. A PDF
produced from a word processor extracts cleanly. A scanned page extracts to
nothing, and a badly-produced one extracts to text with the line structure
destroyed — which still *looks* like a screenplay to a naive parser while
having no sluglines it can find. Both would silently poison a distribution, so
this script classifies every file and reports what it excluded and why. That
classification is the point; the extraction is the easy half.
"""
import argparse
import re
import sys
from pathlib import Path

SLUG_RE = re.compile(r"^\s*(INT|EXT|I/E)[\.\s/]", re.IGNORECASE | re.MULTILINE)
CUE_RE = re.compile(r"^\s{2,}[A-Z][A-Z0-9 .'\-]{1,38}\s*$", re.MULTILINE)

# Below these a file is not usable as a screenplay measurement, whatever it is.
MIN_CHARS = 4000
MIN_SLUGLINES = 15


def extract(path: Path) -> str:
    from pypdf import PdfReader
    try:
        reader = PdfReader(str(path))
        return "\n".join((p.extract_text() or "") for p in reader.pages)
    except Exception:
        return ""


def classify(text: str) -> tuple:
    """(tier, reason). Tiers: strong | usable | reject."""
    if len(text) < MIN_CHARS:
        return "reject", f"only {len(text)} chars extracted (likely a scan)"
    slugs = len(SLUG_RE.findall(text))
    cues = len(CUE_RE.findall(text))
    if slugs >= 40 and cues >= 80:
        return "strong", ""
    if slugs >= MIN_SLUGLINES:
        return "usable", f"{slugs} sluglines, {cues} cues"
    return "reject", f"{slugs} sluglines — prose, a novelisation, or broken extraction"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf_dir")
    ap.add_argument("out_dir")
    ap.add_argument("--limit", type=int, default=0, help="stop after N files (for a trial run)")
    args = ap.parse_args(argv)

    src, out = Path(args.pdf_dir), Path(args.out_dir)
    if not src.is_dir():
        print(f"error: {src} is not a directory", file=sys.stderr)
        return 2
    out.mkdir(parents=True, exist_ok=True)

    pdfs = sorted(src.rglob("*.pdf"))
    if args.limit:
        pdfs = pdfs[: args.limit]

    tally = {"strong": 0, "usable": 0, "reject": 0}
    rejects = []

    for i, pdf in enumerate(pdfs, 1):
        text = extract(pdf)
        tier, reason = classify(text)
        tally[tier] += 1

        if tier == "reject":
            rejects.append((pdf.name, reason))
        else:
            # Keep the parent folder as the genre label, which is what unlocks
            # genre-conditioned benchmarking downstream.
            genre = pdf.parent.name if pdf.parent != src else "unlabelled"
            dest = out / _safe(genre)
            dest.mkdir(parents=True, exist_ok=True)
            (dest / f"{_safe(pdf.stem)}.txt").write_text(text, encoding="utf-8")

        if i % 100 == 0:
            print(f"  {i}/{len(pdfs)} …", flush=True)

    print(f"\nProcessed {len(pdfs)} PDFs")
    print(f"  strong  {tally['strong']}")
    print(f"  usable  {tally['usable']}")
    print(f"  reject  {tally['reject']}")
    print(f"\n  -> {tally['strong'] + tally['usable']} usable text files in {out}")

    if rejects:
        print(f"\nExcluded ({len(rejects)}), first 15:")
        for name, why in rejects[:15]:
            print(f"  - {name[:60]}: {why}")
    return 0


def _safe(name: str) -> str:
    return re.sub(r"[^\w\- ]+", "", name).strip() or "unnamed"


if __name__ == "__main__":
    raise SystemExit(main())
