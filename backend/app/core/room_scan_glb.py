"""Pure-Python USDZ → GLB converter for room scans.

Why there is no Blender here any more
-------------------------------------
This used to shell out to headless Blender (`bpy.ops.wm.usd_import` +
`export_scene.gltf`). That is dead on our production hardware: the VPS is a
QEMU guest whose virtual CPU ("QEMU Virtual CPU version 2.5+") does not expose
SSE4.2, and every official blender.org build refuses to start with
``Blender requires a CPU with SSE42 support``. Debian's apt Blender *does*
start, but is compiled without USD support, so `bpy.ops.wm.usd_import` does not
exist there. Both Blender routes are therefore unusable, and the conversion is
done in-process instead: `usd-core` (Pixar's OpenUSD, ships plain baseline
x86-64 manylinux wheels — no SSE4.2, no AVX) reads the USDZ, and `trimesh`
writes the GLB.

What the output is for
----------------------
The GLB is only ever used as a *translucent reference overlay* in the 3D
studio — the studio itself builds the real room from the parametric scan data.
So this converter deliberately carries geometry only: vertex positions,
triangles, and correct world placement (transforms, stage up-axis and
metersPerUnit). Materials, textures, UVs and normals are dropped on purpose;
they would cost size and complexity for something the user sees at low opacity.

CPU caveat, measured
--------------------
Disassembling usd-core's manylinux x86-64 .so files turns up zero SSE4.2 and
zero AVX opcodes, and the whole conversion below was run end-to-end under
``qemu-x86_64 -cpu qemu64,+rdtscp`` (no SSSE3/SSE4.1/SSE4.2/POPCNT/AVX) with
correct output. The read path below was then re-run under a *bare* ``-cpu
qemu64`` (which also lacks **RDTSCP**) and still produced a byte-identical GLB.
RDTSCP does appear in libusd (OpenUSD's Arch timing code) and a bare qemu64
vCPU SIGILLs on it — but only when *authoring* a new stage
(``Usd.Stage.CreateNew``), which this converter never does. The child process
below is the belt-and-braces for that: SIGILL cannot be caught, so if some
other USD path ever trips it, only the child dies and the scan just gets no
overlay instead of the Celery worker going down.

Best-effort, like the old wrapper: `usdz_to_glb` returns False rather than
raising, and the caller just leaves ``glb_path`` null.
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys

logger = logging.getLogger(__name__)

# The conversion runs in a short-lived child process (`python -m
# app.core.room_scan_glb <in> <out>`), keeping the same temp-file +
# bounded-timeout convention the Blender version used. That is not just habit:
# OpenUSD's timing code uses the RDTSCP instruction, and a bare QEMU `qemu64`
# vCPU does not expose it, so on such a host libusd dies with SIGILL — a signal
# no `except` can catch. Isolating it means the worst case is one dead child and
# a False return, never a killed Celery worker.
_TIMEOUT_S = int(os.environ.get("USDZ_TO_GLB_TIMEOUT", "180"))


def _iter_mesh_prims(stage):
    """Yield every visible, renderable UsdGeom.Mesh prim on the stage.

    Instance proxies are traversed too: RoomPlan-style exports (and anything
    referencing a shared asset) can put real geometry behind instanced prims,
    and the default predicate would walk straight past it.
    """
    from pxr import Usd, UsdGeom

    predicate = Usd.TraverseInstanceProxies(Usd.PrimDefaultPredicate)
    for prim in Usd.PrimRange.Stage(stage, predicate):
        if not prim.IsA(UsdGeom.Mesh):
            continue
        imageable = UsdGeom.Imageable(prim)
        if imageable:
            if imageable.ComputeVisibility() == UsdGeom.Tokens.invisible:
                continue
            if imageable.ComputePurpose() == UsdGeom.Tokens.guide:
                continue
        yield prim


def _triangulate(counts, indices):
    """Fan-triangulate USD ``faceVertexCounts``/``faceVertexIndices``.

    RoomPlan emits quads for walls/floors/openings and triangles for object
    meshes; a fan is exact for both, and for any convex n-gon. Degenerate faces
    (<3 corners) and truncated index runs are skipped rather than raising.
    """
    tris: list[tuple[int, int, int]] = []
    cursor = 0
    total = len(indices)
    for count in counts:
        if count < 3 or cursor + count > total:
            cursor += max(count, 0)
            continue
        base = indices[cursor]
        for k in range(1, count - 1):
            tris.append((base, indices[cursor + k], indices[cursor + k + 1]))
        cursor += count
    return tris


def _mesh_to_world(prim, time_code):
    """Return (world-space vertices, triangles) for one mesh prim, or None."""
    from pxr import Gf, UsdGeom

    mesh = UsdGeom.Mesh(prim)
    points = mesh.GetPointsAttr().Get(time_code)
    counts = mesh.GetFaceVertexCountsAttr().Get(time_code)
    indices = mesh.GetFaceVertexIndicesAttr().Get(time_code)
    if not points or not counts or not indices:
        return None

    tris = _triangulate(list(counts), list(indices))
    if not tris:
        return None

    # USD matrices are row-vector (p' = p * M), which is exactly what Gf's
    # Transform() applies — do not transpose.
    xform = UsdGeom.Xformable(prim).ComputeLocalToWorldTransform(time_code)
    verts = [tuple(xform.Transform(Gf.Vec3d(p[0], p[1], p[2]))) for p in points]

    # leftHanded meshes wind the other way; flip so glTF's CCW front faces hold.
    if mesh.GetOrientationAttr().Get(time_code) == UsdGeom.Tokens.leftHanded:
        tris = [(a, c, b) for (a, b, c) in tris]

    return verts, tris


def _stage_to_gltf_axes(verts, up_axis, scale):
    """Scale to metres and rotate the stage's up-axis onto glTF's +Y."""
    if up_axis == "Z":
        # USD Z-up (x, y, z) → glTF Y-up (x, z, -y).
        return [(x * scale, z * scale, -y * scale) for (x, y, z) in verts]
    return [(x * scale, y * scale, z * scale) for (x, y, z) in verts]


def _convert(in_path: str, out_path: str) -> bool:
    import trimesh
    from pxr import Usd, UsdGeom

    stage = Usd.Stage.Open(in_path)
    if stage is None:
        logger.warning("usdz_to_glb: USD could not open %s", in_path)
        return False

    time_code = Usd.TimeCode.EarliestTime()
    up_axis = UsdGeom.GetStageUpAxis(stage)
    scale = UsdGeom.GetStageMetersPerUnit(stage) or 1.0

    all_verts: list[tuple[float, float, float]] = []
    all_tris: list[tuple[int, int, int]] = []
    mesh_count = 0
    for prim in _iter_mesh_prims(stage):
        try:
            got = _mesh_to_world(prim, time_code)
        except Exception as exc:  # noqa: BLE001 — one bad prim must not kill the scan
            logger.warning("usdz_to_glb: skipping %s: %s", prim.GetPath(), exc)
            continue
        if got is None:
            continue
        verts, tris = got
        offset = len(all_verts)
        all_verts.extend(_stage_to_gltf_axes(verts, up_axis, scale))
        all_tris.extend([(a + offset, b + offset, c + offset) for (a, b, c) in tris])
        mesh_count += 1

    if not all_tris:
        logger.warning("usdz_to_glb: no mesh geometry found in %s", in_path)
        return False

    # One merged mesh: the overlay is drawn as a single translucent object, so
    # per-prim structure buys nothing and a flat mesh keeps the GLB small.
    merged = trimesh.Trimesh(vertices=all_verts, faces=all_tris, process=False)
    with open(out_path, "wb") as fh:
        fh.write(trimesh.Scene(merged).export(file_type="glb"))

    logger.info(
        "usdz_to_glb: %s → %s (%s meshes, %s verts, %s tris)",
        in_path, out_path, mesh_count, len(all_verts), len(all_tris),
    )
    return True


def usdz_to_glb(in_path: str, out_path: str) -> bool:
    """Convert *in_path* (.usdz/.usd/.usda/.usdc) → *out_path* (.glb).

    Returns True on success (and a non-empty output file), False otherwise —
    never raises. Signature and semantics are unchanged from the Blender-backed
    version, so callers (`app.tasks.media`) need no edits.
    """
    # Package root (…/backend) so `-m app.core.room_scan_glb` resolves even when
    # the child is spawned from an unrelated cwd.
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env = dict(os.environ)
    env["PYTHONPATH"] = root + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")

    try:
        proc = subprocess.run(
            [sys.executable, "-m", "app.core.room_scan_glb", in_path, out_path],
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_S,
            env=env,
        )
    except subprocess.TimeoutExpired:
        logger.warning("usdz_to_glb: timed out after %ss", _TIMEOUT_S)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.warning("usdz_to_glb: could not start converter: %s", exc)
        return False

    ok = proc.returncode == 0 and os.path.isfile(out_path) and os.path.getsize(out_path) > 0
    if not ok:
        # A negative returncode means the child was killed by a signal — e.g.
        # -4/SIGILL if this CPU cannot run libusd (see the note on RDTSCP above).
        logger.warning(
            "usdz_to_glb: failed rc=%s stderr=%s", proc.returncode, (proc.stderr or "")[-500:]
        )
    return ok


def _main(argv: list[str]) -> int:
    if len(argv) < 3:
        print("usage: python -m app.core.room_scan_glb <in.usdz> <out.glb>", file=sys.stderr)
        return 2
    try:
        return 0 if _convert(argv[1], argv[2]) else 1
    except ImportError as exc:
        print(f"usdz_to_glb: USD/trimesh not installed in this image: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        print(f"usdz_to_glb: unexpected error: {exc!r}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    sys.exit(_main(sys.argv))
