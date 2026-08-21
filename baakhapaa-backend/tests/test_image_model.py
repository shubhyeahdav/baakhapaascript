"""The image model, and the shape of what it returns.

This called `dall-e-3` at size `1792x1024`. OpenAI shut DALL·E down in the API
on 12 May 2026 and that size was DALL·E-only, so against a live key the call
failed twice over — while demo mode passed, because the mock branch returns
before the API is ever touched. Exactly the class of bug that only appears the
first time real keys are used, which is why it is worth pinning down here.

The response shape changed with it: the gpt-image models return base64 rather
than a hosted URL, so the old `response.data[0].url` would read None on every
frame and produce a board of empty images with no error anywhere.
"""
import base64
import io

import export_service
import storyboard_engine

# 1x1 PNG.
PIXEL = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class _Item:
    def __init__(self, url=None, b64_json=None):
        self.url = url
        self.b64_json = b64_json


# ---------------------------------------------------------------------------
# The model itself
# ---------------------------------------------------------------------------
def test_the_retired_dall_e_model_is_not_requested():
    """`dall-e-3` no longer exists in the API. Asking for it is a guaranteed
    failure on every storyboard a paying user generates."""
    assert storyboard_engine.IMAGE_MODEL != "dall-e-3"
    assert storyboard_engine.IMAGE_MODEL.startswith("gpt-image")


def test_the_size_is_one_the_model_accepts():
    """1792x1024 was a DALL·E size. The gpt-image family takes three."""
    assert storyboard_engine.IMAGE_SIZE in ("1024x1024", "1024x1536", "1536x1024")


def test_the_placeholder_matches_the_real_frame_size():
    """A demo board that is a different aspect ratio from a real one makes
    every layout decision taken against it worthless."""
    url = storyboard_engine.generate_frame("A quiet argument", "Wide Shot", "Drama")
    assert storyboard_engine.IMAGE_SIZE in url


# ---------------------------------------------------------------------------
# The response shape
# ---------------------------------------------------------------------------
def test_a_hosted_url_is_used_as_is():
    assert storyboard_engine._image_reference(
        _Item(url="https://example.com/frame.png")
    ) == "https://example.com/frame.png"


def test_base64_becomes_an_embeddable_reference():
    """The normal case for a real board now."""
    ref = storyboard_engine._image_reference(_Item(b64_json="QUJD"))
    assert ref == "data:image/png;base64,QUJD"


def test_an_empty_result_is_none_rather_than_a_broken_reference():
    assert storyboard_engine._image_reference(_Item()) is None


# ---------------------------------------------------------------------------
# Exports have to be able to embed it
# ---------------------------------------------------------------------------
def test_the_pdf_can_embed_an_inline_frame():
    """Frames used to arrive as DALL·E links that expired after about an hour,
    which is why a package exported the next day printed 'frame image not
    embedded' on every frame. An inline frame still embeds a week later."""
    data_uri = "data:image/png;base64," + base64.b64encode(PIXEL).decode()
    assert export_service._fetch_image(data_uri, deadline=float("inf")) is not None


def test_a_malformed_inline_frame_degrades_instead_of_raising():
    """A missing image is a degraded frame, never a failed export."""
    assert export_service._fetch_image("data:image/png;base64,!!!not-base64!!!",
                                       deadline=float("inf")) is None


def test_a_non_image_reference_is_refused():
    assert export_service._fetch_image("ftp://example.com/x.png",
                                       deadline=float("inf")) is None


def test_an_inline_frame_survives_the_whole_package_export(monkeypatch):
    """The end the writer actually sees: a production package with the frame
    in it rather than a captioned box."""
    data_uri = "data:image/png;base64," + base64.b64encode(PIXEL).decode()
    image = export_service._fetch_image(data_uri, deadline=float("inf"))
    assert image is not None
    # ReportLab must be able to read a size off it, or drawImage would fail.
    assert image.getSize() == (1, 1)
    assert isinstance(io.BytesIO(PIXEL).read(), bytes)
