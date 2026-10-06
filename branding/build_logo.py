"""The andoza.ai logo -> ./logo

    uv run --with fonttools --with brotli python branding/build_logo.py path/to/manrope-800.woff

The mark is a stepladder, which is also the capital letter A: two legs, a platform on top, three
rungs, the middle one in the brand's orange. A renovation tool and the first letter of the name in
one shape. It stands on a floor line (the room) and its legs are shaded top to bottom (volume).

The wordmark is Manrope ExtraBold (SIL Open Font License; 'latin-800' from
https://cdn.jsdelivr.net/fontsource/fonts/manrope@latest/), lowercase, turned into paths so
the files need no font to display.
"""
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

OUT = Path(__file__).parent / "logo"
OUT.mkdir(exist_ok=True)

BLUE_D, BLUE, BLUE_L, SKY = "#1E3A8A", "#2F55D4", "#4F7DF3", "#9DB8FF"
ORANGE, AMBER, INK = "#F97316", "#FDBA74", "#0F172A"

TOP, FULL_BOTTOM = 96, 438       # where the legs start, and where they ended at full height
HEIGHT = 0.89                    # the ladder's height as a share of the original (chosen from 100%, 89% and 78%)
BOTTOM = round(TOP + (FULL_BOTTOM - TOP) * HEIGHT)   # the feet

FLOOR_Y = BOTTOM + 36                      # the floor line under the feet
BOX = (78, 58, 434, BOTTOM + 50)           # the mark's extent in a 512 box, floor and its shadow included
BOX_BARE = (88, 58, 424, BOTTOM + 24)      # without them (the favicon drops both)
W, H = BOX[2] - BOX[0], BOX[3] - BOX[1]
CX, CY = (BOX[0] + BOX[2]) / 2, (BOX[1] + BOX[3]) / 2
CX_BARE, CY_BARE = (BOX_BARE[0] + BOX_BARE[2]) / 2, (BOX_BARE[1] + BOX_BARE[3]) / 2

# The legs shade from their own colour toward this, top to bottom: volume without another shape.
LEG_SHADE_TO = {BLUE_D: BLUE, BLUE_L: "#8FB0FF", "#FFFFFF": "#C7D6FF"}

SCHEMES = {  # suffix -> (legs, rungs, middle rung), wordmark ink, 'ai' colour, period colour
    "": ((BLUE_D, BLUE_L, ORANGE), INK, BLUE, ORANGE),
    "-dark": ((BLUE_L, "#C7D6FF", AMBER), "#FFFFFF", SKY, AMBER),
    "-mono-black": ((INK, INK, INK), INK, INK, INK),
    "-mono-white": (("#FFFFFF",) * 3, "#FFFFFF", "#FFFFFF", "#FFFFFF"),
}
TILE = ("#FFFFFF", SKY, AMBER)  # the mark on the brand-blue tile

GRAD = (f'<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{BLUE_L}"/><stop offset="1" stop-color="{BLUE_D}"/></linearGradient></defs>')


def mark(c, uid, bold=False, mono=False):
    """The stepladder, standing on a floor line. c: legs and platform, rungs, middle rung.

    Two small additions, each with a reason: a floor line and a soft shadow (the ladder stands in a
    room) and legs shaded top to bottom (volume). Neither is in the bold version (the favicon, 16 px), where
    they would only blur; the one-colour versions keep the floor line, solid, and nothing else.
    """
    legs_c, rung_c, mid_c = c
    top, bottom, x_l, x_r = TOP, BOTTOM, 216, 296   # where the legs start and end (top, feet)
    slope = 104 / (bottom - top)                    # the feet stay as wide apart as before, so a shorter ladder splays more
    leg_w, rung_w = (50, 40) if bold else (42, 32)

    def rung_y(fraction):
        return round(top + (bottom - top) * fraction)

    def xl(y):
        return x_l - slope * (y - top)

    def xr(y):
        return x_r + slope * (y - top)

    defs, fill = "", legs_c
    if not bold and not mono:
        defs = (f'<defs><linearGradient id="{uid}g" gradientUnits="userSpaceOnUse" x1="0" y1="{top}" x2="0" y2="{bottom}">'
                f'<stop offset="0" stop-color="{legs_c}"/><stop offset="1" stop-color="{LEG_SHADE_TO[legs_c]}"/></linearGradient></defs>')
        fill = f"url(#{uid}g)"

    floor = ""
    if not bold:
        if not mono:
            floor += f'<ellipse cx="256" cy="{FLOOR_Y}" rx="170" ry="13" fill="{legs_c}" opacity=".16"/>'
        line_opacity = "" if mono else ' opacity=".55"'
        floor += f'<path d="M84,{FLOOR_Y} H428" stroke="{legs_c}" stroke-width="12" stroke-linecap="round"{line_opacity}/>'

    legs = (f'<path d="M{x_l},{top} L{xl(bottom):.1f},{bottom}" stroke="{fill}" stroke-width="{leg_w}" stroke-linecap="round"/>'
            f'<path d="M{x_r},{top} L{xr(bottom):.1f},{bottom}" stroke="{fill}" stroke-width="{leg_w}" stroke-linecap="round"/>')
    rungs = "".join(
        f'<path d="M{xl(y):.1f},{y} L{xr(y):.1f},{y}" stroke="{col}" stroke-width="{rung_w}" stroke-linecap="round"/>'
        for y, col in ((rung_y(0.30), rung_c), (rung_y(0.57), mid_c), (rung_y(0.84), rung_c)))
    platform = f'<rect x="186" y="58" width="140" height="38" rx="19" fill="{fill}"/>'
    return defs + floor + legs + rungs + platform


class Wordmark:
    def __init__(self, path):
        self.font = TTFont(path)
        self.glyphs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.upm = self.font["head"].unitsPerEm
        self.xh = self.font["OS/2"].sxHeight
        self.cap = self.font["OS/2"].sCapHeight

    def text(self, parts, size, x, baseline, tracking=-0.045):
        s = size / self.upm
        out = []
        for txt, fill in parts:
            pen = SVGPathPen(self.glyphs)
            for ch in txt:
                g = self.glyphs[self.cmap[ord(ch)]]
                g.draw(TransformPen(pen, (s, 0, 0, -s, x, baseline)))
                x += g.width * s + tracking * size
            out.append(f'<path d="{pen.getCommands()}" fill="{fill}"/>')
        return "".join(out), x


def svg(view, body):
    return f'<svg viewBox="{view}" xmlns="http://www.w3.org/2000/svg">\n  {body}\n</svg>\n'


def write(name, text):
    (OUT / name).write_text(text)


def main(font_path):
    wm = Wordmark(font_path)

    for suffix, (c, ink, ai, dot) in SCHEMES.items():
        mono = "mono" in suffix
        pad = 24
        write(f"mark{suffix}.svg", svg(f"{BOX[0] - pad} {BOX[1] - pad} {W + 2 * pad} {H + 2 * pad}", mark(c, f"m{suffix}", mono=mono)))

        # horizontal: the mark 300 tall, the wordmark centred on it
        size, s = 150, 300 / H
        placed = f'<g transform="translate({24 - BOX[0] * s:.2f} {30 - BOX[1] * s:.2f}) scale({s:.4f})">{mark(c, f"h{suffix}", mono=mono)}</g>'
        t, end = wm.text([("andoza", ink), (".", dot), ("ai", ai)], size, 24 + W * s + 40, 180 + wm.xh * size / wm.upm / 2)
        write(f"logo-horizontal{suffix}.svg", svg(f"0 0 {end + 24:.0f} 360", placed + t))

        # vertical: the tile above, the wordmark centred under it
        size = 120
        _, tw = wm.text([("andoza.ai", ink)], size, 0, 0)
        width = max(520, tw + 80)
        st = 330 / H
        tile = (f'{GRAD}<rect width="512" height="512" rx="112" fill="url(#bg)"/>'
                f'<g transform="translate(256 256) scale({st:.3f}) translate(-{CX} -{CY})">{mark(TILE, f"vt{suffix}")}</g>')
        baseline = 30 + 200 + 44 + wm.cap * size / wm.upm
        t, _ = wm.text([("andoza", ink), (".", dot), ("ai", ai)], size, (width - tw) / 2, baseline)
        write(f"logo-vertical{suffix}.svg",
              svg(f"0 0 {width:.0f} {baseline + 36:.0f}", f'<g transform="translate({(width - 200) / 2:.1f} 30) scale({200 / 512:.4f})">{tile}</g>' + t))

    def tile(scale, uid, rounded=True, flat=False, bold=False):
        fill = BLUE if flat else "url(#bg)"
        rx = ' rx="112"' if rounded else ""
        cx, cy = (CX_BARE, CY_BARE) if bold else (CX, CY)
        return (f'{"" if flat else GRAD}<rect width="512" height="512"{rx} fill="{fill}"/>'
                f'<g transform="translate(256 256) scale({scale}) translate(-{cx} -{cy})">{mark(TILE, uid, bold)}</g>')

    write("icon.svg", svg("0 0 512 512", tile(0.80, "i1")))
    write("icon-flat.svg", svg("0 0 512 512", tile(0.80, "i2", flat=True)))
    write("icon-maskable.svg", svg("0 0 512 512", tile(0.60, "i3", rounded=False)))      # art inside the central 80%
    write("apple-touch-icon.svg", svg("0 0 512 512", tile(0.76, "i4", rounded=False)))   # the OS rounds it
    write("favicon.svg", svg("0 0 512 512", tile(0.92, "i5", flat=True, bold=True)))      # heavier strokes, for 16 px


if __name__ == "__main__":
    main(sys.argv[1])
