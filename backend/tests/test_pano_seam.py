"""A 360 render must meet itself where its left and right edges join."""
from __future__ import annotations

import io
from unittest.mock import AsyncMock, patch

import numpy as np
import pytest
import respx
from httpx import Response
from PIL import Image

from app.services.pano_seam import edge_difference, make_wrap_seamless

W, H = 1200, 600


def jpeg(array: np.ndarray, quality: int = 95) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(np.clip(array, 0, 255).astype(np.uint8)).save(buf, "JPEG", quality=quality)
    return buf.getvalue()


def decode(data: bytes) -> np.ndarray:
    return np.asarray(Image.open(io.BytesIO(data)).convert("RGB"), dtype=np.float32)


def room(width: int = W, height: int = H, left_boost: float = 0.0) -> np.ndarray:
    """A smooth, periodic 'room' (it wraps by construction), with the left edge optionally brighter."""
    x = np.linspace(0, 1, width, endpoint=False)[None, :, None]
    y = np.linspace(0, 1, height)[:, None, None]
    img = np.tile(110 + 50 * np.sin(2 * np.pi * x) + 25 * y, (1, 1, 3)).astype(np.float32)
    img[:, : width // 10] += left_boost
    return img


def test_a_tone_jump_at_the_join_is_removed():
    seamed = jpeg(room(left_boost=40))
    before = decode(seamed)
    assert edge_difference(before) > 30
    after = decode(make_wrap_seamless(seamed))
    assert edge_difference(after) < 3


def test_the_picture_away_from_the_join_is_left_alone():
    seamed = jpeg(room(left_boost=40))
    before, after = decode(seamed), decode(make_wrap_seamless(seamed))
    middle = slice(int(W * 0.3), int(W * 0.7))
    assert np.abs(before[:, middle] - after[:, middle]).mean() < 0.5


def test_the_correction_follows_the_rows_not_a_flat_tint():
    # Only the top half of the left edge is brighter: the bottom half must not be dimmed or brightened.
    img = room()
    img[: H // 2, : W // 10] += 50
    before, after = decode(jpeg(img)), decode(make_wrap_seamless(jpeg(img)))
    bottom = slice(int(H * 0.8), H)
    assert np.abs(before[bottom, :40] - after[bottom, :40]).mean() < 3


def test_a_picture_that_already_meets_itself_is_returned_unchanged():
    seamless = jpeg(room())
    assert make_wrap_seamless(seamless) == seamless


def test_a_picture_that_is_not_a_2_to_1_panorama_is_returned_unchanged():
    flat = jpeg(room(width=900, height=600, left_boost=60))  # 3:2, a plain render
    assert make_wrap_seamless(flat) == flat


@pytest.mark.parametrize("data", [b"", b"not an image", jpeg(room(left_boost=40))[:200]])
def test_anything_unreadable_comes_back_as_it_was(data):
    assert make_wrap_seamless(data) == data


def test_the_result_is_a_jpeg_of_the_same_size():
    out = make_wrap_seamless(jpeg(room(left_boost=40)))
    image = Image.open(io.BytesIO(out))
    assert image.format == "JPEG" and image.size == (W, H)


def test_the_join_becomes_a_gradient_not_a_step_when_the_content_differs():
    # The two ends show different things (a dark band on the right edge only): no tone fix can
    # match them, so the join is softened instead of left as a hard step.
    img = room()
    img[:, -W // 50:] = 20
    before = decode(jpeg(img))
    after = decode(make_wrap_seamless(jpeg(img)))
    step = lambda a: np.abs(a[:, 0] - a[:, -1]).mean()
    assert step(after) < step(before) * 0.5


@respx.mock
async def test_a_render_is_stored_with_its_join_matched():
    from app.tasks import media

    seamed = jpeg(room(left_boost=40))
    respx.get("https://provider.example/out.jpg").mock(return_value=Response(200, content=seamed))
    stored = {}

    async def fake_upload(content, key, content_type):
        stored["content"] = content
        return f"/media/{key}"

    with patch("app.core.storage.upload_file", new=AsyncMock(side_effect=fake_upload)):
        key, url = await media._keep_remote_image("user-1", "https://provider.example/out.jpg")

    assert key.startswith("renders/user-1/") and url == f"/media/{key}"
    assert edge_difference(decode(stored["content"])) < 3
