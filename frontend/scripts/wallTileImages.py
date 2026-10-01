#!/usr/bin/env python3
"""
Bakes the wall-tile faces in public/wall/tile/.

A tiled FLOOR is real geometry: a slab per tile, with the grout showing in the
gaps and the arris catching light on every edge. A wall is two triangles with a
picture on it, so a wall tile's joint has to be IN the picture — one tile per
image, with half a joint along each edge, so that repeating the image lays the
other half of the joint against it and the wall comes out with one joint
between every pair of tiles.

That is also why there is a file per size rather than one per face: the joint is
2 mm on every tile, and 2 mm is a different fraction of a 1200 mm tile than of a
300 mm one. Sharing an image across sizes would stretch the joint with the tile.

Run from frontend/:  python3 scripts/wallTileImages.py
"""
from PIL import Image, ImageDraw, ImageChops
from pathlib import Path

OUT = Path('public/wall/tile')
SRC = Path('public/floor/tile')

# Matches floorGeometry's GROUT_COLOR and surfaceFinish's tile rim, so a wall
# and a floor tiled in the same room are grouted and eased alike.
GROUT = (0xEF, 0xED, 0xE8)
ARRIS = (0xF2, 0xF0, 0xEB)
PLAIN = (0xD8, 0xD8, 0xD0)  # FLOOR_COLORS.tile — the unprinted glazed tile

JOINT_MM = 2.0
ARRIS_MM = 1.5
LONG_EDGE = 1024

# The same four sizes the floor offers (TILE_SIZES), in millimetres:
# (length across the wall, height up it).
SIZES = [(600, 600), (600, 300), (1200, 600), (400, 400)]

FACES = {
    'plain': None,
    'marble-white': SRC / 'marble-white.jpg',
    'marble-black': SRC / 'marble-black.jpg',
    'marble-grey': SRC / 'marble-grey.jpg',
}


def face_image(path: Path | None, w: int, h: int) -> Image.Image:
    """One tile's face, filling w x h."""
    if path is None:
        return Image.new('RGB', (w, h), PLAIN)
    src = Image.open(path).convert('RGB')
    # The sources are portrait. Veining runs the long way down a tile, so an
    # oblong tile gets the source turned rather than squashed — the same thing
    # tileSettings' textureRotation does for the floor.
    if w > h:
        src = src.transpose(Image.ROTATE_90)
    # Centre-crop to the tile's proportions, then scale: stretching a marble
    # makes the veins obviously wrong before the joint is even visible.
    want = w / h
    sw, sh = src.size
    if sw / sh > want:
        cw = int(sh * want)
        src = src.crop(((sw - cw) // 2, 0, (sw - cw) // 2 + cw, sh))
    else:
        ch = int(sw / want)
        src = src.crop((0, (sh - ch) // 2, sw, (sh - ch) // 2 + ch))
    return src.resize((w, h), Image.LANCZOS)


def build(length_mm: int, height_mm: int, path: Path | None) -> Image.Image:
    long_mm = max(length_mm, height_mm)
    px_per_mm = LONG_EDGE / long_mm
    w = round(length_mm * px_per_mm)
    h = round(height_mm * px_per_mm)

    # Half a joint on each edge: the neighbour's half completes it.
    half = max(2, round(JOINT_MM / 2 * px_per_mm))
    fw, fh = w - 2 * half, h - 2 * half

    img = Image.new('RGB', (w, h), GROUT)
    face = face_image(path, fw, fh)

    # The eased edge: a glazed tile's arris is a rounded lip, which reads as a
    # pale line a millimetre or two in from the joint. Blended rather than
    # painted, so the marble still shows through it.
    arris = max(1, round(ARRIS_MM * px_per_mm))
    if arris * 2 < min(fw, fh):
        lip = Image.new('RGB', (fw, fh), ARRIS)
        mask = Image.new('L', (fw, fh), 0)
        d = ImageDraw.Draw(mask)
        for i in range(arris):
            # Strongest at the very edge, fading inwards.
            v = round(130 * (1 - i / arris))
            d.rectangle([i, i, fw - 1 - i, fh - 1 - i], outline=v)
        face = Image.composite(lip, face, mask)

    img.paste(face, (half, half))
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for length_mm, height_mm in SIZES:
        for name, path in FACES.items():
            out = OUT / f'{name}-{length_mm}x{height_mm}.jpg'
            build(length_mm, height_mm, path).save(out, quality=88, optimize=True)
            print(out, out.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
