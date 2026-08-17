"""Story bible — character sheets and the story details a script needs to
exist but that never appear on the page."""
import json

BIBLE = {
    "logline": "A frame-shop daughter is accepted to a workshop in the busiest week of the year.",
    "dramatic_question": "Will Prerana leave the shop?",
    "theme": "What we owe the people who raised us.",
    "characters": [
        {"name": "PRERANA", "age": "24", "want": "To go to Pokhara.",
         "need": "To say it out loud.", "wound": "", "voice": "Clipped when deflecting.", "notes": ""},
        {"name": "BUBA", "age": "56", "want": "The order book to balance.",
         "need": "", "wound": "", "voice": "", "notes": ""},
    ],
    "locations": ["FRAME SHOP, PATAN", "FAMILY KITCHEN"],
    "notes": "The spirit level moves in the last scene.",
}


def test_bible_starts_empty(client, make_user, make_script):
    user = make_user("free")
    _, script_id = make_script(user)
    r = client.get(f"/scripts/{script_id}/bible", headers=user["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["logline"] == "" and body["characters"] == []


def test_bible_round_trips(client, make_user, make_script):
    user = make_user("free")
    _, script_id = make_script(user)

    saved = client.put(f"/scripts/{script_id}/bible", json=BIBLE, headers=user["headers"])
    assert saved.status_code == 200, saved.text

    fetched = client.get(f"/scripts/{script_id}/bible", headers=user["headers"]).json()
    assert fetched["logline"] == BIBLE["logline"]
    assert [c["name"] for c in fetched["characters"]] == ["PRERANA", "BUBA"]
    assert fetched["locations"] == ["FRAME SHOP, PATAN", "FAMILY KITCHEN"]


def test_bible_arrives_with_the_script(client, make_user, make_script):
    """The editor's type-ahead needs character names before the first
    keystroke, so the bible ships in the same call that loads the draft."""
    user = make_user("free")
    _, script_id = make_script(user)
    client.put(f"/scripts/{script_id}/bible", json=BIBLE, headers=user["headers"])

    script = client.get(f"/scripts/{script_id}", headers=user["headers"]).json()
    assert [c["name"] for c in script["bible"]["characters"]] == ["PRERANA", "BUBA"]


def test_save_is_a_whole_object_replace(client, make_user, make_script):
    """The editor holds the full document, so a partial merge would silently
    resurrect fields the writer deleted."""
    user = make_user("free")
    _, script_id = make_script(user)
    client.put(f"/scripts/{script_id}/bible", json=BIBLE, headers=user["headers"])

    client.put(f"/scripts/{script_id}/bible", json={"logline": "Rewritten."},
               headers=user["headers"])
    after = client.get(f"/scripts/{script_id}/bible", headers=user["headers"]).json()
    assert after["logline"] == "Rewritten."
    assert after["characters"] == []
    assert after["theme"] == ""


def test_blank_locations_are_dropped(client, make_user, make_script):
    """The UI edits locations as a textarea, so empty lines are normal input
    rather than an error."""
    user = make_user("free")
    _, script_id = make_script(user)
    r = client.put(f"/scripts/{script_id}/bible",
                   json={"locations": ["ROOFTOP", "", "   ", "BUS PARK"]},
                   headers=user["headers"])
    assert r.json()["locations"] == ["ROOFTOP", "BUS PARK"]


def test_rejects_absurd_character_count(client, make_user, make_script):
    user = make_user("free")
    _, script_id = make_script(user)
    r = client.put(f"/scripts/{script_id}/bible",
                   json={"characters": [{"name": f"C{i}"} for i in range(100)]},
                   headers=user["headers"])
    assert r.status_code == 422


def test_bible_respects_ownership(client, make_user, make_script):
    owner = make_user("pro")
    intruder = make_user("pro")
    _, script_id = make_script(owner)

    assert client.get(f"/scripts/{script_id}/bible",
                      headers=intruder["headers"]).status_code == 404
    assert client.put(f"/scripts/{script_id}/bible", json=BIBLE,
                      headers=intruder["headers"]).status_code == 404


def test_corrupt_blob_does_not_break_the_script(client, make_user, make_script):
    """A malformed bible must not make the draft unopenable — the script is
    the thing that matters, the bible is beside it."""
    from database import supabase
    user = make_user("free")
    _, script_id = make_script(user)
    supabase.table("scripts").update({"bible_json": "{not json"}).eq("id", script_id).execute()

    script = client.get(f"/scripts/{script_id}", headers=user["headers"])
    assert script.status_code == 200
    assert script.json()["bible"]["characters"] == []


def test_bible_is_stored_as_json_text(client, make_user, make_script):
    """Follows suggestions_json: one nullable column, no migration per field."""
    from database import supabase
    user = make_user("free")
    _, script_id = make_script(user)
    client.put(f"/scripts/{script_id}/bible", json=BIBLE, headers=user["headers"])

    row = supabase.table("scripts").select("*").eq("id", script_id).execute().data[0]
    assert json.loads(row["bible_json"])["theme"] == BIBLE["theme"]
