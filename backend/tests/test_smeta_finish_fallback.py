"""
A floor, a wallpaper or a paint the studio put in the room without a shop product.

The AI designer and the ready-made styles set a floor TYPE ("laminate"), a
wallpaper PATTERN ("gul") and a paint COLOUR, never a product. The estimate
used to leave the floor (and its skirting) out entirely, price the wallpaper at
0 and the paint at a fixed constant. Now each is priced from the cheapest active
shop product of its kind and flagged approximate, so the user sees a real
number and knows to pick their own product.
"""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import estimate_catalog as ec
from app.services.smeta import compute_estimate

STORE = SimpleNamespace(name="Qurilish Bozori")


def product(category, price, unit, name=None, active=True, smeta_key=None):
    return SimpleNamespace(
        id=uuid.uuid4(), name_uz=name or f"{category} {price}", category=category, unit=unit,
        price_uzs=price, pack_qty=None, pack_unit=None, smeta_key=smeta_key, is_active=active,
        store=STORE, roll_width_cm=None, roll_length_m=None,
    )


LAMINAT = product("laminat", 95_000, "m2", "Kronospan laminat 32 sinf")
PARKET = product("parket", 210_000, "m2", "Eman parket")
PLITKA = product("plitka", 120_000, "m2", "Keramogranit 60x60")
OBOY = product("oboy", 85_000, "rulon", "Vinil oboy 1.06 m")
BOYOQ = product("boyoq", 42_000, "litr", "Dulux suv emulsiya")
CATALOG = {
    "finish:laminat": LAMINAT, "finish:parket": PARKET, "finish:plitka": PLITKA,
    "finish:oboy": OBOY, "finish:boyoq": BOYOQ,
}


def room(design=None, surfaces=None):
    walls = [{"id": w, "length": length, "elements": []} for w, length in zip("ABCD", (5, 4, 5, 4))]
    return SimpleNamespace(
        net_wall_area=48.6, floor_area=20.0, perimeter=18.0, openings_count=0, ceiling_h=2.7,
        geometry={"walls": walls}, surfaces=surfaces or {}, state={"designState": design or {}},
        furniture_layout=[],
    )


def lines_of(r, category, **kw):
    return [ln for ln in compute_estimate(r, {}, {}, catalog=CATALOG, **kw).lines if ln.category == category]


# ── the floor ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(("floor_type", "category", "chosen"), [
    ("laminate", "laminat", LAMINAT),
    ("parquet", "laminat", PARKET),   # parquet is laid and priced like laminate
    ("tile", "plitka", PLITKA),
])
def test_a_floor_type_without_a_product_is_priced_from_the_cheapest_shop_product(floor_type, category, chosen):
    r = room({"floorType": floor_type, "floorConfigured": True})
    [floor] = lines_of(r, category)
    assert chosen.name_uz in floor.label
    assert floor.unit_price_uzs == chosen.price_uzs and floor.subtotal_uzs > 0
    assert floor.is_approximate
    assert "tanlanmagan" in floor.warning
    assert floor.store_name == STORE.name


def test_that_floor_gets_its_skirting_too():
    assert len(lines_of(room({"floorType": "laminate", "floorConfigured": True}), "plintus")) == 1


@pytest.mark.parametrize("design", [
    {"floorType": "laminate"},                              # never chosen: the default every room has
    {"floorType": "laminate", "floorConfigured": False},
    {"floorType": "concrete", "floorConfigured": True},     # nothing to buy
])
def test_no_floor_line_for_a_floor_nobody_chose_or_bare_concrete(design):
    est = compute_estimate(room(design), {}, {}, catalog=CATALOG)
    assert not [ln for ln in est.lines if ln.category in ("laminat", "plitka", "plintus")]


def test_a_floor_already_finished_is_not_bought_again():
    r = room({"floorType": "tile", "floorConfigured": True})
    assert lines_of(r, "plitka", floor_state="tayyor") == []


def test_a_floor_product_the_user_picked_still_wins_and_is_exact():
    mine = product("plitka", 150_000, "m2", "Mening plitkam")
    r = room({"floorType": "tile", "floorConfigured": True}, surfaces={"floor": str(mine.id)})
    [floor] = [ln for ln in compute_estimate(r, {str(mine.id): mine}, {}, catalog=CATALOG).lines if ln.category == "plitka"]
    assert "Mening plitkam" in floor.label and not floor.is_approximate


def test_with_no_shop_product_of_that_kind_the_floor_still_gets_its_skirting():
    r = room({"floorType": "parquet", "floorConfigured": True})
    est = compute_estimate(r, {}, {}, catalog={})
    assert [ln.category for ln in est.lines if ln.category in ("laminat", "plitka", "plintus")] == ["plintus"]


# ── wallpaper and paint ──────────────────────────────────────────────────────

def test_a_wallpaper_pattern_without_a_product_is_priced_from_the_cheapest_roll():
    r = room({"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "gul", "baseColor": "#f3e6cf", "accentColor": "#9e2b25"}}})
    oboy = lines_of(r, "oboy")
    assert len(oboy) == 4
    for ln in oboy:
        assert ln.unit_price_uzs == OBOY.price_uzs and ln.subtotal_uzs > 0
        assert OBOY.name_uz in ln.label and ln.is_approximate and "tanlanmagan" in ln.warning


def test_with_no_roll_in_any_shop_the_wallpaper_still_says_so():
    r = room({"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "gul", "baseColor": "#fff", "accentColor": "#000"}}})
    oboy = [ln for ln in compute_estimate(r, {}, {}, catalog={}).lines if ln.category == "oboy"]
    assert oboy and all(ln.subtotal_uzs == 0 and ln.is_approximate for ln in oboy)


def test_a_paint_colour_without_a_product_is_priced_from_the_cheapest_paint():
    r = room({"wallCoverings": {"ALL": {"kind": "paint", "color": "#f4f5f6"}}})
    [paint] = lines_of(r, "boyoq")
    assert BOYOQ.name_uz in paint.label and paint.unit_price_uzs == BOYOQ.price_uzs
    assert paint.is_approximate and "tanlanmagan" in paint.warning


# ── the loader ───────────────────────────────────────────────────────────────

def test_the_cheapest_active_product_of_each_finish_is_kept_by_its_selling_unit():
    picked = ec.pick_cheapest_finishes([
        product("laminat", 95_000, "m2"),
        product("laminat", 31_000, "dona"),          # a laminate-category strip, not a floor by the m²
        product("laminat", 60_000, "m2", active=False),
        product("laminat", 80_000, "m2", name="cheapest"),
        product("plitka", 120_000, "m2"),
        product("oboy", 85_000, "rulon", name="roll"),
        product("oboy", 40_000, "m2"),               # not sold by the roll
        product("boyoq", 42_000, "litr", name="paint"),
        product("gips", 1_000, "qop"),
    ])
    assert set(picked) == {"finish:laminat", "finish:plitka", "finish:oboy", "finish:boyoq"}
    assert picked["finish:laminat"].name_uz == "cheapest"
    assert picked["finish:oboy"].name_uz == "roll"


async def test_the_loader_hands_the_engine_both_the_keyed_products_and_the_finishes():
    rows = [product("gips", 66_000, "qop", smeta_key="suvoq"), product("plitka", 120_000, "m2")]
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    catalog = await ec.load_estimate_catalog(db)
    assert catalog["suvoq"] is rows[0] and catalog["finish:plitka"] is rows[1]


def test_a_parquet_floor_is_called_parquet_not_laminate():
    [floor] = lines_of(room({"floorType": "parquet", "floorConfigured": True}), "laminat")
    assert floor.label.startswith("Parket: ")
    [floor] = lines_of(room({"floorType": "laminate", "floorConfigured": True}), "laminat")
    assert floor.label.startswith("Laminat: ")
