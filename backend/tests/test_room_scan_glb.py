"""Unit tests for the pure-Python USDZ→GLB converter (`app.core.room_scan_glb`).

The geometry helpers are exercised directly (no USD needed). The end-to-end
round-trip needs `pxr`, which has no linux-aarch64 wheel, so it is skipped when
usd-core is absent rather than failing on arm64 dev machines.
"""
import os
import struct

import pytest

from app.core import room_scan_glb as rsg


# --------------------------------------------------------------------------
# triangulation
# --------------------------------------------------------------------------

def test_triangulate_quad_fans_into_two_triangles():
    assert rsg._triangulate([4], [0, 1, 2, 3]) == [(0, 1, 2), (0, 2, 3)]


def test_triangulate_mixed_counts_tracks_the_cursor():
    # one triangle, then one quad
    assert rsg._triangulate([3, 4], [0, 1, 2, 3, 4, 5, 6]) == [
        (0, 1, 2),
        (3, 4, 5),
        (3, 5, 6),
    ]


def test_triangulate_skips_degenerate_and_truncated_faces():
    assert rsg._triangulate([2], [0, 1]) == []          # fewer than 3 corners
    assert rsg._triangulate([4], [0, 1, 2]) == []       # index run truncated


# --------------------------------------------------------------------------
# axis / unit normalisation
# --------------------------------------------------------------------------

def test_y_up_stage_only_scales_to_metres():
    assert rsg._stage_to_gltf_axes([(1.0, 2.0, 3.0)], "Y", 0.01) == [(0.01, 0.02, 0.03)]


def test_z_up_stage_is_rotated_onto_gltf_y_up():
    # USD Z-up (x, y, z) -> glTF Y-up (x, z, -y)
    assert rsg._stage_to_gltf_axes([(1.0, 2.0, 3.0)], "Z", 1.0) == [(1.0, 3.0, -2.0)]


# --------------------------------------------------------------------------
# never-raise contract
# --------------------------------------------------------------------------

def test_missing_input_returns_false_and_does_not_raise(tmp_path):
    out = tmp_path / "out.glb"
    assert rsg.usdz_to_glb(str(tmp_path / "nope.usdz"), str(out)) is False
    assert not out.exists()


def test_garbage_input_returns_false_and_does_not_raise(tmp_path):
    src = tmp_path / "junk.usdz"
    src.write_bytes(b"this is definitely not a USD archive")
    assert rsg.usdz_to_glb(str(src), str(tmp_path / "out.glb")) is False


# --------------------------------------------------------------------------
# end-to-end (needs usd-core: no linux-aarch64 wheel exists)
# --------------------------------------------------------------------------

def test_roundtrip_usdz_to_glb(tmp_path):
    pytest.importorskip("pxr", reason="usd-core not installed (no linux-aarch64 wheel)")
    pytest.importorskip("trimesh")
    from pxr import Gf, Sdf, Usd, UsdGeom, UsdUtils

    usda = tmp_path / "scene.usda"
    stage = Usd.Stage.CreateNew(str(usda))
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y)
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)

    quad = UsdGeom.Mesh.Define(stage, "/Room/Floor")
    quad.CreatePointsAttr([(-1, 0, -1), (1, 0, -1), (1, 0, 1), (-1, 0, 1)])
    quad.CreateFaceVertexCountsAttr([4])
    quad.CreateFaceVertexIndicesAttr([0, 1, 2, 3])
    UsdGeom.XformCommonAPI(quad).SetTranslate(Gf.Vec3d(10, 0, 0))

    hidden = UsdGeom.Mesh.Define(stage, "/Room/Hidden")
    hidden.CreatePointsAttr([(0, 0, 0), (1, 0, 0), (0, 1, 0)])
    hidden.CreateFaceVertexCountsAttr([3])
    hidden.CreateFaceVertexIndicesAttr([0, 1, 2])
    UsdGeom.Imageable(hidden).CreateVisibilityAttr(UsdGeom.Tokens.invisible)

    stage.GetRootLayer().Save()
    usdz = tmp_path / "scan.usdz"
    assert UsdUtils.CreateNewUsdzPackage(Sdf.AssetPath(str(usda)), str(usdz))

    glb = tmp_path / "scan.glb"
    assert rsg.usdz_to_glb(str(usdz), str(glb)) is True

    with open(glb, "rb") as fh:
        magic, version, _length = struct.unpack("<4sII", fh.read(12))
    assert magic == b"glTF" and version == 2
    assert os.path.getsize(glb) > 0

    import trimesh

    scene = trimesh.load(str(glb), force="scene")
    mesh = trimesh.util.concatenate(tuple(scene.geometry.values()))
    # the quad fans into 2 triangles; the invisible prim is dropped
    assert len(mesh.faces) == 2
    assert len(mesh.vertices) == 4
    # and it kept its world translation of +10 in x
    assert mesh.bounds[0][0] == pytest.approx(9.0)
    assert mesh.bounds[1][0] == pytest.approx(11.0)
