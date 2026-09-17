"""Server-side RoomPlan → room converter.

A faithful port of the Flutter converter
(`lib/features/room_scan/room_scan_converter.dart`, Phase 3.2). The backend is
the source of truth: the mobile preview and the persisted room can never diverge
because both run the *same* algorithm on the *same* JSON. The parity test
(`tests/test_room_scan_converter.py`) shares the same fixture as the Dart test
and asserts identical output.

Coordinate mapping (see the discovery doc §3e / §8): RoomPlan is Y-up metres; the
floor is the world XZ plane, so a surface's world position `(tx, ty, tz)` maps to
app 2-D `(x = tx, y = tz)`. A wall's local X axis (transform column 0) runs along
its length. Corners are merged wall endpoints, ordered into a loop, normalised so
the bbox min corner is the origin, then straightened (±3° → square). Ceiling =
median wall height. The world origin sits at *device* height, not on the floor
(real scans put the floor near y = -1.6), so the floor plane is taken as the
lowest wall base and window sills are measured from it. Openings → nearest
wall, `position` 0..1. Objects ride in a separate list.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from app.schemas.room import RoomGeometry, Wall, WallElement
from app.schemas.room_scan import CapturedRoom, ScanSurface, ScanTransform

# Tuning — must match the Dart converter's constants.
_CORNER_MERGE_M = 0.35
_STRAIGHTEN_TOL_DEG = 3.0
_WALL_STEP_M = 0.05
_COLLINEAR_TOL_DEG = 8.0
_MIN_H, _MAX_H, _DEFAULT_H = 2.0, 5.0, 2.8
# Sill limits, all measured from the room's own floor plane.
_MAX_SILL_M = 2.5          # schema cap (RoomGeometry.WallElement)
_SILL_SLACK_M = 0.25       # tolerate a little noise below the floor
_FALLBACK_SILL_M = 0.9     # only for missing / absurd data

Point = tuple[float, float]


@dataclass
class ScanObjectPlacement:
    category: str
    x: float
    y: float
    width: float
    depth: float
    height: float
    rotation_rad: float
    confidence: str


@dataclass
class RoomScanConversion:
    corners: list[Point]
    ceiling_h: float
    geometry: RoomGeometry
    objects: list[ScanObjectPlacement]


# ── vector helpers ────────────────────────────────────────────────────────
def _sub(a: Point, b: Point) -> Point:
    return (a[0] - b[0], a[1] - b[1])


def _add(a: Point, b: Point) -> Point:
    return (a[0] + b[0], a[1] + b[1])


def _mul(a: Point, s: float) -> Point:
    return (a[0] * s, a[1] * s)


def _dot(a: Point, b: Point) -> float:
    return a[0] * b[0] + a[1] * b[1]


def _dist(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _round_to(v: float, step: float) -> float:
    return v if step <= 0 else round(v / step) * step


# ── corners ───────────────────────────────────────────────────────────────
def _world_to_plane(t: ScanTransform) -> Point:
    return (t.m[12], t.m[14])


def _wall_endpoints(wall: ScanSurface) -> list[Point]:
    centre = _world_to_plane(wall.transform)
    m = wall.transform.m
    dx, dz = m[0], m[2]
    length = math.hypot(dx, dz)
    d = (1.0, 0.0) if length < 1e-6 else (dx / length, dz / length)
    half = wall.dimensions.x / 2.0
    return [_sub(centre, _mul(d, half)), _add(centre, _mul(d, half))]


def _build_corners(walls: list[ScanSurface]) -> list[Point]:
    if len(walls) < 3:
        return []
    corners: list[Point] = []
    edges: list[tuple[int, int]] = []

    def index_of(p: Point) -> int:
        for k, c in enumerate(corners):
            if _dist(c, p) < _CORNER_MERGE_M:
                return k
        corners.append(p)
        return len(corners) - 1

    for w in walls:
        ep = _wall_endpoints(w)
        i, j = index_of(ep[0]), index_of(ep[1])
        if i != j:
            edges.append((i, j))
    if len(corners) < 3:
        return []

    ordered = _order_loop(corners, edges)
    if ordered is None:
        ordered = _polar_sort(corners)
    return _ensure_ccw(ordered)


def _order_loop(corners: list[Point], edges: list[tuple[int, int]]) -> list[Point] | None:
    n = len(corners)
    adj: list[list[int]] = [[] for _ in range(n)]
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    order = [0]
    seen = {0}
    prev, cur = -1, 0
    while len(order) < n:
        nexts = [x for x in adj[cur] if x != prev]
        nxt = next((x for x in nexts if x not in seen), -1)
        if nxt == -1:
            break
        order.append(nxt)
        seen.add(nxt)
        prev, cur = cur, nxt
    if len(order) != n:
        return None
    return [corners[k] for k in order]


def _polar_sort(pts: list[Point]) -> list[Point]:
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    return sorted(pts, key=lambda p: math.atan2(p[1] - cy, p[0] - cx))


def _ensure_ccw(poly: list[Point]) -> list[Point]:
    a = 0.0
    n = len(poly)
    for i in range(n):
        p1, p2 = poly[i], poly[(i + 1) % n]
        a += p1[0] * p2[1] - p2[0] * p1[1]
    return list(reversed(poly)) if a < 0 else poly


# ── straighten ────────────────────────────────────────────────────────────
def _snap_to_axis(theta: float) -> float:
    deg = math.degrees(theta)
    cand = round(deg / 90) * 90
    diff = abs(deg - cand) % 360
    if diff > 180:
        diff = 360 - diff
    return math.radians(cand) if diff <= _STRAIGHTEN_TOL_DEG else theta


def _turn_angle(a: Point, b: Point, c: Point) -> float:
    v1, v2 = _sub(b, a), _sub(c, b)
    l1, l2 = math.hypot(*v1), math.hypot(*v2)
    if l1 == 0 or l2 == 0:
        return 0.0
    return math.acos(max(-1.0, min(1.0, _dot(v1, v2) / (l1 * l2))))


def _remove_collinear(poly: list[Point]) -> list[Point]:
    n = len(poly)
    if n < 4:
        return list(poly)
    tol = math.radians(_COLLINEAR_TOL_DEG)
    keep = [poly[i] for i in range(n)
            if _turn_angle(poly[(i - 1) % n], poly[i], poly[(i + 1) % n]) > tol]
    return keep if len(keep) >= 3 else list(poly)


def _straighten(poly: list[Point]) -> list[Point]:
    n = len(poly)
    if n < 3:
        return list(poly)
    lens, dirs = [], []
    for i in range(n):
        e = _sub(poly[(i + 1) % n], poly[i])
        lens.append(_round_to(math.hypot(*e), _WALL_STEP_M))
        dirs.append(_snap_to_axis(math.atan2(e[1], e[0])))
    walk = [poly[0]]
    for i in range(n):
        walk.append(_add(walk[-1], _mul((math.cos(dirs[i]), math.sin(dirs[i])), lens[i])))
    gap = _sub(walk[0], walk[n])
    out = [_add(walk[i], _mul(gap, i / n)) for i in range(n)]
    return _remove_collinear(out)


# ── misc ──────────────────────────────────────────────────────────────────
def _min_corner(corners: list[Point]) -> Point:
    return (min(c[0] for c in corners), min(c[1] for c in corners))


def _ceiling_height(walls: list[ScanSurface]) -> float:
    heights = sorted(w.dimensions.y for w in walls if w.dimensions.y > 0.1)
    if not heights:
        return _DEFAULT_H
    mid = len(heights) // 2
    median = heights[mid] if len(heights) % 2 else (heights[mid - 1] + heights[mid]) / 2
    return max(_MIN_H, min(_MAX_H, median))


def _nearest_wall(corners: list[Point], centre: Point) -> tuple[int, float] | None:
    n = len(corners)
    if n < 2:
        return None
    best, best_d, best_t = None, float("inf"), 0.5
    for i in range(n):
        a, b = corners[i], corners[(i + 1) % n]
        ab = _sub(b, a)
        len2 = _dot(ab, ab)
        t = 0.0 if len2 == 0 else max(0.0, min(1.0, _dot(_sub(centre, a), ab) / len2))
        proj = _add(a, _mul(ab, t))
        d = _dist(proj, centre)
        if d < best_d:
            best_d, best, best_t = d, i, t
    return None if best is None else (best, best_t)


def _floor_level(walls: list[ScanSurface]) -> float | None:
    """World Y of the room's floor plane, derived from the walls themselves.

    RoomPlan's world origin sits roughly at device height, *not* on the floor,
    so floor-level geometry normally has a negative Y (a real scan measured
    -1.622 m). Every wall runs floor-to-ceiling, so the lowest wall base is the
    floor. Same wall filter as :func:`_ceiling_height` — the two functions read
    the same surfaces, one for the top, one for the bottom.

    Returns ``None`` when no usable wall exists (degenerate scan).
    """
    bases = [
        w.transform.m[13] - w.dimensions.y / 2.0
        for w in walls
        if w.dimensions.y > 0.1
        and math.isfinite(w.dimensions.y)
        and math.isfinite(w.transform.m[13])
    ]
    return min(bases) if bases else None


def _window_sill(s: ScanSurface, height: float, floor_y: float | None) -> float:
    """Height of a window's lower edge above the floor, in metres.

    The surface transform's Y is the opening's *centre* in RoomPlan world
    space; subtracting the floor plane is what makes it a sill. The old code
    used the absolute world Y, which on every real scan is negative and so hit
    the fallback every time.
    """
    if floor_y is None:
        return _FALLBACK_SILL_M
    sill = s.transform.m[13] - height / 2.0 - floor_y
    if not math.isfinite(sill) or sill < -_SILL_SLACK_M or sill > _MAX_SILL_M:
        return _FALLBACK_SILL_M
    return max(0.0, sill)  # a hair below the floor plane is measurement noise


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


# ── entry point ───────────────────────────────────────────────────────────
def convert_captured_room(room: CapturedRoom) -> RoomScanConversion:
    corners = _build_corners(room.walls)
    if len(corners) >= 3:
        corners = _straighten(corners)
    origin = _min_corner(corners) if corners else (0.0, 0.0)
    corners = [_sub(c, origin) for c in corners]

    ceiling = _ceiling_height(room.walls)
    floor_y = _floor_level(room.walls)
    n = len(corners)

    openings_per_wall: list[list[WallElement]] = [[] for _ in range(n)]
    if n >= 3:
        def assign(s: ScanSurface, el_type: str) -> None:
            centre = _sub(_world_to_plane(s.transform), origin)
            hit = _nearest_wall(corners, centre)
            if hit is None:
                return
            idx, pos = hit
            height = _clamp(s.dimensions.y, 0.3, 3.5)
            openings_per_wall[idx].append(WallElement(
                type=el_type,  # type: ignore[arg-type]
                width=_clamp(s.dimensions.x, 0.3, 5.0),
                height=height,
                sill_height=(_window_sill(s, height, floor_y)
                             if el_type == "deraza" else 0.0),
                position=_clamp(pos, 0.0, 1.0),
            ))

        for d in room.doors:
            assign(d, "eshik")
        for w in room.windows:
            assign(w, "deraza")
        for o in room.openings:  # door-less pass-throughs → open doorway
            assign(o, "eshik")

    walls = [
        Wall(
            id=str(i),
            length=_clamp(_dist(corners[i], corners[(i + 1) % n]), 0.51, 24.9),
            elements=openings_per_wall[i],
        )
        for i in range(n)
    ]
    # Persist the true polygon (vertices + N walls) — the studio renders it via
    # the N-wall path and it is unambiguous; server stays source of truth.
    geometry = RoomGeometry(
        walls=walls if len(walls) >= 3 else _fallback_walls(),
        vertices=[(c[0], c[1]) for c in corners] if n >= 3 else None,
    )

    objects = [
        ScanObjectPlacement(
            category=o.category.value,
            x=_sub(_world_to_plane(o.transform), origin)[0],
            y=_sub(_world_to_plane(o.transform), origin)[1],
            width=o.dimensions.x,
            depth=o.dimensions.z,
            height=o.dimensions.y,
            rotation_rad=o.transform.y_rotation_rad,
            confidence=o.confidence.value,
        )
        for o in room.objects
    ]

    return RoomScanConversion(
        corners=corners, ceiling_h=ceiling, geometry=geometry, objects=objects
    )


def _fallback_walls() -> list[Wall]:
    # A degenerate scan still needs a schema-valid geometry; caller checks
    # corner count and rejects with 422 before persisting.
    return [Wall(id=str(i), length=1.0, elements=[]) for i in range(3)]
