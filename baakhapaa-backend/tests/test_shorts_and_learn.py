"""Short-form beat grammar and the learning module."""
import pytest

import script_engine
import lessons

SHORT_FORM_PROJECT = {
    "title": "Chiya Break",
    "genre": "Comedy",
    "tone": "Wry",
    "language": "Bilingual",
    "duration_minutes": 1,
    "format": "short_form",
    "duration_seconds": 45,
    "hook_type": "pattern_interrupt",
    "short_form_category": "comedy_skit",
}


class TestShortFormStructure:
    @pytest.mark.parametrize("secs", [15, 30, 45, 60, 90])
    def test_beats_sum_to_the_runtime(self, secs):
        """A beat sheet that does not add up to the runtime is not a plan."""
        s = script_engine.shorts_structure("Drama", "Wry", secs, "Bilingual", "Youth")
        assert sum(b["duration_seconds"] for b in s["beats"]) == secs
        assert s["total_seconds"] == secs

    def test_hook_is_capped_in_absolute_seconds(self):
        """The window where a viewer decides to stay is ~3s whether the video
        runs 20 seconds or 90, so the hook must not scale with runtime."""
        short = script_engine.shorts_structure("Drama", "Wry", 20, "Bilingual", "Youth")
        long = script_engine.shorts_structure("Drama", "Wry", 90, "Bilingual", "Youth")
        assert short["beats"][0]["duration_seconds"] <= script_engine.HOOK_MAX_SECONDS
        assert long["beats"][0]["duration_seconds"] <= script_engine.HOOK_MAX_SECONDS

    def test_every_beat_has_a_retention_function(self):
        """A second with no retention function is where viewers leave."""
        s = script_engine.shorts_structure("Drama", "Wry", 45, "Bilingual", "Youth")
        assert all(b["retention_function"] for b in s["beats"])

    def test_beats_are_contiguous(self):
        s = script_engine.shorts_structure("Drama", "Wry", 60, "Bilingual", "Youth")
        expected = 0
        for b in s["beats"]:
            assert b["start_second"] == expected
            expected += b["duration_seconds"]

    def test_category_changes_the_guidance(self):
        skit = script_engine.shorts_structure("Comedy", "Wry", 45, "Bilingual", "Youth",
                                              category="comedy_skit")
        story = script_engine.shorts_structure("Drama", "Wry", 45, "Bilingual", "Youth",
                                               category="storytime")
        assert skit["beats"][1]["description"] != story["beats"][1]["description"]

    def test_hook_type_changes_the_opening_guidance(self):
        a = script_engine.shorts_structure("Drama", "Wry", 45, "Bilingual", "Youth",
                                           hook_type="bold_claim")
        b = script_engine.shorts_structure("Drama", "Wry", 45, "Bilingual", "Youth",
                                           hook_type="visual_shock")
        assert a["beats"][0]["description"] != b["beats"][0]["description"]


class TestShortFormApi:
    def test_project_stores_short_form_fields(self, client, make_user):
        user = make_user("pro")
        r = client.post("/projects/", json=SHORT_FORM_PROJECT, headers=user["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["format"] == "short_form"
        assert body["duration_seconds"] == 45
        assert body["hook_type"] == "pattern_interrupt"

    def test_rejects_unknown_hook_type(self, client, make_user):
        user = make_user("pro")
        bad = {**SHORT_FORM_PROJECT, "hook_type": "shouting"}
        assert client.post("/projects/", json=bad, headers=user["headers"]).status_code == 422

    @pytest.mark.parametrize("bad", [0, 4, 181, 9999])
    def test_rejects_out_of_range_seconds(self, client, make_user, bad):
        user = make_user("pro")
        payload = {**SHORT_FORM_PROJECT, "duration_seconds": bad}
        assert client.post("/projects/", json=payload, headers=user["headers"]).status_code == 422

    def test_generate_structure_returns_beats_not_acts(self, client, make_user):
        """Running a 45-second video through a three-act split would produce
        advice about act breaks for something with no acts."""
        user = make_user("free")  # short-form grammar is free: no Claude call
        pid = client.post("/projects/", json=SHORT_FORM_PROJECT,
                          headers=user["headers"]).json()["id"]
        r = client.post(f"/scripts/generate-structure?project_id={pid}",
                        json={**SHORT_FORM_PROJECT}, headers=user["headers"])
        assert r.status_code == 200, r.text
        s = r.json()["structure"]
        assert s["short_form"] is True
        assert "acts" not in s
        assert [b["name"] for b in s["beats"]][:3] == ["Hook", "Escalation", "Core payoff"]


class TestLessons:
    def test_curriculum_is_listed_with_progress(self, client, make_user):
        user = make_user("free")
        r = client.get("/learn/lessons", headers=user["headers"])
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == len(lessons.LESSONS)
        assert body["completed"] == []
        assert all(not l["completed"] for l in body["lessons"])
        # The check function must never be serialised out.
        assert "check" not in body["lessons"][0]

    def test_lesson_requires_auth(self, client):
        assert client.get("/learn/lessons").status_code == 401

    def test_unknown_lesson_is_404(self, client, make_user):
        user = make_user("free")
        assert client.get("/learn/lessons/nope", headers=user["headers"]).status_code == 404

    def test_failing_submission_returns_the_reason(self, client, make_user):
        """A failed exercise must say which line and why -- the same words the
        editor would have shown anyway."""
        user = make_user("free")
        r = client.post("/learn/lessons/action-lines/submit",
                        json={"content": "INT. SHOP - DAY\n\nShe realises she is trapped.\n"},
                        headers=user["headers"])
        body = r.json()
        assert body["passed"] is False
        assert body["problems"]
        assert body["technique_unlocked"] is None

    def test_passing_submission_unlocks_and_persists(self, client, make_user):
        user = make_user("free")
        good = "INT. FRAME SHOP - DAY\n\nPrerana re-tapes her left hand. The tape is already fine.\n"
        r = client.post("/learn/lessons/action-lines/submit",
                        json={"content": good}, headers=user["headers"])
        body = r.json()
        assert body["passed"] is True
        assert body["technique_unlocked"]

        again = client.get("/learn/lessons", headers=user["headers"]).json()
        assert "action-lines" in again["completed"]

    def test_completing_twice_does_not_double_count(self, client, make_user):
        user = make_user("free")
        good = "INT. FRAME SHOP - DAY\n\nShe squares the board to the cutter.\n"
        for _ in range(3):
            client.post("/learn/lessons/action-lines/submit",
                        json={"content": good}, headers=user["headers"])
        assert client.get("/learn/lessons", headers=user["headers"]).json()["completed"].count("action-lines") == 1

    def test_grading_is_deterministic(self):
        """Same submission, same verdict -- that is what makes it honest."""
        text = "INT. SHOP - DAY\n\nHe thinks about leaving.\n"
        first = lessons.grade("action-lines", text)
        second = lessons.grade("action-lines", text)
        assert first == second

    def test_every_lesson_has_a_working_check(self):
        """A lesson whose check crashes would block the course silently."""
        for l in lessons.LESSONS:
            ok, problems = l["check"]("INT. SHOP - DAY\n\nShe waits.\n")
            assert isinstance(ok, bool) and isinstance(problems, list)

    def test_rule_lookup_maps_a_flag_to_its_lesson(self, client, make_user):
        """A linter flag should be an entry point to the course, not a dead end."""
        user = make_user("free")
        r = client.get("/learn/for-rule/on_the_nose", headers=user["headers"])
        assert r.status_code == 200
        assert r.json()["id"] == "subtext"

    def test_every_mapped_rule_points_at_a_real_lesson(self):
        for rule, lesson_id in lessons.RULE_TO_LESSON.items():
            assert lesson_id in lessons.LESSONS_BY_ID, f"{rule} -> missing lesson {lesson_id}"

    def test_slugline_lesson_rejects_text_with_no_slugline(self):
        """Regression: screenplay.scenes() wraps pre-slugline content in an
        '(untitled opening)' scene, so counting scenes let the lesson that
        teaches slugline format pass a submission containing none."""
        result = lessons.grade("the-page", "A kitchen somewhere in the morning\nPrerana is there.")
        assert result["passed"] is False
        assert any("scene heading" in p for p in result["problems"])

    def test_slugline_lesson_accepts_a_real_slugline(self):
        result = lessons.grade("the-page", "INT. KITCHEN - MORNING\n\nPrerana sets down the kettle.")
        assert result["passed"] is True

    @pytest.mark.parametrize("lesson_id", [l["id"] for l in lessons.LESSONS])
    def test_no_lesson_passes_on_empty_input(self, lesson_id):
        """A blank submission must never satisfy an exercise."""
        assert lessons.grade(lesson_id, "")["passed"] is False


class TestStoryTrack:
    """The storytelling track (2026-08-26).

    The curriculum split into two tracks: the pen (the script page) and the
    story (what the page is for). The story track grew from four lessons to
    nine, each one a technique from the analysed corpus's playbook. These pin
    the split and the new lessons' grading — an outline exercise cannot be
    graded by the page linter, so `_check_beat_outline` grades structure
    instead, and that is new surface.
    """

    def test_every_lesson_declares_a_track(self):
        for l in lessons.LESSONS:
            assert l.get("track") in ("pen", "story"), l["id"]

    def test_the_story_track_is_a_real_course_not_a_module(self):
        story = [l for l in lessons.LESSONS if l["track"] == "story"]
        assert len(story) >= 9

    def test_the_pen_track_holds_the_page_craft(self):
        pen_modules = {l["module"] for l in lessons.LESSONS if l["track"] == "pen"}
        assert "The page" in pen_modules
        assert "Story" not in pen_modules

    def test_the_api_reports_each_track_with_its_own_modules(self, client, make_user):
        """`tracks` maps a track to its modules. A flat module list mixing both
        courses was ambiguous the moment a module stopped being unique to one."""
        user = make_user()
        body = client.get("/learn/lessons", headers=user["headers"]).json()

        assert list(body["tracks"]) == ["pen", "story"]
        assert "The page" in body["tracks"]["pen"]
        assert body["tracks"]["story"] == ["Story"]
        assert "Story" not in body["tracks"]["pen"]
        assert all("track" in l for l in body["lessons"])

    def test_the_structural_review_can_reach_the_story_track(self):
        """The craft linter reads pages, so its rules land on pen lessons.
        `review.py` reads shape — act balance and runtime drift — and those are
        the only story-level problems this product can detect automatically."""
        for rule in ("act_out_of_balance", "act_balance_unknown", "runtime_drift"):
            lesson_id = lessons.RULE_TO_LESSON.get(rule)
            assert lesson_id, rule
            assert lessons.LESSONS_BY_ID[lesson_id]["track"] == "story"

    def test_every_mapped_rule_still_points_at_a_real_lesson(self):
        for rule, lesson_id in lessons.RULE_TO_LESSON.items():
            assert lesson_id in lessons.LESSONS_BY_ID, f"{rule} -> {lesson_id}"

    def test_a_beat_outline_passes_on_beats_with_the_flip_marked(self):
        outline = "\n".join([
            "Mira takes the extra shift to pay for the class",
            "Baba praises her for finally taking the shop seriously",
            "The class times clash with the evening rush",
            "FLIP: a customer from the class walks into the shop",
            "Every sale now risks the secret",
            "She starts closing early and cooking the books",
        ])
        result = lessons.grade("midpoint-flip", outline)
        assert result["passed"], result["problems"]

    def test_a_beat_outline_fails_without_enough_beats(self):
        result = lessons.grade("midpoint-flip", "one beat\nFLIP: two")
        assert not result["passed"]
        assert any("6 beats" in p for p in result["problems"])

    def test_a_beat_outline_fails_without_the_flip_named(self):
        outline = "\n".join(f"Beat {i}" for i in range(6))
        result = lessons.grade("midpoint-flip", outline)
        assert not result["passed"]
        assert any("FLIP" in p for p in result["problems"])

    def test_the_marker_is_matched_without_caring_about_case(self):
        outline = "\n".join(["a", "b", "c", "flip: the register turns", "e", "f"])
        assert lessons.grade("midpoint-flip", outline)["passed"]

    def test_redefine_victory_rejects_on_the_nose_triumph(self):
        """The lesson that teaches the earned ending must not pass a scene the
        linter reads as stating the feeling outright."""
        scene = (
            "INT. CHIYA PASAL - NIGHT\n\n"
            "MIRA\n"
            "I am so happy because I finally won and proved everyone wrong.\n"
        )
        result = lessons.grade("redefine-victory", scene)
        assert not result["passed"]

    def test_story_lessons_grade_a_clean_scene(self):
        """A properly written scene passes the scene-based story exercises —
        the checks must be passable, or the track is a wall, not a course."""
        scene = (
            "INT. CHIYA PASAL - NIGHT\n\n"
            "Mira counts the till twice. She slides three notes into her bag\n"
            "and the rest into the drawer.\n\n"
            "MIRA\n"
            "Bholi bihanai kholchhu.\n\n"
            "BABA\n"
            "Aaja dherai bikri bhayo?\n\n"
            "MIRA\n"
            "Ali ali.\n\n"
            "BABA\n"
            "Ramro. Class kasto chha?\n\n"
            "She zips the bag shut.\n"
        )
        for lesson_id in ("stakes-of-pursuit", "progress-is-the-trap",
                          "detonate-where-safe", "redefine-victory"):
            result = lessons.grade(lesson_id, scene)
            assert result["passed"], (lesson_id, result["problems"])


class TestNepaliCurriculum:
    """The course speaks Nepali (2026-08-26).

    The interface had spoken Nepali since `i18n/strings.js`, but the course did
    not — a writer could switch the product to Nepali and meet nineteen lessons
    of English prose in the one place the product is explicitly teaching. For a
    tool whose differentiator is that it reads and lints Nepali dialogue, that
    was the least defensible English left.

    The fallback is per FIELD, not per lesson, so a lesson added before anyone
    translates it still reads correctly rather than showing a half-Nepali page.
    """

    def _devanagari(self, text):
        return any("ऀ" <= c <= "ॿ" for c in text)

    def test_every_lesson_is_translated(self):
        for l in lessons.LESSONS:
            assert l["id"] in lessons.TRANSLATIONS["ne"], l["id"]

    def test_every_prose_field_is_translated(self):
        for l in lessons.LESSONS:
            entry = lessons.TRANSLATIONS["ne"][l["id"]]
            for field in ("title", "concept", "corpus_proof", "exercise"):
                assert entry.get(field), f'{l["id"]}.{field}'
                assert self._devanagari(entry[field]), f'{l["id"]}.{field} is not Nepali'

    def test_asking_for_nepali_returns_nepali(self):
        got = lessons.public_lesson(lessons.LESSONS_BY_ID["midpoint-flip"], lang="ne")

        assert self._devanagari(got["title"])
        assert self._devanagari(got["concept"])

    def test_the_default_is_still_english(self):
        got = lessons.public_lesson(lessons.LESSONS_BY_ID["midpoint-flip"])

        assert got["title"] == "The midpoint flips the register"

    def test_an_unknown_language_falls_back_to_english(self):
        got = lessons.public_lesson(lessons.LESSONS_BY_ID["subtext"], lang="fr")

        assert got["title"] == "Nobody says what they want"

    def test_a_missing_field_falls_back_per_field(self):
        """Half a translated lesson must read as English where it is missing,
        not as a blank — the alternative looks broken to the writer."""
        original = lessons.TRANSLATIONS["ne"]["subtext"]
        lessons.TRANSLATIONS["ne"]["subtext"] = {"title": "शीर्षक"}
        try:
            got = lessons.public_lesson(lessons.LESSONS_BY_ID["subtext"], lang="ne")
            assert got["title"] == "शीर्षक"
            assert got["concept"] == lessons.LESSONS_BY_ID["subtext"]["concept"]
        finally:
            lessons.TRANSLATIONS["ne"]["subtext"] = original

    def test_the_api_serves_the_course_in_nepali(self, client, make_user):
        user = make_user()

        r = client.get("/learn/lessons?lang=ne", headers=user["headers"])

        assert r.status_code == 200, r.text
        assert all(self._devanagari(l["title"]) for l in r.json()["lessons"])

    def test_the_api_defaults_to_english(self, client, make_user):
        user = make_user()

        body = client.get("/learn/lessons", headers=user["headers"]).json()

        assert any(l["title"] == "What a screenplay is" for l in body["lessons"])

    def test_a_flag_can_reach_its_lesson_in_nepali(self, client, make_user):
        """The editor's "why this matters" must answer in the language the
        writer is reading the app in."""
        user = make_user()

        r = client.get("/learn/for-rule/on_the_nose?lang=ne", headers=user["headers"])

        assert r.status_code == 200, r.text
        assert self._devanagari(r.json()["concept"])

    def test_grading_is_unaffected_by_language(self):
        """The checks read the writer's screenplay, not the lesson's prose."""
        scene = "INT. PASAL - DAY\n\nShe counts the till.\n"
        assert lessons.grade("the-page", scene)["passed"]
