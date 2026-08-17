"""Structural fingerprints — one row of measurements per screenplay.

A fingerprint is *facts about* a script: how many scenes, how long they run,
how dialogue distributes across the cast. It contains no screenplay text, which
is what makes a corpus of them safe to ship when the scripts themselves are
copyrighted.

The point is comparison. A single fingerprint says little; a thousand of them
give you a distribution, and a distribution turns "your second act drags" from
an opinion into a measurement:

    Your act-one share is 42%. Corpus median for drama is 27% (n=63).

Everything here builds on `screenplay.statistics()` rather than re-deriving
metrics, so a user's draft and a corpus film are always measured the same way.
That shared vocabulary is the whole design — the moment the two sides compute
"scene length" differently, every comparison silently lies.

Deliberately NOT computed here: act breaks. Inferring them from scene rhythm
is guesswork without labelled data, and a confident-looking wrong act boundary
is worse than none. `scene_length_curve` lets you compare overall shape without
claiming to know where act one ends.
"""
from statistics import median
from typing import List, Optional

import screenplay

# Roughly one page of screenplay per 55 lines, and one page ≈ one minute.
LINES_PER_PAGE = 55

# Sluglines end with a time-of-day marker: "INT. KITCHEN - NIGHT".
DAY_MARKERS = ("DAY", "MORNING", "AFTERNOON", "DAWN", "SUNRISE", "MIDDAY", "NOON")
NIGHT_MARKERS = ("NIGHT", "EVENING", "DUSK", "SUNSET", "MIDNIGHT", "LATER THAT NIGHT")

# Below this, a file didn't parse as a screenplay (scan, prose, novelisation)
# and its numbers would poison the distribution.
MIN_SCENES_FOR_VALID_FINGERPRINT = 15
MIN_DIALOGUE_FOR_VALID_FINGERPRINT = 40


def _scene_pages(scene: screenplay.Scene) -> float:
    """Page estimate for one scene, from its line count."""
    lines = sum(1 for el in scene.elements if el.text.strip()) + 1  # +1 for the heading
    return round(lines / LINES_PER_PAGE, 3)


def _time_of_day(heading: str) -> Optional[str]:
    """Classify a slugline's time marker. None when it has none."""
    tail = heading.upper().rsplit("-", 1)[-1].strip() if "-" in heading else heading.upper()
    if any(m in tail for m in NIGHT_MARKERS):
        return "night"
    if any(m in tail for m in DAY_MARKERS):
        return "day"
    return None


def _location(heading: str) -> str:
    """The location part of a slugline, minus INT/EXT and time of day."""
    h = heading.upper().strip()
    for prefix in ("INT./EXT.", "EXT./INT.", "I/E.", "INT.", "EXT.", "INT", "EXT"):
        if h.startswith(prefix):
            h = h[len(prefix):]
            break
    return h.rsplit("-", 1)[0].strip() if "-" in h else h.strip()


def _curve(scene_pages: List[float], buckets: int = 10) -> List[float]:
    """Normalised scene-length curve: mean scene length per decile of runtime.

    Comparable across scripts of any length, which is the point — a 95-page
    short and a 140-page epic can still be asked whether they sag in the middle.
    """
    if not scene_pages:
        return []
    out = []
    n = len(scene_pages)
    for b in range(buckets):
        lo, hi = int(b * n / buckets), int((b + 1) * n / buckets)
        chunk = scene_pages[lo:hi] or scene_pages[min(lo, n - 1):min(lo, n - 1) + 1]
        out.append(round(sum(chunk) / len(chunk), 3))
    return out


def fingerprint(text: str, title_ref: str = "", genre: str = "", tradition: str = "") -> dict:
    """Measure one screenplay. Returns the row that goes into the corpus.

    `valid` is the gate: files that fail to parse as screenplays still produce
    numbers, and those numbers are meaningless. Filter on it before computing
    any distribution.
    """
    stats = screenplay.statistics(text)
    scs = screenplay.scenes(text)
    pages = [_scene_pages(s) for s in scs]

    times = [_time_of_day(s.heading) for s in scs]
    day = sum(1 for t in times if t == "day")
    night = sum(1 for t in times if t == "night")

    locations = [_location(s.heading) for s in scs if s.heading]
    unique_locations = len({l for l in locations if l})

    # Share of scenes the most-speaking character appears in. A protagonist who
    # vanishes for long stretches is a real structural signal.
    lead = (stats["speaking_characters"] or [None])[0]
    lead_scenes = sum(1 for s in scs if lead and lead in s.speaking_characters)

    valid = (
        stats["scene_count"] >= MIN_SCENES_FOR_VALID_FINGERPRINT
        and stats["dialogue_lines"] >= MIN_DIALOGUE_FOR_VALID_FINGERPRINT
    )

    return {
        "title_ref": title_ref,
        "genre": genre,
        "tradition": tradition,
        "valid": valid,
        # --- shared with screenplay.statistics(), same vocabulary ------------
        "scene_count": stats["scene_count"],
        "estimated_pages": stats["estimated_pages"],
        "dialogue_lines": stats["dialogue_lines"],
        "action_lines": stats["action_lines"],
        "dialogue_action_ratio": stats["dialogue_action_ratio"],
        "character_count": stats["character_count"],
        "speaking_top3_share": stats["speaking_top3_share"],
        "int_ext_ratio": stats["int_ext_ratio"],
        # --- corpus-only additions ------------------------------------------
        "median_scene_pages": round(median(pages), 3) if pages else None,
        "longest_scene_pages": round(max(pages), 3) if pages else None,
        # Longest scene as a SHARE of the script, which is the length-
        # independent version. Raw page count is not comparable across formats:
        # a feature's longest scene is longer than a short's entire runtime, so
        # benchmarking the raw number tells a short-film writer only that they
        # wrote a short film.
        "longest_scene_share": (
            round(max(pages) / sum(pages), 3) if pages and sum(pages) else None
        ),
        "day_night_ratio": round(day / (day + night), 3) if (day + night) else None,
        "unique_locations": unique_locations,
        "location_churn": round(unique_locations / len(scs), 3) if scs else None,
        "lead_presence_pct": round(lead_scenes / len(scs), 3) if scs else None,
        "scene_length_curve": _curve(pages),
    }


# Metrics a draft can be benchmarked on. Excludes counts that scale with
# length (scene_count, pages) — comparing those across a short and a feature
# says nothing. Ratios and shape are length-independent, so they compare.
COMPARABLE_METRICS = (
    "median_scene_pages",
    "dialogue_action_ratio",
    "speaking_top3_share",
    "int_ext_ratio",
    "day_night_ratio",
    "location_churn",
    "lead_presence_pct",
    # Share, not raw pages — see the note on longest_scene_share above.
    # `longest_scene_pages` is still recorded on each fingerprint because it is
    # a useful fact about a script; it is simply not comparable across formats.
    "longest_scene_share",
)
