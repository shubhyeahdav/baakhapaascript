"""Script review — the pre-finalization check (proposal FR07).

FR07 asks for "automated review [that] checks scene timing, character name
consistency, and act balance before finalization". A `review_script()` prompt
was written for this months ago and wired to nothing, so finalizing a script
only ever flipped `status` to "finalized" and nobody was told anything.

This replaces it with a deterministic reviewer, for the same reasons the craft
linter is deterministic:

  * it costs no API call, so it runs on every tier and on every finalize,
  * the same draft always produces the same verdict, and
  * it works on a partial draft, where a model would confidently invent a
    reading of a script that is half-written.

Findings share the linter's shape (`rule`, `severity`, `message`) so the editor
can render them with the machinery it already has.
"""
import difflib

import screenplay
import scene_sync

# One script page runs about a minute. The page itself is defined once, in
# `screenplay.PAGE_LINES`, and everything measures against it — this file kept
# its own copy of the number and a different rule for which lines counted, so a
# review could tell a writer a scene ran 2 minutes while the editor's timeline
# showed the same scene at 4. A second opinion nobody asked for.

# Two speaker names this similar are almost certainly the same character typed
# two ways (RAAJA / RAJA). Below it, they are different people (RAAJA / RAJESH).
NAME_SIMILARITY = 0.82

# How far a written scene may drift from its planned allocation before it is
# worth mentioning. Screenwriting is not budgeting; only gross drift matters.
TIMING_OVER = 2.0
TIMING_UNDER = 0.4
TIMING_MIN_ALLOCATION = 1.0

# Act shares the structure generator targets, and how far off is worth a flag.
TARGET_ACT_SHARE = {1: 0.33, 2: 0.33, 3: 0.34}
ACT_SHARE_TOLERANCE = 0.12

# Total runtime tolerance against what the project asked for.
RUNTIME_TOLERANCE = 0.25


def _finding(rule, severity, message, detail=""):
    return {"rule": rule, "severity": severity, "message": message, "detail": detail}


def _scene_minutes(scene, spans: dict | None = None) -> float:
    """Estimated screen time for one parsed scene.

    Measured over the lines the scene actually occupies on the page when a span
    map is available. Counting only its typed elements undercounts by roughly
    half, because a screenplay page is mostly the blank lines between them.
    """
    if spans and scene.line_number in spans:
        return round(spans[scene.line_number] / screenplay.PAGE_LINES, 2)
    return round((1 + len(scene.elements)) / screenplay.PAGE_LINES, 2)


def _scene_spans(text: str) -> dict:
    """Line span of each scene, keyed by its heading line."""
    scs = screenplay.scenes(text)
    starts = [sc.line_number for sc in scs]
    total = len((text or "").split("\n"))
    return {
        sc.line_number: (starts[i + 1] if i + 1 < len(starts) else total + 1) - sc.line_number
        for i, sc in enumerate(scs)
    }


def check_character_names(text: str) -> list:
    """Near-duplicate speaker names — the classic continuity error.

    A character who is RAAJA on page 4 and RAJA on page 40 reads as two people
    to a casting director and to every downstream tool, including this one's
    own storyboard cast list.
    """
    speakers = []
    for el in screenplay.parse(text):
        if el.type == "character" and el.text not in speakers:
            speakers.append(el.text)

    findings = []
    for i, a in enumerate(speakers):
        for b in speakers[i + 1:]:
            if a == b:
                continue
            ratio = difflib.SequenceMatcher(None, a.upper(), b.upper()).ratio()
            if ratio >= NAME_SIMILARITY:
                findings.append(_finding(
                    "character_name_inconsistent", "high",
                    f"{a} and {b} look like the same character spelled two ways.",
                    "Pick one spelling and use it in every cue — casting, "
                    "scheduling and the storyboard cast list all key off this.",
                ))
    return findings


def check_scene_timing(text: str, scenes: list) -> list:
    """Written length against the time each scene was allotted."""
    written = screenplay.scenes(text)
    spans = _scene_spans(text)
    by_heading = {}
    for sc in written:
        if sc.heading != screenplay.UNTITLED_SCENE:
            by_heading.setdefault(sc.heading.strip().upper(), []).append(sc)

    findings = []
    for row in scenes or []:
        allocation = float(row.get("time_allocation") or 0)
        if allocation < TIMING_MIN_ALLOCATION:
            continue

        heading = (scene_sync.read_draft(row).get("heading") or "").strip().upper()
        matches = by_heading.get(heading) or []
        if not matches:
            findings.append(_finding(
                "scene_not_written", "medium",
                f"\"{row.get('title') or 'Untitled scene'}\" has {allocation:g} min "
                "allotted but nothing written yet.",
            ))
            continue

        actual = sum(_scene_minutes(m, spans) for m in matches)
        if actual > allocation * TIMING_OVER:
            findings.append(_finding(
                "scene_over_length", "medium",
                f"\"{row.get('title') or heading}\" runs about {actual:g} min "
                f"against {allocation:g} min allotted.",
                "Either the scene is doing more than one job, or the plan was wrong.",
            ))
        elif actual < allocation * TIMING_UNDER:
            findings.append(_finding(
                "scene_under_length", "low",
                f"\"{row.get('title') or heading}\" runs about {actual:g} min "
                f"against {allocation:g} min allotted.",
            ))
    return findings


def check_act_balance(text: str, scenes: list) -> list:
    """Written screen time per act against the 33/33/34 the structure promised."""
    spans = _scene_spans(text)
    act_by_heading = {}
    for row in scenes or []:
        heading = (scene_sync.read_draft(row).get("heading") or "").strip().upper()
        if heading:
            act_by_heading[heading] = row.get("act_number") or 1

    minutes = {1: 0.0, 2: 0.0, 3: 0.0}
    for sc in screenplay.scenes(text):
        if sc.heading == screenplay.UNTITLED_SCENE:
            continue
        act = act_by_heading.get(sc.heading.strip().upper())
        if act in minutes:
            minutes[act] += _scene_minutes(sc, spans)

    total = sum(minutes.values())
    if total <= 0:
        return []

    # Acts have to have been assigned before their balance means anything.
    #
    # `scene_sync` gives a hand-written scene the act of the scene before it,
    # defaulting to Act 1 — so a screenplay typed straight into the editor puts
    # every scene in Act 1 and this check fired three times: act 1 long, act 2
    # short, act 3 short. All three were artefacts of an act assignment nobody
    # had made, and a review that cries wolf on every hand-typed draft is worse
    # than one that stays quiet.
    #
    # Inferring the acts from position would be worse still: the inference and
    # the target are the same 33/33/34, so the check would pass by construction.
    if sum(1 for m in minutes.values() if m > 0) < 2:
        return [_finding(
            "act_balance_unknown", "low",
            "Act balance was not checked: every written scene sits in the same "
            "act, so no act boundaries have been set yet.",
            "Generate a structure, or assign scenes to acts in the Outline "
            "view, and this becomes a real check.",
        )]

    findings = []
    for act, target in TARGET_ACT_SHARE.items():
        share = minutes[act] / total
        if abs(share - target) > ACT_SHARE_TOLERANCE:
            direction = "long" if share > target else "short"
            findings.append(_finding(
                "act_out_of_balance", "medium",
                f"Act {act} is running {direction}: {round(share * 100)}% of the "
                f"written script against a {round(target * 100)}% target.",
                "Act 2 running short is the usual sign the middle has not been "
                "written yet rather than that the structure is wrong.",
            ))
    return findings


def check_total_runtime(text: str, duration_minutes) -> list:
    """Estimated runtime against the length the project was set up for."""
    try:
        planned = float(duration_minutes or 0)
    except (TypeError, ValueError):
        planned = 0.0
    if planned <= 0:
        return []

    estimated = screenplay.statistics(text)["estimated_minutes"]
    if estimated <= 0:
        return []

    drift = abs(estimated - planned) / planned
    if drift <= RUNTIME_TOLERANCE:
        return []

    direction = "over" if estimated > planned else "under"
    return [_finding(
        "runtime_drift", "low",
        f"The draft estimates {estimated:g} min against the {planned:g} min "
        f"this project was set up for — {direction} by {round(drift * 100)}%.",
        "One page is roughly one minute, so this tracks page count, not pacing.",
    )]


def review(text: str, scenes: list, project: dict) -> dict:
    """Run every check. `ready` means nothing high-severity is outstanding.

    Nothing here blocks finalizing. A writer is allowed to finalize a script a
    tool disagrees with — the review's job is to make sure they do it knowing
    what it found, not to hold the door shut.
    """
    text = text or ""
    findings = (
        check_character_names(text)
        + check_scene_timing(text, scenes)
        + check_act_balance(text, scenes)
        + check_total_runtime(text, (project or {}).get("duration_minutes"))
    )

    counts = {level: sum(1 for f in findings if f["severity"] == level)
              for level in ("high", "medium", "low")}

    return {
        "ready": counts["high"] == 0,
        "findings": findings,
        "counts": counts,
        "statistics": screenplay.statistics(text),
    }
