"""Make a 360 render meet itself where its left and right edges join.

An equirectangular picture wraps: the last column is next to the first. The
panorama we send for rendering does (its edges are the same view of the room), but the
render service paints the picture as a flat image and does not know the edges
touch, so what comes back differs between its left and right edge: a ceiling that is
white on one side and grey on the other. In the viewer that is a straight vertical line
through the room, wherever the edges meet.

The fix has two parts. The tone: for each row, how much brighter or redder the right
edge is than the left edge, smoothed over the rows so it follows light and not detail, is
shared out between the two edges and faded to nothing over a band of the picture on
either side. The two edges then meet at the same colour, and nothing further than the
band from the join is touched. Then what differs across the join anyway (the render may draw
a slightly different floor or object at each end) is softened: a narrow strip on either
side of the join is blended with a horizontal blur of itself, so a hard line becomes a short
gradient. Nothing is moved or invented; further than that strip from the join the picture
is as it was.

A picture that is not a 2:1 panorama, one that already meets itself, and one that cannot
be read are returned exactly as they came in.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image

# A panorama is 2:1; allow for a resize that was a pixel or two off.
_MIN_ASPECT, _MAX_ASPECT = 1.9, 2.1
# Mean per-channel difference (0-255) between the edges below which nothing is done:
# JPEG noise and the content itself differ by about this much on a seamless picture.
_NEGLIGIBLE = 3.0
# How wide the edge strip that is compared is, and how far the fade reaches, as a
# share of the picture's width.
_EDGE_SHARE = 0.006
_FADE_SHARE = 0.22
# The blur that softens the join: its radius, and how far from the join it is blended in
# (both as a share of the width).
_BLUR_SHARE = 0.012
_BLEND_SHARE = 0.03


def _smooth_rows(values: np.ndarray, radius: int) -> np.ndarray:
    """Box-average a (rows, 3) array down its rows, edges repeated."""
    padded = np.pad(values, ((radius, radius), (0, 0)), mode="edge")
    kernel = np.ones(2 * radius + 1, dtype=np.float32) / (2 * radius + 1)
    return np.stack([np.convolve(padded[:, c], kernel, mode="valid") for c in range(values.shape[1])], axis=1)


def _smoothstep(t: np.ndarray) -> np.ndarray:
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _soften_join(pixels: np.ndarray) -> np.ndarray:
    """Blend a strip around the wrap join with a horizontal box blur of itself, strongest at the join."""
    height, width, _ = pixels.shape
    radius = max(2, round(width * _BLUR_SHARE))
    reach = max(radius, round(width * _BLEND_SHARE))
    centre = width // 2
    rolled = np.roll(pixels, centre, axis=1)  # the join is now between columns centre-1 and centre
    lo, hi = centre - reach - radius, centre + reach + radius
    window = rolled[:, lo:hi]
    padded = np.pad(window, ((0, 0), (radius, radius + 1), (0, 0)), mode="edge")
    sums = np.cumsum(padded, axis=1, dtype=np.float64)
    sums = np.concatenate([np.zeros((height, 1, 3)), sums], axis=1)
    blurred = ((sums[:, 2 * radius + 1 + 1:] - sums[:, 1:-(2 * radius + 1)]) / (2 * radius + 1))[:, : window.shape[1]]
    distance = np.abs(np.arange(lo, hi, dtype=np.float32) + 0.5 - centre)  # to the join, in columns
    weight = _smoothstep(1.0 - distance / reach)[None, :, None].astype(np.float32)
    rolled[:, lo:hi] = window * (1.0 - weight) + blurred.astype(np.float32) * weight
    return np.roll(rolled, -centre, axis=1)


def edge_difference(image: np.ndarray) -> float:
    """How far apart the two edges are, mean absolute difference over rows and channels (0-255)."""
    k = max(2, round(image.shape[1] * _EDGE_SHARE))
    return float(np.abs(image[:, -k:].mean(axis=1) - image[:, :k].mean(axis=1)).mean())


def make_wrap_seamless(data: bytes, *, quality: int = 95) -> bytes:
    """The picture with its edges' tone matched, as JPEG; *data* itself when there is nothing to do."""
    try:
        with Image.open(io.BytesIO(data)) as opened:
            image = opened.convert("RGB")
        height, width = image.height, image.width
        if not _MIN_ASPECT <= width / height <= _MAX_ASPECT:
            return data

        pixels = np.asarray(image, dtype=np.float32)
        if edge_difference(pixels) < _NEGLIGIBLE:
            return data

        k = max(2, round(width * _EDGE_SHARE))
        delta = pixels[:, -k:].mean(axis=1) - pixels[:, :k].mean(axis=1)  # (rows, 3): right minus left
        delta = _smooth_rows(delta, max(2, height // 25))

        band = max(8, round(width * _FADE_SHARE))
        x = np.arange(band, dtype=np.float32)
        toward_join = _smoothstep(x / band)  # 0 at the band's inner end, 1 at the edge
        # Right edge: take half of the difference off, most at the edge itself. Left edge: put it on.
        pixels[:, width - band:] -= 0.5 * delta[:, None, :] * toward_join[None, ::1, None]
        pixels[:, :band] += 0.5 * delta[:, None, :] * toward_join[None, ::-1, None]

        pixels = _soften_join(pixels)

        out = io.BytesIO()
        Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8)).save(out, format="JPEG", quality=quality, optimize=True)
        return out.getvalue()
    except Exception:  # unreadable, truncated, anything: keep the picture we were given
        return data
