"""Short-form outliers and posted results (Month 4, Days 9-10).

The rule worth the most here is the one about TEXT: a pasted transcript is
somebody else's creative work and a draft is the writer's, and neither may
reach a row. These tests read back what was actually stored rather than what
the route returned, because the response is not where a leak would live.
"""
import pytest

import shorts
from database import supabase

TRANSCRIPT = """0:00
Why does nobody finish a Nepali web series?
0:03
I watched forty of them, every single one.
0:06
But the problem is not the writing at all.
0:10
It is the first ninety seconds."""

PHRASES = ("Nepali web series", "watched forty", "the writing", "ninety seconds")

DRAFT = ("Why does nobody finish a chiya pasal story? I sat there for an hour. "
         "But the tea was never the point.")


def _stored(script_id):
    return [r for r in supabase.table(shorts.TABLE).select("*").execute().data or []
            if r.get("script_id") == script_id]


def _set_draft(script_id, text):
    supabase.table("scripts").update({"content": text}).eq("id", script_id).execute()


# --- Day 9 --------------------------------------------------------------------

def test_an_outlier_is_measured_and_only_numbers_are_kept(client, make_user, make_script):
    user = make_user()
    _, sid = make_script(user)
    r = client.post(f"/shorts/{sid}/outliers", headers=user["headers"], json={
        "url": "https://www.youtube.com/shorts/abc123XYZ", "transcript": TRANSCRIPT,
        "views": 2_000_000, "channel_median_views": 100_000})

    assert r.status_code == 200, r.text
    n = r.json()["numbers"]
    assert n["status"] == "measured"
    assert n["hook_seconds"] == 3
    assert n["first_rehook_seconds"] == 6
    assert n["outlier_ratio"] == 20.0

    rows = _stored(sid)
    assert rows and rows[0]["platform"] == "youtube" and rows[0]["video_id"] == "abc123XYZ"
    for phrase in PHRASES:
        assert phrase not in repr(rows), f"transcript text reached a row: {phrase!r}"
        assert phrase not in r.text


def test_an_untimed_transcript_is_missing_not_zero(client, make_user, make_script):
    """Same keys, every measurement None, a fixed reason. A zero would be a
    claim about the video; None says nothing was measured."""
    user = make_user()
    _, sid = make_script(user)
    ok = client.post(f"/shorts/{sid}/outliers", headers=user["headers"],
                     json={"url": "", "transcript": TRANSCRIPT}).json()["numbers"]
    bad = client.post(f"/shorts/{sid}/outliers", headers=user["headers"],
                      json={"url": "", "transcript": "no timings here, just words."}).json()["numbers"]

    assert set(bad) == set(ok)
    assert bad["status"] == "missing" and bad["reason"] == shorts.MISSING_NO_TIMINGS
    assert all(bad[k] is None for k in shorts.MEASURE_KEYS)
    assert "just words" not in repr(_stored(sid))


def test_a_failed_save_leaves_the_draft_alone(client, make_user, make_script, monkeypatch):
    user = make_user()
    _, sid = make_script(user)
    _set_draft(sid, DRAFT)

    def boom(row):
        raise shorts.HTTPException(status_code=503, detail="Measured, but it could not be saved.")
    monkeypatch.setattr(shorts, "_store", boom)

    r = client.post(f"/shorts/{sid}/outliers", headers=user["headers"],
                    json={"transcript": TRANSCRIPT})
    assert r.status_code == 503
    script = client.get(f"/scripts/{sid}", headers=user["headers"]).json()
    assert script["content"] == DRAFT


def test_outliers_are_scoped_to_their_script(client, make_user, make_script):
    owner, stranger = make_user(), make_user()
    _, sid = make_script(owner)
    r = client.post(f"/shorts/{sid}/outliers", headers=stranger["headers"],
                    json={"transcript": TRANSCRIPT})
    assert r.status_code == 404


@pytest.mark.parametrize("url,platform,vid", [
    ("https://youtu.be/dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ"),
    ("https://www.tiktok.com/@someone/video/7312345678901234567", "tiktok", "7312345678901234567"),
    ("https://www.instagram.com/reel/C1a2B3c4D5e/", "instagram", "C1a2B3c4D5e"),
    ("https://example.com/my-great-video-title", "other", None),
])
def test_a_video_is_kept_as_platform_and_id(url, platform, vid):
    """An unknown host keeps no id at all — its slug could be a title."""
    assert shorts.video_ref(url) == {"platform": platform, "video_id": vid}


# --- Day 10 -------------------------------------------------------------------

def test_a_result_is_stored_against_the_drafts_shape(client, make_user, make_script):
    user = make_user()
    _, sid = make_script(user)
    _set_draft(sid, DRAFT)
    r = client.post(f"/shorts/{sid}/results", headers=user["headers"],
                    json={"views": 5000, "channel_median_views": 1000, "retention_percent": 61})

    assert r.status_code == 200, r.text
    n = r.json()["numbers"]
    assert n["outlier_ratio"] == 5.0
    assert n["hook"]["opens_on_question"] is True
    assert "chiya pasal" not in repr(_stored(sid))


def _result(ratio, question, device):
    return {"numbers": {"outlier_ratio": ratio, "hook": {
        "opens_on_question": question, "first_device_seconds": device,
        "estimated_seconds": 30}}}


def test_a_single_result_produces_no_claim():
    out = shorts.compare([_result(9.0, True, 4)])
    assert out["comparisons"] == []
    assert out["results_logged"] == 1


def test_below_the_floor_nothing_is_said():
    four_and_four = [_result(3.0, True, 4)] * 4 + [_result(1.0, False, 12)] * 4
    assert shorts.compare(four_and_four)["comparisons"] == []


def test_above_the_floor_every_number_travels_with_its_sample_size():
    rows = [_result(3.0, True, 4)] * 5 + [_result(1.0, False, 12)] * 6
    out = shorts.compare(rows)

    assert out["comparisons"], "five a side clears the floor"
    for c in out["comparisons"]:
        assert c["with"]["n"] >= shorts.MIN_PER_GROUP and "n" in c["without"]
    q = next(c for c in out["comparisons"] if c["split"] == "opens_on_question")
    assert q["with"] == {"n": 5, "median_ratio": 3.0}
    assert q["without"] == {"n": 6, "median_ratio": 1.0}


def test_a_result_with_no_channel_median_is_counted_but_not_compared():
    rows = [{"numbers": {"outlier_ratio": None, "hook": {}}}]
    out = shorts.compare(rows)
    assert out["results_logged"] == 1 and out["results_comparable"] == 0


def test_the_results_route_is_per_creator(client, make_user, make_script):
    a, b = make_user(), make_user()
    _, sid = make_script(a)
    client.post(f"/shorts/{sid}/results", headers=a["headers"], json={"views": 10})
    assert client.get("/shorts/results", headers=a["headers"]).json()["results_logged"] == 1
    assert client.get("/shorts/results", headers=b["headers"]).json()["results_logged"] == 0
