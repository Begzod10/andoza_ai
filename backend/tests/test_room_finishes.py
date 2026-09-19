"""N-wall room finishes — a finish must be able to target any wall a room has.

The defect: `room_finishes.surface` was pinned to a 4-wall A/B/C/D rectangle
(`wall_a`..`wall_d`) with `wall_index` capped at 3, so the 5th wall of every
real LiDAR scan (walls ids "0".."4") could never be given a finish and was
never costed in the smeta. Reproduced against production room
1e24bf2c-a54e-4c57-bfc0-fd9bc2784a60 (5 walls, net_wall_area 68.16 m²).

These tests cover the resolver/overlay service directly (pure, no DB) plus the
router's validation contract, and pin the legacy rectangle behaviour so it can
never silently change.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException

from app.models.room import Room
from app.services.room_finishes import (
    apply_finishes_to_room,
    finish_material_ids,
    resolve_wall_id,
    room_wall_ids,
    validate_finish_surface,
)


class _Finish:
    """Stands in for a RoomFinish ORM row."""

    def __init__(self, surface, material_id=None, finish_type=None, color_hex=None, wall_index=None):
        self.surface = surface
        self.material_id = material_id
        self.finish_type = finish_type
        self.color_hex = color_hex
        self.wall_index = wall_index


def _polygon_room(**overrides) -> Room:
    """The real production 5-wall scan: 5.81 / 1.21 / 4.91 / 6.79 / 5.64 m,
    ceiling 3.16 m, floor area 37.88 m², net wall area 68.16 m² (gross
    24.36 m × 3.16 m = 76.98 m², less 8.82 m² of openings)."""
    lengths = [5.81, 1.21, 4.91, 6.79, 5.64]
    openings = {
        # 8.82 m² total, the difference between this room's gross and net
        # wall area in production.
        "2": [{"width": 2.5, "height": 1.5}, {"width": 0.9, "height": 2.1}],
        "3": [{"width": 2.0, "height": 1.59}],
    }
    defaults = dict(
        id=uuid.uuid4(),
        apartment_id=uuid.uuid4(),
        name="Skanerlangan xona",
        ceiling_h=3.16,
        geometry={
            "walls": [
                {"id": str(i), "length": ln, "elements": openings.get(str(i), [])}
                for i, ln in enumerate(lengths)
            ],
        },
        surfaces={},
        state={},
        floor_area=37.88,
        net_wall_area=68.16,
        perimeter=round(sum(lengths), 2),
        openings_count=3,
    )
    defaults.update(overrides)
    return Room(**defaults)


def _rect_room(**overrides) -> Room:
    defaults = dict(
        id=uuid.uuid4(),
        apartment_id=uuid.uuid4(),
        name="Mehmonxona",
        ceiling_h=2.7,
        geometry={
            "walls": [
                {"id": "A", "length": 4.0, "elements": []},
                {"id": "B", "length": 3.0, "elements": []},
                {"id": "C", "length": 4.0, "elements": []},
                {"id": "D", "length": 3.0, "elements": []},
            ],
        },
        surfaces={},
        state={},
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        openings_count=0,
    )
    defaults.update(overrides)
    return Room(**defaults)


# --------------------------------------------------------------------------
# Resolution
# --------------------------------------------------------------------------

def test_polygon_room_exposes_its_real_wall_ids():
    assert room_wall_ids(_polygon_room()) == ["0", "1", "2", "3", "4"]


@pytest.mark.parametrize("wall_id", ["0", "1", "2", "3", "4"])
def test_every_wall_of_a_five_wall_room_resolves(wall_id):
    """The whole point: the 5th wall ("4") is no longer unreachable."""
    assert resolve_wall_id(_polygon_room(), wall_id) == wall_id


def test_legacy_alias_resolves_to_the_lettered_wall_on_a_rectangle():
    room = _rect_room()
    assert resolve_wall_id(room, "wall_a") == "A"
    assert resolve_wall_id(room, "wall_d") == "D"


def test_legacy_alias_with_explicit_wall_index_uses_that_position():
    assert resolve_wall_id(_polygon_room(), "wall_a", wall_index=4) == "4"


def test_finish_for_a_wall_the_room_no_longer_has_resolves_to_none():
    """A re-scan can drop a wall; the stale finish must not be mispriced onto
    some other wall."""
    assert resolve_wall_id(_polygon_room(), "7") is None


def test_floor_and_ceiling_are_not_walls():
    room = _polygon_room()
    assert resolve_wall_id(room, "floor") is None
    assert resolve_wall_id(room, "ceiling") is None


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------

@pytest.mark.parametrize("surface", ["0", "1", "2", "3", "4", "floor", "ceiling"])
def test_validate_accepts_every_surface_a_polygon_room_has(surface):
    validate_finish_surface(_polygon_room(), surface)


@pytest.mark.parametrize("surface", ["wall_a", "wall_b", "wall_c", "wall_d", "floor", "ceiling"])
def test_validate_still_accepts_every_legacy_value_on_a_rectangle(surface):
    validate_finish_surface(_rect_room(), surface)


@pytest.mark.parametrize("wall_index", [0, 1, 2, 3])
def test_validate_still_accepts_legacy_wall_index_0_to_3(wall_index):
    validate_finish_surface(_rect_room(), "wall_a", wall_index)


def test_validate_rejects_a_wall_the_room_does_not_have():
    with pytest.raises(HTTPException) as exc:
        validate_finish_surface(_polygon_room(), "wall_e")
    assert exc.value.status_code == 422
    # The error must name the walls the room actually has, so a client can fix it.
    assert "0, 1, 2, 3, 4" in exc.value.detail


def test_validate_bounds_wall_index_by_the_rooms_real_wall_count():
    validate_finish_surface(_polygon_room(), "4", wall_index=4)  # 5 walls → 4 is fine
    with pytest.raises(HTTPException) as exc:
        validate_finish_surface(_rect_room(), "wall_a", wall_index=4)  # 4 walls → 4 is not
    assert exc.value.status_code == 422


def test_room_without_geometry_keeps_the_historical_six_value_contract():
    room = _rect_room(geometry=None)
    for surface in ("wall_a", "wall_b", "wall_c", "wall_d", "floor", "ceiling"):
        validate_finish_surface(room, surface)
    with pytest.raises(HTTPException) as exc:
        validate_finish_surface(room, "0")
    assert exc.value.status_code == 422


# --------------------------------------------------------------------------
# Estimate overlay
# --------------------------------------------------------------------------

def test_five_wall_room_feeds_every_wall_into_the_smeta():
    mat = uuid.uuid4()
    room = _polygon_room()
    finishes = [
        _Finish(str(i), material_id=mat, finish_type="paint", color_hex="#f5f0e8")
        for i in range(5)
    ]
    priced = apply_finishes_to_room(room, finishes)

    assert priced.surfaces == {str(i): str(mat) for i in range(5)}
    coverings = priced.state["wallCoverings"]
    assert sorted(coverings) == ["0", "1", "2", "3", "4"]
    assert all(c["kind"] == "paint" for c in coverings.values())
    # The original ORM row must not be mutated — it is a shallow copy.
    assert room.surfaces == {}


def test_five_wall_areas_sum_to_the_rooms_net_wall_area():
    """Guards the number the smeta actually bills: compute_estimate walks
    geometry.walls[].id, so all five walls' net area must add up to the room's
    own net_wall_area (68.16 m² for the production scan)."""
    from app.services.smeta import _painted_wall_areas

    mat = uuid.uuid4()
    room = _polygon_room()
    priced = apply_finishes_to_room(
        room,
        [_Finish(str(i), material_id=mat, finish_type="paint") for i in range(5)],
    )
    groups = _painted_wall_areas(priced, priced.surfaces, {})
    assert len(groups) == 1
    _mat_id, area, wall_ids = groups[0]
    assert sorted(wall_ids) == ["0", "1", "2", "3", "4"]
    assert area == pytest.approx(float(room.net_wall_area), abs=0.05)


def test_legacy_rectangle_finishes_land_on_the_lettered_walls():
    mat = uuid.uuid4()
    room = _rect_room()
    finishes = [
        _Finish(s, material_id=mat, finish_type="paint", wall_index=i)
        for i, s in enumerate(["wall_a", "wall_b", "wall_c", "wall_d"])
    ]
    priced = apply_finishes_to_room(room, finishes)
    assert priced.surfaces == {"A": str(mat), "B": str(mat), "C": str(mat), "D": str(mat)}


def test_the_rooms_own_surfaces_always_win_over_the_finishes_overlay():
    """Non-regression: a room the studio already configured must produce a
    byte-identical estimate, whatever room_finishes rows exist beside it."""
    configured = uuid.uuid4()
    other = uuid.uuid4()
    room = _rect_room(surfaces={"A": str(configured)})
    priced = apply_finishes_to_room(room, [_Finish("wall_a", material_id=other, finish_type="paint")])
    assert priced.surfaces["A"] == str(configured)


def test_existing_wall_coverings_win_over_the_finishes_overlay():
    room = _rect_room(state={"designState": {"wallCoverings": {"A": {"kind": "oboy"}}}})
    priced = apply_finishes_to_room(room, [_Finish("wall_a", finish_type="paint")])
    assert priced.state["designState"]["wallCoverings"]["A"] == {"kind": "oboy"}


def test_no_finishes_returns_the_room_untouched():
    room = _polygon_room()
    assert apply_finishes_to_room(room, []) is room


def test_floor_and_ceiling_finishes_map_to_their_own_surface_keys():
    floor_mat, ceil_mat = uuid.uuid4(), uuid.uuid4()
    priced = apply_finishes_to_room(
        _polygon_room(),
        [_Finish("floor", material_id=floor_mat, finish_type="laminate"),
         _Finish("ceiling", material_id=ceil_mat)],
    )
    assert priced.surfaces == {"floor": str(floor_mat), "ceiling": str(ceil_mat)}
    # floor/ceiling must never leak into wallCoverings
    assert not getattr(priced, "state", {}).get("wallCoverings")


def test_finish_material_ids_dedupes():
    a, b = uuid.uuid4(), uuid.uuid4()
    assert finish_material_ids([_Finish("0", a), _Finish("1", a), _Finish("2", b), _Finish("3")]) == [
        str(a), str(b)
    ]
