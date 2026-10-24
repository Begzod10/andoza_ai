"""Draw the plain window illustrations for the "Deraza bozori — o'rtacha narx" demo store.

The window items are priced at the average Tashkent market price, not taken from a
store's site, so there is no product photo to use. These are simple flat drawings made
here (no photo is copied): a frame, sashes and glass, one per item.

    python scripts/demo_catalog/draw_windows.py   # needs Pillow (in the backend image)

Writes ``app/seed_data/demo_stores/images/deraza-bozori/<n>.webp``; the numbering
matches the store's items in catalog.json.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[2] / "app" / "seed_data" / "demo_stores" / "images" / "deraza-bozori"
SIZE = (640, 640)
BG = (238, 241, 246)
GLASS = (190, 222, 240)
GLARE = (226, 241, 250)
WALL = (214, 219, 228)


def window(frame, sash, panes, w_m, h_m, *, glass_layers=2, door=False):
    """A window of w_m × h_m metres split into *panes* sashes, drawn to scale."""
    img = Image.new("RGB", SIZE, BG)
    d = ImageDraw.Draw(img)
    scale = 440 / max(w_m, h_m)
    w, h = w_m * scale, h_m * scale
    x0, y0 = (SIZE[0] - w) / 2, (SIZE[1] - h) / 2 - (0 if door else 10)
    d.rectangle([x0 - 26, y0 - 26, x0 + w + 26, y0 + h + 26], fill=WALL)  # the wall opening
    d.rectangle([x0, y0, x0 + w, y0 + h], fill=frame)
    pw = w / panes
    for i in range(panes):
        px = x0 + i * pw
        d.rectangle([px + 14, y0 + 14, px + pw - 14, y0 + h - 14], fill=sash)
        gx0, gy0, gx1, gy1 = px + 26, y0 + 26, px + pw - 26, y0 + h - 26
        d.rectangle([gx0, gy0, gx1, gy1], fill=GLASS)
        # glare stripes
        d.polygon([(gx0 + 18, gy1 - 30), (gx0 + 60, gy1 - 30), (gx1 - 20, gy0 + 40), (gx1 - 62, gy0 + 40)], fill=GLARE)
        # glass layers hinted as thin lines at the edge
        for k in range(glass_layers):
            off = 4 + k * 5
            d.rectangle([gx0 + off, gy0 + off, gx1 - off, gy1 - off], outline=(160, 196, 220), width=1)
        # handle on the inner edge of every opening sash
        hx = px + pw - 20 if i % 2 == 0 else px + 20
        hy = y0 + h / 2
        d.rounded_rectangle([hx - 4, hy - 22, hx + 4, hy + 22], radius=4, fill=(120, 126, 138))
    if door:  # lower solid panel of a balcony door
        d.rectangle([x0 + 26, y0 + h * 0.62, x0 + w - 26, y0 + h - 26], fill=sash)
    if not door:  # sill
        d.rectangle([x0 - 40, y0 + h + 26, x0 + w + 40, y0 + h + 40], fill=(250, 250, 250), outline=(200, 204, 212))
    return img


ITEMS = [
    # 1 standard PVC, white, double glazing
    lambda: window((246, 246, 246), (252, 252, 252), 2, 1.4, 1.4, glass_layers=2),
    # 2 energy-saving PVC, three panes of glass
    lambda: window((242, 242, 242), (250, 250, 250), 2, 1.4, 1.4, glass_layers=3),
    # 3 cold aluminium
    lambda: window((176, 182, 190), (196, 201, 208), 2, 1.4, 1.4, glass_layers=1),
    # 4 warm (thermal-break) aluminium
    lambda: window((92, 98, 108), (112, 118, 128), 2, 1.4, 1.4, glass_layers=2),
    # 5 PVC balcony door
    lambda: window((246, 246, 246), (252, 252, 252), 1, 0.8, 2.2, glass_layers=2, door=True),
    # 6 ready-made 1.2 × 1.4 m PVC window
    lambda: window((246, 246, 246), (252, 252, 252), 2, 1.2, 1.4, glass_layers=2),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for n, draw in enumerate(ITEMS, start=1):
        draw().save(OUT / f"{n}.webp", "WEBP", quality=80)
        print(OUT / f"{n}.webp")


if __name__ == "__main__":
    main()
