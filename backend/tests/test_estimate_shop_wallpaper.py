"""A shop wallpaper picked from the studio's library is priced by the roll.

The studio puts a library wallpaper on a wall as a "texture" covering that names
the image URL. A user's own photo has no price, so that stays an AI-priced m²
placeholder; but a shop's wallpaper (a Wallpaper row with its roll width, roll
length and price per roll, e.g. a demo store's) is counted in rolls from its own
roll size, strip by strip, like a catalog oboy.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.services.estimate_catalog import load_estimate_catalog
from app.services.smeta import WallpaperRoll, compute_estimate, wallpaper_catalog_key


def _room(url: str) -> SimpleNamespace:
    walls = [{"id": w, "length": length, "elements": []} for w, length in
             (("A", 4.0), ("B", 3.0), ("C", 4.0), ("D", 3.0))]
    return SimpleNamespace(
        ceiling_h=2.7, floor_area=12.0, net_wall_area=37.8, perimeter=14.0, openings_count=0,
        geometry={"walls": walls}, surfaces={},
        state={"wallCoverings": {"A": {"kind": "texture", "url": url, "color": "#fff"}}},
    )


ROLL = WallpaperRoll(name="Vinil oboy 1234", price_uzs=250_000, roll_width_cm=53.0,
                     roll_length_m=10.05, store_name="Demo Oboy")


def test_a_shop_wallpaper_on_local_storage_is_counted_in_rolls():
    room = _room("https://andoza.ai/media/wallpapers/demo/abc.webp")
    catalog = {wallpaper_catalog_key("wallpapers/demo/abc.webp"): ROLL}

    est = compute_estimate(room, {}, {}, catalog=catalog)

    line = next(ln for ln in est.lines if ln.category == "oboy")
    # 4.0 m × 1.10 waste ÷ 0.53 m = 9 strips; a 10.05 m roll gives 3 strips of 2.7 m → 3 rolls
    assert (line.qty, line.unit, line.unit_price_uzs) == (3, "rulon", 250_000)
    assert line.subtotal_uzs == 750_000
    assert line.store_name == "Demo Oboy" and "Vinil oboy 1234" in line.label
    assert not line.needs_ai_price and not line.is_approximate
    assert not [ln for ln in est.lines if ln.category == "texture"]
    assert {"suvoq", "grunt", "shpatlyovka"} <= {ln.category for ln in est.lines}


def test_a_shop_wallpaper_on_s3_matches_by_its_url():
    url = "https://bucket.s3.eu-central-1.amazonaws.com/wallpapers/demo/abc.webp"
    est = compute_estimate(_room(url), {}, {}, catalog={wallpaper_catalog_key(url): ROLL})
    assert [ln.qty for ln in est.lines if ln.category == "oboy"] == [3]


def test_a_users_own_photo_stays_an_ai_priced_placeholder():
    est = compute_estimate(_room("https://andoza.ai/media/wallpapers/mine.jpg"), {}, {},
                           catalog={wallpaper_catalog_key("wallpapers/demo/abc.webp"): ROLL})
    texture = next(ln for ln in est.lines if ln.category == "texture")
    assert texture.needs_ai_price and texture.unit_price_uzs == 0
    assert not [ln for ln in est.lines if ln.category == "oboy"]


async def test_the_estimate_catalog_carries_priced_shop_wallpapers():
    wp = SimpleNamespace(storage_key="wallpapers/demo/abc.webp", name="Vinil oboy 1234", price_uzs=250_000,
                         width_cm=53, total_length_m=10.05, store=SimpleNamespace(name="Demo Oboy"))
    materials = MagicMock(scalars=lambda: MagicMock(all=lambda: []))
    wallpapers = MagicMock(scalars=lambda: MagicMock(all=lambda: [wp]))
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[materials, wallpapers])

    catalog = await load_estimate_catalog(db)

    roll = catalog[wallpaper_catalog_key("wallpapers/demo/abc.webp")]
    assert (roll.roll_width_cm, roll.roll_length_m, roll.price_uzs, roll.store_name) == (53.0, 10.05, 250_000, "Demo Oboy")
