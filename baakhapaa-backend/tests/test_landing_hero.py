"""The landing page shows the linter's output on a Devanagari scene.

It is the page's whole claim, so it must be the linter's REAL output. The
scene and the flags live in the frontend's `src/lib/landingHero.json`; this
lints the scene and requires exactly those flags back. Change a rule's wording
and this fails until the page is changed with it.
"""
import json
import os

import linter

HERO = os.path.join(os.path.dirname(__file__), "..", "..", "baakhapaa-frontend",
                    "src", "lib", "landingHero.json")


def _hero():
    with open(HERO, encoding="utf-8") as f:
        return json.load(f)


def _scene_text(scene):
    return "\n".join(line.get("text", "") for line in scene) + "\n"


def test_landing_hero_matches_linter():
    hero = _hero()
    found = linter.lint(_scene_text(hero["scene"]))

    assert [(f["rule"], f["severity"], f["message"], f["technique"]) for f in found] == [
        (f["rule"], f["severity"], f["message"], f["technique"]) for f in hero["flags"]
    ]


def test_each_flag_points_at_the_line_the_page_marks():
    hero = _hero()
    found = linter.lint(_scene_text(hero["scene"]))
    marked = {line["flag"]: i + 1 for i, line in enumerate(hero["scene"]) if "flag" in line}

    assert [f["line"] for f in found] == [marked[i] for i in range(len(found))]
