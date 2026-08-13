"""Benchmarking — compare one draft against the corpus distribution.

This is the layer the 1000-script corpus exists for. Retrieval answers "what
technique might help?"; benchmarking answers "is this actually unusual?" — and
only the second one can tell a writer their act one is long, because that is a
claim about a distribution, not about a text.

Design rules:

* **Percentile, not pass/fail.** "Longer than 94% of the corpus" invites a
  decision. "Too long" picks a fight, and the writer may be right.
* **Silence is a result.** Metrics inside the normal band produce no note. A
  report that flags everything gets switched off, and the writer learns nothing
  about which of their choices is actually the outlier.
* **Never compare a short to a feature.** Only length-independent ratios are
  benchmarked (see `fingerprint.COMPARABLE_METRICS`), and cohorts are filtered
  by genre when there is enough data to support it.
* **Say n.** A percentile from six films is noise wearing a lab coat, so every
  verdict carries its cohort size and small cohorts are suppressed entirely.
"""
import json
import os
from pathlib import Path
from typing import List

import fingerprint

# Measurements only — no screenplay text — so this file is safe to ship.
CORPUS_PATH = os.getenv("CORPUS_FINGERPRINTS", "corpus_fingerprints.json")

_corpus_cache = None


def load_corpus(path: str = None) -> List[dict]:
    """Load corpus fingerprints, cached. Missing file is not an error — the
    product works without a corpus, it just cannot benchmark yet."""
    global _corpus_cache
    if _corpus_cache is not None and path is None:
        return _corpus_cache
    p = Path(path or CORPUS_PATH)
    try:
        rows = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        rows = []
    if path is None:
        _corpus_cache = rows
    return rows

# Below this, a cohort's percentiles are not meaningfully different from noise.
MIN_COHORT = 12

# Flag only genuine outliers. The middle 80% of the corpus is "normal", and
# saying so out loud is what keeps the report short enough to read.
LOW_PCT, HIGH_PCT = 0.10, 0.90

# How each metric reads in plain language when a draft sits at an extreme.
# (low end, high end) — phrased as observations, never as instructions.
METRIC_LANGUAGE = {
    "median_scene_pages": (
        "Your scenes are shorter than most of the corpus.",
        "Your scenes run longer than most of the corpus.",
    ),
    "dialogue_action_ratio": (
        "Your draft leans on action over dialogue more than most of the corpus.",
        "Your draft is more dialogue-heavy than most of the corpus.",
    ),
    "speaking_top3_share": (
        "Your dialogue is spread across a wider cast than most of the corpus.",
        "Your dialogue concentrates on very few speakers.",
    ),
    "int_ext_ratio": (
        "Your draft plays mostly outdoors compared to the corpus.",
        "Your draft plays mostly indoors compared to the corpus.",
    ),
    "day_night_ratio": (
        "Your draft is unusually night-heavy.",
        "Your draft is unusually day-heavy.",
    ),
    "location_churn": (
        "Your draft returns to the same locations more than most of the corpus.",
        "Your draft moves between locations more than most of the corpus.",
    ),
    "lead_presence_pct": (
        "Your lead is absent from more of the script than is typical.",
        "Your lead is present in nearly every scene.",
    ),
    "longest_scene_pages": (
        "Your longest scene is short compared to the corpus.",
        "You have a single scene much longer than the corpus norm.",
    ),
}


def _percentile_of(value: float, population: List[float]) -> float:
    """Midrank percentile of `value` within `population`.

    Ties count as half, which matters more than it sounds. Several of these
    metrics have a mass point — `lead_presence_pct` is 1.0 for any script whose
    protagonist is in every scene, and that is most of them. Counting ties as
    "at or below" scores a draft sitting exactly on the median at the 100th
    percentile, and the writer gets told their perfectly ordinary script is an
    outlier. Midrank puts it at 0.5, where it belongs.
    """
    n = len(population)
    if not n:
        return 0.0
    below = sum(1 for p in population if p < value)
    equal = sum(1 for p in population if p == value)
    return (below + 0.5 * equal) / n


def cohort(fingerprints: List[dict], genre: str = "") -> tuple:
    """Pick the comparison set: same genre when that is big enough, else all.

    Returns (rows, label). Falling back to the whole corpus is better than
    reporting confident nonsense from four same-genre films — but the label
    changes so the UI can say which happened.
    """
    valid = [f for f in fingerprints if f.get("valid")]
    if genre:
        same = [f for f in valid if (f.get("genre") or "").lower() == genre.lower()]
        if len(same) >= MIN_COHORT:
            return same, genre
    return valid, "all genres"


def compare(draft_stats: dict, fingerprints: List[dict], genre: str = "") -> dict:
    """Benchmark a parsed draft against the corpus.

    `draft_stats` is a `fingerprint.fingerprint()` result for the user's own
    text — same function, same vocabulary, so no translation happens here.
    """
    rows, label = cohort(fingerprints, genre)
    if len(rows) < MIN_COHORT:
        return {
            "available": False,
            "reason": f"Need at least {MIN_COHORT} analysed scripts to benchmark; have {len(rows)}.",
            "cohort": label,
            "cohort_size": len(rows),
            "notes": [],
        }

    notes = []
    measured = {}
    for metric in fingerprint.COMPARABLE_METRICS:
        mine = draft_stats.get(metric)
        population = [f[metric] for f in rows if f.get(metric) is not None]
        if mine is None or len(population) < MIN_COHORT:
            continue

        pct = _percentile_of(mine, population)
        ordered = sorted(population)
        measured[metric] = {
            "value": mine,
            "percentile": round(pct, 3),
            "corpus_median": round(ordered[len(ordered) // 2], 3),
            "n": len(population),
        }

        if pct <= LOW_PCT or pct >= HIGH_PCT:
            low_text, high_text = METRIC_LANGUAGE.get(metric, ("", ""))
            notes.append({
                "metric": metric,
                "observation": low_text if pct <= LOW_PCT else high_text,
                "your_value": mine,
                "corpus_median": measured[metric]["corpus_median"],
                "percentile": round(pct, 3),
                "n": len(population),
                "cohort": label,
            })

    return {
        "available": True,
        "cohort": label,
        "cohort_size": len(rows),
        "measured": measured,
        # Most extreme first — if a writer reads only one line, make it the
        # one they are furthest from the norm on.
        "notes": sorted(notes, key=lambda n: abs(n["percentile"] - 0.5), reverse=True),
    }
