"""The riser finder, on the numbers of a real scan.

`WALLS` and `OBJECTS` are the surfaces of a real new-build room scanned with
RoomPlan (31.6 m2, ceiling 3.15 m): four room walls over 5 m, plus a 24 cm
piece of wall 2.85 m high; and, among its furniture, a 40 x 33 cm box 2.28 m
high in a corner. Those two are the plumbing riser; the 1.06 x 2.35 x 0.42 m
"storage" is a wardrobe-sized niche and must NOT be called a pipe.
"""
from __future__ import annotations

from app.schemas.room_scan import CapturedRoom, ScanObject, ScanObjectCategory, ScanSurface, ScanTransform, Vec3
from app.services.room_scan_converter import convert_captured_room

WALLS = [{"dims": [5.6494, 3.1456, 0.0], "t": [0.7667, 0.0, -0.642, 0.0, 0.0, 1.0, 0.0, 0.0, 0.642, 0.0, 0.7667, 0.0, -1.8631, 0.9167, -4.8365, 1.0]}, {"dims": [5.5372, 3.1456, 0.0], "t": [0.642, 0.0, 0.7667, 0.0, 0.0, 1.0, 0.0, 0.0, -0.7667, 0.0, 0.642, 0.0, 2.0801, 0.9167, -4.5274, 1.0]}, {"dims": [0.2362, 2.85, 0.0], "t": [-0.4467, 0.0, 0.8947, 0.0, 0.0, 1.0, 0.0, 0.0, -0.8947, 0.0, -0.4467, 0.0, 3.8049, 0.7689, -2.2992, 1.0]}, {"dims": [5.6314, 3.1456, 0.0], "t": [-0.642, 0.0, -0.7667, 0.0, 0.0, 1.0, 0.0, 0.0, 0.7667, 0.0, -0.642, 0.0, -2.221, 0.9167, -0.8642, 1.0]}, {"dims": [5.4329, 3.1456, 0.0], "t": [-0.7667, 0.0, 0.642, 0.0, 0.0, 1.0, 0.0, 0.0, -0.642, 0.0, -0.7667, 0.0, 1.6695, 0.9167, -0.4495, 1.0]}]
OBJECTS = [{"category": "chair", "dims": [0.6768, 0.7223, 0.6052], "t": [0.4629, 0.0, -0.8864, 0.0, 0.0, 1.0, 0.0, 0.0, 0.8864, 0.0, 0.4629, 0.0, -2.1238, -0.295, -3.7731, 1.0]}, {"category": "sofa", "dims": [2.1638, 0.7213, 0.7318], "t": [-0.7667, 0.0, 0.642, 0.0, 0.0, 1.0, 0.0, 0.0, -0.642, 0.0, -0.7667, 0.0, 0.1813, -0.2955, 0.3194, 1.0]}, {"category": "table", "dims": [1.21, 0.8112, 1.1514], "t": [-0.7667, 0.0, 0.642, 0.0, 0.0, 1.0, 0.0, 0.0, -0.642, 0.0, -0.7667, 0.0, 0.0437, -0.2506, -2.6846, 1.0]}, {"category": "storage", "dims": [1.0573, 2.3504, 0.425], "t": [0.7667, 0.0, -0.642, 0.0, 0.0, 1.0, 0.0, 0.0, 0.642, 0.0, 0.7667, 0.0, -3.487, 0.519, -3.1994, 1.0]}, {"category": "table", "dims": [1.3286, 0.8084, 0.6185], "t": [0.642, 0.0, 0.7667, 0.0, 0.0, 1.0, 0.0, 0.0, -0.7667, 0.0, 0.642, 0.0, 1.0934, -0.2519, -5.224, 1.0]}, {"category": "table", "dims": [2.171, 0.8015, 0.6604], "t": [0.7667, 0.0, -0.642, 0.0, 0.0, 1.0, 0.0, 0.0, 0.642, 0.0, 0.7667, 0.0, -0.9431, -0.2554, -5.1762, 1.0]}, {"category": "storage", "dims": [1.0841, 1.05, 0.2778], "t": [0.642, 0.0, 0.7667, 0.0, 0.0, 1.0, 0.0, 0.0, -0.7667, 0.0, 0.642, 0.0, 3.3794, -0.1311, -2.7596, 1.0]}, {"category": "storage", "dims": [0.4003, 2.2826, 0.3309], "t": [0.7667, 0.0, -0.642, 0.0, 0.0, 1.0, 0.0, 0.0, 0.642, 0.0, 0.7667, 0.0, 0.2553, 0.4852, -6.3947, 1.0]}, {"category": "chair", "dims": [0.614, 0.8365, 0.6597], "t": [-0.642, 0.0, -0.7667, 0.0, 0.0, 1.0, 0.0, 0.0, 0.7667, 0.0, -0.642, 0.0, -0.3443, -0.2379, -2.3597, 1.0]}, {"category": "chair", "dims": [0.5413, 0.7736, 0.5481], "t": [-0.6031, 0.0, -0.7977, 0.0, 0.0, 1.0, 0.0, 0.0, 0.7977, 0.0, -0.6031, 0.0, -2.7733, -0.2693, -2.5183, 1.0]}]


def _surface(w: dict) -> ScanSurface:
    return ScanSurface(dimensions=Vec3(x=w["dims"][0], y=w["dims"][1], z=w["dims"][2]), transform=ScanTransform(m=w["t"]))


def _room(extra_objects: list[dict] | None = None, drop_short_wall: bool = False) -> CapturedRoom:
    walls = [w for w in WALLS if not (drop_short_wall and w["dims"][0] < 0.8)]
    return CapturedRoom(
        walls=[_surface(w) for w in walls],
        objects=[
            ScanObject(category=ScanObjectCategory(o["category"]), dimensions=Vec3(x=o["dims"][0], y=o["dims"][1], z=o["dims"][2]),
                       transform=ScanTransform(m=o["t"]))
            for o in OBJECTS + (extra_objects or [])
        ],
    )


def _riser_sources(conv) -> set[str]:
    return {f["source"] for f in conv.features if f["kind"] == "riser"}


def test_finds_the_riser_piece_of_wall_next_to_the_corner():
    conv = convert_captured_room(_room())
    pieces = [f for f in conv.features if f["source"] == "short_wall"]
    assert len(pieces) == 1
    f = pieces[0]
    assert f["kind"] == "riser" and f["confidence"] == "high"
    assert abs(f["width"] - 0.236) < 0.01 and abs(f["height"] - 2.85) < 0.01


def test_finds_the_narrow_tall_box_in_the_corner_as_a_riser():
    conv = convert_captured_room(_room())
    boxes = [f for f in conv.features if f["source"] == "storage" and f["kind"] == "riser"]
    assert len(boxes) == 1
    f = boxes[0]
    assert abs(f["width"] - 0.4) < 0.01 and abs(f["depth"] - 0.33) < 0.01 and abs(f["height"] - 2.28) < 0.01
    assert f["confidence"] == "high"


def test_a_wardrobe_sized_niche_is_not_called_a_pipe():
    conv = convert_captured_room(_room())
    # the 1.06 x 2.35 x 0.42 box and the 1.08 x 1.05 x 0.28 panel are wall boxes at most
    kinds = [f["kind"] for f in conv.features if f["source"] == "storage" and f["width"] > 0.9]
    assert kinds and set(kinds) == {"wall_box"}
    assert all(f["confidence"] == "low" for f in conv.features if f["kind"] == "wall_box")


def test_furniture_in_the_middle_of_the_room_is_ignored():
    conv = convert_captured_room(_room(extra_objects=[
        {"category": "storage", "dims": [0.4, 2.3, 0.35], "t": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -0.08, 0.5, -2.67, 1]},
    ]))
    # a tall narrow box standing in the middle of the floor is no riser
    assert len([f for f in conv.features if f["kind"] == "riser" and f["source"] == "storage"]) == 1


def test_a_room_without_a_short_wall_has_no_wall_riser():
    conv = convert_captured_room(_room(drop_short_wall=True))
    assert "short_wall" not in _riser_sources(conv)


def test_features_do_not_change_the_geometry():
    with_features = convert_captured_room(_room())
    assert len(with_features.corners) == 4
    assert abs(with_features.ceiling_h - 3.15) < 0.01
