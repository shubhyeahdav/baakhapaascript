"""API surface for the new craft features: POST /scripts/lint and .fdx export."""
import xml.etree.ElementTree as ET

MELODRAMATIC = (
    "INT. KITCHEN, KATHMANDU - NIGHT\n\n"
    "Raaja realises his father will never understand him.\n\n"
    "                      RAAJA\n"
    "              (tearfully)\n"
    "          You never supported my dreams!\n\n"
    "                      BABA\n"
    "          Ma ta timro bhalo chahanchu.\n"
)


def test_lint_endpoint_flags_a_melodramatic_draft(client, make_user):
    user = make_user("free")  # linting is free on every tier
    r = client.post(
        "/scripts/lint",
        json={"scene_text": MELODRAMATIC, "genre": "Drama", "tone": "Emotional"},
        headers=user["headers"],
    )
    assert r.status_code == 200
    body = r.json()

    rules = {f["rule"] for f in body["flags"]}
    assert "unfilmable_interiority" in rules
    assert "on_the_nose" in rules
    assert "directed_emotion" in rules
    assert body["counts"]["high"] >= 2

    # Every flag must carry the technique that fixes it.
    assert all(f["technique"] for f in body["flags"])


def test_lint_endpoint_returns_statistics(client, make_user):
    user = make_user("free")
    r = client.post(
        "/scripts/lint",
        json={"scene_text": MELODRAMATIC},
        headers=user["headers"],
    )
    stats = r.json()["statistics"]
    assert stats["scene_count"] == 1
    assert stats["character_count"] == 2
    assert "RAAJA" in stats["speaking_characters"]


def test_lint_endpoint_requires_authentication(client):
    assert client.post("/scripts/lint", json={"scene_text": "x"}).status_code == 401


def test_lint_endpoint_handles_an_empty_draft(client, make_user):
    user = make_user("free")
    r = client.post("/scripts/lint", json={"scene_text": ""}, headers=user["headers"])
    assert r.status_code == 200
    assert r.json()["flags"] == []


def _draft(scenes=12, dialogue_per_scene=6):
    out = []
    for i in range(scenes):
        out.append(f"INT. CHIYA PASAL {i} - DAY\n\nSteam rises from the glasses.\n")
        for j in range(dialogue_per_scene):
            out.append(f"                      {'SANJANA' if j % 2 else 'RAAJA'}\n"
                       f"          Timro kura milena, ali bujha na.\n")
    return "\n".join(out)


def test_benchmark_is_withheld_until_the_draft_is_big_enough(client, make_user):
    """The 'after first draft' gate. A thin draft gets progress, not a verdict —
    a percentile drawn from two scenes would be invented."""
    user = make_user("free")
    r = client.post("/scripts/benchmark",
                    json={"scene_text": MELODRAMATIC, "genre": "Drama"},
                    headers=user["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["ready"] is False
    assert body["progress"]["scenes"] == 1
    assert body["progress"]["scenes_needed"] > 1


def test_benchmark_opens_once_the_draft_has_shape(client, make_user):
    user = make_user("free")  # measurement is free on every tier
    r = client.post("/scripts/benchmark",
                    json={"scene_text": _draft(), "genre": "Drama"},
                    headers=user["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["ready"] is True
    assert body["statistics"]["scene_count"] == 12
    # With no corpus file present it reports honestly rather than inventing one.
    assert "benchmark" in body


def test_benchmark_requires_authentication(client):
    assert client.post("/scripts/benchmark", json={"scene_text": "x"}).status_code == 401


def test_fdx_export_is_valid_xml_with_typed_paragraphs(client, make_user, make_script):
    user = make_user("free")  # interoperability is not a paid feature
    _, script_id = make_script(user)

    client.put(f"/scripts/{script_id}", json={"content": MELODRAMATIC},
               headers=user["headers"])

    r = client.get(f"/export/script/fdx/{script_id}", headers=user["headers"])
    assert r.status_code == 200

    root = ET.fromstring(r.content)
    assert root.tag == "FinalDraft"
    assert root.get("DocumentType") == "Script"

    types = [p.get("Type") for p in root.findall("./Content/Paragraph")]
    assert "Scene Heading" in types
    assert "Character" in types
    assert "Dialogue" in types
    assert "Parenthetical" in types


def test_fdx_export_respects_ownership(client, make_user, make_script):
    owner = make_user("pro")
    intruder = make_user("pro")
    _, script_id = make_script(owner)
    r = client.get(f"/export/script/fdx/{script_id}", headers=intruder["headers"])
    assert r.status_code == 404


# --- diagnosis reads the draft, never the question -------------------------
#
# The editor's focus chips ("Feels flat", "On the nose") are complaints written
# in the writer's voice, and they used to be sent as `scene_text` — the same
# field the draft goes in. So choosing a chip replaced the draft with the
# chip's own wording, the linter dutifully diagnosed THAT, and the panel
# displayed the result under the heading "found in your draft, line 1". The
# line it named was a line of a sentence the writer had never typed.
#
# These pin the separation. `focus` may steer retrieval; only `scene_text` may
# ever be diagnosed.

CLEAN = (
    "INT. CHIYA PASAL - MORNING\n\n"
    "Sanjana wipes the counter. Steam rises from the kettle.\n"
)

# Reads like a complaint about on-the-nose dialogue, and trips the linter's
# interiority rule if you are careless enough to lint it.
NOSE_COMPLAINT = (
    "my dialogue is on the nose, characters say exactly what they feel, "
    "it sounds like a therapy transcript with no subtext"
)


def test_a_focus_phrase_is_never_diagnosed_as_the_draft(client, make_user):
    user = make_user("free")
    r = client.post(
        "/scripts/recommendations",
        json={"scene_text": CLEAN, "focus": NOSE_COMPLAINT,
              "genre": "Drama", "tone": "Emotional"},
        headers=user["headers"],
    )
    assert r.status_code == 200, r.text
    body = r.json()

    # The clean draft trips nothing, so there is nothing to report as found.
    assert body["diagnosed"] == []
    assert body["source"] == "similarity"


def _seed_two_patterns():
    """Two entries far apart in meaning, embedded for real.

    Retrieval is the thing under test, so the embeddings have to come from the
    same model the endpoint uses — a stub would prove only that the stub works.
    """
    import database, rag
    rows = [
        ("dialogue-fix", "dialogue",
         "My dialogue is on the nose. Characters announce their feelings "
         "instead of behaving, and every line sounds like a confession."),
        ("structure-fix", "structure",
         "My second act sags. The protagonist is passive, events happen to "
         "them, and the ending is not earned by anything they chose."),
    ]
    for technique, level, problem in rows:
        database.supabase.table(rag.TABLE).insert({
            "id": f"focus-test-{technique}",
            "title_ref": f"Ref for {technique}",
            "genre": "Drama", "origin_tradition": "screen craft",
            "craft_level": level, "technique": technique, "problem": problem,
            "how_it_works": "Because it does.", "how_to_apply": "Do the thing.",
            "worked_example": "Original prose.",
            "warning_sign": "A sign.",
            "embedding": rag.embed_texts([problem])[0],
        }).execute()


def test_the_focus_phrase_still_steers_what_comes_back(client, make_user):
    """Separating the fields must not make the chips decorative again."""
    user = make_user("free")
    _seed_two_patterns()

    def patterns_for(focus):
        r = client.post(
            "/scripts/recommendations",
            json={"scene_text": CLEAN, "focus": focus,
                  "genre": "Drama", "tone": "Emotional"},
            headers=user["headers"],
        )
        assert r.status_code == 200, r.text
        return [p["technique"] for p in r.json()["patterns"]]

    dialogue = patterns_for(NOSE_COMPLAINT)
    structure = patterns_for(
        "the middle sags and the ending feels unearned, the protagonist is "
        "passive and things just happen to them"
    )
    assert dialogue and structure
    # The clean draft is identical in both calls, so any difference in what
    # comes back can only have come from `focus`.
    assert dialogue[0] == "dialogue-fix"
    assert structure[0] == "structure-fix"


def test_a_real_flag_in_the_draft_is_still_reported(client, make_user):
    """The fix must not cost us the feature it protects."""
    user = make_user("free")
    r = client.post(
        "/scripts/recommendations",
        json={"scene_text": MELODRAMATIC, "genre": "Drama", "tone": "Emotional"},
        headers=user["headers"],
    )
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["diagnosed"], "a melodramatic draft should diagnose something"
    # NOT asserting `source` here: it reports whether a stored pattern matched
    # the flagged technique, so it depends on `script_patterns` being loaded.
    # Every reported line must be a real line of the submitted draft.
    line_count = len(MELODRAMATIC.splitlines())
    for d in body["diagnosed"]:
        assert 1 <= d["line"] <= line_count
