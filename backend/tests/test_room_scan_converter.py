"""Server converter parity — MUST match the Dart test
(`test/features/room_scan/room_scan_converter_test.dart`) on the SHARED fixture.
If you change one converter, change both and keep these expectations in sync.
"""
import json
from pathlib import Path

from app.schemas.room_scan import ScanObjectCategory, parse_captured_room
from app.services.room_scan_converter import convert_captured_room

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
