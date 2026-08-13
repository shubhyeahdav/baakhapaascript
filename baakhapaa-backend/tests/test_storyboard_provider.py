"""Free keyless image provider for storyboard frames.

Tests the URL builder directly rather than the network, so the suite stays
offline and fast. `STORYBOARD_PROVIDER` is read at import time, so the
provider switch itself is asserted through the module constant.
"""
from urllib.parse import urlparse, parse_qs

import storyboard_engine as se


def _frame_prompt():
    return se.generate_frame(
        "Raaja hides his result from his father",
        "Wide Shot",
        "drama",
        "Chiya pasal, Patan",
        "quiet anxiety",
    )


def test_placeholder_is_the_default_provider():
    """Pollinations sends scene text to a third party, so it must never be
    switched on implicitly."""
    assert se.STORYBOARD_PROVIDER == "placeholder"
    assert "placehold.co" in _frame_prompt()


def test_pollinations_url_is_wellformed():
    url = se._pollinations_url("Wide Shot cinematic storyboard frame. A tea shop.")
    parsed = urlparse(url)
    assert parsed.scheme == "https"
    assert parsed.netloc == "image.pollinations.ai"
    assert parsed.path.startswith("/prompt/")

    qs = parse_qs(parsed.query)
    assert qs["width"] == ["1280"]
    assert qs["height"] == ["720"]
    assert qs["nologo"] == ["true"]
    assert qs["seed"][0].isdigit()


def test_same_prompt_gives_the_same_url():
    """A storyboard is a shoot reference. If the seed changed per call the art
    would differ on every page load and the frame would be useless."""
    a = se._pollinations_url("INT. CHIYA PASAL - MORNING, wide")
    b = se._pollinations_url("INT. CHIYA PASAL - MORNING, wide")
    assert a == b


def test_different_prompts_give_different_seeds():
    a = parse_qs(urlparse(se._pollinations_url("a wide shot")).query)["seed"][0]
    b = parse_qs(urlparse(se._pollinations_url("a close up")).query)["seed"][0]
    assert a != b


def test_prompt_special_characters_are_encoded():
    url = se._pollinations_url("INT. PASAL - DAY. Raaja & Sanjana; 100% tension?")
    # Everything after the query separator must be our params, not prompt text.
    assert url.count("?") == 1
    for raw in ("&", " ", ";"):
        assert raw not in urlparse(url).path
