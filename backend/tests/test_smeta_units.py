"""The estimate must price a material in the unit the shop prices it in."""
from __future__ import annotations

import math
from types import SimpleNamespace

from app.services.smeta import PACK_M2, LAMINAT_WASTE_DEFAULT, _laminate_lines


def _room(floor_area=12.0):
    return SimpleNamespace(floor_area=floor_area, perimeter=14.0, openings_count=0, geometry={"walls": []})


def _laminate(unit, price):
    return SimpleNamespace(id="l1", name_uz="Laminat", unit=unit, price_uzs=price, store=None)


def _norm():
    return SimpleNamespace(coverage_per_unit=PACK_M2, waste_factor=LAMINAT_WASTE_DEFAULT)


def test_laminate_priced_per_m2_is_charged_for_the_boxes_square_metres_not_the_box_count():
    line = _laminate_lines(_room(12.0), _laminate("m2", 118_000), _norm(), {})[0]
    boxes = math.ceil(12.0 * LAMINAT_WASTE_DEFAULT / PACK_M2)  # 7 boxes
    m2 = round(boxes * PACK_M2, 2)  # 14.91 m² actually bought
    assert (line.unit, line.qty) == ("m²", m2)
    assert line.subtotal_uzs == round(m2 * 118_000)
    # The old bug charged boxes x per-m² price: 7 x 118 000 = 826 000, about half the real cost.
    assert line.subtotal_uzs > 1_700_000


def test_laminate_priced_per_box_is_still_charged_per_box():
    line = _laminate_lines(_room(12.0), _laminate("dona", 250_000), _norm(), {})[0]
    assert (line.unit, line.qty) == ("quti", 7)
    assert line.subtotal_uzs == 7 * 250_000


def test_the_formula_shows_the_boxes_and_the_square_metres():
    line = _laminate_lines(_room(12.0), _laminate("m2", 118_000), _norm(), {})[0]
    assert "7 quti" in line.formula and "14.91 m²" in line.formula
