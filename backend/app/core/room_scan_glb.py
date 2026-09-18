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
only: wall slabs extruded to the ceiling height with their doors and windows
cut out, plus one ghost box per detected object. No materials, textures, UVs or
normals; they would cost size and complexity for something the user sees at low
opacity.

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

# Panels thinner than this are dropped: a sliver that narrow is scan noise, and
# emitting it would only add faces the user cannot see.
_MIN_PANEL_M = 0.005


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


def _wall_elements(geometry: Any, edge_count: int) -> list[list[dict]]:
    """``geometry.walls[i].elements`` per polygon edge, defensively.

    ``app.services.room_scan_converter.convert_captured_room`` builds
    ``walls[i] = Wall(id=str(i), length=dist(corners[i], corners[i+1]),
    elements=openings_per_wall[i])`` in the same ``for i in range(n)`` loop that
    emits ``vertices``, and openings are assigned by ``_nearest_wall``, which
    tests the segment ``corners[i] → corners[(i + 1) % n]``. So ``walls[i]`` is
    exactly the edge from vertex *i* to vertex *i+1* — verified, not assumed.

    That correspondence only holds while the two lists stay the same length;
    ``POST /rooms/{id}/walls`` can append a wall without adding a vertex. If the
    counts disagree we simply draw unpunched slabs rather than cut holes in the
    wrong walls.
    """
    empty: list[list[dict]] = [[] for _ in range(edge_count)]
    if not isinstance(geometry, dict):
        return empty
    walls = geometry.get("walls")
    if not isinstance(walls, list) or len(walls) != edge_count:
        if isinstance(walls, list) and walls:
            logger.info(
                "room_scan_glb: %s walls vs %s polygon edges — openings not cut",
                len(walls), edge_count,
            )
        return empty
    out: list[list[dict]] = []
    for w in walls:
        els = w.get("elements") if isinstance(w, dict) else None
        out.append([e for e in els if isinstance(e, dict)] if isinstance(els, list) else [])
    return out


def _holes_1d(elements: list[dict], length: float, ceiling_h: float) -> list[tuple[float, float, float, float]]:
    """Openings as ``(u0, u1, v0, v1)`` rectangles in the wall's own 2-D frame.

    ``u`` runs 0..length from the edge's first vertex, ``v`` runs 0..ceiling_h
    from the floor. ``position`` is the 0..1 fraction of the *centre* along the
    wall and ``sill_height`` is metres from the floor (doors sit at 0).

    Everything is clamped to the wall: production scans really do produce
    openings wider than the wall can hold — room
    ``078ff407-7586-483d-8fdc-7a861b283a80`` has a 3.99 m window at position
    0.41 of a 4.84 m wall, whose left edge computes to −0.011 m.
    """
    holes = []
    for el in elements:
        w = _f(el.get("width"), 0.0)
        h = _f(el.get("height"), 0.0)
        if w <= 0.0 or h <= 0.0:
            continue
        centre = _f(el.get("position"), 0.5) * length
        u0 = max(0.0, centre - w / 2.0)
        u1 = min(length, centre + w / 2.0)
        v0 = max(0.0, _f(el.get("sill_height"), 0.0))
        v1 = min(ceiling_h, v0 + h)
        if u1 - u0 > _MIN_PANEL_M and v1 - v0 > _MIN_PANEL_M:
            holes.append((u0, u1, v0, v1))
    return holes


def _panels(length: float, ceiling_h: float,
            holes: list[tuple[float, float, float, float]]) -> list[tuple[float, float, float, float]]:
    """Split one wall face into the solid rectangles left around its openings.

    A vertical-slab decomposition: cut the face at every opening edge in ``u``,
    then in each slab subtract the ``v`` spans of the openings that cover it.
    With no openings that yields the whole face back, i.e. the original slab.
    Overlapping and abutting openings fall out correctly because the spans are
    merged, so nothing here can produce a doubled or negative-width panel — the
    reason this is done by splitting rather than by a CSG difference.
    """
    if not holes:
        return [(0.0, length, 0.0, ceiling_h)]
    cuts = sorted({0.0, length} | {u for h in holes for u in h[:2]})
    out = []
    for s0, s1 in zip(cuts, cuts[1:]):
        if s1 - s0 <= _MIN_PANEL_M:
            continue
        mid = (s0 + s1) / 2.0
        spans = sorted((h[2], h[3]) for h in holes if h[0] <= mid <= h[1])
        v = 0.0
        for a, b in spans:
            if a - v > _MIN_PANEL_M:
                out.append((s0, s1, v, a))
            v = max(v, b)
        if ceiling_h - v > _MIN_PANEL_M:
            out.append((s0, s1, v, ceiling_h))
    return out


def _wall_meshes(vertices: list[tuple[float, float]], ceiling_h: float,
                 elements_per_edge: list[list[dict]] | None = None) -> list:
    """Slabs per polygon edge, floor (y=0) up to the ceiling, openings cut out.

    Extruding each edge separately (rather than the outline as a whole) keeps
    the builder trivial for concave / N-gon rooms, which the converter happily
    produces — L-shaped RoomPlan rooms are common.

    A wall with no openings is still a single box, so the overlay is unchanged
    for scans that found none; a wall with a door or window becomes the two to
    four panels around each hole (left / right / under the sill / over the
    lintel). Full thickness is kept on every panel: nothing is unioned, so there
    is no coplanar overlap to z-fight.
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
        ux, uz = dx / length, dz / length  # unit vector along the edge
        # Box local +X must point along the edge; see _y_rotation for the sign.
        theta = math.atan2(-dz, dx)
        elements = (elements_per_edge or [[]] * n)[i] if elements_per_edge else []
        for u0, u1, v0, v1 in _panels(length, ceiling_h, _holes_1d(elements, length, ceiling_h)):
            u = (u0 + u1) / 2.0
            meshes.append(_box(
                (u1 - u0, v1 - v0, WALL_THICKNESS_M),
                (ax + ux * u, (v0 + v1) / 2.0, az + uz * u),
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
                   ``walls[i].elements`` (doors/windows on the edge from vertex
                   *i* to *i+1*) are cut out of that edge's slab when present.
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

        meshes = _wall_meshes(vertices, h, _wall_elements(geometry, len(vertices)))
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
