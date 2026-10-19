"""
The ceiling cornice (galtel) in the estimate.

The studio draws one when designState.cornice is an object (the user picked a
profile, or a ready-made style did); a plain absence or null means none. It
runs round the whole room, so it is the perimeter in strips, priced from the
shop's own "galtel" product when there is one and otherwise from a standard
strip price, flagged approximate. It goes in the ceiling section.
"""
from __future__ import annotations

import math
import uuid
from types import SimpleNamespace

import pytest

from app.services.smeta import GALTEL_PIECE_M, GALTEL_PIECE_PRICE_UZS, compute_estimate
from app.services.smeta_groups import group_key_for

STORE = SimpleNamespace(name="Qurilish Bozori")


def room(cornice=..., perimeter=18.0):
    design = {} if cornice is ... else {"cornice": cornice}
    return SimpleNamespace(
        net_wall_area=48.6, floor_area=20.0, perimeter=perimeter, openings_count=0, ceiling_h=2.7,
        geometry={"walls": []}, surfaces={}, state={"designState": design}, furniture_layout=[],
    )


def galtel(r, catalog=None, **kw):
    return [ln for ln in compute_estimate(r, {}, {}, catalog=catalog or {}, **kw).lines if "Galtel" in ln.label]


def shop(price, unit, pack_qty=None, name="Poliuretan galtel"):
    return SimpleNamespace(id=uuid.uuid4(), name_uz=name, unit=unit, price_uzs=price, pack_qty=pack_qty,
                           pack_unit="m" if pack_qty else None, smeta_key="galtel", is_active=True,
                           store=STORE, category="gips")


def test_a_cornice_runs_round_the_room_in_standard_strips():
    [line] = galtel(room({"id": "t140"}))
    assert line.qty == math.ceil(18.0 / GALTEL_PIECE_M) and line.unit == "dona"
    assert line.unit_price_uzs == GALTEL_PIECE_PRICE_UZS
    assert line.subtotal_uzs == line.qty * GALTEL_PIECE_PRICE_UZS
    assert line.is_approximate and line.warning
    assert "T 140" in line.label
    assert group_key_for(line.category) == "shift"


@pytest.mark.parametrize("cornice", [..., None])
def test_no_cornice_no_line(cornice):
    assert galtel(room(cornice)) == []


def test_a_shop_cornice_sold_in_strips_is_priced_per_strip_and_exact():
    [line] = galtel(room({"id": "t56"}), {"galtel": shop(48_000, "dona", 2.0, "Poliuretan galtel 2 m")})
    assert line.qty == 9 and line.unit_price_uzs == 48_000
    assert not line.is_approximate and line.store_name == STORE.name
    assert "Poliuretan galtel 2 m" in line.label


def test_a_shop_cornice_sold_by_the_metre_is_priced_per_metre():
    [line] = galtel(room({"id": "t56"}, perimeter=17.2), {"galtel": shop(22_000, "m")})
    assert (line.qty, line.unit, line.unit_price_uzs) == (18, "m", 22_000)


def test_a_room_with_no_perimeter_gets_no_cornice_line():
    assert galtel(room({"id": "t140"}, perimeter=0)) == []

