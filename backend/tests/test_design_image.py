"""
prepare_design_image: what the AI designer is allowed to see of an
inspiration image.

The file is checked by its real bytes, not the browser's word; shrunk so
the long side is at most 1024 px (a big photo costs more and reads no
better); and re-encoded as a plain JPEG, which drops EXIF (a phone photo
carries its GPS position). Nothing is written anywhere.
"""
from __future__ import annotations

import base64
import io
import struct
import zlib

import pytest
from PIL import Image

from app.services.design_image import (
    MAX_DESIGN_IMAGE_BYTES,
    ImageTooLarge,
    PreparedImage,
    UnsupportedImage,
    prepare_design_image,
)


def _img(fmt: str, w: int, h: int, mode: str = "RGB", color=(120, 140, 160), exif: bytes | None = None) -> bytes:
    buf = io.BytesIO()
    kwargs = {"exif": exif} if exif is not None else {}
    Image.new(mode, (w, h), color).save(buf, format=fmt, **kwargs)
    return buf.getvalue()


def _out(p: PreparedImage) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(p.data_b64)))


@pytest.mark.parametrize(("fmt", "ctype"), [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")])
def test_jpeg_png_and_webp_are_accepted_and_come_out_as_jpeg(fmt, ctype):
    p = prepare_design_image(_img(fmt, 300, 200), ctype)
    assert p.media_type == "image/jpeg"
    assert base64.b64decode(p.data_b64)[:3] == b"\xff\xd8\xff"
    assert (p.width, p.height) == (300, 200)


def test_a_header_that_lies_about_the_content_is_refused():
    with pytest.raises(UnsupportedImage):
        prepare_design_image(b"<script>alert(1)</script>" + b"0" * 100, "image/jpeg")


@pytest.mark.parametrize("ctype", ["image/heic", "image/gif", None])
def test_an_unlisted_type_is_refused(ctype):
    with pytest.raises(UnsupportedImage):
        prepare_design_image(_img("PNG", 50, 50), ctype)


def test_more_than_10_mb_is_too_large():
    with pytest.raises(ImageTooLarge):
        prepare_design_image(b"\xff\xd8\xff" + b"0" * MAX_DESIGN_IMAGE_BYTES, "image/jpeg")


def test_a_big_image_is_shrunk_to_1024_on_its_long_side():
    p = prepare_design_image(_img("JPEG", 3000, 1500), "image/jpeg")
    assert (p.width, p.height) == (1024, 512)
    assert _out(p).size == (1024, 512)


def test_a_small_image_is_not_enlarged():
    p = prepare_design_image(_img("PNG", 500, 400), "image/png")
    assert (p.width, p.height) == (500, 400)


def test_exif_is_gone_from_the_output():
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # Make
    exif[0x8825] = {2: (41.0, 18.0, 0.0)}  # GPSInfo: latitude
    p = prepare_design_image(_img("JPEG", 200, 100, exif=exif.tobytes()), "image/jpeg")
    assert dict(_out(p).getexif()) == {}


# ── Review Focus ─────────────────────────────────────────────────────────────

def test_a_truncated_file_with_a_good_header_is_unsupported():
    data = _img("JPEG", 400, 300)
    with pytest.raises(UnsupportedImage):
        prepare_design_image(data[: len(data) // 2], "image/jpeg")


def test_a_decompression_bomb_is_unsupported():
    # A tiny PNG whose header claims 20000 x 20000 pixels.
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", 20000, 20000, 8, 2, 0, 0, 0)
    bomb = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"\x00" * 10)) + chunk(b"IEND", b"")
    with pytest.raises(UnsupportedImage):
        prepare_design_image(bomb, "image/png")


def test_transparent_png_areas_become_white_not_black():
    p = prepare_design_image(_img("PNG", 10, 10, mode="RGBA", color=(0, 0, 0, 0)), "image/png")
    assert all(channel >= 250 for channel in _out(p).convert("RGB").getpixel((0, 0)))


def test_exif_rotation_is_applied_before_it_is_dropped():
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation: rotate 90° clockwise to view
    p = prepare_design_image(_img("JPEG", 200, 100, exif=exif.tobytes()), "image/jpeg")
    assert (p.width, p.height) == (100, 200)


def test_more_than_60_megapixels_is_refused_from_the_header():
    # Final review: decoding a ~100 MP photo stalled the worker and needed
    # Pillow's global cap raised. The cap is ours now, read from the header.
    buf = io.BytesIO()
    Image.new("1", (8000, 8000)).save(buf, format="PNG")  # 64 MP, a few KB
    with pytest.raises(UnsupportedImage):
        prepare_design_image(buf.getvalue(), "image/png")


def test_pillows_global_cap_is_left_alone(monkeypatch):
    seen = []
    real_open = Image.open

    def spy(*a, **k):
        seen.append(Image.MAX_IMAGE_PIXELS)
        return real_open(*a, **k)

    monkeypatch.setattr(Image, "open", spy)
    before = Image.MAX_IMAGE_PIXELS
    prepare_design_image(_img("JPEG", 300, 200), "image/jpeg")
    assert seen == [before]  # never swapped, even while decoding
