"""Pipe risers, shafts and wall boxes found in a LiDAR scan.

New-build flats are handed over with the plumbing risers boxed in or left as
niches. Apple RoomPlan has no class for them, but they do not vanish: on a real
scan the riser came back as a short piece of "wall" (24 cm wide and lower than
the ceiling) and as narrow, tall "storage" boxes standing against a wall. The
converter's corner merging and straightening folds the first away and the
furniture list drops the second, so the room is drawn as a clean box with no
riser in it.

This reads them off the same scan *before* that tidying. It only reports: it
changes no geometry, and what it finds rides in `room_scan.features` for the
studio and the estimate to use (a riser takes floor and wall area away).

The thresholds come from one real room, not from a spec, so every feature
carries a `confidence`, and a wardrobe niche that looks like a box is reported
as the low-confidence `wall_box` rather than called a pipe.
"""
from __future__ import annotations

import math

from app.schemas.room_scan import ScanSurface

Point = tuple[float, float]

# A wall piece shorter than this is not a room edge: the real scan's four walls
# were all over 5 m, its riser piece 0.24 m.
SHORT_WALL_M = 0.8
# Only a piece clearly below the ceiling is a box; one that reaches it is a
# genuine (short) wall return, e.g. a jamb, and is left alone.
BELOW_CEILING_M = 0.1

# A riser box: tall, narrow in both directions, and standing against a wall.
RISER_MIN_HEIGHT_M = 1.8
RISER_MAX_SIDE_M = 0.7
AGAINST_WALL_M = 0.5
NEAR_CORNER_M = 0.8
# A wall box: shallow, wide, against a wall (an electrical panel, a niche — or
# simply a wardrobe, hence only low confidence).
WALL_BOX_MAX_DEPTH_M = 0.45
WALL_BOX_MIN_WIDTH_M = 0.8


def _dist(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _dist_to_segment(p: Point, a: Point, b: Point) -> float:
    abx, aby = b[0] - a[0], b[1] - a[1]
    seg2 = abx * abx + aby * aby
    if seg2 == 0:
        return _dist(p, a)
    t = max(0.0, min(1.0, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / seg2))
    return _dist(p, (a[0] + t * abx, a[1] + t * aby))


def _to_wall(p: Point, corners: list[Point]) -> float:
    """Distance from a point to the nearest room edge."""
    n = len(corners)
    return min(_dist_to_segment(p, corners[i], corners[(i + 1) % n]) for i in range(n))


def _to_corner(p: Point, corners: list[Point]) -> float:
    return min(_dist(p, c) for c in corners)


def _feature(kind: str, confidence: str, source: str, x: float, y: float,
             width: float, depth: float | None, height: float, rotation_rad: float) -> dict:
    return {
        "kind": kind,
        "confidence": confidence,
        "source": source,
        "x": round(x, 3),
        "y": round(y, 3),
        "width": round(width, 3),
        "depth": None if depth is None else round(depth, 3),
        "height": round(height, 3),
        "rotation_rad": round(rotation_rad, 4),
    }


def detect_service_features(
    walls: list[ScanSurface],
    objects: list,
    corners: list[Point],
    origin: Point,
    ceiling_h: float,
) -> list[dict]:
    """Candidate risers and wall boxes, in the room's own plane (metres).

    `objects` are the converter's `ScanObjectPlacement`s (already in the plane
    frame); `walls` are the raw scan walls, whose transforms are still in world
    coordinates, so `origin` is subtracted here.
    """
    found: list[dict] = []
    if len(corners) < 3:
        return found

    for w in walls:
        length, height = w.dimensions.x, w.dimensions.y
        if length >= SHORT_WALL_M or height > ceiling_h - BELOW_CEILING_M:
            continue
        cx = w.transform.m[12] - origin[0]
        cy = w.transform.m[14] - origin[1]
        near_corner = _to_corner((cx, cy), corners) <= NEAR_CORNER_M
        found.append(_feature(
            "riser", "high" if near_corner else "medium", "short_wall",
            cx, cy, length, None, height, w.transform.y_rotation_rad,
        ))

    for o in objects:
        if o.category not in ("storage", "other"):
            continue
        p = (o.x, o.y)
        against_wall = _to_wall(p, corners) <= AGAINST_WALL_M
        if not against_wall:
            continue
        narrow = max(o.width, o.depth) <= RISER_MAX_SIDE_M
        if o.height >= RISER_MIN_HEIGHT_M and narrow:
            near_corner = _to_corner(p, corners) <= NEAR_CORNER_M
            found.append(_feature(
                "riser", "high" if near_corner else "medium", "storage",
                o.x, o.y, o.width, o.depth, o.height, o.rotation_rad,
            ))
        elif o.depth <= WALL_BOX_MAX_DEPTH_M and o.width >= WALL_BOX_MIN_WIDTH_M:
            found.append(_feature(
                "wall_box", "low", "storage",
                o.x, o.y, o.width, o.depth, o.height, o.rotation_rad,
            ))

    return found
