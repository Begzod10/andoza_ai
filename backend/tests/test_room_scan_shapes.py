"""Room shapes the scan→geometry→electrical pipeline had never seen.

Everything in `test_room_scan_converter.py` and `test_room_electrical_auto.py`
runs on one kind of room: a living-room-ish space, a handful of walls, one
door, one or two windows. Whole branches therefore shipped unexercised — most
obviously the object-driven socket rules, which key off `toilet`, `sink`,
`stove`, `refrigerator`, `bathtub` and `washer`, none of which appears in any
scan fixture we hold.

The six fixtures added alongside this file are built the way the existing ones
are (flat 16-float column-major transforms, a wall's local X axis along its
length, dimensions `[length, height, thickness]`) and, crucially, with the
world origin at *device* height — the floor sits at y = -1.6, as RoomPlan
really emits it. A fixture with the floor at y = 0 encodes a false assumption
and has already cost us one bug (see the sill tests in
test_room_scan_converter.py).

Several tests below are marked BEHAVIOUR, not SPEC: they pin what the code
does today on input nobody had considered, because the right answer is a
product decision rather than a bug with one obvious fix. Each says so and says
what the open question is.
"""
from __future__ import annotations

import json
import logging
import math
from pathlib import Path

import pytest

from app.schemas.room import RoomGeometry
from app.schemas.room_scan import (
    CapturedRoom,
    ScanSurface,
    ScanTransform,
    Vec3,
    parse_captured_room,
)
from app.services.room_electrical_auto import (
    MERGE_SAME_TYPE_MM,
    MIN_SEPARATION_MM,
    PANEL_DOOR_CLEAR_MM,
    WALL_END_CLEAR_MM,
    AutoElectricalPlan,
    _place_one_switch,
    _Placer,
    _point_in_polygon,
    _Wall,
    generate_electrical_plan,
)
from app.services.room_scan_converter import RoomScanConversion, convert_captured_room

_FIXTURES = Path(__file__).parent / "fixtures"

# The six shapes, by fixture stem. Kept as a tuple so the blanket sanity test
# below fails loudly if a fixture is added without being wired in here.
SHAPES = ("bathroom", "kitchen", "multi_opening", "rect", "tiny", "corridor")


def _convert(name: str) -> RoomScanConversion:
    path = _FIXTURES / f"captured_room_{name}.json"
    return convert_captured_room(parse_captured_room(json.loads(path.read_text())))


def _plan(name: str) -> AutoElectricalPlan:
    return generate_electrical_plan(_convert(name))


def _edge_mm(conv: RoomScanConversion, index: int) -> float:
    """The true polygon edge length, which is what `_build_walls` measures —
    `Wall.length` is the same number after a 0.51..24.9 m schema clamp."""
    n = len(conv.corners)
    return math.dist(conv.corners[index], conv.corners[(index + 1) % n]) * 1000.0


def _world(conv: RoomScanConversion, wall_index: int, position_mm: float) -> tuple[float, float]:
    """A device's position on its wall, back in polygon metres."""
    n = len(conv.corners)
    (ax, ay), (bx, by) = conv.corners[wall_index], conv.corners[(wall_index + 1) % n]
    t = position_mm / _edge_mm(conv, wall_index)
    return (ax + (bx - ax) * t, ay + (by - ay) * t)


def _light_world(conv: RoomScanConversion, light) -> tuple[float, float]:
    """Inverse of `_to_plan_mm`: plan millimetres → the polygon's own frame."""
    corners = conv.corners
    mean_x = sum(c[0] for c in corners) / len(corners)
    mean_y = sum(c[1] for c in corners) / len(corners)
    width = max(c[0] for c in corners) - min(c[0] for c in corners)
    depth = max(c[1] for c in corners) - min(c[1] for c in corners)
    return (light.x_mm / 1000.0 + mean_x - width / 2.0,
            light.z_mm / 1000.0 + mean_y - depth / 2.0)


def _elements(conv: RoomScanConversion, el_type: str | None = None):
    return [e for w in conv.geometry.walls for e in w.elements
            if el_type is None or e.type == el_type]


def _of_type(plan: AutoElectricalPlan, kind: str):
    return [d for d in plan.devices if d.type == kind]


def _doors_on(conv: RoomScanConversion, wall_index: int) -> list[tuple[float, float]]:
    """(start_mm, end_mm) footprints, read the way `_build_walls` reads them."""
    length_mm = _edge_mm(conv, wall_index)
    return [
        (e.position * length_mm - e.width * 1000.0 / 2.0,
         e.position * length_mm + e.width * 1000.0 / 2.0)
        for e in conv.geometry.walls[wall_index].elements
        if e.type == "eshik"
    ]


# ---------------------------------------------------------------------------
# Blanket invariants — every shape, every device
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("name", SHAPES)
def test_converted_geometry_is_sane(name):
    """Corners, walls and openings agree with each other on every shape."""
    conv = _convert(name)
    n = len(conv.corners)
    assert n >= 3
    assert len(conv.geometry.walls) == n
    assert conv.geometry.vertices is not None and len(conv.geometry.vertices) == n
    assert [w.id for w in conv.geometry.walls] == [str(i) for i in range(n)]
    assert 2.0 <= conv.ceiling_h <= 5.0
    # No degenerate or duplicated corner.
    for i in range(n):
        assert _edge_mm(conv, i) > 100.0
    # Every opening sits on a real wall, inside it, with a sill that fits.
    for wall_index, wall in enumerate(conv.geometry.walls):
        assert 0 <= wall_index < n
        for el in wall.elements:
            assert 0.0 <= el.position <= 1.0
            assert el.sill_height + el.height <= conv.ceiling_h + 0.01


@pytest.mark.parametrize("name", SHAPES)
def test_generated_plan_is_sane(name):
    """Every device on a real wall, inside it, clear of its neighbours; every
    light inside the polygon."""
    conv = _convert(name)
    plan = _plan(name)
    n = len(conv.corners)
    assert plan, f"{name} produced no electrical plan at all"

    by_wall: dict[int, list[float]] = {}
    for device in plan.devices:
        assert 0 <= device.wall_index < n
        assert device.wall_id == str(device.wall_index)
        length_mm = _edge_mm(conv, device.wall_index)
        assert -1e-6 <= device.position_mm <= length_mm + 1e-6, (
            f"{name}: {device.type} at {device.position_mm:.1f} mm "
            f"off a {length_mm:.1f} mm wall"
        )
        for start, end in _doors_on(conv, device.wall_index):
            assert not (start <= device.position_mm <= end), (
                f"{name}: {device.type} at {device.position_mm:.1f} mm sits "
                f"inside the {start:.0f}–{end:.0f} mm opening on wall "
                f"{device.wall_index}"
            )
        by_wall.setdefault(device.wall_index, []).append(device.position_mm)

    for positions in by_wall.values():
        positions.sort()
        for a, b in zip(positions, positions[1:]):
            assert b - a >= MIN_SEPARATION_MM - 1e-6

    assert plan.light_points
    for light in plan.light_points:
        assert _point_in_polygon(_light_world(conv, light), conv.corners)
        assert 0 <= light.wall_index < n
        assert light.height_mm == round(conv.ceiling_h * 1000.0)

    assert plan.wiring_meters > 0


@pytest.mark.parametrize("name", SHAPES)
def test_exactly_one_panel_per_shape(name):
    assert len(_of_type(_plan(name), "panel")) == 1


# ---------------------------------------------------------------------------
# 1. Bathroom — toilet / sink / bathtub / washer, categories no scan had shown
# ---------------------------------------------------------------------------

def test_bathroom_converts_to_a_small_windowless_room():
    conv = _convert("bathroom")
    assert len(conv.corners) == 4
    assert {(round(x, 2), round(y, 2)) for x, y in conv.corners} == {
        (0.0, 0.0), (2.2, 0.0), (2.2, 1.8), (0.0, 1.8)
    }
    assert len(_elements(conv, "eshik")) == 1
    assert _elements(conv, "deraza") == []
    assert {o.category for o in conv.objects} == {"toilet", "sink", "bathtub", "washer"}


def test_the_washer_is_the_only_bathroom_fixture_that_gets_a_socket():
    """The one object-driven rule that fires in a bathroom, and where it lands.

    `_OBJECT_SOCKETS` carries `washer` but not `toilet`, `sink` or `bathtub`,
    so three of the four detected fixtures contribute nothing. The washer's
    socket must land against the washer, not merely somewhere on its wall.
    """
    conv, plan = _convert("bathroom"), _plan("bathroom")
    dedicated = _of_type(plan, "socket1")
    assert len(dedicated) == 1
    assert dedicated[0].height_mm == 300

    washer = next(o for o in conv.objects if o.category == "washer")
    placed = _world(conv, dedicated[0].wall_index, dedicated[0].position_mm)
    assert math.dist(placed, (washer.x, washer.y)) < 0.5


def test_a_sink_toilet_or_bathtub_alone_generates_no_dedicated_socket():
    """Sibling of `test_unwired_object_categories_are_ignored`, widened to the
    other two wet fixtures a real bathroom scan carries."""
    conv = _convert("bathroom")
    for category in ("toilet", "sink", "bathtub"):
        stripped = RoomScanConversion(
            corners=list(conv.corners),
            ceiling_h=conv.ceiling_h,
            geometry=conv.geometry,
            objects=[o for o in conv.objects if o.category == category],
        )
        plan = generate_electrical_plan(stripped)
        assert not _of_type(plan, "socket1"), category
        assert not _of_type(plan, "socket_media"), category


def test_BEHAVIOUR_a_baseline_socket_lands_against_the_bathtub():
    """BEHAVIOUR, not spec — the wet-zone question, stated as a number.

    Nothing in the generator knows a bathtub is wet. The baseline "one socket
    per wall" filler puts a 300 mm-high general-purpose socket2 on the wall the
    bath backs onto, ~0.35 m from the tub's own centre — inside what IEC 60364-7-701
    would call zone 1/2. The same run puts a socket within half a metre of the
    toilet and the panel and a light switch inside the bathroom itself.

    Whether that is acceptable is a product/regulatory decision, not something
    this test should invent, so it records the fact rather than forbidding it.
    If a wet-zone rule is ever added, THIS TEST IS EXPECTED TO FAIL and should
    be rewritten as the positive statement of that rule.
    """
    conv, plan = _convert("bathroom"), _plan("bathroom")
    wet = {o.category: (o.x, o.y) for o in conv.objects}

    nearest = {}
    for device in plan.devices:
        placed = _world(conv, device.wall_index, device.position_mm)
        for category, centre in wet.items():
            distance = math.dist(placed, centre)
            if distance < nearest.get(category, (math.inf, None))[0]:
                nearest[category] = (distance, device)

    bath_distance, bath_device = nearest["bathtub"]
    assert bath_device.type == "socket2"          # a plain socket, not the washer's
    assert bath_device.height_mm == 300
    assert bath_distance < 0.5, bath_distance
    # And the room gets consumer-unit and switchgear of its own.
    assert _of_type(plan, "panel")
    assert _of_type(plan, "switch1")


# ---------------------------------------------------------------------------
# 2. Kitchen — several dedicated appliance sockets on one counter run
# ---------------------------------------------------------------------------

def test_kitchen_appliances_each_keep_their_own_socket_when_spaced_apart():
    """The fridge and the stove sit 0.85 m apart on wall 0 — comfortably past
    the 400 mm same-type merge — so both dedicated circuits survive."""
    conv, plan = _convert("kitchen"), _plan("kitchen")
    dedicated = sorted(_of_type(plan, "socket1"), key=lambda d: d.position_mm)
    assert len(dedicated) == 2
    assert {d.wall_index for d in dedicated} == {0}
    assert all(d.height_mm == 300 for d in dedicated)

    for device, category in zip(dedicated, ("refrigerator", "stove")):
        obj = next(o for o in conv.objects if o.category == category)
        placed = _world(conv, device.wall_index, device.position_mm)
        assert math.dist(placed, (obj.x, obj.y)) < 0.5, category

    assert dedicated[1].position_mm - dedicated[0].position_mm >= MERGE_SAME_TYPE_MM


def test_the_kitchen_sink_gets_nothing_while_the_counter_run_is_wired():
    """Documents the gap: `sink` is not in `_OBJECT_SOCKETS`, so the worktop
    beside it is covered only by whatever baseline socket happens to land
    there."""
    conv, plan = _convert("kitchen"), _plan("kitchen")
    sink = next(o for o in conv.objects if o.category == "sink")
    dedicated = [
        d for d in _of_type(plan, "socket1")
        if math.dist(_world(conv, d.wall_index, d.position_mm), (sink.x, sink.y)) < 0.5
    ]
    assert not dedicated


def test_two_appliances_closer_than_400mm_each_keep_their_own_socket():
    """A dedicated circuit is a requirement, not a detection to be deduplicated.

    The same-type merge exists to collapse two boxes reported for one
    television; `socket1` means "this appliance needs its own circuit", so a
    slide-in stove 300 mm from the fridge is two requirements and must come
    back as two sockets, nudged apart rather than merged away. `NO_MERGE_TYPES`
    exempts it, so the pair falls through to the ordinary separation rule.
    """
    conv = _convert("kitchen")
    fridge = next(o for o in conv.objects if o.category == "refrigerator")
    stove = next(o for o in conv.objects if o.category == "stove")
    # Move the stove to 300 mm from the fridge, still on the same wall.
    stove.x = fridge.x + 0.3
    stove.y = fridge.y

    plan = generate_electrical_plan(RoomScanConversion(
        corners=list(conv.corners), ceiling_h=conv.ceiling_h,
        geometry=conv.geometry, objects=[fridge, stove],
    ))
    dedicated = sorted(_of_type(plan, "socket1"), key=lambda d: d.position_mm)
    assert len(dedicated) == 2                       # ← two appliances, two sockets
    assert dedicated[1].position_mm - dedicated[0].position_mm >= MIN_SEPARATION_MM
    assert dedicated[1].position_mm - dedicated[0].position_mm < MERGE_SAME_TYPE_MM
    # Each socket against the appliance that asked for it, in scan order.
    for device, obj in zip(dedicated, (fridge, stove)):
        placed = _world(conv, device.wall_index, device.position_mm)
        assert math.dist(placed, (obj.x, obj.y)) < 0.5

    # The merge itself is untouched: the same room with the appliances swapped
    # gives the same two sockets, so the result no longer depends on scan order.
    swapped = generate_electrical_plan(RoomScanConversion(
        corners=list(conv.corners), ceiling_h=conv.ceiling_h,
        geometry=conv.geometry, objects=[stove, fridge],
    ))
    assert sorted(round(d.position_mm) for d in _of_type(swapped, "socket1")) == \
           sorted(round(d.position_mm) for d in dedicated)


def test_the_kitchen_window_and_door_share_a_wall_without_confusing_placement():
    conv, plan = _convert("kitchen"), _plan("kitchen")
    wall_index = next(i for i, w in enumerate(conv.geometry.walls) if len(w.elements) == 2)
    assert {e.type for e in conv.geometry.walls[wall_index].elements} == {"eshik", "deraza"}
    # The panel and the door switch both went to that wall, beside the door.
    assert _of_type(plan, "panel")[0].wall_index == wall_index
    assert [s.wall_index for s in _of_type(plan, "switch1")] == [wall_index]


# ---------------------------------------------------------------------------
# 3. Two doors on one wall, two windows on another
# ---------------------------------------------------------------------------

def test_two_doors_on_one_wall_each_get_their_own_switch():
    """The switch-beside-each-door rule had only ever seen one door per wall."""
    conv, plan = _convert("multi_opening"), _plan("multi_opening")
    doors = _doors_on(conv, 0)
    assert len(doors) == 2

    switches = _of_type(plan, "switch1")
    assert len(switches) == 2
    assert {s.wall_index for s in switches} == {0}
    assert all(s.height_mm == 900 for s in switches)
    # One switch within 150 mm + the nudge grid of each door's nearest jamb.
    for start, end in doors:
        assert any(min(abs(s.position_mm - start), abs(s.position_mm - end)) < 400.0
                   for s in switches)


def test_two_windows_on_one_wall_both_survive_conversion():
    conv = _convert("multi_opening")
    wall_index = next(i for i, w in enumerate(conv.geometry.walls)
                      if sum(e.type == "deraza" for e in w.elements) == 2)
    windows = [e for e in conv.geometry.walls[wall_index].elements if e.type == "deraza"]
    assert len(windows) == 2
    # Distinct positions, both floor-relative sills off the 0.9 m fallback.
    assert abs(windows[0].position - windows[1].position) > 0.1
    assert all(abs(w.sill_height - 0.85) < 0.01 for w in windows)


def test_baseline_sockets_dodge_both_door_footprints():
    """Door-footprint avoidance with more than one footprint on the wall."""
    conv, plan = _convert("multi_opening"), _plan("multi_opening")
    doors = _doors_on(conv, 0)
    sockets = [d for d in plan.devices
               if d.wall_index == 0 and d.type.startswith("socket")]
    assert sockets
    for socket in sockets:
        for start, end in doors:
            assert not (start <= socket.position_mm <= end), (socket.position_mm, start, end)


def test_the_panel_clears_both_doors_when_a_wall_carries_two():
    conv, plan = _convert("multi_opening"), _plan("multi_opening")
    panel = _of_type(plan, "panel")[0]
    assert panel.wall_index == 0
    assert panel.height_mm == 1500
    # `_entrance_door` picks the widest door; the two here are the same width,
    # so the first detected wins. What matters is that the panel ends up clear
    # of EVERY door footprint on the wall, not just the one it was derived from.
    for start, end in _doors_on(conv, 0):
        assert not (start <= panel.position_mm <= end)


# ---------------------------------------------------------------------------
# 4. Plain axis-aligned rectangle — the legacy A/B/C/D path
# ---------------------------------------------------------------------------

def test_a_four_wall_scan_keeps_its_scanned_vertices():
    """`RoomGeometry._normalize_polygon` auto-fills vertices for ANY 4-wall
    room from `walls[0].length × walls[1].length`. The converter must always
    hand it real vertices so that fill never runs on a scan."""
    conv = _convert("rect")
    assert len(conv.geometry.walls) == 4
    assert conv.geometry.vertices is not None
    assert [(round(x, 3), round(y, 3)) for x, y in conv.geometry.vertices] == \
           [(round(x, 3), round(y, 3)) for x, y in conv.corners]
    assert {(round(x, 2), round(y, 2)) for x, y in conv.corners} == {
        (0.0, 0.0), (4.5, 0.0), (4.5, 3.2), (0.0, 3.2)
    }


def test_the_legacy_rectangle_fill_would_misplace_a_rotated_four_wall_scan():
    """Why the assertion above matters: for an axis-aligned rectangle the
    legacy fill happens to agree, so it hides the problem. A room scanned at an
    angle — the normal case, since RoomPlan's axes follow the device, not the
    building — disagrees by metres. Any path that drops `vertices` and lets
    `_normalize_polygon` re-derive them silently un-rotates the room.
    """
    angle = math.radians(30.0)
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    rect = [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (0.0, 3.0)]
    rotated = [(x * cos_a - z * sin_a, x * sin_a + z * cos_a) for x, z in rect]

    conv = convert_captured_room(CapturedRoom(
        walls=[_wall_surface(*rotated[i], *rotated[(i + 1) % 4]) for i in range(4)]
    ))
    assert len(conv.geometry.walls) == 4
    assert conv.geometry.vertices is not None

    # Drop the vertices and let the legacy validator fill them back in.
    refilled = RoomGeometry(walls=[w.model_copy(deep=True) for w in conv.geometry.walls])
    assert refilled.vertices is not None
    worst = max(math.dist(a, b) for a, b in zip(conv.geometry.vertices, refilled.vertices))
    assert worst > 1.0, worst           # metres apart, not rounding


def test_a_plain_rectangle_wires_every_wall():
    conv, plan = _convert("rect"), _plan("rect")
    sockets_per_wall: dict[int, int] = {}
    for device in plan.devices:
        if device.type.startswith("socket"):
            sockets_per_wall[device.wall_index] = sockets_per_wall.get(device.wall_index, 0) + 1
    assert set(sockets_per_wall) == {0, 1, 2, 3}
    # 4.5 m walls take 1 + floor(4.5/3.5) = 2 baseline sockets; 3.2 m walls, 1.
    assert sockets_per_wall[1] == sockets_per_wall[3] == 1
    # The TV against wall 0 pulled a media plate at 1200 mm.
    media = _of_type(plan, "socket_media")
    assert len(media) == 1 and media[0].height_mm == 1200
    tv = next(o for o in conv.objects if o.category == "television")
    assert math.dist(_world(conv, media[0].wall_index, media[0].position_mm), (tv.x, tv.y)) < 0.5


# ---------------------------------------------------------------------------
# 5. Extremes — a 1.5 × 2 m room and a 1.2 × 8 m corridor
# ---------------------------------------------------------------------------

def test_a_three_square_metre_room_still_gets_exactly_one_light():
    """`clamp(round(area / 12), 1, 4)` rounds 3 m² / 12 to 0; the floor at 1 is
    what stops a tiny room coming back unlit."""
    conv, plan = _convert("tiny"), _plan("tiny")
    assert abs(_area(conv.corners) - 3.0) < 0.05
    assert len(plan.light_points) == 1
    assert _point_in_polygon(_light_world(conv, plan.light_points[0]), conv.corners)


def test_a_corridor_gets_one_light_and_three_sockets_along_each_long_wall():
    """`1 + floor(length / 3.5)` at the long end: an 8 m wall takes three."""
    conv, plan = _convert("corridor"), _plan("corridor")
    assert abs(_area(conv.corners) - 9.6) < 0.05
    assert len(plan.light_points) == 1          # round(9.6 / 12) == 1

    long_walls = [i for i in range(4) if _edge_mm(conv, i) > 5000.0]
    assert len(long_walls) == 2
    for index in long_walls:
        sockets = [d for d in plan.devices
                   if d.wall_index == index and d.type.startswith("socket")]
        assert len(sockets) == 3
        positions = sorted(d.position_mm for d in sockets)
        # Evenly spread inside the corner clearance, nothing bunched at an end.
        assert positions[0] >= WALL_END_CLEAR_MM - 1e-6
        assert positions[-1] <= _edge_mm(conv, index) - WALL_END_CLEAR_MM + 1e-6
        gaps = [b - a for a, b in zip(positions, positions[1:])]
        assert max(gaps) - min(gaps) < 1.0


def test_a_wall_barely_wider_than_the_clearances_does_not_divide_by_zero():
    """A 1.2 m wall has 0.6 m of usable span once both 300 mm corner clearances
    are taken; the 1.5 m room's walls are tighter still. Neither may crash or
    push a device off the end."""
    for name in ("tiny", "corridor"):
        conv, plan = _convert(name), _plan(name)
        short = [i for i in range(len(conv.corners)) if _edge_mm(conv, i) <= 2000.0]
        assert short
        for device in plan.devices:
            if device.wall_index in short:
                assert 0.0 <= device.position_mm <= _edge_mm(conv, device.wall_index)


def test_a_narrow_wall_moves_its_switch_round_the_corner():
    """A switch never lands in the opening; on a wall its door fills it steps
    onto the wall beside the frame.

    Corridor, wall 0 and wall 2: a 1.2 m wall with an 0.85 m door leaves
    175 mm at each end, so with the door keep-out applied there is no legal
    position on the door wall at all and fallback (1) fires — each switch ends
    up on the adjoining long wall, 300 mm from the corner the door stands by.
    Both doors are centred, so no hung side can be read from the geometry and
    the tie goes to the wall the edge runs into (wall 1 for the door on wall 0,
    wall 3 for the one on wall 2).

    The 1.5 m room keeps its switch on its own door wall: once the panel
    relocates (see the panel test below) the clamped 300 mm spot is free, and
    300 mm is outside the 400–1100 mm opening.
    """
    conv, plan = _convert("corridor"), _plan("corridor")
    switches = sorted(_of_type(plan, "switch1"), key=lambda s: s.wall_index)
    assert [s.wall_index for s in switches] == [1, 3]
    for switch in switches:
        assert not _doors_on(conv, switch.wall_index)       # a wall with room
        assert switch.position_mm == pytest.approx(WALL_END_CLEAR_MM)
        assert switch.height_mm == 900

    conv, plan = _convert("tiny"), _plan("tiny")
    switch = _of_type(plan, "switch1")[0]
    start, end = _doors_on(conv, switch.wall_index)[0]
    assert not (start <= switch.position_mm <= end), (switch.position_mm, start, end)
    assert switch.position_mm == pytest.approx(WALL_END_CLEAR_MM)


def _bare_wall(index: int, length_mm: float, doors=()) -> _Wall:
    """A wall with no room behind it — enough for the placement rules, which
    only ever read `length_mm`, `doors` and the ids."""
    return _Wall(index=index, id=str(index), a=(0.0, 0.0),
                 b=(length_mm / 1000.0, 0.0), length_mm=length_mm,
                 doors=list(doors))


def test_the_panel_yields_its_spot_when_it_is_the_switch_s_only_one():
    """Fallback (2): a consumer unit can hang anywhere sensible, a switch cannot.

    No scanned fixture reaches this branch, and that is by construction — once
    the panel relocates rather than degrading (the test below), a panel that
    stays on a door wall is at least 400 mm from the jamb while the switch aims
    150 mm off it, so the two can no longer collide. The rule still has to hold
    for the shapes we have not seen, so it is exercised directly rather than
    carried as untested code: a 1.5 m door wall whose one legal spot the panel
    holds, between two 0.4 m notches that are already full.
    """
    door = (400.0, 1100.0)
    walls = [_bare_wall(0, 1500.0, [door]), _bare_wall(1, 400.0),
             _bare_wall(2, 4000.0), _bare_wall(3, 400.0)]
    placer = _Placer()
    panel = placer.add(walls[0], "panel", 300.0)
    for notch in (walls[1], walls[3]):               # both neighbours full
        assert placer.add(notch, "socket2", 0.0) is not None

    switch = _place_one_switch(placer, walls, walls[0], door)
    assert switch is not None
    assert switch.wall_index == 0
    assert switch.position_mm == pytest.approx(300.0)   # the panel's old spot

    moved = placer.first("panel")
    assert moved is not None and moved is not panel
    assert moved.wall_index == 2                        # the only wall left
    assert panel not in placer.devices
    assert len({d.id for d in placer.devices}) == len(placer.devices)


def test_a_switch_is_left_out_loudly_rather_than_placed_in_the_doorway(caplog):
    """Fallback (3): every wall in this room is its own door, so there is
    nowhere legal at all — and the plan says so instead of quietly putting the
    switch in the opening."""
    door = (175.0, 1025.0)
    walls = [_bare_wall(i, 1200.0, [door]) for i in range(4)]
    placer = _Placer()
    with caplog.at_level(logging.WARNING, logger="app.services.room_electrical_auto"):
        assert _place_one_switch(placer, walls, walls[0], door) is None
    assert not placer.devices
    assert any("no legal position for the switch" in r.message for r in caplog.records)


def test_a_wall_the_door_fills_gets_no_baseline_socket_and_says_so(caplog):
    """"One socket per wall" is the aim, not a guarantee — and the gap is logged.

    `_clear_of_doors` only offers the two jamb-plus-keep-out points, and on the
    corridor's 1.2 m end walls both fall outside the usable span: there is
    genuinely no wall left to put a socket on, so skipping it is right. What
    was wrong was doing it silently while `_Wall.usable` promised otherwise.
    The docstring now matches the code, and the skip is a warning naming the
    wall, so nobody has to re-derive it from the output.
    """
    with caplog.at_level(logging.WARNING, logger="app.services.room_electrical_auto"):
        conv, plan = _convert("corridor"), _plan("corridor")

    short = [i for i in range(4) if _edge_mm(conv, i) <= 2000.0]
    assert short
    for index in short:
        assert _doors_on(conv, index)
        assert not [d for d in plan.devices
                    if d.wall_index == index and d.type.startswith("socket")]
        assert any(
            f"wall {index}" in r.message and "no baseline socket" in r.message
            for r in caplog.records
        ), caplog.text


@pytest.mark.parametrize("name", ["tiny", "corridor"])
def test_the_panel_moves_to_a_wall_that_can_hold_its_door_clearance(name):
    """`PANEL_DOOR_CLEAR_MM` is 400 mm, and on these rooms' door walls the
    clamp to the usable span could only give it 100–125 mm. A consumer unit is
    the least constrained device in the room, so it moves to the wall the
    entrance opens towards instead of accepting a quarter of its clearance.

    It lands 600 mm past that wall's own corner clearance, leaving the spot
    right beside the door frame for the switch the same narrow wall displaces.
    """
    conv, plan = _convert(name), _plan(name)
    panel = _of_type(plan, "panel")[0]
    assert panel.height_mm == 1500
    assert panel.wall_index == 1                      # the wall the edge runs into
    assert not _doors_on(conv, panel.wall_index)
    assert panel.position_mm == pytest.approx(WALL_END_CLEAR_MM + 600.0)

    # Whatever wall it ended on, it is clear of every opening in the room by
    # the full clearance, measured in metres across the polygon.
    placed = _world(conv, panel.wall_index, panel.position_mm)
    for index in range(len(conv.corners)):
        for start, end in _doors_on(conv, index):
            for jamb in (start, end):
                assert math.dist(placed, _world(conv, index, jamb)) >= \
                       PANEL_DOOR_CLEAR_MM / 1000.0 - 1e-6


def test_a_sub_clearance_wall_places_its_device_at_the_midpoint():
    """A polygon edge shorter than 2 × `WALL_END_CLEAR_MM` collapses `usable`
    to its midpoint instead of an empty range — and the midpoint is measured on
    the TRUE edge, not on `Wall.length`, which the 0.51 m schema floor inflates.
    """
    # A 6-wall room with a 0.25 m notch; the straightener keeps it as a short
    # edge, and the schema clamps that wall's stored length up to 0.51 m.
    points = [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (3.75, 3.0), (3.75, 3.4), (0.0, 3.4)]
    conv = convert_captured_room(CapturedRoom(walls=[
        _wall_surface(*points[i], *points[(i + 1) % len(points)])
        for i in range(len(points))
    ]))
    short = min(range(len(conv.corners)), key=lambda i: _edge_mm(conv, i))
    true_mm = _edge_mm(conv, short)
    assert true_mm < 2 * WALL_END_CLEAR_MM
    assert conv.geometry.walls[short].length * 1000.0 > true_mm   # the clamp bit

    plan = generate_electrical_plan(conv)
    on_short = [d for d in plan.devices if d.wall_index == short]
    assert len(on_short) == 1
    assert on_short[0].position_mm == pytest.approx(true_mm / 2.0, abs=1.0)


# ---------------------------------------------------------------------------
# Helpers that build synthetic scans, kept at the bottom like the fixture
# builders in test_room_scan_converter.py
# ---------------------------------------------------------------------------

_FLOOR_Y = -1.6      # RoomPlan's origin is at device height, never on the floor


def _wall_surface(x0: float, z0: float, x1: float, z1: float, height: float = 2.5) -> ScanSurface:
    """A wall from (x0, z0) to (x1, z1), transform shaped like the fixtures'."""
    dx, dz = x1 - x0, z1 - z0
    length = math.hypot(dx, dz)
    ux, uz = dx / length, dz / length
    m = [ux, 0, uz, 0,
         0, 1, 0, 0,
         -uz, 0, ux, 0,
         (x0 + x1) / 2, _FLOOR_Y + height / 2, (z0 + z1) / 2, 1]
    return ScanSurface(
        dimensions=Vec3(x=length, y=height, z=0.0),
        transform=ScanTransform(m=[float(v) for v in m]),
    )


def _area(poly: list[tuple[float, float]]) -> float:
    n = len(poly)
    acc = 0.0
    for i in range(n):
        p1, p2 = poly[i], poly[(i + 1) % n]
        acc += p1[0] * p2[1] - p2[0] * p1[1]
    return abs(acc) / 2.0


def test_every_fixture_in_this_suite_has_a_device_height_origin():
    """Guards the fixtures themselves: a floor at y = 0 is a false assumption
    about RoomPlan and has already caused one real bug here."""
    from app.services.room_scan_converter import _floor_level

    for name in SHAPES:
        room = parse_captured_room(
            json.loads((_FIXTURES / f"captured_room_{name}.json").read_text())
        )
        assert _floor_level(room.walls) == pytest.approx(_FLOOR_Y), name
