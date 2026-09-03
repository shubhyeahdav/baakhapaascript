"""What the craft panel has already said, and whether it worked.

The panel had no memory. It recomputed three recommendations on every request
and had no idea it had given the same three yesterday, or that the writer had
acted on one of them a week ago. Two things follow from that, and both are bad:

  * Advice repeats. A writer who fixed their on-the-nose dialogue kept being
    told about on-the-nose dialogue, because retrieval only knows what the draft
    looks like now, not what it used to look like.
  * Nothing is ever known to have worked. The product could not answer the one
    question that would tell it whether the craft library is any good — of the
    techniques we recommended, which ones did writers actually resolve?

This is the smallest thing that fixes both: one row per (script, technique),
counting how often it has been shown and when it stopped being flagged.

Resolution is only claimed for techniques the LINTER named. A technique that
arrived by semantic similarity was never a flag, so there is nothing for it to
stop being — recording it as resolved would be inventing a result. That
distinction is the difference between a measurement and a vanity metric.

Every function here swallows its exceptions and returns something harmless. The
craft panel is a free-tier feature that has to work on a partial draft, and it
must not start failing because a log table is missing.
"""
from datetime import datetime, timezone

TABLE = "craft_recommendations"


def _now():
    return datetime.now(timezone.utc).isoformat()


def _rows(script_id):
    from database import supabase
    return supabase.table(TABLE).select("*").eq("script_id", script_id).execute().data or []


def history(script_id):
    """{technique: {"times_shown", "resolved", "diagnosed"}} for one script.

    Returns {} on any failure, which reads as "no history" — the same state a
    brand-new script is in, and therefore a state every caller already handles.
    """
    if not script_id:
        return {}
    try:
        return {
            r["technique"]: {
                "times_shown": r.get("times_shown") or 0,
                "resolved": bool(r.get("resolved_at")),
                "diagnosed": bool(r.get("diagnosed")),
            }
            for r in _rows(script_id) if r.get("technique")
        }
    except Exception as e:
        print(f"Recommendation history unavailable ({e}).")
        return {}


def record(script_id, techniques, diagnosed_techniques=()):
    """Note that these techniques were put in front of the writer.

    Called after the response has been sent, so a slow write cannot make the
    craft panel slower. A dropped write costs one count, which is why nothing
    here retries: the number is used for ordering, not for billing.
    """
    if not script_id or not techniques:
        return
    try:
        from database import supabase
        existing = {r["technique"]: r for r in _rows(script_id)}
        diagnosed = set(diagnosed_techniques or ())

        for technique in techniques:
            if not technique:
                continue
            row = existing.get(technique)
            if row:
                update = {"times_shown": (row.get("times_shown") or 0) + 1,
                          "last_shown_at": _now()}
                # A technique first seen by similarity and later actually
                # flagged becomes diagnosable, and can from then on resolve.
                if technique in diagnosed and not row.get("diagnosed"):
                    update["diagnosed"] = True
                supabase.table(TABLE).update(update).eq("id", row["id"]).execute()
            else:
                supabase.table(TABLE).insert({
                    "script_id": script_id,
                    "technique": technique,
                    "times_shown": 1,
                    "diagnosed": technique in diagnosed,
                    "first_shown_at": _now(),
                    "last_shown_at": _now(),
                    "resolved_at": None,
                }).execute()
    except Exception as e:
        print(f"Recommendation not recorded ({e}).")


def resolve(script_id, still_flagged):
    """Close out every diagnosed technique the linter no longer reports.

    `still_flagged` is what the linter found in THIS draft. A recorded technique
    that was once flagged and is not any more means the writer went and fixed
    it, which is the only evidence of success this product can gather without
    asking them.

    A resolved technique that gets flagged again is reopened, because it is
    back on the page and pretending otherwise would hide a regression from the
    person who has to fix it.
    """
    if not script_id:
        return
    try:
        from database import supabase
        flagged = set(still_flagged or ())
        for row in _rows(script_id):
            if not row.get("diagnosed"):
                continue
            gone = row["technique"] not in flagged
            if gone and not row.get("resolved_at"):
                supabase.table(TABLE).update(
                    {"resolved_at": _now()}).eq("id", row["id"]).execute()
            elif not gone and row.get("resolved_at"):
                supabase.table(TABLE).update(
                    {"resolved_at": None}).eq("id", row["id"]).execute()
    except Exception as e:
        print(f"Recommendation resolution not recorded ({e}).")


def rank_key(history_for_script):
    """Order the similarity half: unfinished business before new advice.

    A technique the writer has already been shown and has NOT resolved is
    better evidence than one nothing has ever suggested — it survived the
    linter twice. A technique they resolved goes last, because bringing it back
    unprompted is exactly the repetition this log exists to stop.

    Returns a function suitable for `sorted(key=...)`, so the caller keeps
    control of what it is sorting.
    """
    def key(pattern):
        seen = history_for_script.get(pattern.get("technique")) or {}
        if seen.get("resolved"):
            return (2, 0)
        if seen.get("times_shown"):
            return (0, -seen["times_shown"])
        return (1, 0)
    return key


def resolution_rates(script_id=None):
    """How often each technique, once recommended, stopped being flagged.

    The number the craft library has never had about itself. A technique
    recommended forty times and resolved twice is either badly explained or
    wrong, and there is no way to tell which from inside the corpus.
    """
    try:
        from database import supabase
        q = supabase.table(TABLE).select("*")
        if script_id:
            q = q.eq("script_id", script_id)
        rows = [r for r in (q.execute().data or []) if r.get("diagnosed")]
    except Exception as e:
        print(f"Resolution rates unavailable ({e}).")
        return {}

    out = {}
    for r in rows:
        t = r.get("technique")
        if not t:
            continue
        bucket = out.setdefault(t, {"shown": 0, "resolved": 0})
        bucket["shown"] += 1
        bucket["resolved"] += 1 if r.get("resolved_at") else 0
    for bucket in out.values():
        bucket["rate"] = round(bucket["resolved"] / bucket["shown"], 3)
    return out
