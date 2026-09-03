"""Improving one line instead of the whole scene.

Until now `POST /scripts/improve` took a scene and returned a scene. That is the
wrong unit of work for the most common request a writer actually has, which is
about one line. Rewriting the whole scene to fix it costs a full generation, it
quietly takes back every other decision the writer made in that scene, and it
makes the change impossible to read AS a change — the writer gets a wall of new
text and has to diff it in their head.

The scene still goes into the prompt, because a line cannot be rewritten without
knowing what it answers and what answers it. Only the selected part comes back.

The property worth defending hardest is the one about ambiguity: if the selected
words appear twice in the scene, there is no way to know which occurrence the
writer highlighted, and replacing the wrong one edits a part of their draft they
were not looking at. That case falls back to a whole-scene rewrite, which is
visible and recoverable, rather than guessing.
"""
import script_engine

SCENE = """INT. CHIYA PASAL - DAY

Raaja stares at the glass.

                      RAAJA
          I am very sad about my father.

                      SANJANA
          I know.
"""

LINE = "          I am very sad about my father."


# --- scoped_selection: what counts as a selection this can act on -----------

def test_a_selection_that_appears_once_is_scoped():
    assert script_engine.scoped_selection(SCENE, LINE) == LINE


def test_an_empty_selection_is_not_scoped():
    """No selection means the writer asked about the scene, which is the
    behaviour that existed before this and still has to work."""
    assert script_engine.scoped_selection(SCENE, "") == ""
    assert script_engine.scoped_selection(SCENE, "   \n  ") == ""


def test_a_selection_that_is_not_in_the_scene_is_not_scoped():
    """The writer can type while the request is in flight. A selection that no
    longer matches is stale, and acting on it would edit the wrong words."""
    assert script_engine.scoped_selection(SCENE, "a line from another draft") == ""


def test_a_selection_that_appears_twice_is_not_scoped():
    """The reason this is not a near-miss worth being clever about: 'I know.'
    is exactly the kind of short line a screenplay repeats, and picking the
    first occurrence would silently rewrite a line the writer was not looking
    at, three pages away from where they are reading."""
    doubled = SCENE + "\n                      SANJANA\n          I know.\n"

    assert script_engine.scoped_selection(doubled, "          I know.") == ""


# --- the prompt -------------------------------------------------------------

def test_the_scoped_prompt_carries_the_whole_scene_and_marks_the_selection():
    """Both halves matter. Without the scene the model cannot know what the line
    answers; without the markers it does not know which part to replace."""
    prompt = script_engine.improve_prompt(
        SCENE, "less on the nose", selection=LINE,
    )

    assert "INT. CHIYA PASAL - DAY" in prompt
    assert "SANJANA" in prompt
    assert script_engine.SELECTION_OPEN + LINE + script_engine.SELECTION_CLOSE in prompt
    assert "Rewrite ONLY the selected text" in prompt


def test_the_scoped_prompt_says_the_replacement_has_to_fit_where_it_sits():
    """A line rewritten in isolation reads well and lands wrong. The lines
    around it are staying, so the replacement still has to answer the one before
    and set up the one after."""
    prompt = script_engine.improve_prompt(SCENE, "sharper", selection=LINE)

    assert "answer the first and set up the second" in prompt


def test_an_unscoped_request_gets_the_whole_scene_prompt_as_before():
    prompt = script_engine.improve_prompt(SCENE, "less on the nose")

    assert "Rewrite the scene following the instruction exactly" in prompt
    assert script_engine.SELECTION_OPEN not in prompt


def test_a_stale_selection_falls_back_to_the_whole_scene_prompt():
    prompt = script_engine.improve_prompt(
        SCENE, "less on the nose", selection="not in this scene",
    )

    assert "Rewrite the scene following the instruction exactly" in prompt


# --- what comes back --------------------------------------------------------

def test_demo_mode_returns_the_selection_itself_not_a_notice():
    """The caller replaces the selection with whatever comes back. The usual
    demo notice would be written into the middle of the writer's draft."""
    out = script_engine.improve_scene(SCENE, "sharper", selection=LINE)

    assert out == LINE
    assert "Demo mode" not in out


def test_demo_mode_still_annotates_a_whole_scene_rewrite():
    """The old behaviour, unchanged. Appending a notice to a whole-scene
    rewrite is fine, because the caller replaces the whole scene with it."""
    out = script_engine.improve_scene(SCENE, "sharper")

    assert "Demo mode" in out


def test_echoed_markers_are_stripped(monkeypatch):
    """Models echo their own scaffolding back sometimes. It costs nothing to
    remove here and it is confusing on the page if it survives."""
    monkeypatch.setattr(script_engine, "MOCK_AI", False)
    monkeypatch.setattr(
        script_engine, "_call_llm",
        lambda *a, **k: f"{script_engine.SELECTION_OPEN}Baba is dying."
                        f"{script_engine.SELECTION_CLOSE}",
    )

    out = script_engine.improve_scene(SCENE, "sharper", selection=LINE)

    assert out == "Baba is dying."


def test_a_scoped_rewrite_asks_for_a_smaller_budget(monkeypatch):
    """A line does not need a scene's token allowance, and the cap is what the
    request is billed against if the model decides to keep writing."""
    monkeypatch.setattr(script_engine, "MOCK_AI", False)
    seen = {}

    def record(system, prompt, max_tokens=3000):
        seen["max_tokens"] = max_tokens
        return "x"

    monkeypatch.setattr(script_engine, "_call_llm", record)

    script_engine.improve_scene(SCENE, "sharper", selection=LINE)
    scoped = seen["max_tokens"]
    script_engine.improve_scene(SCENE, "sharper")

    assert scoped == 400
    assert seen["max_tokens"] == 2000


def test_a_scoped_stream_asks_for_a_smaller_budget_too(monkeypatch):
    monkeypatch.setattr(script_engine, "MOCK_AI", False)
    seen = {}

    def record(system, prompt, max_tokens=3000):
        seen["max_tokens"] = max_tokens
        return iter(())

    monkeypatch.setattr(script_engine, "_stream_llm", record)

    script_engine.stream_improvement(
        scene_text=SCENE, instruction="sharper", selection=LINE,
    )

    assert seen["max_tokens"] == 400


# --- the route --------------------------------------------------------------

def _improve(client, token, **body):
    return client.post(
        "/scripts/improve",
        json={"scene_text": SCENE, "instruction": "less on the nose", **body},
        headers={"Authorization": f"Bearer {token}"},
    )


def test_the_route_reports_whether_the_answer_is_scoped(client, make_user):
    """The caller cannot tell a replacement line from a replacement scene by
    looking at the text, and guessing wrong either duplicates the scene or
    deletes it. So the answer says which it is."""
    user = make_user(tier="pro")

    scoped = _improve(client, user["token"], selection=LINE)
    whole = _improve(client, user["token"])

    assert scoped.status_code == 200, scoped.text
    assert scoped.json()["scoped"] is True
    assert scoped.json()["improved_text"] == LINE

    assert whole.status_code == 200, whole.text
    assert whole.json()["scoped"] is False


def test_an_ambiguous_selection_is_reported_as_unscoped(client, make_user):
    """The fallback has to be visible to the caller, or it will paste a whole
    scene in place of one highlighted line."""
    user = make_user(tier="pro")

    r = _improve(client, user["token"], selection="          I know.",
                 scene_text=SCENE + "\n          I know.\n")

    assert r.status_code == 200, r.text
    assert r.json()["scoped"] is False


def test_a_free_user_still_cannot_improve_anything(client, make_user):
    """Scoping is a smaller unit of the same paid feature, not a way around
    the tier gate."""
    user = make_user()

    r = _improve(client, user["token"], selection=LINE)

    assert r.status_code == 403, r.text
