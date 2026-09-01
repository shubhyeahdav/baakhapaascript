"""Streaming generation.

A blocking call meant a writer asked for a scene and watched a spinner while
two thousand tokens were composed elsewhere, then received all of it at once.
For a product whose claim is keeping a writer in flow, that is the wrong shape.

The property worth defending: the mock path streams too. If demo mode returned
its canned scene in one lump, every piece of plumbing between the engine and
the browser would stay untested until the day someone put a real key in - and
this project has spent a week finding exactly that class of bug.

The second: errors cannot be a 503 here. Once the first byte is out the status
is already 200, so a provider failure has to arrive inside the stream as
something the client can read, not as a dropped connection a browser cannot
tell apart from a lost network.
"""
import json

import script_engine


def _events(resp):
    """Parse an SSE body into the list of decoded payloads."""
    out = []
    for line in resp.text.splitlines():
        if line.startswith("data: "):
            out.append(json.loads(line[6:]))
    return out


def _text(resp):
    return "".join(e.get("text", "") for e in _events(resp))


def test_a_scene_arrives_in_pieces(client, make_user):
    user = make_user("pro")
    r = client.post("/scripts/generate-scene/stream",
                    json={"scene_description": "A tea shop at dawn",
                          "genre": "Drama", "tone": "Emotional"},
                    headers=user["headers"])
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/event-stream")

    events = _events(r)
    assert len(events) > 5, "one chunk is not a stream"
    assert events[-1] == {"done": True}


def test_the_pieces_rejoin_into_exactly_the_blocking_answer(client, make_user):
    """Streaming must not become a second, subtly different generator."""
    user = make_user("pro")
    r = client.post("/scripts/generate-scene/stream",
                    json={"scene_description": "A tea shop at dawn",
                          "genre": "Drama", "tone": "Emotional"},
                    headers=user["headers"])
    assert _text(r) == script_engine._DEMO_SCENE


def test_nothing_is_lost_between_chunks(client, make_user):
    """Chunking splits on whitespace, so no word may be cut in half."""
    user = make_user("pro")
    r = client.post("/scripts/generate-scene/stream",
                    json={"scene_description": "d", "genre": "Drama", "tone": "Emotional"},
                    headers=user["headers"])
    joined = _text(r)
    assert joined.split() == script_engine._DEMO_SCENE.split()


def test_a_rewrite_streams_too(client, make_user):
    user = make_user("pro")
    r = client.post("/scripts/improve/stream",
                    json={"scene_text": "INT. PASAL - DAY", "instruction": "less on the nose"},
                    headers=user["headers"])
    assert r.status_code == 200, r.text
    assert len(_events(r)) > 5
    assert _events(r)[-1] == {"done": True}


def test_streaming_is_still_a_paid_route(client, make_user):
    """The blocking versions are Pro/Studio. A stream is the same product."""
    user = make_user("free")
    for path, payload in [
        ("/scripts/generate-scene/stream", {"scene_description": "d", "genre": "Drama", "tone": "E"}),
        ("/scripts/improve/stream", {"scene_text": "x", "instruction": "y"}),
    ]:
        r = client.post(path, json=payload, headers=user["headers"])
        assert r.status_code == 403, f"{path} leaked to a free user"


def test_a_provider_failure_arrives_inside_the_stream(client, make_user, monkeypatch):
    """Not a 503 - the status is already 200 by then."""
    def boom(*a, **kw):
        yield "The scene opens. "
        raise RuntimeError("Claude API error: credit balance too low")

    monkeypatch.setattr(script_engine, "stream_scene", boom)
    user = make_user("pro")
    r = client.post("/scripts/generate-scene/stream",
                    json={"scene_description": "d", "genre": "Drama", "tone": "E"},
                    headers=user["headers"])
    assert r.status_code == 200

    events = _events(r)
    assert events[0]["text"] == "The scene opens. "
    assert "credit balance too low" in events[1]["error"]
    # Still closed properly, so the client stops waiting.
    assert events[-1] == {"done": True}


def test_the_stream_is_not_buffered_away_by_a_proxy(client, make_user):
    user = make_user("pro")
    r = client.post("/scripts/generate-scene/stream",
                    json={"scene_description": "d", "genre": "Drama", "tone": "E"},
                    headers=user["headers"])
    assert r.headers.get("cache-control") == "no-cache"
    assert r.headers.get("x-accel-buffering") == "no"
