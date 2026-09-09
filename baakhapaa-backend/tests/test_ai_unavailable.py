"""What a writer is told when the model cannot be reached.

Written the day the Anthropic account ran out of credit, which is the only
condition that exposes this: with a working key the detail is never seen, and
with no key at all the app is in demo mode and never calls out. So the bug sat
behind a state that neither the test suite nor demo mode can reach, and the
first real-key attempt found it in one call.

What a Pro writer pressing Generate was shown:

    Claude API error: Error code: 400 - {'type': 'error', 'error':
    {'type': 'invalid_request_error', 'message': 'Your credit balance is too
    low to access the Anthropic API. Please go to Plans & Billing to upgrade
    or purchase credits.'}, 'request_id': 'req_011Ces...'}

That is our billing state, an instruction addressed to somebody else, and a
Python dict — none of which helps them decide what to do with their scene.
"""
import pytest
from fastapi import HTTPException

import scripts


def _detail_for(error):
    with pytest.raises(HTTPException) as caught:
        with scripts.ai_unavailable_as_503():
            raise error
    return caught.value


def test_a_provider_failure_is_503_not_500():
    """A model being down is not the writer's fault and not a bug in us."""
    assert _detail_for(RuntimeError("Claude API error: boom")).status_code == 503


def test_the_provider_message_never_reaches_the_writer():
    real = (
        "Claude API error: Error code: 400 - {'type': 'error', 'error': "
        "{'type': 'invalid_request_error', 'message': 'Your credit balance is "
        "too low to access the Anthropic API. Please go to Plans & Billing to "
        "upgrade or purchase credits.'}, 'request_id': 'req_011Ces'}"
    )
    detail = _detail_for(RuntimeError(real)).detail

    for leak in ("credit balance", "Plans & Billing", "request_id", "400", "{"):
        assert leak not in detail, f"the response still repeats {leak!r}"


def test_the_writer_is_told_their_work_is_safe():
    """The first question after a failed generate is "did I lose my scene"."""
    detail = _detail_for(RuntimeError("anything")).detail

    assert "changed" in detail          # nothing you have written was changed
    assert "try again" in detail.lower()


def test_anything_that_is_not_a_provider_failure_still_raises():
    """The guard is for RuntimeError only. A bug in our own code must not be
    dressed up as the model being unavailable — that would hide it behind a
    status that says "not our fault" and invites a retry that cannot work."""
    with pytest.raises(ValueError):
        with scripts.ai_unavailable_as_503():
            raise ValueError("a real bug")


def test_an_http_error_raised_inside_passes_through_untouched():
    """A tier check inside the block returns 402; it must not become a 503."""
    with pytest.raises(HTTPException) as caught:
        with scripts.ai_unavailable_as_503():
            raise HTTPException(status_code=402, detail="Upgrade to Pro")

    assert caught.value.status_code == 402
