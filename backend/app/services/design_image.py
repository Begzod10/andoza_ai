"""What the AI designer is allowed to see of an inspiration image.

A user hands the studio a picture (a Pinterest screenshot, a photo of a room they
liked) and the designer takes its style from it. Before the model sees it:

  * the file is checked by its own bytes, not by the browser's content-type;
  * it is shrunk so its long side is at most 1024 px: a bigger image costs more
    tokens and does not read any better;
  * it is re-encoded as a plain JPEG, which turns it the right way up and drops
    the EXIF a phone photo carries (its GPS position among it).

It stays in memory. Nothing here writes the image anywhere.
"""
from __future__ import annotations

import base64
import io
import warnings
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_DESIGN_IMAGE_BYTES = 10 * 1024 * 1024
_LONG_SIDE = 1024
_JPEG_QUALITY = 85
# Above any real photo (a 108 MP phone camera gives ~1.1e8 pixels) and far below
# what a forged header can claim. Pillow warns above it and refuses at twice it;
# the warning is turned into a refusal here too.
_MAX_PIXELS = 120_000_000

_SIGNATURES = {
    "image/jpeg": lambda b: b[:3] == b"\xff\xd8\xff",
    "image/png": lambda b: b[:4] == b"\x89PNG",
    "image/webp": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP",
}


class UnsupportedImage(Exception):
    """Not a JPEG, PNG or WebP image we can read."""


class ImageTooLarge(Exception):
    """Over MAX_DESIGN_IMAGE_BYTES."""


@dataclass(frozen=True)
class PreparedImage:
    media_type: str
    data_b64: str
    width: int
    height: int


def prepare_design_image(data: bytes, content_type: str | None) -> PreparedImage:
    """The image as the model gets it: checked, shrunk, a JPEG without EXIF."""
    looks_like = _SIGNATURES.get(content_type or "")
    if looks_like is None:
        raise UnsupportedImage(content_type)
    if len(data) > MAX_DESIGN_IMAGE_BYTES:
        raise ImageTooLarge(len(data))
    if not looks_like(data):
        raise UnsupportedImage("content does not match its type")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            previous = Image.MAX_IMAGE_PIXELS
            Image.MAX_IMAGE_PIXELS = _MAX_PIXELS
            try:
                img = Image.open(io.BytesIO(data))
                img.load()
            finally:
                Image.MAX_IMAGE_PIXELS = previous
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise UnsupportedImage(str(exc)) from exc

    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        img = Image.alpha_composite(white, rgba)
    img = img.convert("RGB")
    img.thumbnail((_LONG_SIDE, _LONG_SIDE))

    out = io.BytesIO()
    img.save(out, format="JPEG", quality=_JPEG_QUALITY)
    return PreparedImage(
        media_type="image/jpeg",
        data_b64=base64.b64encode(out.getvalue()).decode("ascii"),
        width=img.width,
        height=img.height,
    )
