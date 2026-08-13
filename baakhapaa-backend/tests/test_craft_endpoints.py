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
