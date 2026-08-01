"""Tests for the delta calculation engine (app.services.delta).

Uses SimpleNamespace mocks — no SQLAlchemy or database required, mirroring
the style of tests/test_smeta_fixtures.py.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.delta import compute_delta
from app.services.smeta import STAGE_ORDER, stage_index


def _wall(wall_id: str, length_m: float, elements: list | None = None) -> dict:
    return {"id": wall_id, "length": length_m, "elements": elements or []}


def _room(**overrides) -> SimpleNamespace:
    defaults = dict(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        openings_count=0,
        geometry={"walls": [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]},
        surfaces={"ALL": "p1", "floor": "l1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _room_state(current_state: str, floor_state: str | None = None, ceiling_state: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(current_state=current_state, floor_state=floor_state, ceiling_state=ceiling_state)


def _material(mid: str, category: str, price_uzs: int = 25_000) -> SimpleNamespace:
    return SimpleNamespace(id=mid, category=category, name_uz="Test", price_uzs=price_uzs, store=None)


def _norm(material_key: str, coverage_per_unit: float = 9.0, coats: int = 2) -> SimpleNamespace:
    return SimpleNamespace(material_key=material_key, coverage_per_unit=coverage_per_unit, coats=coats, waste_factor=1.07, params=None)


@pytest.fixture
def materials_map():
    return {"p1": _material("p1", "boyoq"), "l1": _material("l1", "laminat", price_uzs=120_000)}


@pytest.fixture
def norms_map():
    return {
        "boyoq": _norm("boyoq"),
        "laminat": _norm("laminat", coverage_per_unit=2.13),
        "suvoq": _norm("suvoq"),
        "grunt": _norm("grunt"),
        "shpatlyovka": _norm("shpatlyovka"),
        "plintus": _norm("plintus"),
        "elektr_kabel": _norm("elektr_kabel"),
    }


def test_xom_room_has_no_savings_full_equals_delta(materials_map, norms_map):
    """A raw (xom) room needs everything — delta should equal the full price."""
    room = _room()
    state = _room_state("xom")

    result = compute_delta(room, state, materials_map, norms_map)

    assert result.delta_savings_uzs == 0
    assert result.full_estimate.total_uzs == result.delta_estimate.total_uzs
    cats = [ln.category for ln in result.delta_estimate.lines]
    assert "suvoq" in cats
    assert "grunt" in cats
    assert "shpatlyovka" in cats
    assert "boyoq" in cats


def test_suvoq_room_skips_plaster_only(materials_map, norms_map):
    """A plastered room should skip suvoq but still need grunt/putty/paint."""
    room = _room()
    state = _room_state("suvoq")

    result = compute_delta(room, state, materials_map, norms_map)

    delta_cats = [ln.category for ln in result.delta_estimate.lines]
    assert "suvoq" not in delta_cats
    assert "grunt" in delta_cats
    assert "shpatlyovka" in delta_cats
    assert "boyoq" in delta_cats

    # Savings should equal exactly the cost of the skipped suvoq line
    full_suvoq_line = next(ln for ln in result.full_estimate.lines if ln.category == "suvoq")
    assert result.delta_savings_uzs == full_suvoq_line.subtotal_uzs


def test_shpaklovka_room_skips_prep_keeps_paint(materials_map, norms_map):
    """A room already primed/puttied only needs the paint finish coat."""
    room = _room()
    state = _room_state("shpaklovka")

    result = compute_delta(room, state, materials_map, norms_map)

    delta_cats = [ln.category for ln in result.delta_estimate.lines]
    assert "suvoq" not in delta_cats
    assert "grunt" not in delta_cats
    assert "shpatlyovka" not in delta_cats
    assert "boyoq" in delta_cats

    assert 0 < result.delta_savings_uzs < result.full_estimate.total_uzs


def test_tayyor_room_wall_prep_fully_skipped_but_paint_finish_remains(materials_map, norms_map):
    """Fully finished walls skip all prep; only the (re)paint finish remains."""
    room = _room()
    state = _room_state("tayyor")

    result = compute_delta(room, state, materials_map, norms_map)

    delta_cats = [ln.category for ln in result.delta_estimate.lines]
    assert "suvoq" not in delta_cats
    assert "grunt" not in delta_cats
    assert "shpatlyovka" not in delta_cats
    assert "boyoq" in delta_cats  # choosing a finish is always priced


def test_floor_state_tayyor_skips_floor_material(materials_map, norms_map):
    """When the floor is already finished, no floor covering line is added."""
    room = _room()
    state = _room_state("shpaklovka", floor_state="tayyor")

    result = compute_delta(room, state, materials_map, norms_map)

    delta_cats = [ln.category for ln in result.delta_estimate.lines]
    assert "laminat" not in delta_cats
    assert "plintus" not in delta_cats

    # Full baseline still includes the floor (it assumes xom, not "already done")
    full_cats = [ln.category for ln in result.full_estimate.lines]
    assert "laminat" in full_cats


def test_delta_savings_never_negative(materials_map, norms_map):
    room = _room()
    for state_val in STAGE_ORDER:
        state = _room_state(state_val)
        result = compute_delta(room, state, materials_map, norms_map)
        assert result.delta_savings_uzs >= 0


def test_stage_progression_reduces_or_maintains_delta_total(materials_map, norms_map):
    """Later stages should never cost more than earlier ones (monotonic delta)."""
    room = _room()
    totals = []
    for state_val in STAGE_ORDER:
        state = _room_state(state_val)
        result = compute_delta(room, state, materials_map, norms_map)
        totals.append(result.delta_estimate.total_uzs)

    for earlier, later in zip(totals, totals[1:]):
        assert later <= earlier


def test_completed_and_remaining_stages_partition_correctly(materials_map, norms_map):
    room = _room()
    state = _room_state("shpaklovka")

    result = compute_delta(room, state, materials_map, norms_map)

    assert [s.stage for s in result.completed_stages] == ["xom", "suvoq"]
    assert [s.stage for s in result.remaining_stages] == ["shpaklovka", "tayyor"]
    assert all(s.already_done for s in result.completed_stages)
    assert all(not s.already_done for s in result.remaining_stages)


def test_stage_index_unknown_state_treated_as_raw():
    assert stage_index(None) == 0
    assert stage_index("not_a_real_state") == 0
    assert stage_index("tayyor") == len(STAGE_ORDER) - 1
