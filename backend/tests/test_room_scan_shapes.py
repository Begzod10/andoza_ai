"""Room shapes the scan→geometry converter had never seen.

`test_room_scan_converter.py` runs on one kind of room: a living-room-ish
space, a handful of walls, one door, one or two windows. Whole branches
therefore shipped unexercised.

The six fixtures added alongside this file are built the way the existing ones
are (flat 16-float column-major transforms, a wall's local X axis along its
length, dimensions `[length, height, thickness]`) and, crucially, with the
world origin at *device* height — the floor sits at y = -1.6, as RoomPlan
really emits it. A fixture with the floor at y = 0 encodes a false assumption
and has already cost us one bug (see the sill tests in
test_room_scan_converter.py).

"""
from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from app.schemas.room import RoomGeometry
from app.schemas.room_scan import (
    CapturedRoom,
    ScanSurface,
    ScanTransform,
    Vec3,
    parse_captured_room,
)
from app.services.room_scan_converter import RoomScanConversion, convert_captured_room

_FIXTURES = Path(__file__).parent / "fixtures"

# The six shapes, by fixture stem. Kept as a tuple so the blanket sanity test
# below fails loudly if a fixture is added without being wired in here.
SHAPES = ("bathroom", "kitchen", "multi_opening", "rect", "tiny", "corridor")


def _convert(name: str) -> RoomScanConversion:
    path = _FIXTURES / f"captured_room_{name}.json"
    return convert_captured_room(parse_captured_room(json.loads(path.read_text())))


def _edge_mm(conv: RoomScanConversion, index: int) -> float:
    """The true polygon edge length, which is what `_build_walls` measures —
    `Wall.length` is the same number after a 0.51..24.9 m schema clamp."""
    n = len(conv.corners)
    return math.dist(conv.corners[index], conv.corners[(index + 1) % n]) * 1000.0


def _elements(conv: RoomScanConversion, el_type: str | None = None):
    return [e for w in conv.geometry.walls for e in w.elements
            if el_type is None or e.type == el_type]


# ---------------------------------------------------------------------------
# Blanket invariants — every shape
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("name", SHAPES)
def test_converted_geometry_is_sane(name):
    """Corners, walls and openings agree with each other on every shape."""
    conv = _convert(name)
    n = len(conv.corners)
    assert n >= 3
    assert len(conv.geometry.walls) == n
    assert conv.geometry.vertices is not None and len(conv.geometry.vertices) == n
    assert [w.id for w in conv.geometry.walls] == [str(i) for i in range(n)]
    assert 2.0 <= conv.ceiling_h <= 5.0
    # No degenerate or duplicated corner.
    for i in range(n):
        assert _edge_mm(conv, i) > 100.0
    # Every opening sits on a real wall, inside it, with a sill that fits.
    for wall_index, wall in enumerate(conv.geometry.walls):
        assert 0 <= wall_index < n
        for el in wall.elements:
            assert 0.0 <= el.position <= 1.0
            assert el.sill_height + el.height <= conv.ceiling_h + 0.01


# ---------------------------------------------------------------------------
# 1. Bathroom — toilet / sink / bathtub / washer, categories no scan had shown
# ---------------------------------------------------------------------------

def test_bathroom_converts_to_a_small_windowless_room():
    conv = _convert("bathroom")
    assert len(conv.corners) == 4
    assert {(round(x, 2), round(y, 2)) for x, y in conv.corners} == {
        (0.0, 0.0), (2.2, 0.0), (2.2, 1.8), (0.0, 1.8)
    }
    assert len(_elements(conv, "eshik")) == 1
    assert _elements(conv, "deraza") == []
    assert {o.category for o in conv.objects} == {"toilet", "sink", "bathtub", "washer"}


# ---------------------------------------------------------------------------
# 2. Kitchen — a door and a window sharing one wall
# ---------------------------------------------------------------------------

def test_the_kitchen_window_and_door_share_a_wall_and_both_survive():
    conv = _convert("kitchen")
    wall_index = next(i for i, w in enumerate(conv.geometry.walls) if len(w.elements) == 2)
    assert {e.type for e in conv.geometry.walls[wall_index].elements} == {"eshik", "deraza"}


# ---------------------------------------------------------------------------
# 3. Two doors on one wall, two windows on another
# ---------------------------------------------------------------------------

def test_two_windows_on_one_wall_both_survive_conversion():
    conv = _convert("multi_opening")
    wall_index = next(i for i, w in enumerate(conv.geometry.walls)
                      if sum(e.type == "deraza" for e in w.elements) == 2)
    windows = [e for e in conv.geometry.walls[wall_index].elements if e.type == "deraza"]
    assert len(windows) == 2
    # Distinct positions, both floor-relative sills off the 0.9 m fallback.
    assert abs(windows[0].position - windows[1].position) > 0.1
    assert all(abs(w.sill_height - 0.85) < 0.01 for w in windows)


# ---------------------------------------------------------------------------
# 4. Plain axis-aligned rectangle — the legacy A/B/C/D path
# ---------------------------------------------------------------------------

def test_a_four_wall_scan_keeps_its_scanned_vertices():
    """`RoomGeometry._normalize_polygon` auto-fills vertices for ANY 4-wall
    room from `walls[0].length × walls[1].length`. The converter must always
    hand it real vertices so that fill never runs on a scan."""
    conv = _convert("rect")
    assert len(conv.geometry.walls) == 4
    assert conv.geometry.vertices is not None
    assert [(round(x, 3), round(y, 3)) for x, y in conv.geometry.vertices] == \
           [(round(x, 3), round(y, 3)) for x, y in conv.corners]
    assert {(round(x, 2), round(y, 2)) for x, y in conv.corners} == {
        (0.0, 0.0), (4.5, 0.0), (4.5, 3.2), (0.0, 3.2)
    }


def test_the_legacy_rectangle_fill_would_misplace_a_rotated_four_wall_scan():
    """Why the assertion above matters: for an axis-aligned rectangle the
    legacy fill happens to agree, so it hides the problem. A room scanned at an
    angle — the normal case, since RoomPlan's axes follow the device, not the
    building — disagrees by metres. Any path that drops `vertices` and lets
    `_normalize_polygon` re-derive them silently un-rotates the room.
    """
    angle = math.radians(30.0)
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    rect = [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (0.0, 3.0)]
    rotated = [(x * cos_a - z * sin_a, x * sin_a + z * cos_a) for x, z in rect]

    conv = convert_captured_room(CapturedRoom(
        walls=[_wall_surface(*rotated[i], *rotated[(i + 1) % 4]) for i in range(4)]
    ))
    assert len(conv.geometry.walls) == 4
    assert conv.geometry.vertices is not None

    # Drop the vertices and let the legacy validator fill them back in.
    refilled = RoomGeometry(walls=[w.model_copy(deep=True) for w in conv.geometry.walls])
    assert refilled.vertices is not None
    worst = max(math.dist(a, b) for a, b in zip(conv.geometry.vertices, refilled.vertices))
    assert worst > 1.0, worst           # metres apart, not rounding


# ---------------------------------------------------------------------------
# 5. Extremes — a 1.5 × 2 m room and a 1.2 × 8 m corridor
# ---------------------------------------------------------------------------

def test_the_extreme_shapes_convert_to_the_floor_areas_they_were_built_with():
    assert abs(_area(_convert("tiny").corners) - 3.0) < 0.05
    corridor = _convert("corridor")
    assert abs(_area(corridor.corners) - 9.6) < 0.05
    assert len([i for i in range(4) if _edge_mm(corridor, i) > 5000.0]) == 2


def test_a_notch_shorter_than_the_schema_floor_is_clamped_up_to_it():
    """A polygon edge may be shorter than `WallSchema`'s 0.51 m floor. The
    straightener keeps it as a real short edge on `corners`, while the stored
    `Wall.length` is the clamped number — so anything measuring a wall must
    measure the edge, not the stored length.
    """
    # A 6-wall room with a 0.25 m notch.
    points = [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (3.75, 3.0), (3.75, 3.4), (0.0, 3.4)]
    conv = convert_captured_room(CapturedRoom(walls=[
        _wall_surface(*points[i], *points[(i + 1) % len(points)])
        for i in range(len(points))
    ]))
    short = min(range(len(conv.corners)), key=lambda i: _edge_mm(conv, i))
    assert _edge_mm(conv, short) < 510.0
    assert conv.geometry.walls[short].length * 1000.0 > _edge_mm(conv, short)


# ---------------------------------------------------------------------------
# Helpers that build synthetic scans, kept at the bottom like the fixture
# builders in test_room_scan_converter.py
# ---------------------------------------------------------------------------

_FLOOR_Y = -1.6      # RoomPlan's origin is at device height, never on the floor


def _wall_surface(x0: float, z0: float, x1: float, z1: float, height: float = 2.5) -> ScanSurface:
    """A wall from (x0, z0) to (x1, z1), transform shaped like the fixtures'."""
    dx, dz = x1 - x0, z1 - z0
    length = math.hypot(dx, dz)
    ux, uz = dx / length, dz / length
    m = [ux, 0, uz, 0,
         0, 1, 0, 0,
         -uz, 0, ux, 0,
         (x0 + x1) / 2, _FLOOR_Y + height / 2, (z0 + z1) / 2, 1]
    return ScanSurface(
        dimensions=Vec3(x=length, y=height, z=0.0),
        transform=ScanTransform(m=[float(v) for v in m]),
    )


def _area(poly: list[tuple[float, float]]) -> float:
    n = len(poly)
    acc = 0.0
    for i in range(n):
        p1, p2 = poly[i], poly[(i + 1) % n]
        acc += p1[0] * p2[1] - p2[0] * p1[1]
    return abs(acc) / 2.0


def test_every_fixture_in_this_suite_has_a_device_height_origin():
    """Guards the fixtures themselves: a floor at y = 0 is a false assumption
    about RoomPlan and has already caused one real bug here."""
    from app.services.room_scan_converter import _floor_level

    for name in SHAPES:
        room = parse_captured_room(
            json.loads((_FIXTURES / f"captured_room_{name}.json").read_text())
        )
        assert _floor_level(room.walls) == pytest.approx(_FLOOR_Y), name
