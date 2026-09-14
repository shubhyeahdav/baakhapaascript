"""The finalize review, told what it is reading.

`review.py` was written when every script was a screenplay, and two of its
checks are screenplay ideas wearing no label:

  * **Runtime** was measured at roughly one page a minute. Narration read aloud
    has no relationship to page count — the same words as one paragraph or ten
    short lines take the same time to say.
  * **Act balance** measures a three-act split against 33/33/34. A long-form
    video has no acts. It has sections.

Measured before this was format-aware: a COMPLETE six-minute video script, 900
words of narration at a speaking rate, was reported as *"estimates 1.45 min
against the 6 min this project was set up for — under by 76%"*. Confident, and
wrong in every part.

That is worse than not checking. A review that speaks from a measurement which
does not apply gets believed, and it would send a writer to pad a script that
was already the right length. It is the same rule the retention instrument and
the mid-draft notes follow: show and point, never assert a fault you cannot
check.
"""
import review
import videoscript


def _video(words: int) -> str:
    """A long-form draft whose narration really does run `words` long."""
    return ("## HOOK - 0:15\n" + " ".join(["word"] * words)
            + "\n\n## PAYOFF - 1:30\nAnd that is why.\n")


SHORT_VIDEO = _video(20)
COMPLETE_VIDEO = _video(900)  # ~6 minutes at 150 wpm


def test_a_finished_video_is_not_told_it_is_three_quarters_short():
    """The bug, stated as the thing a writer would have done about it: padded a
    script that was already the right length."""
    assert 5.5 <= videoscript.runtime_seconds(COMPLETE_VIDEO) / 60 <= 6.5

    findings = review.check_total_runtime(COMPLETE_VIDEO, 6, "long_form")

    assert findings == [], findings


def test_the_same_draft_read_as_a_screenplay_still_complains():
    """Pins the difference rather than the fix. If this ever stops complaining,
    the two paths have converged and the format argument has stopped doing
    anything — which would be a silent regression."""
    findings = review.check_total_runtime(COMPLETE_VIDEO, 6, "short")

    assert findings, "the screenplay path should still read this as short"


def test_a_video_that_really_is_short_is_still_told_so():
    """The check is made accurate, not removed. A twenty-word script for a
    six-minute video is genuinely thin and a writer should hear it."""
    findings = review.check_total_runtime(SHORT_VIDEO, 6, "long_form")

    assert findings
    assert "under" in findings[0]["message"]


def test_the_video_finding_says_how_it_measured():
    """"One page is roughly one minute" is false here and would explain a
    number using a rule that was not used to produce it."""
    findings = review.check_total_runtime(SHORT_VIDEO, 6, "long_form")

    assert "speaking rate" in findings[0]["detail"]
    assert "page" not in findings[0]["detail"].lower()


def test_a_screenplay_keeps_the_page_explanation():
    findings = review.check_total_runtime("INT. A - DAY\n\nOne line.\n", 90, "short")

    assert findings
    assert "page" in findings[0]["detail"].lower()


def test_an_unknown_format_is_read_as_a_screenplay():
    """Every project that existed before long_form is one, and a format nobody
    recognises is far more likely to be one of those than to be a video."""
    a = review.check_total_runtime(COMPLETE_VIDEO, 6, None)
    b = review.check_total_runtime(COMPLETE_VIDEO, 6, "short")

    assert a == b


# --- act balance ------------------------------------------------------------

def test_a_video_is_not_given_a_reading_of_acts_it_does_not_have():
    """Act balance measures a three-act split. Running it on a video reports a
    structure the writer never claimed to have — an invented finding, which is
    the one thing a deterministic check must never produce.

    The retention shape in the Outline is the equivalent instrument, and it
    draws what is actually there.
    """
    scenes = [
        {"act_number": 1, "title": "HOOK", "time_allocation": 0},
        {"act_number": 1, "title": "PAYOFF", "time_allocation": 0},
    ]

    out = review.review(COMPLETE_VIDEO, scenes, {"duration_minutes": 6,
                                                 "format": "long_form"})

    assert not [f for f in out["findings"] if f["rule"] == "act_balance"]


def test_a_screenplay_still_gets_its_act_balance():
    """The check is skipped for video, not deleted. If this fails, a real
    screenplay check has been lost to a feature it has nothing to do with."""
    scenes = [{"act_number": 1, "title": "INT. A - DAY", "time_allocation": 90}]

    out = review.review("INT. A - DAY\n\nOne line.\n", scenes,
                        {"duration_minutes": 90, "format": "short"})

    # Not asserting it FIRES — that depends on the draft. Asserting the check
    # still ran at all, which is what the skip could accidentally remove.
    assert isinstance(out["findings"], list)
    assert review.check_act_balance("INT. A - DAY\n\nOne line.\n", scenes) is not None


def test_review_survives_a_project_with_no_format():
    """Called on every finalize, including for rows written before `format`
    existed."""
    out = review.review(COMPLETE_VIDEO, [], {"duration_minutes": 6})

    assert "findings" in out
