"""Unit tests for the parametric room-scan → GLB builder (`app.core.room_scan_glb`).

These replace the old usd-core round-trip tests. There is no USD reader any more:
Pixar's manylinux binaries SIGILL on the production VPS's SSE4.2-less QEMU vCPU
(prod logged `usdz_to_glb: failed rc=-4`), so the overlay is built from the
parametric scan data with numpy + trimesh only — both of which do run there.
"""
import ast
import io
import json
import math
import os
import struct

import pytest

trimesh = pytest.importorskip("trimesh")

from app.core import room_scan_glb as rsg  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "captured_room_sample.json")

# A 4 m × 3 m room — matches the converted fixture used at the bottom.
SQUARE = {"vertices": [[0.0, 0.0], [4.0, 0.0], [4.0, 3.0], [0.0, 3.0]]}


def _walls(elements_per_edge):
    """A ``geometry.walls`` list for SQUARE, one entry per polygon edge."""
    return [{"id": str(i), "length": 4.0 if i % 2 == 0 else 3.0, "elements": els}
            for i, els in enumerate(elements_per_edge)]


def _boxes(mesh):
    """Per-box AABBs. Each slab/panel is exactly 12 faces and every wall in
    these fixtures is axis aligned, so the AABB *is* the box (the image has no
    rtree/scipy, hence no ray or connected-component backend)."""
    tri = mesh.triangles
    return [(tri[i:i + 12].reshape(-1, 3).min(0), tri[i:i + 12].reshape(-1, 3).max(0))
            for i in range(0, len(tri), 12)]


def _solid_at(mesh, point):
    import numpy as np
    p = np.array(point, dtype=float)
    return any(bool(((p >= lo - 1e-9) & (p <= hi + 1e-9)).all()) for lo, hi in _boxes(mesh))


def _load(data: bytes):
    scene = trimesh.load(io.BytesIO(data), file_type="glb", force="scene")
    return trimesh.util.concatenate(tuple(scene.geometry.values()))


# --------------------------------------------------------------------------
# defensive coercion
# --------------------------------------------------------------------------

def test_f_coerces_and_rejects_nonsense():
    assert rsg._f("2.5") == 2.5
    assert rsg._f(None, 1.0) == 1.0
    assert rsg._f(float("nan"), 7.0) == 7.0
    assert rsg._f(float("inf"), 7.0) == 7.0
    assert rsg._f(True, 3.0) == 3.0  # bools are not dimensions


def test_extent_clamps_to_a_plausible_range():
    assert rsg._extent(1.2) == 1.2
    assert rsg._extent(0.0) is None
    assert rsg._extent(1e6) is None
    assert rsg._extent("nope") is None


def test_vertices_are_read_defensively():
    assert rsg._vertices_from(None) == []
    assert rsg._vertices_from({"walls": []}) == []
    assert rsg._vertices_from({"vertices": [[1, 2], "junk", [3]]}) == [(1.0, 2.0)]


# --------------------------------------------------------------------------
# placement maths
# --------------------------------------------------------------------------

def test_y_rotation_maps_local_x_onto_the_plane_direction():
    import numpy as np

    # A quarter turn about +Y sends local +X to -Z (glTF is right-handed, Y up).
    got = rsg._y_rotation(math.pi / 2) @ np.array([1.0, 0.0, 0.0, 1.0])
    assert got[0] == pytest.approx(0.0, abs=1e-9)
    assert got[2] == pytest.approx(-1.0)


def test_object_box_sits_on_the_floor_at_its_stored_position():
    mesh = rsg._object_mesh(
        {"x": 2.0, "y": 1.5, "width": 1.2, "depth": 0.8, "height": 0.75, "rotation": 0.0}
    )
    lo, hi = mesh.bounds
    assert lo[1] == pytest.approx(0.0) and hi[1] == pytest.approx(0.75)
    assert (lo[0], hi[0]) == pytest.approx((2.0 - 0.6, 2.0 + 0.6))
    assert (lo[2], hi[2]) == pytest.approx((1.5 - 0.4, 1.5 + 0.4))


def test_object_rotation_swaps_the_footprint():
    # A quarter turn puts the 1.2 m width along Z and the 0.8 m depth along X.
    mesh = rsg._object_mesh(
        {"x": 0.0, "y": 0.0, "width": 1.2, "depth": 0.8, "height": 0.5,
         "rotation": math.pi / 2}
    )
    lo, hi = mesh.bounds
    assert (hi[0] - lo[0]) == pytest.approx(0.8, abs=1e-6)
    assert (hi[2] - lo[2]) == pytest.approx(1.2, abs=1e-6)


def test_object_mesh_rejects_missing_or_absurd_dimensions():
    assert rsg._object_mesh("not a dict") is None
    assert rsg._object_mesh({"width": 1.0, "depth": 1.0}) is None          # no height
    assert rsg._object_mesh({"width": 0.0, "depth": 1.0, "height": 1.0}) is None


def test_wall_slabs_are_one_per_edge_and_reach_the_ceiling():
    meshes = rsg._wall_meshes([(0, 0), (4, 0), (4, 3), (0, 3)], 2.5)
    assert len(meshes) == 4
    for m in meshes:
        lo, hi = m.bounds
        assert lo[1] == pytest.approx(0.0) and hi[1] == pytest.approx(2.5)


def test_wall_slabs_skip_degenerate_edges():
    # duplicate vertex → a zero-length edge, which must not become a box
    assert len(rsg._wall_meshes([(0, 0), (0, 0), (4, 0), (4, 3)], 2.5)) == 3


# --------------------------------------------------------------------------
# build_room_scan_glb — happy path
# --------------------------------------------------------------------------

def test_room_glb_has_gltf_magic_and_matching_bounds():
    data = rsg.build_room_scan_glb(SQUARE, 2.5, [])
    assert data
    magic, version, length = struct.unpack("<4sII", data[:12])
    assert magic == b"glTF" and version == 2 and length == len(data)

    mesh = _load(data)
    # 4 wall slabs, each a box: 8 verts / 12 faces.
    assert len(mesh.faces) == 4 * 12
    lo, hi = mesh.bounds
    half = rsg.WALL_THICKNESS_M / 2
    assert (lo[0], hi[0]) == pytest.approx((-half, 4.0 + half))
    assert (lo[2], hi[2]) == pytest.approx((-half, 3.0 + half))
    assert (lo[1], hi[1]) == pytest.approx((0.0, 2.5))


def test_objects_add_one_ghost_box_each():
    objects = [
        {"x": 2.0, "y": 1.5, "width": 1.2, "depth": 0.8, "height": 0.75,
         "rotation": 0.0, "category": "table"},
        {"x": 2.6, "y": 1.8, "width": 0.5, "depth": 0.5, "height": 0.9,
         "rotation": 0.0, "category": "chair"},
    ]
    bare = _load(rsg.build_room_scan_glb(SQUARE, 2.5, []))
    full = _load(rsg.build_room_scan_glb(SQUARE, 2.5, objects))
    assert len(full.faces) - len(bare.faces) == 2 * 12


def test_glb_carries_no_textures():
    # The studio tints the overlay itself; image data would be dead weight.
    raw = rsg.build_room_scan_glb(SQUARE, 2.5, [])
    assert b"baseColorTexture" not in raw and b'"images"' not in raw


# --------------------------------------------------------------------------
# build_room_scan_glb — never-raise contract
# --------------------------------------------------------------------------

@pytest.mark.parametrize("geometry", [None, {}, {"vertices": None}, {"vertices": [[0, 0], [1, 1]]}])
def test_bad_geometry_returns_none(geometry):
    assert rsg.build_room_scan_glb(geometry, 2.5, []) is None


@pytest.mark.parametrize("ceiling", [None, 0.0, -2.0, 99.0, "tall", float("nan")])
def test_bad_ceiling_returns_none(ceiling):
    assert rsg.build_room_scan_glb(SQUARE, ceiling, []) is None


def test_garbage_objects_are_skipped_not_fatal():
    data = rsg.build_room_scan_glb(SQUARE, 2.5, ["junk", None, {"width": 1}, 42])
    assert data and len(_load(data).faces) == 4 * 12


def test_objects_may_be_none():
    assert rsg.build_room_scan_glb(SQUARE, 2.5, None)


# --------------------------------------------------------------------------
# build_object_glb
# --------------------------------------------------------------------------

def test_object_glb_is_a_local_frame_box_on_the_floor():
    data = rsg.build_object_glb(
        {"x": 9.0, "y": 9.0, "width": 1.2, "depth": 0.8, "height": 0.75,
         "rotation": 1.0, "category": "table"}
    )
    assert data and data[:4] == b"glTF"
    lo, hi = _load(data).bounds
    # placed at its own origin, unrotated — the studio positions it
    assert (lo[0], hi[0]) == pytest.approx((-0.6, 0.6))
    assert (lo[2], hi[2]) == pytest.approx((-0.4, 0.4))
    assert (lo[1], hi[1]) == pytest.approx((0.0, 0.75))


def test_object_glb_returns_none_for_junk():
    assert rsg.build_object_glb(None) is None
    assert rsg.build_object_glb({"width": 1.0}) is None


# --------------------------------------------------------------------------
# end to end from the real RoomPlan fixture (no USD involved)
# --------------------------------------------------------------------------

def test_fixture_roundtrip_matches_the_converted_room():
    from app.schemas.room_scan import parse_captured_room
    from app.services.room_scan_converter import convert_captured_room

    with open(FIXTURE) as fh:
        conv = convert_captured_room(parse_captured_room(json.load(fh)))

    objects = [
        {"category": o.category, "x": o.x, "y": o.y, "width": o.width,
         "depth": o.depth, "height": o.height, "rotation": o.rotation_rad}
        for o in conv.objects
    ]
    data = rsg.build_room_scan_glb(conv.geometry.model_dump(), conv.ceiling_h, objects)
    assert data and data[:4] == b"glTF"

    mesh = _load(data)
    lo, hi = mesh.bounds
    half = rsg.WALL_THICKNESS_M / 2
    xs = [v[0] for v in conv.geometry.vertices]
    zs = [v[1] for v in conv.geometry.vertices]
    assert lo[0] == pytest.approx(min(xs) - half)
    assert hi[0] == pytest.approx(max(xs) + half)
    assert lo[2] == pytest.approx(min(zs) - half)
    assert hi[2] == pytest.approx(max(zs) + half)
    assert (lo[1], hi[1]) == pytest.approx((0.0, conv.ceiling_h))
    # One box per object, and one box per wall panel: the fixture's walls carry
    # a door and a window, so two of the slabs are split (see the opening tests
    # below for what the panels are).
    panels = sum(
        len(rsg._panels(
            math.dist(conv.geometry.vertices[i], conv.geometry.vertices[(i + 1) % len(conv.geometry.vertices)]),
            conv.ceiling_h,
            rsg._holes_1d(
                w["elements"],
                math.dist(conv.geometry.vertices[i], conv.geometry.vertices[(i + 1) % len(conv.geometry.vertices)]),
                conv.ceiling_h),
        ))
        for i, w in enumerate(conv.geometry.model_dump()["walls"])
    )
    assert panels > len(conv.geometry.vertices)  # something really was cut
    assert len(mesh.faces) == (panels + len(objects)) * 12


def test_module_imports_no_usd_library():
    """Regression guard: a USD import here SIGILLs the production converter."""
    with open(rsg.__file__) as fh:
        tree = ast.parse(fh.read())
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module.split(".")[0])
    assert "pxr" not in names


# --------------------------------------------------------------------------
# openings (doors / windows) are cut out of the wall slabs
# --------------------------------------------------------------------------

DOOR = {"type": "eshik", "width": 0.9, "height": 2.1, "sill_height": 0.0, "position": 0.25}
WINDOW = {"type": "deraza", "width": 1.5, "height": 1.2, "sill_height": 0.9, "position": 0.5}


def test_holes_are_mapped_into_the_wall_local_frame():
    (u0, u1, v0, v1), = rsg._holes_1d([WINDOW], 4.0, 2.5)
    assert (u0, u1) == pytest.approx((2.0 - 0.75, 2.0 + 0.75))
    assert (v0, v1) == pytest.approx((0.9, 2.1))


def test_holes_are_clamped_to_the_wall_and_ceiling():
    # An opening wider than the wall (production really produces these) and one
    # taller than the room must not spill outside the slab.
    (u0, u1, v0, v1), = rsg._holes_1d(
        [{"type": "deraza", "width": 4.0, "height": 3.0, "sill_height": 0.5, "position": 0.5}],
        2.0, 2.5,
    )
    assert (u0, u1) == pytest.approx((0.0, 2.0))
    assert (v0, v1) == pytest.approx((0.5, 2.5))


def test_degenerate_openings_are_ignored():
    assert rsg._holes_1d([{"width": 0.0, "height": 2.0}], 4.0, 2.5) == []
    assert rsg._holes_1d([{"width": "junk", "height": "junk"}], 4.0, 2.5) == []
    # position 1.0 with a tiny width leaves nothing inside the wall
    assert rsg._holes_1d(
        [{"width": 0.3, "height": 2.0, "position": 1.0, "sill_height": 2.5}], 4.0, 2.5) == []


def test_a_wall_without_openings_is_still_one_panel():
    assert rsg._panels(4.0, 2.5, []) == [(0.0, 4.0, 0.0, 2.5)]


def test_a_door_splits_the_wall_into_left_right_and_lintel():
    panels = rsg._panels(4.0, 2.5, rsg._holes_1d([DOOR], 4.0, 2.5))
    assert sorted(tuple(round(x, 4) for x in p) for p in panels) == [
        (0.0, 0.55, 0.0, 2.5),    # left of the door, full height
        (0.55, 1.45, 2.1, 2.5),   # over the lintel
        (1.45, 4.0, 0.0, 2.5),    # right of the door, full height
    ]


def test_a_window_also_leaves_a_panel_under_the_sill():
    panels = rsg._panels(4.0, 2.5, rsg._holes_1d([WINDOW], 4.0, 2.5))
    assert sorted(tuple(round(x, 4) for x in p) for p in panels) == [
        (0.0, 1.25, 0.0, 2.5),
        (1.25, 2.75, 0.0, 0.9),   # under the sill
        (1.25, 2.75, 2.1, 2.5),   # over the head
        (2.75, 4.0, 0.0, 2.5),
    ]


def test_overlapping_openings_merge_instead_of_doubling_up():
    # Two windows whose spans overlap must leave one hole, not two panels on
    # top of each other — the reason the cut is a split, not a CSG union.
    holes = rsg._holes_1d(
        [{"width": 2.0, "height": 1.0, "sill_height": 1.0, "position": 0.375},
         {"width": 2.0, "height": 1.0, "sill_height": 1.2, "position": 0.5}], 4.0, 2.5)
    panels = rsg._panels(4.0, 2.5, holes)
    assert all(b > a for a, b, _, _ in panels)
    assert all(d > c for _, _, c, d in panels)
    total = sum((b - a) * (d - c) for a, b, c, d in panels)
    assert total < 4.0 * 2.5  # strictly less area than the solid wall


def test_a_full_height_full_width_opening_removes_the_wall():
    assert rsg._panels(2.0, 2.5, rsg._holes_1d(
        [{"width": 5.0, "height": 3.5, "sill_height": 0.0, "position": 0.5}], 2.0, 2.5)) == []


def test_wall_elements_follow_the_vertex_to_wall_index():
    geometry = {**SQUARE, "walls": _walls([[DOOR], [], [WINDOW], []])}
    assert rsg._wall_elements(geometry, 4) == [[DOOR], [], [WINDOW], []]


def test_wall_elements_are_ignored_when_the_counts_disagree():
    # POST /rooms/{id}/walls can append a wall without adding a vertex; cutting
    # then would punch the wrong edge, so we draw plain slabs instead.
    geometry = {**SQUARE, "walls": _walls([[DOOR], [], [WINDOW], []]) + [{"id": "4", "length": 2.0, "elements": [DOOR]}]}
    assert rsg._wall_elements(geometry, 4) == [[], [], [], []]
    assert rsg._wall_elements({"vertices": SQUARE["vertices"]}, 4) == [[], [], [], []]
    assert rsg._wall_elements(None, 3) == [[], [], []]


def test_wall_elements_tolerate_junk_entries():
    geometry = {**SQUARE, "walls": ["junk", {"elements": "nope"}, {}, {"elements": [DOOR, 7]}]}
    assert rsg._wall_elements(geometry, 4) == [[], [], [], [DOOR]]


def test_glb_gains_panels_and_a_real_hole_for_each_opening():
    plain = {**SQUARE, "walls": _walls([[], [], [], []])}
    punched = {**SQUARE, "walls": _walls([[DOOR], [WINDOW], [], []])}

    bare = _load(rsg.build_room_scan_glb(plain, 2.5, []))
    holed = _load(rsg.build_room_scan_glb(punched, 2.5, []))
    # 4 slabs → 3 panels (door wall) + 4 panels (window wall) + 2 plain = 9
    assert len(bare.faces) == 4 * 12
    assert len(holed.faces) == 9 * 12

    # door on edge 0 ((0,0)→(4,0), z = 0): centred at x = 1.0, 0.9 wide, 2.1 tall
    assert _solid_at(bare, (1.0, 1.0, 0.0)) and not _solid_at(holed, (1.0, 1.0, 0.0))
    assert _solid_at(holed, (1.0, 2.3, 0.0))   # over the lintel
    assert _solid_at(holed, (0.2, 1.0, 0.0))   # left of the door
    assert _solid_at(holed, (2.0, 1.0, 0.0))   # right of the door

    # window on edge 1 ((4,0)→(4,3), x = 4): centred at z = 1.5, sill 0.9
    assert not _solid_at(holed, (4.0, 1.5, 1.5))
    assert _solid_at(holed, (4.0, 0.4, 1.5))   # under the sill
    assert _solid_at(holed, (4.0, 2.3, 1.5))   # over the head

    # the overlay's overall envelope is unchanged by the cut
    assert holed.bounds == pytest.approx(bare.bounds)


def test_production_window_shape_lands_where_the_numbers_say():
    """Room 078ff407-7586-483d-8fdc-7a861b283a80's real window: 3.99 m wide,
    1.85 m tall, sill 0.90, position 0.41 of a 4.84 m wall, 3.17 m ceiling.
    Its centre computes to 1.9844 m, so its left edge is 0.011 m *off* the wall
    and has to clamp."""
    el = {"type": "deraza", "width": 3.99, "height": 1.85,
          "sill_height": 0.90, "position": 0.41}
    (u0, u1, v0, v1), = rsg._holes_1d([el], 4.84, 3.17)
    assert (u0, u1) == pytest.approx((0.0, 3.9794), abs=1e-4)
    assert (v0, v1) == pytest.approx((0.90, 2.75))

    geometry = {
        "vertices": [[0.0, 0.0], [4.84, 0.0], [4.84, 4.0], [0.0, 4.0]],
        "walls": [{"id": "0", "length": 4.84, "elements": [el]},
                  {"id": "1", "length": 4.0, "elements": []},
                  {"id": "2", "length": 4.84, "elements": []},
                  {"id": "3", "length": 4.0, "elements": []}],
    }
    mesh = _load(rsg.build_room_scan_glb(geometry, 3.17, []))
    assert len(mesh.faces) == 6 * 12  # 3 panels on the punched wall + 3 slabs
    # inside the opening: empty. Just outside it in every direction: solid.
    assert not _solid_at(mesh, (2.0, 1.8, 0.0))
    assert _solid_at(mesh, (2.0, 0.5, 0.0))     # under the sill
    assert _solid_at(mesh, (2.0, 3.0, 0.0))     # over the head
    assert _solid_at(mesh, (4.4, 1.8, 0.0))     # the 0.86 m panel right of it
    # clamped flush to the wall start: no panel is left of the opening
    panels = rsg._panels(4.84, 3.17, rsg._holes_1d([el], 4.84, 3.17))
    assert min(p[0] for p in panels) == 0.0
    assert not any(p[1] <= 0.0106 for p in panels)


def test_fixture_room_gets_its_door_and_window_cut_out():
    from app.schemas.room_scan import parse_captured_room
    from app.services.room_scan_converter import convert_captured_room

    with open(FIXTURE) as fh:
        conv = convert_captured_room(parse_captured_room(json.load(fh)))
    geometry = conv.geometry.model_dump()
    openings = [e for w in geometry["walls"] for e in w["elements"]]
    assert len(openings) == 2  # the fixture has one door and one window

    holed = _load(rsg.build_room_scan_glb(geometry, conv.ceiling_h, []))
    plain = _load(rsg.build_room_scan_glb(
        {**geometry, "walls": [{**w, "elements": []} for w in geometry["walls"]]},
        conv.ceiling_h, []))
    assert len(holed.faces) > len(plain.faces)
    assert holed.bounds == pytest.approx(plain.bounds)
