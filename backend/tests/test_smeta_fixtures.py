"""15 room fixture tests for compute_estimate.

Uses SimpleNamespace mock objects — no SQLAlchemy or database required.
Geometry wall lengths are in metres (< 100) so the _to_metres heuristic
passes them through unchanged; this keeps fixture maths readable.

Constants used in assertions (mirrors smeta.py):
    ROLL_WIDTH_M  = 1.06
    ROLL_LENGTH_M = 10.05
    ROLL_AREA_M2  = 1.06 * 10.05 = 10.653
    TILE_WASTE    = 1.10
    LAMINAT_WASTE_DEFAULT = 1.07
    PACK_M2       = 2.13
    PLINTH_PIECE_M = 2.5
    PRIMER_RATE_KG_M2 = 0.15   (bag=5 kg)
    PUTTY_RATE_KG_M2  = 1.2    (bag=25 kg)
"""
from __future__ import annotations

import math
from types import SimpleNamespace

import pytest

from app.services.smeta import (
    ROLL_AREA_M2,
    TILE_WASTE,
    LAMINAT_WASTE_DEFAULT,
    PACK_M2,
    PLINTH_PIECE_M,
    WASTE_FACTORS,
    compute_estimate,
)

# ---------------------------------------------------------------------------
# Mock factory helpers
# ---------------------------------------------------------------------------

def _wall(wall_id: str, length_m: float, elements: list | None = None) -> dict:
    """Build a wall dict (geometry in metres, id keyed)."""
    return {"id": wall_id, "length": length_m, "elements": elements or []}


def _elem(elem_type: str, width: float, height: float) -> dict:
    return {"type": elem_type, "width": width, "height": height}


def _room(
    *,
    ceiling_h: float = 2.7,
    floor_area: float = 0.0,
    net_wall_area: float = 0.0,
    perimeter: float = 0.0,
    openings_count: int = 0,
    geometry: dict | None = None,
    surfaces: dict | None = None,
    state: dict | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        ceiling_h=ceiling_h,
        floor_area=floor_area,
        net_wall_area=net_wall_area,
        perimeter=perimeter,
        openings_count=openings_count,
        geometry=geometry or {"walls": []},
        surfaces=surfaces or {},
        state=state or {},
    )


def _material(mid: str, category: str, name_uz: str = "Test", price_uzs: int = 100_000) -> SimpleNamespace:
    return SimpleNamespace(
        id=mid,
        category=category,
        name_uz=name_uz,
        price_uzs=price_uzs,
        store=None,
    )


def _norm(
    material_key: str,
    coverage_per_unit: float = 9.0,
    coats: int = 2,
    waste_factor: float = LAMINAT_WASTE_DEFAULT,
    params: dict | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        material_key=material_key,
        coverage_per_unit=coverage_per_unit,
        coats=coats,
        waste_factor=waste_factor,
        params=params,
    )


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def boyoq_norm() -> SimpleNamespace:
    return _norm("boyoq", coverage_per_unit=9.0, coats=2)


@pytest.fixture
def laminat_norm() -> SimpleNamespace:
    return _norm("laminat", coverage_per_unit=PACK_M2, coats=2, waste_factor=LAMINAT_WASTE_DEFAULT)


@pytest.fixture
def oboy_norm() -> SimpleNamespace:
    """Norm for oboy — not actually used in per-wall computation, but must be present."""
    return _norm("oboy", coverage_per_unit=0.0, coats=0, waste_factor=1.0)


@pytest.fixture
def plitka_norm() -> SimpleNamespace:
    return _norm("plitka", coverage_per_unit=1.0, coats=1)


@pytest.fixture
def paint_mat() -> SimpleNamespace:
    return _material("p1", "boyoq", "Oq bo'yoq", 25_000)


@pytest.fixture
def laminat_mat() -> SimpleNamespace:
    return _material("l1", "laminat", "Laminat 8mm", 120_000)


@pytest.fixture
def tile_mat() -> SimpleNamespace:
    return _material("t1", "plitka", "Kafel 60×60", 85_000)


@pytest.fixture
def oboy_mat() -> SimpleNamespace:
    return _material("o1", "oboy", "Oboy damask", 45_000)


# ---------------------------------------------------------------------------
# Helper to build norms_map
# ---------------------------------------------------------------------------

def _norms(*norms: SimpleNamespace) -> dict:
    return {n.material_key: n for n in norms}


def _mats(*mats: SimpleNamespace) -> dict:
    return {m.id: m for m in mats}


# ---------------------------------------------------------------------------
# Test 1: Simple 4×3 room, no openings, paint walls, laminate floor
# ---------------------------------------------------------------------------

def test_1_simple_paint_laminate(boyoq_norm, laminat_norm, paint_mat, laminat_mat):
    """4×3 room, no openings, all-paint walls, laminate floor."""
    # net_wall_area = (2*(4+3)) * 2.7 = 14 * 2.7 = 37.8 m²
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"ALL": "p1", "floor": "l1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat, laminat_mat)
    norms = _norms(boyoq_norm, laminat_norm)

    est = compute_estimate(room, mats, norms)

    # No RoomState passed → defaults to "xom" (raw shell), so every prep
    # line is included: suvoq(1) + boyoq(3: paint/grunt/shpatlyovka) +
    # laminat+plintus(2) + elektr(1) = 7
    cats = [ln.category for ln in est.lines]
    assert cats.count("suvoq") == 1
    assert cats.count("boyoq") == 1
    assert cats.count("grunt") == 1
    assert cats.count("shpatlyovka") == 1
    assert cats.count("laminat") == 1
    assert cats.count("plintus") == 1
    assert cats.count("elektr") == 1
    assert len(est.lines) == 7

    # Spot-check paint qty: ceil(37.8 * 2 / 9.0) = ceil(8.4) = 9 liters
    paint_line = next(ln for ln in est.lines if ln.category == "boyoq")
    assert paint_line.qty == 9.0


# ---------------------------------------------------------------------------
# Test 2: 4×3 room with 1 door + 1 window, paint walls, laminate
# ---------------------------------------------------------------------------

def test_2_paint_laminate_with_openings(boyoq_norm, laminat_norm, paint_mat, laminat_mat):
    """4×3 room, 1 door in wall A (0.9×2.1) + 1 window in wall B (1.2×1.5)."""
    door = _elem("eshik", 0.9, 2.1)
    window = _elem("deraza", 1.2, 1.5)
    walls = [_wall("A", 4.0, [door]), _wall("B", 3.0, [window]), _wall("C", 4.0), _wall("D", 3.0)]
    # openings_area = 0.9*2.1 + 1.2*1.5 = 1.89 + 1.8 = 3.69
    # net_wall_area = 14*2.7 - 3.69 = 37.8 - 3.69 = 34.11
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=34.11,
        perimeter=14.0,
        openings_count=2,
        geometry={"walls": walls},
        surfaces={"ALL": "p1", "floor": "l1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat, laminat_mat)
    norms = _norms(boyoq_norm, laminat_norm)

    est = compute_estimate(room, mats, norms)

    # Defaults to "xom" → +1 line (suvoq) versus the pre-stage-gating count
    assert len(est.lines) == 7
    assert any(ln.category == "suvoq" for ln in est.lines)

    # Spot-check paint: ceil(34.11 * 2 / 9.0) = ceil(7.58) = 8 liters
    paint_line = next(ln for ln in est.lines if ln.category == "boyoq")
    assert paint_line.qty == 8.0

    # Spot-check plinth: door_m = 0.9, plinth_m = 14 - 0.9 = 13.1, pieces = ceil(13.1/2.5) = 6
    plinth_line = next(ln for ln in est.lines if ln.category == "plintus")
    assert plinth_line.qty == 6.0


# ---------------------------------------------------------------------------
# Test 3: 5×4 room, oboy all walls (damask), tile floor
# ---------------------------------------------------------------------------

def test_3_oboy_all_damask_tile(oboy_norm, tile_mat, oboy_mat):
    """5×4 room, all-oboy (damask) walls, tile floor — 4 oboy lines."""
    walls = [_wall("A", 5.0), _wall("B", 4.0), _wall("C", 5.0), _wall("D", 4.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=20.0,
        net_wall_area=48.6,
        perimeter=18.0,
        geometry={"walls": walls},
        surfaces={"ALL": "o1", "floor": "t1"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "damask"}}},
    )
    mats = _mats(oboy_mat, tile_mat)
    norms = _norms(oboy_norm)

    est = compute_estimate(room, mats, norms)

    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]
    assert len(oboy_lines) == 4, "One oboy line per wall A, B, C, D"

    # Wallpaper-only room ("boyoq" never in wall_categories) still needs wall
    # prep — defaults to "xom", so suvoq+grunt+shpatlyovka are all included:
    # suvoq+grunt+shpatlyovka(3) + oboy(4) + tile+plintus(2) + elektr(1) = 10
    # (Fix 8: tile floors now get a plinth line too, same as laminate)
    assert sum(1 for ln in est.lines if ln.category in ("suvoq", "grunt", "shpatlyovka")) == 3
    assert any(ln.category == "plintus" for ln in est.lines)
    assert len(est.lines) == 10

    # Wall A: 5.0 * 2.7 = 13.5, waste=13.5*1.15=15.525, rolls=ceil(15.525/10.653)=2
    wall_a = next(ln for ln in oboy_lines if "devor A" in ln.label)
    assert wall_a.qty == 2.0

    # Wall B: 4.0 * 2.7 = 10.8, waste=10.8*1.15=12.42, rolls=ceil(12.42/10.653)=2
    wall_b = next(ln for ln in oboy_lines if "devor B" in ln.label)
    assert wall_b.qty == 2.0


# ---------------------------------------------------------------------------
# Test 4: Per-wall mixed: A+C oboy(damask), B+D paint, laminate floor
# ---------------------------------------------------------------------------

def test_4_mixed_oboy_paint_laminate(boyoq_norm, laminat_norm, oboy_norm, paint_mat, laminat_mat, oboy_mat):
    """Walls A+C have oboy(damask), walls B+D have paint, laminate floor."""
    walls = [_wall("A", 5.0), _wall("B", 4.0), _wall("C", 5.0), _wall("D", 4.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=20.0,
        net_wall_area=48.6,
        perimeter=18.0,
        geometry={"walls": walls},
        surfaces={"A": "o1", "C": "o1", "B": "p1", "D": "p1", "floor": "l1"},
        state={
            "wallCoverings": {
                "A": {"kind": "oboy", "patternId": "damask"},
                "B": {"kind": "paint", "color": "#fff"},
                "C": {"kind": "oboy", "patternId": "damask"},
                "D": {"kind": "paint", "color": "#fff"},
            }
        },
    )
    mats = _mats(oboy_mat, paint_mat, laminat_mat)
    norms = _norms(boyoq_norm, laminat_norm, oboy_norm)

    est = compute_estimate(room, mats, norms)

    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]
    assert len(oboy_lines) == 2, "Only walls A and C produce oboy lines"

    wall_ids_with_oboy = [ln.label for ln in oboy_lines]
    assert any("devor A" in lbl for lbl in wall_ids_with_oboy)
    assert any("devor C" in lbl for lbl in wall_ids_with_oboy)

    # Paint lines (boyoq+grunt+shpatlyovka) should also be present
    assert any(ln.category == "boyoq" for ln in est.lines)
    # Room also needs plaster (suvoq) — defaults to "xom" since some walls
    # need prep regardless of which finish (paint vs oboy) they end up with.
    assert any(ln.category == "suvoq" for ln in est.lines)
    # Laminat + plintus + elektr
    assert any(ln.category == "laminat" for ln in est.lines)
    # Total: suvoq(1) + 2 oboy + 3 paint(boyoq/grunt/shpatlyovka) + 2 laminat/plintus + 1 elektr = 9
    assert len(est.lines) == 9

    # Fix 2: the paint litre count must only cover walls B+D (paint), NOT
    # room.net_wall_area (48.6, all 4 walls) — that would double-count A+C,
    # which are wallpapered and already get their own oboy roll lines.
    # B+D net area = 2 * (4.0 * 2.7) = 21.6 m²; ceil(21.6 * 2 / 9.0) = 5 litr
    paint_line = next(ln for ln in est.lines if ln.category == "boyoq")
    assert paint_line.qty == 5.0
    assert "21.6" in paint_line.formula


# ---------------------------------------------------------------------------
# Test 5: Zero openings room, all oboy (tekstura)
# ---------------------------------------------------------------------------

def test_5_oboy_tekstura_no_floor(oboy_norm, oboy_mat):
    """3×3 room, all-oboy (tekstura), no floor material."""
    walls = [_wall("A", 3.0), _wall("B", 3.0), _wall("C", 3.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.5,
        floor_area=9.0,
        net_wall_area=30.0,
        perimeter=12.0,
        geometry={"walls": walls},
        surfaces={"ALL": "o1"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "tekstura"}}},
    )
    mats = _mats(oboy_mat)
    norms = _norms(oboy_norm)

    est = compute_estimate(room, mats, norms)

    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]
    assert len(oboy_lines) == 4

    # Wall A: 3.0 * 2.5 = 7.5 m², tekstura waste=1.05, area=7.875
    # rolls = ceil(7.875 / 10.653) = ceil(0.7394) = 1
    wall_a = next(ln for ln in oboy_lines if "devor A" in ln.label)
    assert wall_a.qty == 1.0

    # No floor material, but a raw ("xom") wallpapered room still needs
    # suvoq+grunt+shpatlyovka prep → 3 + oboy(4) + elektr(1) = 8 lines
    assert sum(1 for ln in est.lines if ln.category in ("suvoq", "grunt", "shpatlyovka")) == 3
    assert len(est.lines) == 8


# ---------------------------------------------------------------------------
# Test 6: High ceiling 3.2m room, oboy (yolli)
# ---------------------------------------------------------------------------

def test_6_oboy_yolli_high_ceiling(oboy_norm, oboy_mat):
    """4×3 room, ceiling 3.2 m, all-oboy yolli pattern."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=3.2,
        floor_area=12.0,
        net_wall_area=44.8,
        perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"ALL": "o1"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "yolli"}}},
    )
    mats = _mats(oboy_mat)
    norms = _norms(oboy_norm)

    est = compute_estimate(room, mats, norms)

    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]
    assert len(oboy_lines) == 4

    # Strip-based (Fix 3): strips_per_roll = floor(10.05 / 3.2) = 3
    # Wall A: strips = ceil(4.0 * 1.10 / 1.06) = ceil(4.15) = 5; rolls = ceil(5/3) = 2
    wall_a = next(ln for ln in oboy_lines if "devor A" in ln.label)
    assert wall_a.qty == 2.0

    # Wall B: strips = ceil(3.0 * 1.10 / 1.06) = ceil(3.11) = 4; rolls = ceil(4/3) = 2
    # (Before Fix 3's strip math, area-based rounding wrongly gave 1 roll —
    # 3 strips fit on paper by area, but only 3 strips actually come out of
    # one roll, and this wall needs 4.)
    wall_b = next(ln for ln in oboy_lines if "devor B" in ln.label)
    assert wall_b.qty == 2.0


# ---------------------------------------------------------------------------
# Test 7: Minimal room 2.5×2.0, paint only, no floor
# ---------------------------------------------------------------------------

def test_7_minimal_paint_no_floor(boyoq_norm, paint_mat):
    """2.5×2.0 room, paint walls only, no floor material."""
    walls = [_wall("A", 2.5), _wall("B", 2.0), _wall("C", 2.5), _wall("D", 2.0)]
    # net_wall_area = 2*(2.5+2.0)*2.7 = 9*2.7 = 24.3
    room = _room(
        ceiling_h=2.7,
        floor_area=5.0,
        net_wall_area=24.3,
        perimeter=9.0,
        geometry={"walls": walls},
        surfaces={"ALL": "p1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat)
    norms = _norms(boyoq_norm)

    est = compute_estimate(room, mats, norms)

    # suvoq + boyoq + grunt + shpatlyovka + elektr = 5 lines (defaults to "xom")
    assert len(est.lines) == 5
    assert sum(1 for ln in est.lines if ln.category == "suvoq") == 1
    assert sum(1 for ln in est.lines if ln.category == "boyoq") == 1
    assert sum(1 for ln in est.lines if ln.category == "elektr") == 1


# ---------------------------------------------------------------------------
# Test 8: Large room 7×5, tile floor + paint walls
# ---------------------------------------------------------------------------

def test_8_large_tile_paint(boyoq_norm, plitka_norm, paint_mat, tile_mat):
    """7×5 room, paint walls + tile floor."""
    walls = [_wall("A", 7.0), _wall("B", 5.0), _wall("C", 7.0), _wall("D", 5.0)]
    # net_wall_area = 2*(7+5)*2.7 = 24*2.7 = 64.8
    room = _room(
        ceiling_h=2.7,
        floor_area=35.0,
        net_wall_area=64.8,
        perimeter=24.0,
        geometry={"walls": walls},
        surfaces={"ALL": "p1", "floor": "t1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat, tile_mat)
    norms = _norms(boyoq_norm, plitka_norm)

    est = compute_estimate(room, mats, norms)

    # suvoq + boyoq + grunt + shpatlyovka + plitka + plintus + elektr = 7
    # (Fix 8: tile floors now get a plinth line too, same as laminate)
    assert len(est.lines) == 7
    assert sum(1 for ln in est.lines if ln.category == "suvoq") == 1
    assert sum(1 for ln in est.lines if ln.category == "plintus") == 1

    tile_line = next(ln for ln in est.lines if ln.category == "plitka")
    # m² = ceil(35.0 * 1.10 * 100) / 100 = ceil(3850) / 100 = 38.50
    assert tile_line.qty == pytest.approx(38.5, abs=0.01)

    # No doors recorded (openings_count=0) → door_m=0 (Fix 8: no forced
    # minimum of one door) → plinth_m = perimeter = 24.0; ceil(24.0/2.5) = 10
    plinth_line = next(ln for ln in est.lines if ln.category == "plintus")
    assert plinth_line.qty == 10.0


# ---------------------------------------------------------------------------
# Test 9: Room with 2 doors + 2 windows, oboy (geometrik)
# ---------------------------------------------------------------------------

def test_9_oboy_geometrik_with_openings(oboy_norm, oboy_mat):
    """5×4 room, oboy geometrik, 2 doors + 2 windows."""
    door_a = _elem("eshik", 0.9, 2.1)
    window_a = _elem("deraza", 1.5, 1.2)
    door_c = _elem("eshik", 0.9, 2.1)
    window_d = _elem("deraza", 1.5, 1.2)
    walls = [
        _wall("A", 5.0, [door_a, window_a]),
        _wall("B", 4.0),
        _wall("C", 5.0, [door_c]),
        _wall("D", 4.0, [window_d]),
    ]
    room = _room(
        ceiling_h=2.7,
        floor_area=20.0,
        net_wall_area=42.93,  # 18*2.7 - (0.9*2.1*2 + 1.5*1.2*2) = 48.6 - 5.67 = 42.93
        perimeter=18.0,
        openings_count=4,
        geometry={"walls": walls},
        surfaces={"ALL": "o1"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "geometrik"}}},
    )
    mats = _mats(oboy_mat)
    norms = _norms(oboy_norm)

    est = compute_estimate(room, mats, norms)

    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]
    assert len(oboy_lines) == 4

    # Strip-based (Fix 3): openings are NOT subtracted (a strip runs the
    # full ceiling height regardless of a door/window behind it).
    # strips_per_roll = floor(10.05 / 2.7) = 3
    # Wall A: strips = ceil(5.0 * 1.15 / 1.06) = ceil(5.42) = 6; rolls = ceil(6/3) = 2
    wall_a = next(ln for ln in oboy_lines if "devor A" in ln.label)
    assert wall_a.qty == 2.0

    # Wall D: strips = ceil(4.0 * 1.15 / 1.06) = ceil(4.34) = 5; rolls = ceil(5/3) = 2
    wall_d = next(ln for ln in oboy_lines if "devor D" in ln.label)
    assert wall_d.qty == 2.0


# ---------------------------------------------------------------------------
# Test 10: Room with no floor material selected
# ---------------------------------------------------------------------------

def test_10_paint_only_no_floor(boyoq_norm, paint_mat):
    """4×3 room, paint walls, no floor material at all."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"ALL": "p1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat)
    norms = _norms(boyoq_norm)

    est = compute_estimate(room, mats, norms)

    # suvoq + boyoq + grunt + shpatlyovka + elektr = 5, no floor lines (defaults to "xom")
    assert len(est.lines) == 5
    assert not any(ln.category in ("laminat", "plitka", "plintus") for ln in est.lines)


# ---------------------------------------------------------------------------
# Test 11: Room with plitka floor, no wall material
# ---------------------------------------------------------------------------

def test_11_tile_floor_no_wall_material(plitka_norm, tile_mat):
    """4×3 room, tile floor only, no wall material in surfaces."""
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        geometry={"walls": [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]},
        surfaces={"floor": "t1"},
        state={},
    )
    mats = _mats(tile_mat)
    norms = _norms(plitka_norm)

    est = compute_estimate(room, mats, norms)

    # plitka + plintus + elektr = 3 (Fix 8: tile now gets a plinth line too)
    assert len(est.lines) == 3
    assert any(ln.category == "plitka" for ln in est.lines)
    assert any(ln.category == "plintus" for ln in est.lines)

    tile_line = next(ln for ln in est.lines if ln.category == "plitka")
    # ceil(12.0 * 1.10 * 100) / 100 = ceil(1320) / 100 = 13.2
    assert tile_line.qty == pytest.approx(13.2, abs=0.01)

    # No doors (openings_count=0) → plinth_m = perimeter = 14.0; ceil(14.0/2.5) = 6
    plinth_line = next(ln for ln in est.lines if ln.category == "plintus")
    assert plinth_line.qty == 6.0


# ---------------------------------------------------------------------------
# Test 12: Laminat floor, oboy bolalar walls
# ---------------------------------------------------------------------------

def test_12_oboy_bolalar_laminat(oboy_norm, laminat_norm, oboy_mat, laminat_mat):
    """4×3 room, oboy bolalar walls + laminat floor."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"ALL": "o1", "floor": "l1"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "bolalar"}}},
    )
    mats = _mats(oboy_mat, laminat_mat)
    norms = _norms(oboy_norm, laminat_norm)

    est = compute_estimate(room, mats, norms)

    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]
    assert len(oboy_lines) == 4

    # Strip-based (Fix 3): strips_per_roll = floor(10.05 / 2.7) = 3
    # Wall A: strips = ceil(4.0 * 1.15 / 1.06) = ceil(4.34) = 5; rolls = ceil(5/3) = 2
    wall_a = next(ln for ln in oboy_lines if "devor A" in ln.label)
    assert wall_a.qty == 2.0

    # Wall B: strips = ceil(3.0 * 1.15 / 1.06) = ceil(3.25) = 4; rolls = ceil(4/3) = 2
    wall_b = next(ln for ln in oboy_lines if "devor B" in ln.label)
    assert wall_b.qty == 2.0

    # Wallpaper-only room defaults to "xom" → suvoq+grunt+shpatlyovka(3) +
    # oboy(4) + laminat(1) + plintus(1) + elektr(1) = 10
    assert sum(1 for ln in est.lines if ln.category in ("suvoq", "grunt", "shpatlyovka")) == 3
    assert len(est.lines) == 10


# ---------------------------------------------------------------------------
# Test 13: Only paint, no floor material, 3×3 ceiling 3.0m
# ---------------------------------------------------------------------------

def test_13_paint_only_high_ceiling(boyoq_norm, paint_mat):
    """3×3 room with 3.0 m ceiling, paint only, no floor."""
    walls = [_wall("A", 3.0), _wall("B", 3.0), _wall("C", 3.0), _wall("D", 3.0)]
    # net_wall_area = 12 * 3.0 = 36.0
    room = _room(
        ceiling_h=3.0,
        floor_area=9.0,
        net_wall_area=36.0,
        perimeter=12.0,
        geometry={"walls": walls},
        surfaces={"ALL": "p1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat)
    norms = _norms(boyoq_norm)

    est = compute_estimate(room, mats, norms)

    # Defaults to "xom" → suvoq + boyoq + grunt + shpatlyovka + elektr = 5
    assert len(est.lines) == 5
    assert sum(1 for ln in est.lines if ln.category == "suvoq") == 1

    # Paint: ceil(36.0 * 2 / 9.0) = ceil(8.0) = 8 liters
    paint_line = next(ln for ln in est.lines if ln.category == "boyoq")
    assert paint_line.qty == 8.0


# ---------------------------------------------------------------------------
# Test 14: 3×3 room, oboy gul, verify waste factor 1.15
# ---------------------------------------------------------------------------

def test_14_oboy_gul_waste_factor(oboy_norm, oboy_mat):
    """3×3 room, gul pattern — waste factor must be 1.15."""
    assert WASTE_FACTORS["gul"] == pytest.approx(1.15), "gul waste factor is 1.15"

    walls = [_wall("A", 3.0), _wall("B", 3.0), _wall("C", 3.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=9.0,
        net_wall_area=32.4,
        perimeter=12.0,
        geometry={"walls": walls},
        surfaces={"ALL": "o1"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "gul"}}},
    )
    mats = _mats(oboy_mat)
    norms = _norms(oboy_norm)

    est = compute_estimate(room, mats, norms)

    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]
    assert len(oboy_lines) == 4

    # Strip-based (Fix 3): strips_per_roll = floor(10.05 / 2.7) = 3
    # Wall A: strips = ceil(3.0 * 1.15 / 1.06) = ceil(3.25) = 4; rolls = ceil(4/3) = 2
    wall_a = next(ln for ln in oboy_lines if "devor A" in ln.label)
    assert wall_a.qty == 2.0

    # Verify the formula string contains the waste factor 1.15
    assert "1.15" in wall_a.formula


# ---------------------------------------------------------------------------
# Test 15: Door widths reduce plinth count
# ---------------------------------------------------------------------------

def test_15_plinth_reduced_by_doors(boyoq_norm, laminat_norm, paint_mat, laminat_mat):
    """4×3 room, 2 doors (one in A, one in C), laminat floor.

    Without doors: perimeter=14m → pieces = ceil(14/2.5) = ceil(5.6) = 6
    With doors:    door_m=1.8  → plinth = 14-1.8 = 12.2m → ceil(12.2/2.5) = ceil(4.88) = 5
    """
    door = _elem("eshik", 0.9, 2.1)
    walls = [_wall("A", 4.0, [door]), _wall("B", 3.0), _wall("C", 4.0, [door]), _wall("D", 3.0)]
    # net_wall_area = 14*2.7 - 2*(0.9*2.1) = 37.8 - 3.78 = 34.02
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=34.02,
        perimeter=14.0,
        openings_count=2,
        geometry={"walls": walls},
        surfaces={"ALL": "p1", "floor": "l1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat, laminat_mat)
    norms = _norms(boyoq_norm, laminat_norm)

    est = compute_estimate(room, mats, norms)

    plinth_line = next(ln for ln in est.lines if ln.category == "plintus")

    # door_widths_m = 0.9 + 0.9 = 1.8m
    # plinth_m = 14 - 1.8 = 12.2m
    # pieces = ceil(12.2 / 2.5) = ceil(4.88) = 5
    assert plinth_line.qty == 5.0

    # Defaults to "xom" → suvoq(1) + boyoq+grunt+shpatlyovka(3) + laminat+plintus(2) + elektr(1) = 7
    assert sum(1 for ln in est.lines if ln.category == "suvoq") == 1
    assert len(est.lines) == 7


# ---------------------------------------------------------------------------
# Test 16 (Fix 1) — omitting current_state is identical to explicit "xom"
# ---------------------------------------------------------------------------

def test_16_omitted_stage_equals_explicit_xom(boyoq_norm, laminat_norm, paint_mat, laminat_mat):
    """Regression guard: compute_estimate(...) with no stage args must match
    compute_estimate(..., current_state="xom", ...) exactly — the two used to
    diverge (omitted meant "skip all prep", which was the Fix 1 bug)."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"ALL": "p1", "floor": "l1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat, laminat_mat)
    norms = _norms(boyoq_norm, laminat_norm)

    omitted = compute_estimate(room, mats, norms)
    explicit_xom = compute_estimate(
        room, mats, norms, current_state="xom", floor_state="xom", ceiling_state="xom",
    )

    assert [ln.category for ln in omitted.lines] == [ln.category for ln in explicit_xom.lines]
    assert omitted.total_uzs == explicit_xom.total_uzs
    assert any(ln.category == "suvoq" for ln in omitted.lines), (
        "a raw/omitted-stage room must get a plaster (suvoq) line — this is "
        "the exact bug Fix 1 closes"
    )


# ---------------------------------------------------------------------------
# Test 17 (Fix 1) — wallpaper-only rooms now participate in stage gating
# ---------------------------------------------------------------------------

def test_17_wallpaper_only_room_respects_stage_gating(oboy_norm, oboy_mat):
    """Before Fix 1, a wallpaper-only room got NO prep lines at all, ever —
    regardless of construction stage — because prep was only ever attached
    via the paint branch. Now a wallpaper-only room at "shpaklovka" (primed +
    puttied) must skip suvoq/grunt/shpatlyovka just like a painted room does,
    keeping only its oboy finish lines."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"ALL": "o1"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "tekstura"}}},
    )
    mats = _mats(oboy_mat)
    norms = _norms(oboy_norm)

    raw = compute_estimate(room, mats, norms, current_state="xom")
    finished_prep = compute_estimate(room, mats, norms, current_state="shpaklovka")

    raw_cats = [ln.category for ln in raw.lines]
    finished_cats = [ln.category for ln in finished_prep.lines]

    assert {"suvoq", "grunt", "shpatlyovka"} <= set(raw_cats)
    assert not {"suvoq", "grunt", "shpatlyovka"} & set(finished_cats)
    # The wallpaper finish itself is never skipped, at any stage
    assert finished_cats.count("oboy") == raw_cats.count("oboy") == 4


# ---------------------------------------------------------------------------
# Test 18 (Fix 2) — painted wall with a door opening excludes the opening
# ---------------------------------------------------------------------------

def test_18_paint_area_excludes_openings_on_painted_wall(boyoq_norm, paint_mat):
    """One painted wall with a door: the paint line's area must subtract the
    door, same as _wallpaper_lines already does for oboy walls."""
    door = _elem("eshik", 0.9, 2.1)
    walls = [_wall("A", 4.0, [door]), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=34.11,
        perimeter=14.0,
        openings_count=1,
        geometry={"walls": walls},
        surfaces={"ALL": "p1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat)
    norms = _norms(boyoq_norm)

    est = compute_estimate(room, mats, norms)
    paint_line = next(ln for ln in est.lines if ln.category == "boyoq")

    # net = 14*2.7 - 0.9*2.1 = 37.8 - 1.89 = 35.91; ceil(35.91*2/9.0) = ceil(7.98) = 8
    assert paint_line.qty == 8.0


# ---------------------------------------------------------------------------
# Test 19 (Fix 2) — no wallCoverings recorded at all falls back to surfaces
# ---------------------------------------------------------------------------

def test_19_paint_area_falls_back_to_surfaces_when_no_covering_recorded(boyoq_norm, paint_mat):
    """A room whose walls were never touched in the "Devorlar" design step
    has no wallCoverings at all (state={}) — the paint area must still be
    computed from the boyoq material assigned via `surfaces`, not silently
    come out as zero."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"ALL": "p1"},
        state={},
    )
    mats = _mats(paint_mat)
    norms = _norms(boyoq_norm)

    est = compute_estimate(room, mats, norms)
    paint_line = next((ln for ln in est.lines if ln.category == "boyoq"), None)

    assert paint_line is not None
    # ceil(37.8 * 2 / 9.0) = ceil(8.4) = 9
    assert paint_line.qty == 9.0


# ---------------------------------------------------------------------------
# Test 20 (Fix 3) — strip-based math vs. the old area-based math
# ---------------------------------------------------------------------------

def test_20_wallpaper_strips_not_area_regression(oboy_norm, oboy_mat):
    """A 3 m wall at 2.7 m ceiling, no waste (patternId unset → 1.10 default
    from WASTE_FACTORS.get fallback... use a pattern with waste=1.0 instead
    so the numbers are exact): old area math said 1 roll (3*2.7=8.1 m² fits
    inside one 10.653 m² roll on paper); real purchasing needs 2, because a
    10.05 m roll cut into 2.7 m strips only yields 3 strips (8.1 m of usable
    length), and this wall alone needs 3 strips at ceiling height, using up
    that entire roll's usable length with nothing left for the door
    reveal etc. Bump the wall to 3.5 m so it clearly needs a 4th strip that
    does not fit in the first roll — proving the fix without depending on
    a knife-edge rounding coincidence.
    """
    walls = [_wall("A", 3.5), _wall("B", 3.0), _wall("C", 3.5), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=10.5,
        net_wall_area=35.1,
        perimeter=13.0,
        geometry={"walls": walls},
        surfaces={"ALL": "o1"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "unknown_pattern"}}},
    )
    mats = _mats(oboy_mat)
    norms = _norms(oboy_norm)

    est = compute_estimate(room, mats, norms)
    wall_a = next(ln for ln in est.lines if ln.category == "oboy" and "devor A" in ln.label)

    # Unknown pattern → WASTE_FACTORS.get(..., 1.10) default.
    # strips = ceil(3.5 * 1.10 / 1.06) = ceil(3.632) = 4
    # strips_per_roll = floor(10.05 / 2.7) = 3
    # rolls = ceil(4 / 3) = 2
    #
    # The old area-based math would have computed:
    #   net_area = 3.5*2.7=9.45; waste=9.45*1.10=10.395
    #   rolls = ceil(10.395 / 10.653) = ceil(0.9758) = 1  ← underestimate
    assert wall_a.qty == 2.0
    assert "polosa" in wall_a.formula


# ---------------------------------------------------------------------------
# Test 21 (Fix 4) — oboy wall with a missing material is flagged, not free
# ---------------------------------------------------------------------------

def test_21_oboy_missing_material_flagged_approximate(oboy_norm):
    """A wall's covering references a material id that isn't in
    materials_map (deleted, or never a real row) — this must NOT become a
    silent 0-price line counted as exact; it must be flagged approximate
    with a warning telling the user to pick a material."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7,
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"ALL": "ghost-material-id"},
        state={"wallCoverings": {"ALL": {"kind": "oboy", "patternId": "tekstura"}}},
    )
    mats = _mats()  # empty — "ghost-material-id" resolves to nothing
    norms = _norms(oboy_norm)

    est = compute_estimate(room, mats, norms)
    oboy_lines = [ln for ln in est.lines if ln.category == "oboy"]

    assert len(oboy_lines) == 4
    for ln in oboy_lines:
        assert ln.unit_price_uzs == 0
        assert ln.subtotal_uzs == 0
        assert ln.is_approximate is True
        assert ln.warning == "Material topilmadi — narx smetaga kirmadi. Devor uchun material tanlang."

    # These lines are zero-priced (no material to price against), so they
    # contribute nothing to total_uzs either way — Fix 5's exact/approx
    # split is exercised by test_22 below with a nonzero approximate line.
    assert all(ln.subtotal_uzs == 0 for ln in oboy_lines)


# ---------------------------------------------------------------------------
# Test 22 (Fix 5) — total_uzs includes approximate lines; min/max formula
# ---------------------------------------------------------------------------

def test_22_totals_include_approximate_lines():
    """A room with one exact line (confirmed electrical, real point count)
    and one approximate line (furniture with no known price, fallback
    2,000,000 UZS) must fold BOTH into total_uzs — the old behaviour
    silently dropped the approximate line from the total entirely."""
    room = _room(
        geometry={"walls": []},
        surfaces={},
        state={
            "furniture": [{"furniture_id": "unknown-item", "name": "Noma'lum jihoz"}],
            "electricals": [{"id": "e1"}, {"id": "e2"}],
        },
    )
    mats = _mats()
    norms = _norms()

    est = compute_estimate(room, mats, norms)

    furniture_line = next(ln for ln in est.lines if ln.category == "jihoz")
    elektr_line = next(ln for ln in est.lines if ln.category == "elektr")

    assert furniture_line.is_approximate is True
    assert furniture_line.subtotal_uzs == 2_000_000
    assert elektr_line.is_approximate is False
    # 2 points * 8.0 m avg run * 1.15 slack = 18.4 → ceil = 19 m * 10,000 UZS
    assert elektr_line.subtotal_uzs == 190_000

    assert est.total_exact_uzs == 190_000
    assert est.total_approx_uzs == 2_000_000
    assert est.total_uzs == 2_190_000, (
        "total_uzs must be the FULL expected spend (exact + approximate) — "
        "this is the exact Fix 5 bug: it used to exclude the furniture line "
        "entirely, understating the total"
    )
    assert est.total_min == int(2_190_000 * 0.9)
    # Wider band on the approximate portion: (190_000 + 2_000_000*1.3) * 1.1
    assert est.total_max == int((190_000 + 2_000_000 * 1.3) * 1.1)


# ---------------------------------------------------------------------------
# Test 23 (Fix 6) — has_electrical vs electrical_confirmed no longer contradict
# ---------------------------------------------------------------------------

def test_23_electrical_confirmed_distinguishes_fallback_from_real_count(boyoq_norm, paint_mat):
    """An electrical line is ALWAYS present (compute_estimate always adds
    one) — has_electrical must reflect that (always True), while
    electrical_confirmed must be the thing that actually distinguishes a
    real placed point count from the ELEC_POINTS_DEFAULT fallback guess.
    Before Fix 6, has_electrical WAS the confirmed-only check, so a visible
    fallback electrical line sat next to a contradictory 'Yo'q'."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]

    def _room_with_electricals(electricals):
        return _room(
            ceiling_h=2.7, floor_area=12.0, net_wall_area=37.8, perimeter=14.0,
            geometry={"walls": walls},
            surfaces={"ALL": "p1"},
            state={
                "wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}},
                "electricals": electricals,
            },
        )

    mats = _mats(paint_mat)
    norms = _norms(boyoq_norm)

    # No placed points at all → fallback guess: has_electrical True, NOT confirmed
    fallback_est = compute_estimate(_room_with_electricals([]), mats, norms)
    assert fallback_est.has_electrical is True
    assert fallback_est.electrical_confirmed is False

    # Real placed points → both True
    confirmed_est = compute_estimate(
        _room_with_electricals([{"id": "e1"}, {"id": "e2"}]), mats, norms
    )
    assert confirmed_est.has_electrical is True
    assert confirmed_est.electrical_confirmed is True


# ---------------------------------------------------------------------------
# Test 24 (Fix 8) — door-width fallback has no forced minimum of one door
# ---------------------------------------------------------------------------

def test_24_no_recorded_doors_means_zero_door_width_in_plinth(boyoq_norm, laminat_norm, paint_mat, laminat_mat):
    """A room with openings_count=0 and no explicit door elements at all
    must get plinth = perimeter exactly — the old fallback subtracted one
    phantom 0.9m door even when the room genuinely has none."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7, floor_area=12.0, net_wall_area=37.8, perimeter=14.0,
        openings_count=0,
        geometry={"walls": walls},
        surfaces={"ALL": "p1", "floor": "l1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat, laminat_mat)
    norms = _norms(boyoq_norm, laminat_norm)

    est = compute_estimate(room, mats, norms)
    plinth_line = next(ln for ln in est.lines if ln.category == "plintus")

    # perimeter=14.0, door_m=0 (no minimum) → ceil(14.0/2.5) = 6
    assert plinth_line.qty == 6.0
    assert "0.00 m" in plinth_line.formula


# ---------------------------------------------------------------------------
# Test 25 (Fix 8) — two different paint materials price each wall correctly
# ---------------------------------------------------------------------------

def test_25_multiple_paint_materials_priced_per_wall(laminat_norm, laminat_mat):
    """Wall A painted with a cheap material, wall C with an expensive one —
    each must produce its own boyoq line at its own price and its own area,
    not one combined line arbitrarily priced at whichever material a
    single next() lookup happened to find first."""
    boyoq_norm = _norm("boyoq", coverage_per_unit=9.0, coats=2)
    cheap = _material("cheap", "boyoq", "Arzon oq", price_uzs=20_000)
    pricey = _material("pricey", "boyoq", "Premium ko'k", price_uzs=60_000)

    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7, floor_area=12.0, net_wall_area=37.8, perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"A": "cheap", "B": "cheap", "C": "pricey", "D": "pricey", "floor": "l1"},
        state={
            "wallCoverings": {
                "A": {"kind": "paint", "color": "#fff"},
                "B": {"kind": "paint", "color": "#fff"},
                "C": {"kind": "paint", "color": "#00f"},
                "D": {"kind": "paint", "color": "#00f"},
            }
        },
    )
    mats = _mats(cheap, pricey, laminat_mat)
    norms = _norms(boyoq_norm, laminat_norm)

    est = compute_estimate(room, mats, norms)
    boyoq_lines = [ln for ln in est.lines if ln.category == "boyoq"]

    assert len(boyoq_lines) == 2, "one line per distinct paint material, not one combined line"

    cheap_line = next(ln for ln in boyoq_lines if ln.material_id == "cheap")
    pricey_line = next(ln for ln in boyoq_lines if ln.material_id == "pricey")

    # A+B: (4.0+3.0)*2.7 = 18.9 m² → ceil(18.9*2/9.0) = ceil(4.2) = 5 litr @ 20,000
    assert cheap_line.qty == 5.0
    assert cheap_line.unit_price_uzs == 20_000

    # C+D: same area 18.9 m² → 5 litr @ 60,000 (a different price, proving
    # each group is priced against its OWN material, not the same one twice)
    assert pricey_line.qty == 5.0
    assert pricey_line.unit_price_uzs == 60_000
    assert pricey_line.subtotal_uzs == 3 * cheap_line.subtotal_uzs


# ---------------------------------------------------------------------------
# Test 26 (Fix 8) — tile floors get a plinth line, same as laminate
# ---------------------------------------------------------------------------

def test_26_tile_floor_gets_plinth_line(plitka_norm, tile_mat):
    """A tile floor's walls meet the floor exactly like a laminate floor's —
    it used to get no skirting board line at all."""
    room = _room(
        ceiling_h=2.7, floor_area=12.0, net_wall_area=37.8, perimeter=14.0,
        geometry={"walls": [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]},
        surfaces={"floor": "t1"},
        state={},
    )
    mats = _mats(tile_mat)
    norms = _norms(plitka_norm)

    est = compute_estimate(room, mats, norms)

    assert any(ln.category == "plintus" for ln in est.lines)
    plinth_line = next(ln for ln in est.lines if ln.category == "plintus")
    # perimeter=14.0, no doors → ceil(14.0/2.5) = 6
    assert plinth_line.qty == 6.0


# ---------------------------------------------------------------------------
# Test 27 (Fix 9) — a painted wall recorded only in wallCoverings (the real
# studio flow) still triggers prep and a paint line even when `surfaces`
# never resolved to a Material.
# ---------------------------------------------------------------------------

def test_27_paint_recorded_only_in_wallcoverings_still_prices(boyoq_norm):
    """The real-world studio bug: a room painted through the actual paint
    picker only ever writes to state['wallCoverings'] — `surfaces` is never
    populated by that flow (only the separate AI-builder path touches it).
    Before this fix, "boyoq" in wall_categories was the ONLY gate for both
    wall-prep and the paint finish line, and wall_categories is derived
    solely from `surfaces` — so a painted room with empty `surfaces` got
    NO suvoq/grunt/shpatlyovka and NO paint line at all, silently.
    """
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7, floor_area=12.0, net_wall_area=37.8, perimeter=14.0,
        geometry={"walls": walls},
        surfaces={},  # <- never populated, exactly like the real studio flow
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats()  # no boyoq Material anywhere either
    norms = _norms(boyoq_norm)

    est = compute_estimate(room, mats, norms)
    cats = [ln.category for ln in est.lines]

    # Prep must still run — this used to be silently skipped entirely.
    assert "suvoq" in cats
    assert "grunt" in cats
    assert "shpatlyovka" in cats

    paint_line = next((ln for ln in est.lines if ln.category == "boyoq"), None)
    assert paint_line is not None, "a painted room must always get a paint line"
    # No material anywhere resolves → flagged approximate, nonzero fallback
    # price (never a silent 0, matching the furniture-fallback philosophy).
    assert paint_line.is_approximate is True
    assert paint_line.unit_price_uzs == 28_000
    assert paint_line.subtotal_uzs > 0
    assert "tanlanmagan" in (paint_line.warning or "")


def test_28_paint_recorded_in_wallcoverings_with_real_material_prices_exactly(boyoq_norm, paint_mat):
    """Once the frontend wiring fix lands (paint picker calling applySurface
    alongside setWallCovering), `surfaces` DOES resolve to a real boyoq
    Material — the paint line must then be priced exactly against it, not
    fall back to the approximate per-litre guess."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7, floor_area=12.0, net_wall_area=37.8, perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"ALL": "p1"},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    mats = _mats(paint_mat)
    norms = _norms(boyoq_norm)

    est = compute_estimate(room, mats, norms)
    paint_line = next(ln for ln in est.lines if ln.category == "boyoq")

    assert paint_line.is_approximate is False
    assert paint_line.unit_price_uzs == paint_mat.price_uzs
    assert paint_line.material_id == "p1"


def test_29_ceiling_construction_priced_for_border_design(boyoq_norm):
    """A room with a real 'border' drop-ceiling design recorded in
    state['ceiling'] must get gipsokarton + profile line items, sized off
    the perimeter ring (not the full ceiling area) — border designs only
    drop a band around the edge, per ceilingDesigns.ts geometry."""
    room = _room(
        ceiling_h=2.7, floor_area=12.0, net_wall_area=37.8, perimeter=14.0,
        geometry={"walls": []},
        surfaces={},
        state={"ceiling": {"design": "border", "settings": {"border": 420, "strip": True}}},
    )
    est = compute_estimate(room, _mats(), _norms())
    shift_lines = [ln for ln in est.lines if ln.category == "shift"]

    assert {"Shift gipsokartoni", "Shift profili (karkas)", "LED lenta (shift nishi)"} <= {
        ln.label for ln in shift_lines
    }
    # panel_area = perimeter * border_m = 14.0 * 0.42 = 5.88 m²
    sheet_line = next(ln for ln in shift_lines if ln.label == "Shift gipsokartoni")
    assert "5.9 m²" in sheet_line.formula
    assert all(ln.is_approximate for ln in shift_lines)


def test_30_ceiling_non_drop_and_no_ceiling_config_are_unpriced(boyoq_norm):
    """A 'non_drop' design (or no ceiling config recorded at all) is a bare
    structural slab — nothing built, nothing priced."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]

    room_explicit_non_drop = _room(
        ceiling_h=2.7, floor_area=12.0, net_wall_area=37.8, perimeter=14.0,
        geometry={"walls": walls}, surfaces={},
        state={"ceiling": {"design": "non_drop"}},
    )
    room_no_ceiling_key = _room(
        ceiling_h=2.7, floor_area=12.0, net_wall_area=37.8, perimeter=14.0,
        geometry={"walls": walls}, surfaces={}, state={},
    )

    for room in (room_explicit_non_drop, room_no_ceiling_key):
        est = compute_estimate(room, _mats(), _norms())
        assert not any(ln.category == "shift" for ln in est.lines)


def test_31_ceiling_construction_skipped_when_ceiling_state_finished(boyoq_norm):
    """ceiling_state="tayyor" means the ceiling already exists — no further
    construction spend, mirroring floor_already_done for the floor."""
    room = _room(
        ceiling_h=2.7, floor_area=12.0, net_wall_area=37.8, perimeter=14.0,
        geometry={"walls": []}, surfaces={},
        state={"ceiling": {"design": "flat", "settings": {"strip": False}}},
    )
    est = compute_estimate(room, _mats(), _norms(), ceiling_state="tayyor")
    assert not any(ln.category == "shift" for ln in est.lines)

    # Sanity: the same room WITHOUT ceiling_state="tayyor" does get priced.
    est_active = compute_estimate(room, _mats(), _norms())
    assert any(ln.category == "shift" for ln in est_active.lines)


# ---------------------------------------------------------------------------
# Test 32 (Fix 10) — the real persisted shape nests wallCoverings/ceiling
# under state["designState"], not at the top level of room.state
# ---------------------------------------------------------------------------

def test_32_real_persisted_shape_nests_under_design_state(boyoq_norm, oboy_norm, oboy_mat):
    """StudioPage.handleSave persists {geometry, ceilingHeight, name,
    designState: {wallCoverings, floorType, ceiling, ...}, furniture,
    electricals, lights, layoutPos} — confirmed against a live database row.
    wallCoverings/ceiling/floorType sit one level DEEPER than furniture/
    electricals/lights, which are top-level. Reading wallCoverings/ceiling
    straight off room.state (the old code, and every fixture test above)
    finds an empty dict for every real room — this test uses the exact
    nested shape a real save produces, not the flat shorthand the other
    fixtures use for readability."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7, floor_area=12.0, net_wall_area=37.8, perimeter=14.0,
        geometry={"walls": walls},
        surfaces={"ALL": "o1"},
        state={
            "name": "Xona",
            "geometry": {"walls": walls},
            "ceilingHeight": 2700,
            "designState": {
                "wallCoverings": {"ALL": {"kind": "oboy", "patternId": "damask"}},
                "floorType": "laminate",
                "ceiling": {"design": "border", "settings": {"border": 420, "strip": True}},
                "floorConfigured": True,
            },
            "furniture": [],
            "electricals": [],
            "lights": [],
            "layoutPos": None,
        },
    )
    mats = _mats(oboy_mat)
    norms = _norms(boyoq_norm, oboy_norm)

    est = compute_estimate(room, mats, norms)
    cats = [ln.category for ln in est.lines]

    assert cats.count("oboy") == 4, "wallpaper lines must fire from the nested designState shape"
    assert {"suvoq", "grunt", "shpatlyovka"} <= set(cats)
    assert "shift" in cats, "ceiling construction must fire from the nested designState shape"


# ---------------------------------------------------------------------------
# Test 33 (Fix 11) — a painted room still gets a paint line with an empty
# norms table, matching how the prep lines already degrade gracefully
# ---------------------------------------------------------------------------

def test_33_paint_line_survives_missing_boyoq_norm():
    """Reproduces a real dev-environment gap: the `norms` table has zero rows
    (confirmed against a live database). _plaster_line/_grunt_line/_putty_line
    already fall back to hardcoded defaults when their Norm row is missing —
    the paint line used to be the only one gated on `if boyoq_norm:` at the
    call site, so it silently produced nothing at all instead of degrading
    the same way."""
    walls = [_wall("A", 4.0), _wall("B", 3.0), _wall("C", 4.0), _wall("D", 3.0)]
    room = _room(
        ceiling_h=2.7, floor_area=12.0, net_wall_area=37.8, perimeter=14.0,
        geometry={"walls": walls},
        surfaces={},
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
    )
    est = compute_estimate(room, _mats(), _norms())  # no boyoq Norm row at all

    paint_line = next((ln for ln in est.lines if ln.category == "boyoq"), None)
    assert paint_line is not None, "a painted room must get a paint line even with an empty norms table"
    assert paint_line.is_approximate is True
    assert paint_line.subtotal_uzs > 0
    assert "Norma topilmadi" in (paint_line.warning or "")
