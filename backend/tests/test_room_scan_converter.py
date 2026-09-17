"""Server converter parity — MUST match the Dart test
(`test/features/room_scan/room_scan_converter_test.dart`) on the SHARED fixture.
If you change one converter, change both and keep these expectations in sync.

NOTE: the shared fixture's world origin was moved to device height (floor at
y = -1.25) so it matches what RoomPlan really emits; the Dart converter needs
the same floor-relative sill fix before its copy of this test can pass.
"""
import json
from pathlib import Path

from app.schemas.room_scan import ScanObjectCategory, parse_captured_room
from app.services.room_scan_converter import (
    _floor_level,
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
