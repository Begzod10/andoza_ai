"""Server converter parity — MUST match the Dart test
(`test/features/room_scan/room_scan_converter_test.dart`) on the SHARED fixture.
If you change one converter, change both and keep these expectations in sync.

NOTE: the shared fixture's world origin was moved to device height (floor at
y = -1.25) so it matches what RoomPlan really emits; the Dart converter needs
the same floor-relative sill fix before its copy of this test can pass.
"""
import json
import math
from pathlib import Path

from app.schemas.room_scan import ScanObjectCategory, parse_captured_room
from app.services.room_scan_converter import (
    _build_corners,
    _floor_level,
    _min_corner,
    _straighten_traced,
    _window_sill,
    convert_captured_room,
)

_FIXTURE = Path(__file__).parent / "fixtures" / "captured_room_sample.json"


def _load():
    return convert_captured_room(parse_captured_room(json.loads(_FIXTURE.read_text())))


def test_corners_match_dart_4x3_normalised():
    conv = _load()
    assert len(conv.corners) == 4
    got = {(round(x, 3), round(y, 3)) for x, y in conv.corners}
    assert got == {(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (0.0, 3.0)}


def test_ceiling_is_median_wall_height():
    assert abs(_load().ceiling_h - 2.5) < 1e-6


def test_geometry_is_polygon_with_vertices():
    g = _load().geometry
    assert len(g.walls) == 4
    assert g.vertices is not None and len(g.vertices) == 4
    lens = sorted(w.length for w in g.walls)
    assert abs(lens[0] - 3.0) < 0.05 and abs(lens[1] - 3.0) < 0.05
    assert abs(lens[2] - 4.0) < 0.05 and abs(lens[3] - 4.0) < 0.05


def test_door_and_window_placed_on_walls():
    g = _load().geometry
    elements = [e for w in g.walls for e in w.elements]
    assert len(elements) == 2

    door = next(e for e in elements if e.type == "eshik")
    assert abs(door.width - 0.9) < 0.01
    assert abs(door.height - 2.1) < 0.01
    assert door.sill_height == 0.0
    assert 0.0 <= door.position <= 1.0

    window = next(e for e in elements if e.type == "deraza")
    assert abs(window.width - 1.5) < 0.01
    assert abs(window.height - 1.2) < 0.01
    assert abs(window.sill_height - 0.8) < 0.01  # 1.4 - 1.2/2


def test_objects_separate_from_geometry():
    conv = _load()
    assert len(conv.objects) == 2
    cats = {o.category for o in conv.objects}
    assert cats == {ScanObjectCategory.table.value, ScanObjectCategory.chair.value}
    table = next(o for o in conv.objects if o.category == "table")
    assert abs(table.width - 1.2) < 0.01
    assert abs(table.depth - 0.8) < 0.01
    assert abs(table.height - 0.75) < 0.01


def test_empty_room_is_defensive():
    from app.schemas.room_scan import CapturedRoom
    conv = convert_captured_room(CapturedRoom())
    assert conv.objects == []
    assert len(conv.corners) < 3


# ── floor-relative window sills ───────────────────────────────────────────
# Two fixtures below are real iPhone RoomPlan scans of the same office,
# transcribed from the exported USDZ (`Parametric_grp/Arch_grp`) into the
# CapturedRoom JSON the endpoint consumes. They exist because RoomPlan's world
# origin sits at *device* height, so the floor plane is at a negative Y — the
# converter used to read a window's absolute world Y as its sill, which always
# tripped the `< 0.05` guard and stored the 0.90 fallback.
_REAL_2 = Path(__file__).parent / "fixtures" / "captured_room_real_scan2.json"
_REAL_1 = Path(__file__).parent / "fixtures" / "captured_room_real_scan1.json"


def _convert(path: Path):
    return convert_captured_room(parse_captured_room(json.loads(path.read_text())))


def _elements(conv):
    return [e for w in conv.geometry.walls for e in w.elements]


def test_shared_fixture_has_a_device_height_origin_like_real_roomplan():
    """The fixture's floor must be below y=0, the way RoomPlan actually emits it."""
    room = parse_captured_room(json.loads(_FIXTURE.read_text()))
    assert _floor_level(room.walls) == -1.25
    assert all(w.transform.m[13] < 0.01 for w in room.walls)


def test_real_scan_window_sill_is_floor_relative_not_the_fallback():
    conv = _convert(_REAL_2)
    window = next(e for e in _elements(conv) if e.type == "deraza")
    # Measured in the USDZ: floor y = -1.6224, window y_min = -0.5414.
    assert abs(window.sill_height - 1.081) < 0.005
    assert abs(window.sill_height - 0.9) > 0.1  # the old fallback, explicitly not


def test_real_scan_door_still_sits_on_the_floor():
    conv = _convert(_REAL_2)
    door = next(e for e in _elements(conv) if e.type == "eshik")
    assert door.sill_height == 0.0
    assert abs(door.height - 2.204) < 0.01


def test_earlier_real_scan_of_the_same_room_agrees():
    conv = _convert(_REAL_1)
    elements = _elements(conv)
    assert [e.type for e in elements] == ["deraza"]  # this scan caught no door
    assert abs(elements[0].sill_height - 1.002) < 0.005


def test_old_absolute_y_rule_would_have_returned_the_fallback():
    """Pin the regression: the pre-fix formula yields 0.90 on this same input."""
    room = parse_captured_room(json.loads(_REAL_2.read_text()))
    w = room.windows[0]
    height = min(3.5, max(0.3, w.dimensions.y))
    old = w.transform.m[13] - height / 2.0            # absolute world Y
    assert old < 0.05                                 # → old code returned 0.9
    new = _window_sill(w, height, _floor_level(room.walls))
    assert abs(new - 1.081) < 0.005


def test_sill_is_unchanged_for_a_scan_that_is_already_floor_relative():
    """A floor-at-zero scan (older exports, synthetic data) must not shift."""
    room = parse_captured_room(json.loads(_FIXTURE.read_text()))
    shifted = room.model_copy(deep=True)
    for s in shifted.walls + shifted.windows + shifted.doors:
        s.transform.m[13] += 1.25                     # put the floor back at y=0
    assert _floor_level(shifted.walls) == 0.0
    before = next(e for e in _elements(convert_captured_room(room)) if e.type == "deraza")
    after = next(e for e in _elements(convert_captured_room(shifted)) if e.type == "deraza")
    assert abs(before.sill_height - after.sill_height) < 1e-9
    assert abs(after.sill_height - 0.8) < 1e-9


def test_floor_level_ignores_degenerate_walls_and_missing_scans():
    from app.schemas.room_scan import ScanSurface, ScanTransform, Vec3

    assert _floor_level([]) is None
    sliver = ScanSurface(
        dimensions=Vec3(x=1.0, y=0.05, z=0.0),        # too short to be a wall
        transform=ScanTransform(m=[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -9, 0, 1]),
    )
    assert _floor_level([sliver]) is None


def test_nan_and_absurd_sills_still_fall_back():
    from app.schemas.room_scan import ScanSurface, ScanTransform, Vec3

    def window_at(ty: float) -> ScanSurface:
        return ScanSurface(
            dimensions=Vec3(x=1.5, y=1.2, z=0.0),
            transform=ScanTransform(m=[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, ty, 0, 1]),
        )

    assert _window_sill(window_at(float("nan")), 1.2, -1.25) == 0.9
    assert _window_sill(window_at(0.15), 1.2, None) == 0.9        # no floor found
    assert _window_sill(window_at(9.0), 1.2, -1.25) == 0.9        # absurdly high
    assert _window_sill(window_at(-1.0), 1.2, -1.25) == 0.9       # below the floor
    # Slightly-below-floor noise clamps to a floor-level sill, not the fallback.
    assert _window_sill(window_at(-0.7), 1.2, -1.25) == 0.0


# ── raw (pre-tidy) capture ────────────────────────────────────────────────
# `convert_captured_room` deliberately rounds wall lengths to 5 cm, snaps near-
# square angles, drops <8° corners and clamps ceiling/opening sizes. That stays.
# These tests pin the *additive* record of what was measured before all that,
# which rides in `rooms.room_scan.raw`.

def _raw_of(path: Path) -> dict:
    return _convert(path).raw


def test_raw_block_has_the_measurements_the_processing_would_lose():
    raw = _raw_of(_REAL_2)
    assert raw["schema"] == 1
    conv = _convert(_REAL_2)
    assert len(raw["corners"]) == len(raw["wall_lengths"]) == 5
    assert raw["wall_heights"] and all(h > 0 for h in raw["wall_heights"])
    assert raw["ceiling_h"] is not None
    assert raw["floor_y"] is not None and raw["floor_y"] < 0  # device-height origin
    # One door + one window, each carrying the confidence the WallElement drops.
    assert {o["type"] for o in raw["openings"]} == {"eshik", "deraza"}
    assert all(o["confidence"] in ("high", "medium", "low") for o in raw["openings"])
    assert all(0 <= o["wall"] < len(conv.geometry.walls) for o in raw["openings"])


def test_raw_wall_lengths_are_off_the_5cm_grid_that_processing_snaps_to():
    raw = _raw_of(_REAL_2)
    conv = _convert(_REAL_2)
    proc = [w.length for w in conv.geometry.walls]
    assert len(proc) == len(raw["wall_lengths"])
    # Raw values are genuinely different from the processed ones...
    assert any(abs(p - r) > 1e-6 for p, r in zip(proc, raw["wall_lengths"]))
    # ...and the recorded per-wall delta matches that difference.
    for d, p, r in zip(raw["deltas"]["wall_length"], proc, raw["wall_lengths"]):
        assert abs(d - (p - r)) < 1e-3
    # The loop-closure gap `_straighten` redistributed is non-zero on a real scan.
    assert raw["deltas"]["closure_gap_m"] > 0
    areas = raw["deltas"]["area_m2"]
    assert areas["raw"] > 30 and areas["processed"] > 30
    assert abs(areas["delta"] - (areas["processed"] - areas["raw"])) < 1e-3


def test_raw_values_are_rounded_not_full_float_repr():
    raw = _raw_of(_REAL_1)
    numbers = (
        [v for c in raw["corners"] for v in c]
        + raw["wall_lengths"] + raw["wall_heights"] + [raw["ceiling_h"], raw["floor_y"]]
        + [o["width"] for o in raw["openings"]]
    )
    assert numbers and all(round(v, 4) == v for v in numbers)


def test_raw_keeps_the_ceiling_and_opening_sizes_the_clamps_trim():
    """A too-tall room with an over-wide window: processed hits the caps, raw doesn't."""
    from app.schemas.room_scan import CapturedRoom, ScanSurface, ScanTransform, Vec3

    def transform(tx: float, ty: float, tz: float, along_x: bool = True):
        m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1]
        if not along_x:
            m[0], m[2] = 0.0, 1.0                     # wall runs along Z
        return ScanTransform(m=[float(v) for v in m])

    h = 6.0                                           # above the 5.0 m ceiling cap
    room = CapturedRoom(
        walls=[
            ScanSurface(dimensions=Vec3(x=8.0, y=h, z=0.1), transform=transform(4, 0, 0)),
            ScanSurface(dimensions=Vec3(x=6.0, y=h, z=0.1), transform=transform(8, 0, 3, False)),
            ScanSurface(dimensions=Vec3(x=8.0, y=h, z=0.1), transform=transform(4, 0, 6)),
            ScanSurface(dimensions=Vec3(x=6.0, y=h, z=0.1), transform=transform(0, 0, 3, False)),
        ],
        windows=[ScanSurface(
            dimensions=Vec3(x=6.5, y=4.0, z=0.1),     # wider/taller than the caps
            transform=transform(4, 0, 0),
        )],
    )
    conv = convert_captured_room(room)
    raw = conv.raw

    assert conv.ceiling_h == 5.0 and raw["ceiling_h"] == 6.0
    assert raw["deltas"]["ceiling_h"] == -1.0

    window = next(e for e in _elements(conv) if e.type == "deraza")
    assert window.width == 5.0 and window.height == 3.5          # clamped
    raw_window = next(o for o in raw["openings"] if o["type"] == "deraza")
    assert raw_window["width"] == 6.5 and raw_window["height"] == 4.0


def test_raw_corner_count_survives_collinear_removal():
    """A near-straight corner is dropped by `_remove_collinear`; raw keeps it."""
    from app.schemas.room_scan import CapturedRoom, ScanSurface, ScanTransform, Vec3

    def wall(x0, z0, x1, z1):
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        dx, dz = x1 - x0, z1 - z0
        length = (dx * dx + dz * dz) ** 0.5
        m = [dx / length, 0, dz / length, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 0, cz, 1]
        return ScanSurface(dimensions=Vec3(x=length, y=2.5, z=0.1),
                           transform=ScanTransform(m=[float(v) for v in m]))

    # A rectangle whose bottom edge is split in two by an almost-straight corner.
    room = CapturedRoom(walls=[
        wall(0, 0, 4, 0.02), wall(4, 0.02, 8, 0), wall(8, 0, 8, 6),
        wall(8, 6, 0, 6), wall(0, 6, 0, 0),
    ])
    conv = convert_captured_room(room)
    counts = conv.raw["deltas"]["corner_count"]
    assert counts["raw"] == 5
    assert counts["processed"] == len(conv.corners) == 4
    assert len(conv.raw["corners"]) == 5
    # Wall-by-wall deltas make no sense once a corner is gone, so they're omitted.
    assert conv.raw["deltas"]["wall_length"] is None


def test_raw_capture_does_not_disturb_the_processed_geometry():
    """The tidy polygon is exactly `_straighten`'s output — raw is bookkeeping."""
    from app.services.room_scan_converter import (
        _build_corners, _min_corner, _straighten,
    )
    room = parse_captured_room(json.loads(_REAL_2.read_text()))
    expected = _straighten(_build_corners(room.walls))
    origin = _min_corner(expected)
    expected = [(c[0] - origin[0], c[1] - origin[1]) for c in expected]
    assert convert_captured_room(room).corners == expected

# ── position-0 end of a wall ──────────────────────────────────────────────
# `WallElement.position` is a 0..1 fraction from `corners[i]` toward
# `corners[i + 1]` — polygon traversal order. The studio used to read it from
# whichever endpoint had the smaller coordinate on the edge's dominant axis,
# which names the same point only on an edge that happens to run the increasing
# way; a closed loop must run each axis in both directions, so openings on the
# other edges rendered at the far end of their wall (0.92 m out on the real
# scan below, a full metre on the shared fixture). The studio now measures from
# `vertices[i]` too (frontend/src/lib/wallDefsFromVertices.ts and
# planPolygon.ts carry the reasoning); these pin this side of that contract, so
# flipping the converter breaks loudly instead of silently mirroring every
# scanned room's doors and windows.

def _scan_origin(room) -> tuple[float, float]:
    """The world→polygon shift `convert_captured_room` applies to everything."""
    corners = _straighten_traced(_build_corners(room.walls))[0]
    return _min_corner(corners)


def _scanned_openings(room) -> list[tuple[str, tuple[float, float]]]:
    """(element type, plane centre) for every opening the scan carries."""
    typed = ([("eshik", d) for d in room.doors]
             + [("deraza", w) for w in room.windows]
             + [("eshik", o) for o in room.openings])  # door-less pass-through
    return [(t, (s.transform.m[12], s.transform.m[14])) for t, s in typed]


def _position_point(corners, wall_index: int, position: float) -> tuple[float, float]:
    """The plane point `position` names, read the way the converter writes it."""
    n = len(corners)
    (ax, ay), (bx, by) = corners[wall_index], corners[(wall_index + 1) % n]
    return (ax + (bx - ax) * position, ay + (by - ay) * position)


def test_position_is_measured_from_the_wall_s_first_corner():
    """Every stored position must name the point the scan actually saw.

    Slop is 0.25 m: `_straighten` rounds wall lengths to 5 cm and snaps near-
    square angles, so a corner moves a little. A mirrored reading would be out
    by metres, not centimetres.
    """
    for path in (_FIXTURE, _REAL_2, _REAL_1):
        room = parse_captured_room(json.loads(path.read_text()))
        conv = convert_captured_room(room)
        ox, oy = _scan_origin(room)
        scanned = [(t, (x - ox, y - oy)) for t, (x, y) in _scanned_openings(room)]
        for wall_index, wall in enumerate(conv.geometry.walls):
            for el in wall.elements:
                pt = _position_point(conv.corners, wall_index, el.position)
                off = min(math.dist(pt, c) for t, c in scanned if t == el.type)
                assert off < 0.25, f"{path.name} wall {wall_index} {el.type}: {off:.3f} m off"


def test_a_decreasing_direction_edge_is_not_mirrored():
    """The case the old studio reading got wrong, stated as a number.

    Shared fixture: corners (0,0) (4,0) (4,3) (0,3); the window sits at x = 2.5
    on wall 2, which runs (4,3) → (0,3) — decreasing on X. Position must be
    0.375 (1.5 m from the x = 4 end), not 0.625 (1.5 m from the x = 0 end).
    """
    conv = _load()
    window_wall = next(i for i, w in enumerate(conv.geometry.walls)
                       if any(e.type == "deraza" for e in w.elements))
    assert window_wall == 2
    window = next(e for e in conv.geometry.walls[2].elements if e.type == "deraza")
    assert abs(window.position - 0.375) < 1e-6
    x, y = _position_point(conv.corners, 2, window.position)
    assert abs(x - 2.5) < 1e-6 and abs(y - 3.0) < 1e-6


def test_position_marks_the_opening_s_centre_not_an_edge():
    """The other half of the convention: WHICH point of the opening it names.

    `test_position_is_measured_from_the_wall_s_first_corner` above allows 0.25 m
    of straightening slop, which is wider than a narrow window's half-width — so
    it pins the direction but not the reference point. This one is exact, on the
    synthetic fixture where straightening is a no-op, and names the wrong answer
    as well as the right one: reading `position` as the opening's LEFT EDGE (what
    the studio store's millimetre field means) puts the door's centre half a
    width — 450 mm — further along the wall. See the comment on
    `WallElement.position` in app/schemas/room.py.
    """
    conv = _load()
    door = next(e for w in conv.geometry.walls for e in w.elements if e.type == "eshik")
    door_wall = next(i for i, w in enumerate(conv.geometry.walls)
                     if any(e.type == "eshik" for e in w.elements))

    # Fixture door: transform translation (−0.8, ·, −1.5); the converter shifts
    # the polygon so its bbox min corner (−2, −1.5) is the origin, putting the
    # door's centre 1.2 m along wall 0, which runs (0,0) → (4,0).
    assert door_wall == 0
    assert _position_point(conv.corners, door_wall, door.position) == (1.2, 0.0)
    assert abs(door.position - 0.3) < 1e-9

    left_edge_fraction = (1.2 - door.width / 2) / conv.geometry.walls[0].length
    assert abs(door.position - left_edge_fraction) > 0.1  # 0.30 vs 0.1875
