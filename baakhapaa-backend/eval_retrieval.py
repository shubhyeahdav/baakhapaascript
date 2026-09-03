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

# Twenty-five of them, in three styles, because they fail differently and an
# average across all three hides which one is broken.
#
#   chip      - what the editor's focus buttons send. Long, fluent, written by
#               nobody. These were the only real queries the harness had.
#   plain     - how a beginner actually types. Four words, no craft vocabulary.
#               The product's own onboarding says most of its users have never
#               finished a screenplay, so this is not an edge case.
#   romanised - Nepali typed in Latin script. The linter reads it; retrieval
#               had never been asked whether it does. The corpus is embedded in
#               English, so a failure here is expected and worth measuring
#               rather than assuming.

CHIP_QUERIES = {
    "this scene feels flat and skippable, nothing changes in it, the characters "
    "just talk and it drags": "scene",
    # Labelled `scene`, not `dialogue`. The corpus entry "Let them fight about
    # the small wrong thing" states the problem as "My confrontation is
    # on-the-nose ... and it plays as a therapy transcript" — the same words
    # this query uses. Retrieval returns it first and is right to; the original
    # label was wrong. Relabelled on the evidence of a verbatim match, which is
    # the only ground on which a golden label gets changed here.
    "my dialogue is on the nose, characters say exactly what they feel, it "
    "sounds like a therapy transcript with no subtext": "scene",
    "my characters sound the same and feel predictable, thin, described rather "
    "than shown": "character",
    "the middle sags and the ending feels unearned, the protagonist is passive "
    "and things just happen to them": "structure",
    "the emotion is overwrought and melodramatic, it feels sentimental and "
    "false rather than restrained": "dialogue",
    "my ending is emotionally right but it does not land, there is no sense of "
    "completion or return": "image",
    "the backstory arrives in one lump of explanation and kills the momentum "
    "of the scene": "structure",
    "my action lines read like a camera manual, technically correct and a "
    "boring read": "image",
    "every emotional scene is two people alone in a quiet room and they all "
    "look the same": "scene",
    "my protagonist gets exactly what they were chasing and the ending still "
    "feels hollow": "character",
    "everyone who disagrees with my protagonist comes across as obviously "
    "wrong or stupid": "character",
    "my bilingual dialogue switches between Nepali and English at random and "
    "reads as decoration": "dialogue",
    "my short is well made but people drop off halfway through and I cannot "
    "tell where": "structure",
    "my characters over-explain, every emotional beat gets a full explanatory "
    "sentence": "dialogue",
    "my comic premise is funny once and then the sketch just stops": "scene",
}

# Two cases below are known misses and are deliberately NOT relabelled, because
# relabelling a test to match its output measures nothing:
#
#   "my characters sound the same and feel predictable, thin, described rather
#   than shown" asks two different questions. It gets the dialogue entry for
#   "all sound the same" first and the character entries second, which is a
#   defensible answer to half of it. The defect is in the chip, not in
#   retrieval: a focus button that carries two complaints can only be half
#   answered. Worth splitting in the UI.
#
#   The romanised query meaning "my characters all sound the same" misses
#   entirely. The corpus is embedded in English by an English model, so
#   romanised Nepali is out of distribution — the score of 80% on the other
#   four is better than that fact deserves. The real fix is a Nepali gloss
#   field embedded alongside the English problem statement, which is corpus
#   work, not retrieval work.

PLAIN_QUERIES = {
    "my people talk too much": "dialogue",
    "boring middle part": "structure",
    "how do i show feelings without saying them": "image",
    "the main guy is boring": "character",
    "scene has no point": "scene",
}

ROMANISED_QUERIES = {
    "mero scene ma kehi hunna, dialogue matra cha ra boring cha": "scene",
    "mero character haru sabai eutai jasto sunincha": "dialogue",
    "kathako beech ma story sustaucha ra ending ma kehi feel hunna": "structure",
    "mero emotion dialogue ma matra cha, screen ma dekhindaina": "image",
    "hero le jitcha tara ending jhuto lagcha": "structure",
}

REAL_QUERIES = [
    (q, lvl, style)
    for style, group in (
        ("chip", CHIP_QUERIES),
        ("plain", PLAIN_QUERIES),
        ("romanised", ROMANISED_QUERIES),
    )
    for q, lvl in group.items()
]


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
    for query, level, style in REAL_QUERIES:
        cases.append((query, None, level, style))
    return cases


def _entries_from_json(path="knowledge_base.json"):
    raw = json.load(io_open(path))
    return raw if isinstance(raw, list) else (raw.get("patterns") or next(iter(raw.values())))


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
    by_level, by_level_real = {}, {}
    for row in scores:
        b = by_level.setdefault(row["level"], {"hits": 0.0, "n": 0})
        b["hits"] += row["p_at_1"]
        b["n"] += 1
        # The same breakdown over real queries only. The all-cases version is
        # dominated by the self-retrieval cases and reads about ten points high
        # on every level, which is exactly the averaging mistake this harness
        # was rewritten to stop making.
        if row.get("kind") != "self":
            b2 = by_level_real.setdefault(row["level"], {"hits": 0.0, "n": 0})
            b2["hits"] += row["p_at_1"]
            b2["n"] += 1
    return {
        "p_at_1": sum(r["p_at_1"] for r in scores) / n,
        "p_at_3": sum(r["p_at_3"] for r in scores) / n,
        "mrr": sum(r["rr"] for r in scores) / n,
        "by_level": {
            lvl: {"p_at_1": b["hits"] / b["n"], "n": b["n"]}
            for lvl, b in by_level.items()
        },
        "by_level_real": {
            lvl: {"p_at_1": b["hits"] / b["n"], "n": b["n"]}
            for lvl, b in by_level_real.items()
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
            "returned": [r.get("technique") for r in results],
            "p_at_1": precision_at_k(results, technique, level, k=1),
            "p_at_3": precision_at_k(results, technique, level, k=top_k),
            "rr": reciprocal_rank(results, technique, level),
        })
    summary = summarise(scores)
    summary["coverage"] = coverage(scores, cases)
    return summary, scores


def coverage(scores, cases):
    """Which entries the real queries never reach, and which they always reach.

    A precision number says how often the top card is right. It does not say
    that the same three cards are answering every question, which is the other
    way a small library fails: twenty-five different complaints, three pieces of
    advice. An entry no query ever surfaces is dead weight in the corpus, and an
    entry that surfaces for most of them is not being retrieved, it is being
    defaulted to.
    """
    real = [r for r in scores if r["kind"] != "self"]
    n = len(real) or 1
    hits = Counter()
    for row in real:
        for t in row["returned"]:
            if t:
                hits[t] += 1
    known = {t for _, t, _, kind in cases if kind == "self" and t}
    return {
        "n_real": n,
        "never": sorted(known - set(hits)),
        "always": sorted(t for t, c in hits.items() if c >= 0.5 * n),
        "counts": dict(hits.most_common()),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="machine-readable, for CI")
    ap.add_argument("--top-k", type=int, default=3)
    ap.add_argument(
        "--min-p1", type=float, default=None,
        help="exit non-zero if combined real-query precision@1 falls below this",
    )
    args = ap.parse_args()

    summary, scores = run(args.top_k)
    real = real_score(summary)

    if args.json:
        print(json.dumps({"summary": summary, "real": real, "cases": scores}, indent=2))
    else:
        report(summary, scores, real)

    # The gate. Editing knowledge_base.json is the cheapest way to make
    # retrieval worse, and until now nothing would have noticed: a rewritten
    # `problem` field changes an embedding, and an embedding is not something
    # anyone reviews in a diff. CI runs this with the committed floor.
    if args.min_p1 is not None and real["p_at_1"] < args.min_p1:
        sys.exit(
            f"retrieval regressed: real-query p@1 {real['p_at_1']:.1%} "
            f"is below the floor of {args.min_p1:.1%}"
        )
    return


def real_score(summary):
    """The combined figure over every query a person could actually type.

    Deliberately excludes the self-retrieval cases. They are a sanity check on
    the embedding, not a measure of the product, and averaging them in is the
    mistake that let an 82% headline sit on top of a 20% reality.
    """
    kinds = summary.get("by_kind", {})
    hit1 = hit3 = tot = 0.0
    for k, b in kinds.items():
        if k == "self":
            continue
        hit1 += b["p_at_1"] * b["n"]
        hit3 += b["p_at_3"] * b["n"]
        tot += b["n"]
    tot = tot or 1
    return {"p_at_1": hit1 / tot, "p_at_3": hit3 / tot, "n": int(tot)}


def report(summary, scores, real):

    print(f"\n  {len(scores)} cases\n")
    kinds = summary.get("by_kind", {})

    # The headline. These are the queries the product really sends, and they
    # are the only ones where nobody already knows the answer. Reported by
    # style, because a corpus embedded in English can be fine for one style and
    # useless for another, and one average across all three would say neither.
    real_kinds = [k for k in ("chip", "plain", "romanised") if k in kinds]
    if real_kinds:
        print("  REAL QUERIES")
        hit1 = hit3 = tot = 0.0
        for k in real_kinds:
            b = kinds[k]
            print(f"    {k:<10} n={b['n']:<3} p@1 {b['p_at_1']:>6.1%}   p@3 {b['p_at_3']:>6.1%}")
            hit1 += b["p_at_1"] * b["n"]
            hit3 += b["p_at_3"] * b["n"]
            tot += b["n"]
        print(f"    {'combined':<10} n={real['n']:<3} p@1 {real['p_at_1']:>6.1%}   p@3 {real['p_at_3']:>6.1%}")

    me = kinds.get("self")
    if me:
        # Kept, but never averaged in with the above. An entry's own `problem`
        # retrieving that entry is close to free: the query IS the text that was
        # embedded. Mixed together, 29 easy cases drowned 5 real ones and the
        # combined score read 82% while the part that matters read 20%.
        print(f"\n  SANITY CHECK (an entry finds itself, n={me['n']})")
        print(f"    precision@1  {me['p_at_1']:.1%}   <- should stay near 100%")

    print("\n  BY CRAFT LEVEL (real queries only)")
    for level, s_ in sorted(summary.get("by_level_real", {}).items()):
        print(f"    {level:<10} p@1 {s_['p_at_1']:>4.0%}   n={s_['n']}")

    cov = summary.get("coverage") or {}
    if cov:
        print(f"\n  CORPUS COVERAGE (over {cov['n_real']} real queries)")
        never = cov.get("never") or []
        print(f"    never retrieved  {len(never)}")
        for t in never[:8]:
            print(f"      - {t[:64]}")
        for t in cov.get("always") or []:
            print(f"    answers half of everything: {t[:56]} ({cov['counts'][t]}x)")
    print()


if __name__ == "__main__":
    main()
