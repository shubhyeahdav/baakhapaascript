"""Does retrieval actually put the right craft pattern first?

Nothing in this product knows. `load_knowledge_base.py` ends with four canned
probes, and they pass — but they only ask whether the right craft level appears
ANYWHERE in the top three. Look at what they actually printed:

    probe [OK] want=dialogue  got=['scene', 'dialogue', 'scene']
    probe [OK] want=scene     got=['scene', 'image', 'scene']
    probe [OK] want=character got=['dialogue', 'character', 'scene']
    probe [OK] want=structure got=['scene', 'structure', 'structure']

Three of the four put the WRONG level first. Position one is the card a
writer's eye lands on, so the number that matters is precision@1, and on those
four probes it is 25%.

This script turns that into something you can measure and improve. Run it,
commit the baseline, change something (a bigger embedding model, reranking,
better `problem` text), run it again. That before/after number is the whole
point — of the eval, and of the engineering.

    ./venv/Scripts/python eval_retrieval.py
    ./venv/Scripts/python eval_retrieval.py --json    # for CI

NOTE FOR THE AUTHOR: the three metric functions below are deliberately left
unimplemented. They are ten lines each and they are the part worth writing
yourself — everything around them is scaffolding.
"""
import argparse
import json
import sys
from collections import Counter

import rag


# --- the golden set -------------------------------------------------------
#
# Mined from the corpus rather than invented, which is what keeps it honest.
# Every entry's own `problem` field is a query whose correct answer is that
# entry: it is how a writer would describe the symptom, and it is what the
# embedding is built from.
#
# The editor's focus chips are the second source. They are real queries typed
# by nobody — they are what the UI sends when a writer presses "Feels flat" —
# so if retrieval is wrong for them it is wrong in production.

FOCUS_QUERIES = {
    "this scene feels flat and skippable, nothing changes in it, the characters "
    "just talk and it drags": "scene",
    "my dialogue is on the nose, characters say exactly what they feel, it "
    "sounds like a therapy transcript with no subtext": "dialogue",
    "my characters sound the same and feel predictable, thin, described rather "
    "than shown": "character",
    "the middle sags and the ending feels unearned, the protagonist is passive "
    "and things just happen to them": "structure",
    "the emotion is overwrought and melodramatic, it feels sentimental and "
    "false rather than restrained": "dialogue",
}


def golden_set():
    """[(query, expected_technique, expected_craft_level), ...]

    Two kinds of case, and they test different things:

      * `problem` -> its own entry. Exact retrieval. If this fails the
        embedding is not doing its job at all.
      * a focus chip -> the right craft LEVEL. Looser, and closer to the real
        job: nobody knows which single entry is right, but a dialogue complaint
        must not return structure advice.
    """
    entries = rag.load_entries() if hasattr(rag, "load_entries") else _entries_from_json()
    cases = []
    for e in entries:
        problem = (e.get("problem") or "").strip()
        if problem:
            cases.append((problem, e.get("technique"), e.get("craft_level"), "self"))
    for query, level in FOCUS_QUERIES.items():
        cases.append((query, None, level, "chip"))
    return cases


def _entries_from_json(path="knowledge_base.json"):
    raw = json.load(io_open(path))
    return raw if isinstance(raw, list) else (raw.get("patterns") or list(raw.values())[0])


def io_open(path):
    import io as _io
    return _io.open(path, encoding="utf-8")


# --- metrics: YOURS TO WRITE ----------------------------------------------

def precision_at_k(results, expected_technique, expected_level, k=1):
    """Did the right answer appear in the first k results?

    `results` is what `rag.retrieve_relevant_patterns` returned: a list of
    dicts with `technique` and `craft_level`.

    Score a hit when `expected_technique` matches, or — when the case has no
    specific technique — when `craft_level` matches. Return 1.0 or 0.0.
    """
    for r in results[:k]:
        if expected_technique:
            if r.get("technique") == expected_technique:
                return 1.0
        elif r.get("craft_level") == expected_level:
            return 1.0
    return 0.0


def reciprocal_rank(results, expected_technique, expected_level):
    """1 / (position of the first correct result), or 0.0 if it never appears.

    Rank is 1-based: first position scores 1.0, second 0.5, third 0.333.
    Averaged over every case this is MRR, and unlike precision@1 it can tell
    "just missed" apart from "nowhere near".
    """
    for i, r in enumerate(results, start=1):
        hit = (r.get("technique") == expected_technique if expected_technique
               else r.get("craft_level") == expected_level)
        if hit:
            return 1.0 / i
    return 0.0


def summarise(scores):
    """Turn per-case scores into the numbers you report.

    `scores` is a list of dicts: {"p_at_1": float, "p_at_3": float, "rr": float,
    "level": str}. Return overall means plus a per-craft-level breakdown —
    the breakdown is what tells you WHICH part of the corpus is weak, which is
    the difference between a number and a lead.
    """
    n = len(scores) or 1
    by_kind = {}
    for row in scores:
        b = by_kind.setdefault(row.get("kind", "self"), {"hits": 0.0, "h3": 0.0, "n": 0})
        b["hits"] += row["p_at_1"]
        b["h3"] += row["p_at_3"]
        b["n"] += 1
    by_level = {}
    for row in scores:
        b = by_level.setdefault(row["level"], {"hits": 0.0, "n": 0})
        b["hits"] += row["p_at_1"]
        b["n"] += 1
    return {
        "p_at_1": sum(r["p_at_1"] for r in scores) / n,
        "p_at_3": sum(r["p_at_3"] for r in scores) / n,
        "mrr": sum(r["rr"] for r in scores) / n,
        "by_level": {
            lvl: {"p_at_1": b["hits"] / b["n"], "n": b["n"]}
            for lvl, b in by_level.items()
        },
        "by_kind": {
            k: {"p_at_1": b["hits"] / b["n"], "p_at_3": b["h3"] / b["n"], "n": b["n"]}
            for k, b in by_kind.items()
        },
    }


# --- runner ---------------------------------------------------------------

def run(top_k=3):
    cases = golden_set()
    if not cases:
        sys.exit("No cases. Is knowledge_base.json present?")

    scores = []
    for query, technique, level, kind in cases:
        results = rag.retrieve_relevant_patterns("Drama", "Emotional", query, top_k=top_k)
        scores.append({
            "query": query[:60],
            "level": level,
            "kind": kind,
            "p_at_1": precision_at_k(results, technique, level, k=1),
            "p_at_3": precision_at_k(results, technique, level, k=top_k),
            "rr": reciprocal_rank(results, technique, level),
        })
    return summarise(scores), scores


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="machine-readable, for CI")
    ap.add_argument("--top-k", type=int, default=3)
    args = ap.parse_args()

    summary, scores = run(args.top_k)

    if args.json:
        print(json.dumps({"summary": summary, "cases": scores}, indent=2))
        return

    print(f"\n  {len(scores)} cases\n")
    kinds = summary.get("by_kind", {})
    chip = kinds.get("chip")
    if chip:
        # The headline. These are the queries the editor really sends, and they
        # are the only ones where nobody already knows the answer.
        print(f"  REAL QUERIES (focus chips, n={chip['n']})")
        print(f"    precision@1  {chip['p_at_1']:.1%}")
        print(f"    precision@3  {chip['p_at_3']:.1%}")
    me = kinds.get("self")
    if me:
        # Kept, but never averaged in with the above. An entry's own `problem`
        # retrieving that entry is close to free: the query IS the text that was
        # embedded. Mixed together, 29 easy cases drowned 5 real ones and the
        # combined score read 82% while the part that matters read 20%.
        print(f"\n  SANITY CHECK (an entry finds itself, n={me['n']})")
        print(f"    precision@1  {me['p_at_1']:.1%}   <- should stay near 100%")
    print(f"\nall {len(scores)} cases: p@1 {summary['p_at_1']:.1%} | MRR {summary['mrr']:.3f}")
    print("\nby craft level")
    for level, s in sorted(summary.get("by_level", {}).items()):
        print(f"    {level:<10} p@1 {s['p_at_1']:.0%}   n={s['n']}")
    print()


if __name__ == "__main__":
    main()
