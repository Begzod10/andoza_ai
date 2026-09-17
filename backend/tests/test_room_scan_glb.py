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
    assert len(mesh.faces) == (len(conv.geometry.vertices) + len(objects)) * 12


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
