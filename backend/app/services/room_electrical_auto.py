"""Default electrical plan derived from a LiDAR room scan.

Why
---
Before this module a freshly scanned room arrived in the studio (and in the
mobile app) with an *empty* electrical layer, and the smeta priced its cable
line off ``ELEC_POINTS_DEFAULT = 8`` — a flat guess that ignores whether the
room is a 4 m² bathroom or a 38 m² living room. The scan already tells us
where the walls, the doors, the windows and the furniture are, so a sensible
first-draft layout can simply be computed. The user then edits it instead of
starting from nothing, and the cable estimate is backed by real point counts
from the first save onwards.

Purity
------
No DB, no I/O, no ORM: :func:`generate_electrical_plan` takes a
:class:`~app.services.room_scan_converter.RoomScanConversion` and returns a
plain :class:`AutoElectricalPlan`. Persistence (both stores — see
``app.routers.rooms.upload_room_scan``) lives in the caller.

Coordinate conventions (the fiddly part)
----------------------------------------
* The conversion's ``corners``/``geometry.vertices`` are **metres**, origin at
  the polygon's bbox min corner. Wall *i* spans ``corners[i] →
  corners[i+1 mod n]`` and has ``geometry.walls[i].id == str(i)``.
* ``positionMm`` is measured **from ``corners[i]`` towards ``corners[i+1]``**,
  i.e. the same direction the converter uses for ``WallElement.position``
  (0..1 along that edge). That is what makes a switch land next to the door
  the scan actually saw. NOTE: the studio's plan layer
  (``frontend/src/lib/planPolygon.ts``) measures a polygon edge from its
  "smaller coordinate on the dominant axis" end instead, so for edges that run
  right-to-left the two conventions mirror each other. That divergence is
  pre-existing — it already applies to every scanned door and window — and is
  deliberately *not* papered over here: a generated device must sit where the
  door it was derived from sits.
* ``PlacedLight.xMm``/``zMm`` are plan millimetres, defined by planPolygon as
  ``vertex − mean(vertices) + (W/2, D/2)`` with ``W``/``D`` the bbox extents.
  :func:`_to_plan_mm` reproduces exactly that relation.
* Mounting heights are the studio catalog's (``PlacementPage.tsx``): panel
  1500 mm, switch 900 mm, socket 300 mm, media socket 1200 mm.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from app.services.room_scan_converter import RoomScanConversion
# Cable slack is a property of the wiring trade, not of how the run was
# measured, so the estimator's own factor is reused verbatim — the two numbers
# must never drift apart. ELEC_AVG_RUN_M is deliberately NOT reused: it is the
# per-point fallback for rooms with no layout, and the whole point here is that
# we can measure the real run along the real perimeter.
from app.services.smeta import ELEC_SLACK

Point = tuple[float, float]

# ── Mounting heights, mm (studio catalog: frontend/src/pages/studio/PlacementPage.tsx)
PANEL_H_MM = 1500
SWITCH_H_MM = 900
SOCKET_H_MM = 300
MEDIA_H_MM = 1200

# ── Placement tuning, mm
PANEL_DOOR_CLEAR_MM = 400.0    # panel stands clear of the entrance jamb
SWITCH_DOOR_CLEAR_MM = 150.0   # switch sits right beside the jamb
WALL_END_CLEAR_MM = 300.0      # nothing within 300 mm of a corner
DOOR_KEEP_OUT_MM = 100.0       # extra margin around a door's footprint
MIN_SEPARATION_MM = 250.0      # two devices never share the same spot
MERGE_SAME_TYPE_MM = 400.0     # same type, same wall, this close → one device
NUDGE_STEPS_MM = (300.0, -300.0, 600.0, -600.0)  # tried, in order, when blocked
BED_SIDE_OFFSET_MM = 700.0     # a bedside socket either side of the headboard

SOCKET_SPACING_M = 3.5         # one extra baseline socket per this much wall
LIGHT_AREA_PER_FIXTURE_M2 = 12.0
MAX_LIGHTS = 4

# Keep a ceiling light off the walls; relaxed for a room too small to afford it.
LIGHT_EDGE_MARGIN_M = 0.6

# Which frontend electrical type an object category pulls to the wall behind it.
# Kitchen/laundry appliances get a dedicated single socket (socket1); seating
# and desks get the usual double (socket2); the TV gets the media plate.
_OBJECT_SOCKETS: dict[str, str] = {
    "television": "socket_media",
    "sofa": "socket2",
    "table": "socket2",
    "refrigerator": "socket1",
    "stove": "socket1",
    "washer": "socket1",
}

_HEIGHT_BY_TYPE: dict[str, int] = {
    "panel": PANEL_H_MM,
    "switch1": SWITCH_H_MM,
    "switch2": SWITCH_H_MM,
    "socket1": SOCKET_H_MM,
    "socket2": SOCKET_H_MM,
    "socket_media": MEDIA_H_MM,
}

# frontend ElectricalType → the DB `electrical_device_type` enum value.
DB_TYPE_BY_ELECTRICAL: dict[str, str] = {
    "panel": "panel",
    "switch1": "switch",
    "switch2": "switch",
    "socket1": "socket",
    "socket2": "socket",
    "socket_media": "socket",
}


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class AutoDevice:
    """One generated wall device, in both stores' terms at once."""

    id: str
    type: str          # frontend ElectricalType ('socket2', 'switch1', …)
    wall_id: str       # geometry.walls[].id
    wall_index: int    # position of that wall in geometry.walls
    position_mm: float
    height_mm: int

    @property
    def db_type(self) -> str:
        return DB_TYPE_BY_ELECTRICAL[self.type]

    def as_state(self) -> dict:
        """The ``room.state['electricals']`` shape (frontend PlacedElectrical),
        plus the ``auto`` marker that makes a regeneration safe."""
        return {
            "id": self.id,
            "type": self.type,
            "wallId": self.wall_id,
            "positionMm": round(self.position_mm, 1),
            "heightMm": self.height_mm,
            "auto": True,
        }


@dataclass
class AutoLight:
    """A ceiling fixture. `x_mm`/`z_mm` are the plan-frame position the studio
    draws it at; `wall_index`/`position_mm`/`height_mm` are the same fixture
    expressed the only way the wall-oriented `electrical_devices` table can
    hold it — nearest wall, projected position, ceiling height."""

    id: str
    x_mm: float
    z_mm: float
    wall_index: int = 0
    wall_id: str = "0"
    position_mm: float = 0.0
    height_mm: int = 0

    def as_state(self) -> dict:
        return {
            "id": self.id,
            "xMm": round(self.x_mm, 1),
            "zMm": round(self.z_mm, 1),
            "auto": True,
        }


@dataclass
class AutoElectricalPlan:
    devices: list[AutoDevice] = field(default_factory=list)
    light_points: list[AutoLight] = field(default_factory=list)
    wiring_meters: float = 0.0

    @property
    def electricals(self) -> list[dict]:
        return [d.as_state() for d in self.devices]

    @property
    def lights(self) -> list[dict]:
        return [light.as_state() for light in self.light_points]

    def __bool__(self) -> bool:
        return bool(self.devices or self.light_points)


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

@dataclass
class _Wall:
    index: int
    id: str
    a: Point           # corners[i], the position-0 end
    b: Point           # corners[i+1]
    length_mm: float
    #: Door footprints as (start_mm, end_mm) along this wall.
    doors: list[tuple[float, float]] = field(default_factory=list)
    #: Perimeter coordinate of `a`, mm — the wire-routing baseline.
    perimeter_start_mm: float = 0.0

    @property
    def usable(self) -> tuple[float, float]:
        """The span a device may occupy, corners kept clear.

        Degenerately short walls collapse to their midpoint rather than to an
        empty range, so "at least one socket per wall" still holds.
        """
        lo, hi = WALL_END_CLEAR_MM, self.length_mm - WALL_END_CLEAR_MM
        if lo >= hi:
            mid = self.length_mm / 2.0
            return mid, mid
        return lo, hi

    def blocked_by_door(self, position_mm: float) -> bool:
        # Strict bounds: a point exactly on the keep-out margin is the first
        # legal spot beside the door, and `_clear_of_doors` aims at precisely
        # that point — an inclusive test would reject its own answer.
        return any(
            start - DOOR_KEEP_OUT_MM < position_mm < end + DOOR_KEEP_OUT_MM
            for start, end in self.doors
        )


def _dist(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _polygon_area(poly: list[Point]) -> float:
    """Unsigned shoelace area, m²."""
    n = len(poly)
    if n < 3:
        return 0.0
    acc = 0.0
    for i in range(n):
        p1, p2 = poly[i], poly[(i + 1) % n]
        acc += p1[0] * p2[1] - p2[0] * p1[1]
    return abs(acc) / 2.0


def _point_in_polygon(pt: Point, poly: list[Point]) -> bool:
    """Ray-casting test. The scanned rooms are not convex (the real one is a
    5-wall L), so a bbox/centroid shortcut is not good enough for lights."""
    x, y = pt
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            t = (y - y1) / (y2 - y1)
            if x < x1 + t * (x2 - x1):
                inside = not inside
    return inside


def _dist_to_edges(pt: Point, poly: list[Point]) -> float:
    """Shortest distance from `pt` to the polygon boundary, metres."""
    n = len(poly)
    best = float("inf")
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        abx, aby = b[0] - a[0], b[1] - a[1]
        len2 = abx * abx + aby * aby
        t = 0.0 if len2 == 0 else max(0.0, min(1.0, ((pt[0] - a[0]) * abx + (pt[1] - a[1]) * aby) / len2))
        best = min(best, _dist(pt, (a[0] + abx * t, a[1] + aby * t)))
    return best


def _project_onto_wall(pt: Point, wall: _Wall) -> tuple[float, float]:
    """(distance from `pt` to the wall in metres, position along it in mm)."""
    ax, ay = wall.a
    abx, aby = wall.b[0] - ax, wall.b[1] - ay
    len2 = abx * abx + aby * aby
    t = 0.0 if len2 == 0 else max(0.0, min(1.0, ((pt[0] - ax) * abx + (pt[1] - ay) * aby) / len2))
    proj = (ax + abx * t, ay + aby * t)
    return _dist(pt, proj), t * wall.length_mm


def _build_walls(conversion: RoomScanConversion) -> list[_Wall]:
    corners = list(conversion.corners)
    geo_walls = list(conversion.geometry.walls)
    n = min(len(corners), len(geo_walls))
    if n < 3:
        return []

    walls: list[_Wall] = []
    perimeter = 0.0
    for i in range(n):
        a, b = corners[i], corners[(i + 1) % n]
        # The polygon edge is the truth; `Wall.length` is the same number after
        # a 0.51..24.9 m schema clamp, which would misplace a device on a wall
        # the clamp actually bit.
        length_mm = _dist(a, b) * 1000.0
        wall = _Wall(
            index=i,
            id=geo_walls[i].id,
            a=a,
            b=b,
            length_mm=length_mm,
            perimeter_start_mm=perimeter,
        )
        for el in geo_walls[i].elements:
            if el.type != "eshik":
                continue
            centre = el.position * length_mm
            half = el.width * 1000.0 / 2.0
            wall.doors.append((centre - half, centre + half))
        walls.append(wall)
        perimeter += length_mm
    return walls


def _to_plan_mm(pt: Point, corners: list[Point]) -> tuple[float, float]:
    """World metres → the plan-millimetre frame ``PlacedLight`` is stored in.

    planPolygon.ts: ``plan = vertex − mean(vertices) + (W/2, D/2)``, with W/D
    the polygon's bounding-box extents.
    """
    n = len(corners)
    mean_x = sum(c[0] for c in corners) / n
    mean_y = sum(c[1] for c in corners) / n
    width = max(c[0] for c in corners) - min(c[0] for c in corners)
    depth = max(c[1] for c in corners) - min(c[1] for c in corners)
    return (
        (pt[0] - mean_x + width / 2.0) * 1000.0,
        (pt[1] - mean_y + depth / 2.0) * 1000.0,
    )


# ---------------------------------------------------------------------------
# Device placement
# ---------------------------------------------------------------------------

class _Placer:
    """Accumulates devices while enforcing the spacing/merge rules.

    Insertion order encodes priority: whatever is added first keeps its spot,
    so the panel and the door switches are placed before the object-driven
    sockets, and the filler baseline sockets go in last.
    """

    def __init__(self) -> None:
        self.devices: list[AutoDevice] = []
        self._by_wall: dict[int, list[AutoDevice]] = {}

    def add(self, wall: _Wall, kind: str, position_mm: float) -> AutoDevice | None:
        lo, hi = wall.usable
        for offset in (0.0, *NUDGE_STEPS_MM):
            pos = min(hi, max(lo, position_mm + offset))
            # A socket in a doorway is simply wrong, so the keep-out survives
            # both the nudging and the clamp to `usable`. Panels and switches
            # are exempt: they are deliberately placed beside a jamb, and the
            # caller has already put them on the door's clear side.
            if kind.startswith("socket") and wall.blocked_by_door(pos):
                continue
            existing = self._by_wall.get(wall.index, ())
            if any(
                d.type == kind and abs(d.position_mm - pos) < MERGE_SAME_TYPE_MM
                for d in existing
            ):
                return None  # merged into the neighbour of the same type
            if any(abs(d.position_mm - pos) < MIN_SEPARATION_MM for d in existing):
                continue     # too close to something else — try the next nudge
            device = AutoDevice(
                id=f"auto-e{len(self.devices)}",
                type=kind,
                wall_id=wall.id,
                wall_index=wall.index,
                position_mm=pos,
                height_mm=_HEIGHT_BY_TYPE[kind],
            )
            self.devices.append(device)
            self._by_wall.setdefault(wall.index, []).append(device)
            return device
        return None  # every candidate spot on this wall was taken


def _entrance_door(walls: list[_Wall]) -> tuple[_Wall, tuple[float, float]] | None:
    """The widest detected ``eshik`` — RoomPlan gives us no door semantics, and
    the entrance is in practice the widest opening in the room."""
    best: tuple[_Wall, tuple[float, float]] | None = None
    best_width = 0.0
    for wall in walls:
        for door in wall.doors:
            width = door[1] - door[0]
            if width > best_width:
                best, best_width = (wall, door), width
    return best


def _beside_door(wall: _Wall, door: tuple[float, float], clearance: float) -> float:
    """A position `clearance` clear of the door, on the side with more free
    wall (so a door in the corner does not push the device off the wall)."""
    start, end = door
    left_free = start - WALL_END_CLEAR_MM
    right_free = (wall.length_mm - WALL_END_CLEAR_MM) - end
    return start - clearance if left_free >= right_free else end + clearance


def _place_panel(placer: _Placer, walls: list[_Wall]) -> AutoDevice | None:
    entrance = _entrance_door(walls)
    if entrance is not None:
        wall, door = entrance
        return placer.add(wall, "panel", _beside_door(wall, door, PANEL_DOOR_CLEAR_MM))
    # No door detected (RoomPlan misses door-less openings in some scans):
    # the longest wall near its first corner is the conventional fallback.
    wall = max(walls, key=lambda w: w.length_mm)
    return placer.add(wall, "panel", wall.usable[0])


def _place_door_switches(placer: _Placer, walls: list[_Wall]) -> None:
    for wall in walls:
        for door in wall.doors:
            placer.add(wall, "switch1", _beside_door(wall, door, SWITCH_DOOR_CLEAR_MM))


def _place_object_sockets(placer: _Placer, walls: list[_Wall], objects) -> None:
    for obj in objects:
        kind = _OBJECT_SOCKETS.get(obj.category)
        is_bed = obj.category == "bed"
        if kind is None and not is_bed:
            continue
        centre = (obj.x, obj.y)
        # The wall "behind" the object is simply the closest one; RoomPlan's
        # yaw is unreliable for pushed-back furniture, so distance beats it.
        _, position_mm, wall = min(
            ((*_project_onto_wall(centre, w), w) for w in walls),
            key=lambda triple: triple[0],
        )
        if is_bed:
            # A bed is used from both sides; one socket per bedside.
            placer.add(wall, "socket2", position_mm - BED_SIDE_OFFSET_MM)
            placer.add(wall, "socket2", position_mm + BED_SIDE_OFFSET_MM)
        else:
            placer.add(wall, kind, position_mm)


def _place_baseline_sockets(placer: _Placer, walls: list[_Wall]) -> None:
    for wall in walls:
        lo, hi = wall.usable
        span = hi - lo
        count = 1 + int((wall.length_mm / 1000.0) // SOCKET_SPACING_M)
        for k in range(count):
            position_mm = lo + span * (k + 1) / (count + 1)
            if wall.blocked_by_door(position_mm):
                # A socket may sit under a window (normal) but never inside a
                # doorway. Shift clear of the door rather than losing the point.
                position_mm = _clear_of_doors(wall, position_mm)
                if position_mm is None:
                    continue
            placer.add(wall, "socket2", position_mm)


def _clear_of_doors(wall: _Wall, position_mm: float) -> float | None:
    lo, hi = wall.usable
    candidates = []
    for start, end in wall.doors:
        candidates.extend((start - DOOR_KEEP_OUT_MM, end + DOOR_KEEP_OUT_MM))
    free = [c for c in candidates if lo <= c <= hi and not wall.blocked_by_door(c)]
    return min(free, key=lambda c: abs(c - position_mm)) if free else None


# ---------------------------------------------------------------------------
# Lights
# ---------------------------------------------------------------------------

def _light_count(area_m2: float) -> int:
    return max(1, min(MAX_LIGHTS, round(area_m2 / LIGHT_AREA_PER_FIXTURE_M2)))


def _inside_candidates(corners: list[Point]) -> list[Point]:
    """A grid of points strictly inside the polygon, preferring ones away from
    the walls. Sampling beats any closed form here: the polygon is arbitrary
    and possibly concave, so an analytic "spread" can land in the notch."""
    min_x = min(c[0] for c in corners)
    max_x = max(c[0] for c in corners)
    min_y = min(c[1] for c in corners)
    max_y = max(c[1] for c in corners)
    steps = 24
    step_x = (max_x - min_x) / steps
    step_y = (max_y - min_y) / steps
    grid = [
        (min_x + step_x * (i + 0.5), min_y + step_y * (j + 0.5))
        for i in range(steps)
        for j in range(steps)
    ]
    inside = [p for p in grid if _point_in_polygon(p, corners)]
    if not inside:
        return []
    # A light hugging a wall reads as a mistake; only drop the margin when the
    # room is too narrow to honour it at all.
    roomy = [p for p in inside if _dist_to_edges(p, corners) >= LIGHT_EDGE_MARGIN_M]
    return roomy or inside


def _place_lights(
    corners: list[Point], area_m2: float, walls: list[_Wall], ceiling_h: float
) -> list[AutoLight]:
    if len(corners) < 3:
        return []
    count = _light_count(area_m2)
    candidates = _inside_candidates(corners)
    if not candidates:
        return []

    centroid = (
        sum(c[0] for c in corners) / len(corners),
        sum(c[1] for c in corners) / len(corners),
    )
    if count == 1:
        # Spec is "the centroid" — but the centroid of a concave polygon can
        # fall outside it, so snap to the nearest point known to be inside.
        chosen = [min(candidates, key=lambda p: _dist(p, centroid))]
    else:
        # Farthest-point sampling: deterministic, and every pick is a candidate
        # that already passed the point-in-polygon test.
        chosen = [min(candidates, key=lambda p: _dist(p, centroid))]
        while len(chosen) < count:
            nxt = max(candidates, key=lambda p: min(_dist(p, c) for c in chosen))
            if any(_dist(nxt, c) < 1e-9 for c in chosen):
                break
            chosen.append(nxt)

    out = []
    for i, pt in enumerate(chosen):
        x_mm, z_mm = _to_plan_mm(pt, corners)
        _, position_mm, wall = min(
            ((*_project_onto_wall(pt, w), w) for w in walls),
            key=lambda triple: triple[0],
        )
        out.append(AutoLight(
            id=f"auto-l{i}",
            x_mm=x_mm,
            z_mm=z_mm,
            wall_index=wall.index,
            wall_id=wall.id,
            position_mm=position_mm,
            height_mm=round(ceiling_h * 1000.0),
        ))
    return out


# ---------------------------------------------------------------------------
# Wiring
# ---------------------------------------------------------------------------

def _wiring_meters(
    panel: AutoDevice | None,
    devices: list[AutoDevice],
    lights: list[AutoLight],
    walls: list[_Wall],
    corners: list[Point],
    ceiling_h: float,
) -> float:
    """Cable from the panel to every point: around the perimeter to the point's
    wall and along it, plus the vertical difference, times the trade's slack.

    Perimeter routing (rather than a straight line through the room) is what a
    real chase actually follows, and it is the shortest of the two directions
    around the loop.
    """
    if panel is None or not walls:
        return 0.0
    perimeter_mm = sum(w.length_mm for w in walls)
    by_index = {w.index: w for w in walls}

    def around(from_mm: float, to_mm: float) -> float:
        direct = abs(to_mm - from_mm)
        return min(direct, perimeter_mm - direct) if perimeter_mm else direct

    panel_wall = by_index[panel.wall_index]
    panel_p = panel_wall.perimeter_start_mm + panel.position_mm

    total_mm = 0.0
    for device in devices:
        if device is panel:
            continue
        wall = by_index.get(device.wall_index)
        if wall is None:
            continue
        device_p = wall.perimeter_start_mm + device.position_mm
        total_mm += around(panel_p, device_p) + abs(device.height_mm - panel.height_mm)

    # A ceiling light: up the wall to the ceiling, round the perimeter to the
    # wall nearest the fixture, then across the ceiling to it.
    ceiling_mm = max(0.0, ceiling_h * 1000.0 - panel.height_mm)
    for light in lights:
        wall = by_index.get(light.wall_index)
        if wall is None:
            continue
        light_p = wall.perimeter_start_mm + light.position_mm
        # `_project_onto_wall` already gave the fixture's distance from that
        # wall when it was placed; recovering it here keeps AutoLight small.
        across_mm = _project_onto_wall(_plan_mm_to_world(light, corners), wall)[0] * 1000.0
        total_mm += around(panel_p, light_p) + ceiling_mm + across_mm

    return round(total_mm / 1000.0 * ELEC_SLACK, 2)


def _plan_mm_to_world(light: AutoLight, corners: list[Point]) -> Point:
    """Inverse of :func:`_to_plan_mm`."""
    n = len(corners)
    mean_x = sum(c[0] for c in corners) / n
    mean_y = sum(c[1] for c in corners) / n
    width = max(c[0] for c in corners) - min(c[0] for c in corners)
    depth = max(c[1] for c in corners) - min(c[1] for c in corners)
    return (
        light.x_mm / 1000.0 + mean_x - width / 2.0,
        light.z_mm / 1000.0 + mean_y - depth / 2.0,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def generate_electrical_plan(conversion: RoomScanConversion) -> AutoElectricalPlan:
    """A first-draft electrical layout for a freshly scanned room.

    Deterministic: the same conversion always yields the same plan, ids
    included, so regenerating after a re-scan replaces the previous auto plan
    rather than piling a second copy on top of it.
    """
    walls = _build_walls(conversion)
    if not walls:
        return AutoElectricalPlan()

    placer = _Placer()
    panel = _place_panel(placer, walls)
    _place_door_switches(placer, walls)
    _place_object_sockets(placer, walls, conversion.objects)
    _place_baseline_sockets(placer, walls)

    corners = list(conversion.corners)
    area_m2 = _polygon_area(corners)
    lights = _place_lights(corners, area_m2, walls, conversion.ceiling_h)

    return AutoElectricalPlan(
        devices=placer.devices,
        light_points=lights,
        wiring_meters=_wiring_meters(
            panel, placer.devices, lights, walls, corners, conversion.ceiling_h
        ),
    )
