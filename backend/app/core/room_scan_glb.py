"""Parametric room-scan → GLB builder for the studio's reference overlay.

Why there is no USD reader here any more
----------------------------------------
Three generations of this file tried to read the iPhone's RoomPlan ``.usdz``
directly. All of them are dead on our production hardware, which is a QEMU
guest reporting "QEMU Virtual CPU version 2.5+" — a baseline x86-64 vCPU with
no SSE4.2:

1. Official blender.org builds refuse to even start:
   ``Blender requires a CPU with SSE42 support``.
2. Debian's apt Blender starts, but is compiled without USD support, so
   ``bpy.ops.wm.usd_import`` does not exist.
3. ``usd-core`` (Pixar's OpenUSD manylinux wheel) was deployed and the
   conversion child process was killed by **SIGILL**. Production log:
   ``usdz_to_glb: failed rc=-4`` (rc=-4 = signal 4 = illegal instruction).
   Reproduced exactly under ``qemu-x86_64 -cpu qemu64``: ``from pxr import
   Usd`` imports fine, but ``Usd.Stage.Open(<usdz>)`` dies with
   ``uncaught target signal 4 (Illegal instruction)``. In the same emulated
   environment ``numpy`` and ``trimesh`` import and work fine.

So: **no USD parsing is possible on this hardware**, and none is attempted.
Do not reintroduce a USD library here.

What replaced it
----------------
The overlay is built from the *parametric* scan data the server already owns.
``POST /rooms/{id}/room-scan`` re-runs `app.services.room_scan_converter` on the
RoomPlan JSON and persists the result: the room's floor polygon
(``room.geometry.vertices``, metres, origin at the bbox min corner), its
``ceiling_h``, and ``room_scan.objects`` (each with x, y, width, depth, height,
rotation, category, confidence). That is everything the overlay needs, and it
is pure ``numpy``/``trimesh`` arithmetic — no native USD code, nothing that can
SIGILL.

The raw ``.usdz`` is still uploaded and still recorded as
``room_scan.usdz_path``: we archive the original capture even though we no
longer parse it (a future host with a modern CPU, or an offline re-processing
job, may want it). Nothing in this module reads it.

What the output is for
----------------------
A *translucent reference overlay* in the 3D studio — the studio builds the real
room from the same parametric data. So the GLB deliberately carries geometry
only: wall slabs extruded to the ceiling height, plus one ghost box per
detected object. No materials, textures, UVs or normals; they would cost size
and complexity for something the user sees at low opacity.

Best-effort, like every previous version: the builders return ``None`` rather
than raising, and the caller just leaves ``glb_path`` null.
"""
from __future__ import annotations

import logging
import math
from typing import Any

logger = logging.getLogger(__name__)

# Walls are drawn as thin slabs centred on each polygon edge. 10 cm reads as a
# wall at overlay opacity without hiding the real geometry behind it; it also
# means the GLB's XZ bounds exceed the room's floor bbox by half that on each
# side.
WALL_THICKNESS_M = 0.10

# Sanity clamps — a degenerate scan must not produce a multi-kilometre mesh.
_MIN_EXTENT_M = 0.01
_MAX_EXTENT_M = 100.0
_MIN_CEILING_M = 0.5
_MAX_CEILING_M = 10.0


def _f(value: Any, default: float = 0.0) -> float:
    """Coerce JSONB-sourced numbers defensively (never raises)."""
    if isinstance(value, bool):
        return default
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    return default if math.isnan(out) or math.isinf(out) else out


def _extent(value: Any) -> float | None:
    v = _f(value, 0.0)
    return None if not (_MIN_EXTENT_M <= v <= _MAX_EXTENT_M) else v


def _y_rotation(theta: float):
    """4×4 rotation about glTF's +Y.

    RoomPlan is Y-up metres and the converter stores the floor plane as
    ``(x, y) = (world x, world z)``, so an app-plane rotation ``r`` (the stored
    ``rotation``, measured as ``atan2(dz, dx)`` of the object's local X axis)
    becomes a rotation of ``-r`` about glTF's +Y.
    """
    import numpy as np

    c, s = math.cos(theta), math.sin(theta)
    return np.array([
        [c, 0.0, s, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [-s, 0.0, c, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ])


def _box(extents: tuple[float, float, float], centre: tuple[float, float, float], theta: float):
    """A box of the given extents, rotated about +Y and moved to *centre*."""
    import trimesh

    m = _y_rotation(theta)
    m[0, 3], m[1, 3], m[2, 3] = centre
    return trimesh.creation.box(extents=extents, transform=m)


def _vertices_from(geometry: Any) -> list[tuple[float, float]]:
    """Pull the floor polygon out of a persisted ``room.geometry`` JSONB blob."""
    if not isinstance(geometry, dict):
        return []
    raw = geometry.get("vertices")
    if not isinstance(raw, list):
        return []
    out: list[tuple[float, float]] = []
    for v in raw:
        if isinstance(v, (list, tuple)) and len(v) >= 2:
            out.append((_f(v[0]), _f(v[1])))
    return out


def _wall_meshes(vertices: list[tuple[float, float]], ceiling_h: float) -> list:
    """One slab per polygon edge, floor (y=0) up to the ceiling.

    Extruding each edge separately (rather than the outline as a whole) keeps
    the builder trivial for concave / N-gon rooms, which the converter happily
    produces — L-shaped RoomPlan rooms are common.
    """
    meshes = []
    n = len(vertices)
    for i in range(n):
        ax, az = vertices[i]
        bx, bz = vertices[(i + 1) % n]
        dx, dz = bx - ax, bz - az
        length = math.hypot(dx, dz)
        if length < _MIN_EXTENT_M or length > _MAX_EXTENT_M:
            continue
        # Box local +X must point along the edge; see _y_rotation for the sign.
        theta = math.atan2(-dz, dx)
        meshes.append(_box(
            (length, ceiling_h, WALL_THICKNESS_M),
            ((ax + bx) / 2.0, ceiling_h / 2.0, (az + bz) / 2.0),
            theta,
        ))
    return meshes


def _object_mesh(obj: Any, at_origin: bool = False):
    """One ghost box for a stored ``room_scan.objects`` entry, or None."""
    if not isinstance(obj, dict):
        return None
    w = _extent(obj.get("width"))
    d = _extent(obj.get("depth"))
    h = _extent(obj.get("height"))
    if w is None or d is None or h is None:
        return None
    if at_origin:
        x = z = theta = 0.0
    else:
        x, z, theta = _f(obj.get("x")), _f(obj.get("y")), -_f(obj.get("rotation"))
    # RoomPlan's object transform carries a centre height, but the converter
    # only persists the floor-plane position — so sit the box on the floor.
    return _box((w, h, d), (x, h / 2.0, z), theta)


def _export(meshes: list, what: str) -> bytes | None:
    """Concatenate to a single mesh and serialise as binary glTF."""
    import trimesh

    if not meshes:
        logger.warning("room_scan_glb: nothing to build for %s", what)
        return None
    merged = trimesh.util.concatenate(meshes)
    data = trimesh.Scene(merged).export(file_type="glb")
    if not data:
        logger.warning("room_scan_glb: empty export for %s", what)
        return None
    logger.info(
        "room_scan_glb: built %s — %s parts, %s verts, %s faces, %s bytes",
        what, len(meshes), len(merged.vertices), len(merged.faces), len(data),
    )
    return bytes(data)


def build_room_scan_glb(geometry: Any, ceiling_h: Any, objects: Any = None) -> bytes | None:
    """Build the room overlay GLB from persisted parametric scan data.

    Args:
        geometry:  ``room.geometry`` JSONB — needs ``vertices``, the floor
                   polygon in metres with the origin at its bbox min corner.
        ceiling_h: ``room.ceiling_h`` in metres.
        objects:   ``room_scan.objects`` — each a dict with x, y, width, depth,
                   height, rotation.

    Returns the GLB bytes, or None on any problem. Never raises.
    """
    try:
        vertices = _vertices_from(geometry)
        if len(vertices) < 3:
            logger.warning("room_scan_glb: geometry has < 3 vertices, no overlay")
            return None
        h = _f(ceiling_h, 0.0)
        if not (_MIN_CEILING_M <= h <= _MAX_CEILING_M):
            logger.warning("room_scan_glb: implausible ceiling_h %r, no overlay", ceiling_h)
            return None

        meshes = _wall_meshes(vertices, h)
        for obj in objects or []:
            mesh = _object_mesh(obj)
            if mesh is not None:
                meshes.append(mesh)
        return _export(meshes, "room")
    except Exception as exc:  # noqa: BLE001 — best-effort; caller leaves glb_path null
        logger.warning("room_scan_glb: room build failed: %r", exc)
        return None


def build_object_glb(obj: Any) -> bytes | None:
    """Build one detected object's ghost-box GLB (the Phase 6 per-object path).

    That endpoint also uploads an Object-Capture ``.usdz``; like the room scan's
    it is archived, not parsed, for the CPU reason at the top of this module. The
    placeholder comes from the object's own stored dimensions, in its own local
    frame (origin at the floor centre, unrotated) — the studio places it.

    Returns the GLB bytes, or None. Never raises.
    """
    try:
        mesh = _object_mesh(obj, at_origin=True)
        return _export([mesh] if mesh is not None else [], "object")
    except Exception as exc:  # noqa: BLE001
        logger.warning("room_scan_glb: object build failed: %r", exc)
        return None
