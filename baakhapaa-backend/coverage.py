"""Script coverage — the reader's report, assembled from what is already known.

Coverage is the document the industry actually passes around: someone reads a
screenplay and writes down what it is, what works, what does not, and whether
to take it further. Every AI screenwriting tool worth comparing against ships
one, and this product shipped none — while already computing every input.

That is the whole point of this module. `review.py` finds structural problems,
`benchmark.py` places the draft against 798 measured screenplays, `linter.py`
names craft faults line by line, and `screenplay.statistics` measures shape.
Four separate answers to four questions nobody asked in that form. A writer
asks one question — *is this any good, and what do I do next* — and until now
had to assemble the answer themselves out of four panels.

Two rules govern what goes in it.

**No AI call.** Every number here is measured or counted, which means coverage
is free, works offline, runs on a partial draft, and says the same thing twice
about the same script. A generated opinion would be none of those, and would
also be the one part a writer could not check.

**It never renders a verdict.** Real coverage ends in RECOMMEND or PASS because
a studio reader is deciding whether to buy. Nobody here is buying anything, and
a tool that tells a writer their script is a PASS has told them something
useless and discouraging in the same sentence. This reports what is measurable
and what the measurements are *evidence of*, and leaves the judgement where it
belongs.
"""
import benchmark
import fingerprint
import linter
import review
import screenplay

# Below this there is not enough script for the shape measurements to mean
# anything, and reporting percentiles on four scenes invites a writer to fix a
# problem they do not have.
MIN_SCENES_FOR_SHAPE = 8


def _logline(text: str, bible: dict | None) -> dict:
    """What the script says it is about.

    Taken from the story bible when the writer wrote one, because a logline
    they authored beats anything inferred from the page. Absence is reported
    rather than filled in: "no logline" is itself the most useful note a reader
    can give an unfinished project.
    """
    bible = bible or {}
    return {
        "logline": (bible.get("logline") or "").strip(),
        "dramatic_question": (bible.get("dramatic_question") or "").strip(),
        "theme": (bible.get("theme") or "").strip(),
    }


def _shape(stats: dict, scenes: list) -> list:
    """Observations about the script's proportions, in plain sentences.

    Each is a measurement plus what it is evidence of. A number on its own —
    "dialogue/action ratio 5.12" — is not a note; it is a reading a writer has
    to do themselves.
    """
    out = []

    ratio = stats.get("dialogue_action_ratio")
    if ratio is not None:
        if ratio > 6:
            out.append({
                "metric": "dialogue to action",
                "value": ratio,
                "reading": "Heavily spoken. Scenes are carried by what people say "
                           "rather than by what they do, which reads fast on the "
                           "page and can play static on screen.",
            })
        elif ratio < 1.2:
            out.append({
                "metric": "dialogue to action",
                "value": ratio,
                "reading": "Action-led. Very little is spoken, which suits some "
                           "material and starves character in others.",
            })

    share = stats.get("speaking_top3_share")
    if share is not None and share > 0.85 and stats.get("character_count", 0) > 3:
        out.append({
            "metric": "voice concentration",
            "value": share,
            "reading": f"{int(share * 100)}% of dialogue belongs to three "
                       "characters. Everyone else is functional rather than alive.",
        })

    int_ratio = stats.get("int_ext_ratio")
    if int_ratio is not None and scenes:
        if int_ratio > 0.9:
            out.append({
                "metric": "interiors",
                "value": int_ratio,
                "reading": "Almost entirely interior. Cheap to shoot; watch that "
                           "the world stops feeling like it has an outside.",
            })
        elif int_ratio < 0.15:
            out.append({
                "metric": "interiors",
                "value": int_ratio,
                "reading": "Almost entirely exterior — the most weather-dependent "
                           "and expensive shape a schedule can take.",
            })

    return out


def coverage(text: str, scenes: list, project: dict, bible: dict | None = None) -> dict:
    """The whole report.

    Sections are ordered the way a reader writes one: what it is, how long it
    runs, what is wrong with it, how it sits against comparable work, and what
    to do first.
    """
    text = text or ""
    project = project or {}

    stats = screenplay.statistics(text)
    structural = review.review(text, scenes, project)
    # `lint` returns a flat list; the grouping by craft level belongs to the
    # route that serves the editor panel, and coverage only needs counts.
    flags = linter.lint(text)

    parsed_scenes = screenplay.scenes(text)
    shape_ready = len(parsed_scenes) >= MIN_SCENES_FOR_SHAPE

    comparison = None
    if shape_ready:
        fp = fingerprint.fingerprint(text, title_ref="draft", genre=project.get("genre") or "")
        comparison = benchmark.compare(fp, benchmark.load_corpus(), project.get("genre") or "")

    # What to do first. Ordered by how much it costs to leave: a structural
    # problem outlasts a line-level one, and an unfilmable line is a fact about
    # the medium rather than an opinion about the writing.
    next_steps = []
    for finding in structural.get("findings", []):
        if finding["severity"] == "high":
            next_steps.append({"from": "structure", "note": finding["message"]})
    for flag in flags:
        if flag.get("confidence") == "mechanical":
            next_steps.append({
                "from": "craft",
                "note": f"Line {flag['line']}: {flag['message']}",
            })

    return {
        "title": project.get("title") or "Untitled",
        "premise": _logline(text, bible),
        "runtime": {
            "pages": stats.get("estimated_pages"),
            "minutes": stats.get("estimated_minutes"),
            "planned_minutes": project.get("duration_minutes"),
            "scenes": stats.get("scene_count"),
            "speaking_characters": stats.get("character_count"),
        },
        "structure": {
            "findings": structural.get("findings", []),
            "counts": structural.get("counts", {}),
        },
        "craft": {
            "total": len(flags),
            "counts": {
                level: sum(1 for f in flags if f["severity"] == level)
                for level in ("high", "medium", "low")
            },
            # Split by how arguable each note is, which is the distinction a
            # writer needs before deciding what to act on: "a camera cannot
            # photograph this" and "I read this as on the nose" must not arrive
            # wearing the same authority.
            "by_confidence": {
                c: sum(1 for f in flags if f.get("confidence") == c)
                for c in ("mechanical", "convention", "judgement")
            },
        },
        "shape": _shape(stats, parsed_scenes),
        # None until there is enough script. Percentiles on four scenes invite a
        # writer to fix a problem they do not have.
        "comparison": comparison,
        "shape_ready": shape_ready,
        "next_steps": next_steps[:6],
        # Said out loud rather than implied, because every competing tool's
        # coverage ends in a verdict and a reader will look for one here.
        "no_verdict": (
            "This is a measurement, not a judgement. Nothing here decides "
            "whether the script is good — it reports what can be counted and "
            "what those counts are evidence of."
        ),
    }
