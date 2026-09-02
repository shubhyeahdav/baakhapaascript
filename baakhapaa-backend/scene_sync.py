"""Reconciling the `scenes` table with the draft the writer actually typed.

Two representations of the same story coexist in this app:

  * `scripts.content` — the screenplay as typed, the thing the writer edits
  * `scenes` rows     — created one at a time from the structure preview, and
                        the only thing a storyboard frame can hang off, because
                        `storyboard_frames.scene_id` points at a scene row

Nothing connected them. A scene row was written once, at the moment its
structure suggestion was added, and never updated again. Three consequences,
all of which this module exists to remove:

  1. A writer who typed their screenplay by hand had no scene rows at all, so
     "Finalize & Storyboard" led to a page whose only button returned 404.
  2. A writer who added structure scenes and then rewrote them got a storyboard
     illustrating the original AI beat description rather than the scene on the
     page.
  3. The editor's scene index cards came from these rows while its jump-to-scene
     counted sluglines in the draft, so the two drifted apart as soon as a
     slugline moved.

`sync_from_draft` folds what the parser sees onto the rows. It is deliberately
additive: rows are updated and appended, never deleted. A storyboard frame
points at a scene id, and deleting the row would orphan a frame the user paid
to generate — a destructive answer to a bookkeeping problem.
"""
import json
from typing import List

import screenplay


def _draft_payload(summary: dict) -> dict:
    """The fields sync owns, as one JSON blob.

    Repo convention (`suggestions_json`, `bible_json`, `preferences_json`): a
    growing set of derived fields lives in one nullable TEXT column instead of
    costing a migration each.
    """
    return {
        "heading": summary["heading"],
        "time_of_day": summary["time_of_day"],
        "interior": summary["interior"],
        "line_number": summary["line_number"],
        "characters": summary["characters"],
        "summary": summary["action"],
        # Measured off the page, and the reason the editor's timeline can show
        # a written script at all. `time_allocation` is what the writer PLANNED
        # for this scene and stays untouched; `minutes` is what they have
        # actually written. Every draft-derived scene used to carry a planned
        # allocation of zero and nothing else, so nine written scenes rendered
        # exactly as wide as nothing.
        "minutes": summary["estimated_minutes"],
        "line_count": summary["line_count"],
        # The printed page this scene opens on — the same page number the PDF
        # export prints and the editor's gutter shows.
        "page": summary["page"],
    }


def read_draft(scene_row: dict) -> dict:
    """Parse a row's `draft_json`.

    A malformed blob must never break a storyboard or make a script unopenable,
    so failure reads as "never synced" — the same contract as `_read_bible`.
    """
    raw = (scene_row or {}).get("draft_json")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def read_characters(scene_row: dict) -> list:
    """The cast the structure preview planned for this scene.

    Same lenient contract as `read_draft`: a bad blob means "unknown", never an
    exception on the way to generating a storyboard.
    """
    raw = (scene_row or {}).get("characters_json")
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        return [str(c) for c in parsed] if isinstance(parsed, list) else []
    except (TypeError, ValueError):
        return []


def _match_rows(summaries: List[dict], rows: List[dict]) -> List[tuple]:
    """Pair each written scene with the row that represents it, if any.

    Slugline first, position second. Matching on position alone would re-point
    every later row at different content the moment a scene is inserted in the
    middle of the draft — and since frames hang off rows, that silently moves
    somebody's storyboard frames onto the wrong scenes.
    """
    by_heading: dict = {}
    for r in rows:
        heading = (read_draft(r).get("heading") or "").strip().upper()
        if heading:
            by_heading.setdefault(heading, []).append(r)

    claimed = set()
    pairs: List[list] = [[s, None] for s in summaries]

    # Two passes, and the order matters. Resolving each scene completely before
    # moving to the next lets a positional guess claim the row that a LATER
    # scene matches exactly — insert one scene mid-draft and every row after it
    # slides onto the wrong scene, which is the failure this whole function
    # exists to prevent. So: every exact match first, positions afterwards.
    for pair in pairs:
        for candidate in by_heading.get(pair[0]["heading"].strip().upper(), []):
            if candidate["id"] not in claimed:
                claimed.add(candidate["id"])
                pair[1] = candidate
                break

    # Position covers rows that have never been synced (no stored heading yet)
    # and repeated sluglines, where the heading cannot disambiguate anything.
    for pair in pairs:
        if pair[1] is not None:
            continue
        index = pair[0]["index"]
        if index < len(rows) and rows[index]["id"] not in claimed:
            claimed.add(rows[index]["id"])
            pair[1] = rows[index]

    return [(s, row) for s, row in pairs]


def sync_from_draft(script_id: str, content: str) -> List[dict]:
    """Fold the draft's scenes onto the script's rows; return them in document
    order.

    Only fields derived from the draft are written. `title`, `description`,
    `act_number`, `scene_type` and `time_allocation` came from the structure
    preview or from the writer, and sync has no business overwriting them —
    which is also why the draft's own text lands in `draft_json.summary` rather
    than replacing `description`.
    """
    # Imported here rather than at module scope so this module can be reasoned
    # about (and unit-tested) without standing up a database.
    from database import supabase, get_scenes_by_script

    rows = get_scenes_by_script(script_id)
    summaries = screenplay.scene_summaries(content or "")
    if not summaries:
        # Nothing written yet. The structure-added rows are all there is, and
        # they are still the right answer for a storyboard.
        return rows

    ordered = []
    last_act = 1
    for summary, row in _match_rows(summaries, rows):
        payload = {
            "draft_json": json.dumps(_draft_payload(summary)),
            # Document position is the authority on order: it is what the editor
            # counts sluglines to find and what a storyboard reads top to bottom.
            "order_index": summary["index"],
        }
        # Once a slugline exists the draft is the better authority on location —
        # the writer may well have moved the scene since the structure named it.
        if summary["location"]:
            payload["location"] = summary["location"]

        if row is None:
            # Written by hand, no structure suggestion behind it. Inherit the act
            # of the scene before it so act-ordered reads still match the page.
            created = supabase.table("scenes").insert({
                "script_id": script_id,
                "act_number": last_act,
                "scene_type": "minor",
                "title": summary["heading"] or f"Scene {summary['index'] + 1}",
                "description": "",
                "time_allocation": 0,
                **payload,
            }).execute()
            ordered.append(created.data[0])
            continue

        last_act = row.get("act_number") or last_act

        # Follow a renamed slugline — but ONLY when nobody ever named the scene
        # themselves. A row created from the page gets `title` set to its
        # heading, so a writer who then rewrites that heading was left with a
        # scene index and a timeline showing a line no longer in the script.
        # A structure-authored title ("The confession") is a different thing
        # from the slugline and must survive: the test is whether the stored
        # title still equals the heading this row was last synced from.
        previous = {}
        try:
            raw = row.get("draft_json")
            previous = json.loads(raw) if isinstance(raw, str) else (raw or {})
        except (ValueError, TypeError):
            previous = {}
        was_derived = (row.get("title") or "") == (previous.get("heading") or "")
        if was_derived and summary["heading"] and row.get("title") != summary["heading"]:
            payload["title"] = summary["heading"]

        # Only write when something actually changed. Sync runs on every save,
        # and in demo mode a write rewrites the whole table to SQLite — so an
        # unconditional update would make each save cost one full rewrite per
        # scene in the script.
        if any(row.get(k) != v for k, v in payload.items()):
            updated = supabase.table("scenes").update(payload).eq("id", row["id"]).execute()
            ordered.append(updated.data[0] if updated.data else {**row, **payload})
        else:
            ordered.append(row)

    # Rows with no counterpart on the page. Two different things end up here and
    # they must not look the same to a reader:
    #
    #   * a structure scene that was added but never written — legitimately
    #     pending, and the outline should still show it;
    #   * a scene that WAS written and has since been cut from the draft — a
    #     ghost, which the corkboard would otherwise present as a real scene.
    #
    # Having `draft_json` is what separates them: it means this row was on the
    # page at some point. Rows are still never deleted (a storyboard frame FKs
    # to a scene id), they are marked.
    written = {r["id"] for r in ordered}
    for row in rows:
        if row["id"] in written:
            continue
        draft = read_draft(row)
        if draft and not draft.get("removed"):
            draft["removed"] = True
            supabase.table("scenes").update(
                {"draft_json": json.dumps(draft)}
            ).eq("id", row["id"]).execute()
            row = {**row, "draft_json": json.dumps(draft)}
        ordered.append(row)
    return ordered
