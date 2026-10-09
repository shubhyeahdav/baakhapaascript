"""`course` is a sixth category, not a use of `tutorial`.

A tutorial is watched; a course is practised. That distinction is exactly what
`## EXERCISE` and `## CHECK` exist to hold, so collapsing the two would remove
the only structural rule the course mode has.
"""
import pytest
from pydantic import ValidationError

import models


def test_course_is_a_category():
    assert "course" in models.VIDEO_CATEGORIES


def test_the_five_existing_categories_survive():
    for name in ("essay", "tutorial", "documentary", "commentary", "vlog"):
        assert name in models.VIDEO_CATEGORIES


def test_a_project_can_be_created_as_a_course():
    p = models.ProjectCreate(title="Cut on the turn", video_category="course")
    assert p.video_category == "course"


def test_an_unknown_category_is_still_rejected():
    # Widening the list must not turn the validator off.
    with pytest.raises(ValidationError):
        models.ProjectCreate(title="X", video_category="webinar")
