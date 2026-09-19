"""Auto-generated electrical plan for a scanned room.

Two halves, matching the two halves of the feature:

* the placement rules themselves — pure, no DB, exercised on real polygons
  (including the non-convex 5-wall shape a real scan produces, the one the old
  ``wall_index <= 3`` CHECK made unstorable);
* the upload wiring — run against a hand-written session double rather than an
  ``AsyncMock``, because a mock DB is exactly what let the last room-scan 500
  through (see the ``db.refresh`` note in test_room_scan_router.py): with
  ``AsyncMock`` every query silently answers "a mock", so nothing about the
  real branch logic is tested.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy.sql import Delete, Select

import app.routers.rooms as rooms_mod
from app.models.electrical import ElectricalDevice, RoomElectrical
from app.models.room import Room
from app.schemas.room import RoomGeometry, Wall, WallElement
from app.services.room_electrical_auto import (
    MIN_SEPARATION_MM,
    AutoElectricalPlan,
    _point_in_polygon,
    generate_electrical_plan,
)
from app.services.room_scan_converter import RoomScanConversion, ScanObjectPlacement

# A real scan's shape: five walls, concave at (3, 3). 22.5 m².
L_ROOM = [(0.0, 0.0), (6.0, 0.0), (6.0, 6.0), (3.0, 6.0), (3.0, 3.0)]
RECT_ROOM = [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (0.0, 3.0)]

# The same RoomPlan capture the converter parity test uses.
_SCAN_FIXTURE = (Path(__file__).parent / "fixtures" / "captured_room_sample.json").read_text()


def _conversion(
    corners=None,
    *,
    doors: dict[int, list[tuple[float, float]]] | None = None,
    windows: dict[int, list[float]] | None = None,
    objects: list[ScanObjectPlacement] | None = None,
    ceiling_h: float = 2.8,
) -> RoomScanConversion:
    """A conversion shaped exactly like `convert_captured_room` produces one.

    `doors` maps a wall index to (position 0..1, width m) pairs; `windows` to
    bare positions. Wall lengths come from the polygon edges, so the walls and
    the corners agree the way the converter guarantees they do.
    """
    corners = list(corners or L_ROOM)
    doors = doors or {}
    windows = windows or {}
    n = len(corners)
    walls = []
    for i in range(n):
        a, b = corners[i], corners[(i + 1) % n]
        length = ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5
        elements = [
            WallElement(type="eshik", width=width, height=2.1, position=pos)
            for pos, width in doors.get(i, [])
        ] + [
            WallElement(type="deraza", width=1.4, height=1.4, sill_height=0.9, position=pos)
            for pos in windows.get(i, [])
        ]
        walls.append(Wall(id=str(i), length=round(length, 3), elements=elements))
    return RoomScanConversion(
        corners=corners,
        ceiling_h=ceiling_h,
        geometry=RoomGeometry(walls=walls, vertices=[(c[0], c[1]) for c in corners]),
        objects=list(objects or []),
    )


def _obj(category: str, x: float, y: float) -> ScanObjectPlacement:
    return ScanObjectPlacement(
        category=category, x=x, y=y,
        width=1.2, depth=0.6, height=0.8, rotation_rad=0.0, confidence="high",
    )


def _of_type(plan: AutoElectricalPlan, kind: str):
    return [d for d in plan.devices if d.type == kind]


# ---------------------------------------------------------------------------
# Placement rules
# ---------------------------------------------------------------------------

def test_five_wall_room_places_devices_on_wall_index_4():
    """The regression the old CHECK (wall_index <= 3) blocked outright."""
    plan = generate_electrical_plan(_conversion(L_ROOM))
    indices = {d.wall_index for d in plan.devices}
    assert indices == {0, 1, 2, 3, 4}
    assert max(d.wall_index for d in plan.devices) == 4


def test_every_wall_gets_at_least_one_socket_plus_one_per_3_5_m():
    plan = generate_electrical_plan(_conversion(L_ROOM))
    per_wall: dict[int, int] = {}
    for d in plan.devices:
        if d.type.startswith("socket"):
            per_wall[d.wall_index] = per_wall.get(d.wall_index, 0) + 1
    assert set(per_wall) == {0, 1, 2, 3, 4}
    # 6 m and 6 m walls take two each; the 3 m ones take one.
    assert per_wall[0] >= 2 and per_wall[1] >= 2
    assert per_wall[2] >= 1 and per_wall[3] >= 1


def test_exactly_one_panel_beside_the_entrance_door():
    door_pos, door_width = 0.5, 0.9
    plan = generate_electrical_plan(_conversion(L_ROOM, doors={2: [(door_pos, door_width)]}))
    panels = _of_type(plan, "panel")
    assert len(panels) == 1
    panel = panels[0]
    assert panel.wall_index == 2
    assert panel.height_mm == 1500
    # 400 mm clear of the nearest jamb of a 900 mm door centred on a 3 m wall.
    jamb = door_pos * 3000 - door_width * 1000 / 2
    assert abs(abs(panel.position_mm - jamb) - 400) < 1.0


def test_panel_falls_back_to_the_longest_wall_when_no_door_was_detected():
    plan = generate_electrical_plan(_conversion(L_ROOM))
    panel = _of_type(plan, "panel")[0]
    # Walls 0 and 1 are both 6 m — the first of the longest wins.
    assert panel.wall_index == 0
    assert panel.position_mm == pytest.approx(300.0)  # near the corner


def test_a_switch_lands_beside_every_door():
    plan = generate_electrical_plan(
        _conversion(L_ROOM, doors={0: [(0.5, 0.9)], 2: [(0.5, 0.9)]})
    )
    switches = _of_type(plan, "switch1")
    assert {s.wall_index for s in switches} == {0, 2}
    assert all(s.height_mm == 900 for s in switches)


def test_no_socket_sits_inside_a_doorway():
    door_pos, door_width = 0.5, 1.0
    plan = generate_electrical_plan(_conversion(L_ROOM, doors={0: [(door_pos, door_width)]}))
    start = door_pos * 6000 - door_width * 1000 / 2
    end = door_pos * 6000 + door_width * 1000 / 2
    for device in plan.devices:
        if device.wall_index == 0 and device.type.startswith("socket"):
            assert not (start <= device.position_mm <= end)


def test_a_walled_in_door_does_not_cost_that_wall_its_socket():
    """The door keep-out must move the baseline socket, not delete it — a 3 m
    wall with a door centred on it has only ~600 mm of room either side."""
    plan = generate_electrical_plan(_conversion(L_ROOM, doors={2: [(0.5, 0.9)]}))
    on_wall_2 = [d for d in plan.devices if d.wall_index == 2 and d.type.startswith("socket")]
    assert len(on_wall_2) == 1
    start, end = 1500 - 450, 1500 + 450
    assert not (start <= on_wall_2[0].position_mm <= end)


def test_a_socket_under_a_window_is_fine():
    """Windows are not keep-out zones — a socket below one is normal practice."""
    plan = generate_electrical_plan(_conversion(RECT_ROOM, windows={0: [0.5]}))
    on_wall_0 = [d for d in plan.devices if d.wall_index == 0 and d.type.startswith("socket")]
    assert on_wall_0


def test_a_television_gets_a_media_socket_at_1200mm():
    tv = _obj("television", x=3.0, y=0.3)  # against wall 0 (y = 0)
    plan = generate_electrical_plan(_conversion(L_ROOM, objects=[tv]))
    media = _of_type(plan, "socket_media")
    assert len(media) == 1
    assert media[0].height_mm == 1200
    assert media[0].wall_index == 0
    assert media[0].position_mm == pytest.approx(3000.0, abs=1.0)


def test_a_bed_gets_a_socket_either_side():
    bed = _obj("bed", x=3.0, y=0.4)
    plan = generate_electrical_plan(_conversion(RECT_ROOM, objects=[bed]))
    on_wall_0 = sorted(
        d.position_mm for d in plan.devices if d.wall_index == 0 and d.type == "socket2"
    )
    # 700 mm either side of the bed's projected centre (3000 mm), both still
    # on the wall.
    assert any(abs(p - 2300.0) < 1.0 for p in on_wall_0)
    assert any(abs(p - 3700.0) < 1.0 for p in on_wall_0)


@pytest.mark.parametrize("category", ["refrigerator", "stove", "washer"])
def test_appliances_get_a_dedicated_single_socket(category):
    plan = generate_electrical_plan(
        _conversion(RECT_ROOM, objects=[_obj(category, x=2.0, y=0.3)])
    )
    dedicated = _of_type(plan, "socket1")
    assert len(dedicated) == 1
    assert dedicated[0].wall_index == 0
    assert dedicated[0].height_mm == 300


def test_unwired_object_categories_are_ignored():
    plan = generate_electrical_plan(
        _conversion(RECT_ROOM, objects=[_obj("toilet", 2.0, 0.3), _obj("chair", 2.0, 1.0)])
    )
    assert not _of_type(plan, "socket1")
    assert not _of_type(plan, "socket_media")


def test_no_two_devices_share_a_spot():
    """Two TVs against the same patch of wall must not stack."""
    objects = [_obj("television", 3.0, 0.3), _obj("television", 3.1, 0.3), _obj("sofa", 3.0, 0.5)]
    plan = generate_electrical_plan(_conversion(L_ROOM, objects=objects))
    by_wall: dict[int, list[float]] = {}
    for d in plan.devices:
        by_wall.setdefault(d.wall_index, []).append(d.position_mm)
    for positions in by_wall.values():
        positions.sort()
        for a, b in zip(positions, positions[1:]):
            assert b - a >= MIN_SEPARATION_MM - 1e-6
    # The near-identical TVs merged into one media socket.
    assert len(_of_type(plan, "socket_media")) == 1


def test_devices_keep_clear_of_the_wall_ends():
    plan = generate_electrical_plan(_conversion(L_ROOM))
    lengths = {i: w.length * 1000 for i, w in enumerate(_conversion(L_ROOM).geometry.walls)}
    for device in plan.devices:
        assert device.position_mm >= 300.0 - 1e-6
        assert device.position_mm <= lengths[device.wall_index] - 300.0 + 1e-6


# ---------------------------------------------------------------------------
# Lights
# ---------------------------------------------------------------------------

def test_lights_land_inside_a_non_convex_polygon():
    conv = _conversion(L_ROOM)
    plan = generate_electrical_plan(conv)
    assert plan.light_points
    # room.state stores plan-frame mm; convert back to the world frame the
    # polygon is expressed in before testing containment.
    mean_x = sum(c[0] for c in L_ROOM) / len(L_ROOM)
    mean_y = sum(c[1] for c in L_ROOM) / len(L_ROOM)
    width = max(c[0] for c in L_ROOM) - min(c[0] for c in L_ROOM)
    depth = max(c[1] for c in L_ROOM) - min(c[1] for c in L_ROOM)
    for light in plan.light_points:
        world = (light.x_mm / 1000 + mean_x - width / 2, light.z_mm / 1000 + mean_y - depth / 2)
        assert _point_in_polygon(world, L_ROOM), world


def test_the_concave_notch_is_outside_the_polygon():
    """Guards the containment test above: a point in the cut-out corner of the
    L must read as outside, or the assertion proves nothing."""
    assert not _point_in_polygon((1.0, 5.0), L_ROOM)
    assert _point_in_polygon((4.5, 4.5), L_ROOM)


@pytest.mark.parametrize(
    "corners, expected",
    [
        ([(0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (0.0, 2.0)], 1),        # 4 m²
        ([(0.0, 0.0), (5.0, 0.0), (5.0, 4.0), (0.0, 4.0)], 2),        # 20 m²
        ([(0.0, 0.0), (10.0, 0.0), (10.0, 9.0), (0.0, 9.0)], 4),      # 90 m² → capped
    ],
)
def test_light_count_scales_with_floor_area_and_caps_at_four(corners, expected):
    plan = generate_electrical_plan(_conversion(corners))
    assert len(plan.light_points) == expected


def test_several_lights_are_spread_apart():
    plan = generate_electrical_plan(
        _conversion([(0.0, 0.0), (10.0, 0.0), (10.0, 9.0), (0.0, 9.0)])
    )
    points = [(light.x_mm, light.z_mm) for light in plan.light_points]
    assert len(points) == 4
    for i, a in enumerate(points):
        for b in points[i + 1:]:
            assert ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5 > 1000.0


# ---------------------------------------------------------------------------
# Wiring + determinism
# ---------------------------------------------------------------------------

def test_wiring_meters_is_a_plausible_run_for_the_point_count():
    plan = generate_electrical_plan(_conversion(L_ROOM))
    points = len(plan.devices) + len(plan.light_points)
    assert plan.wiring_meters > 0
    # Sanity band, not a golden number: a 22.5 m² room's runs average somewhere
    # between one and two perimeters per point (perimeter ≈ 22.2 m).
    assert 2.0 < plan.wiring_meters / points < 25.0


def test_a_degenerate_conversion_yields_an_empty_plan_rather_than_raising():
    conv = _conversion(L_ROOM)
    conv.corners = []
    plan = generate_electrical_plan(conv)
    assert not plan
    assert plan.wiring_meters == 0.0


def test_generation_is_deterministic_ids_included():
    first = generate_electrical_plan(_conversion(L_ROOM, objects=[_obj("sofa", 3.0, 0.4)]))
    second = generate_electrical_plan(_conversion(L_ROOM, objects=[_obj("sofa", 3.0, 0.4)]))
    assert first.electricals == second.electricals
    assert first.lights == second.lights
    assert first.wiring_meters == second.wiring_meters


def test_every_generated_entry_is_marked_auto():
    plan = generate_electrical_plan(_conversion(L_ROOM))
    assert all(e["auto"] is True for e in plan.electricals)
    assert all(light["auto"] is True for light in plan.lights)


def test_state_shape_matches_the_frontend_placed_electrical():
    plan = generate_electrical_plan(_conversion(L_ROOM))
    entry = plan.electricals[0]
    assert set(entry) == {"id", "type", "wallId", "positionMm", "heightMm", "auto"}
    assert entry["wallId"] in {"0", "1", "2", "3", "4"}
    assert set(plan.lights[0]) == {"id", "xMm", "zMm", "auto"}


# ---------------------------------------------------------------------------
# Upload wiring (router)
# ---------------------------------------------------------------------------

class _Scalar:
    def __init__(self, value):
        self._value = value

    def scalar_one(self):
        return self._value

    def scalar_one_or_none(self):
        return self._value


class _Nested:
    """Stands in for `AsyncSession.begin_nested()`'s savepoint context."""

    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        self._session.savepoints += 1
        return self

    async def __aexit__(self, *exc):
        return False


class _Session:
    """A session double that answers the queries the router really issues.

    Deliberately not an AsyncMock: the branch under test is "does this room
    already have devices?", and a mock answers that question with a mock.
    """

    def __init__(self, room: Room, device_count: int = 0, header: RoomElectrical | None = None):
        self.room = room
        self.device_count = device_count
        self.header = header
        self.added: list = []
        self.deleted_device_rows = 0
        self.savepoints = 0
        self.flushes = 0

    async def execute(self, statement):
        text = str(statement)
        if isinstance(statement, Delete):
            self.deleted_device_rows += 1
            return _Scalar(None)
        assert isinstance(statement, Select), text
        if "count(" in text:
            return _Scalar(self.device_count)
        if "FROM room_electrical" in text:
            return _Scalar(self.header)
        return _Scalar(self.room)

    def add(self, obj):
        self.added.append(obj)

    def add_all(self, objs):
        self.added.extend(objs)

    async def flush(self):
        self.flushes += 1

    async def refresh(self, obj):
        return None

    def begin_nested(self):
        return _Nested(self)

    @property
    def added_devices(self) -> list[ElectricalDevice]:
        return [o for o in self.added if isinstance(o, ElectricalDevice)]


def _room(state=None, room_scan=None) -> Room:
    return Room(
        id=uuid.uuid4(),
        apartment_id=uuid.uuid4(),
        name="Skanerlangan xona",
        ceiling_h=2.8,
        geometry=None,
        surfaces=None,
        furniture_layout=[],
        state=state,
        room_scan=room_scan,
        floor_area=0.0,
        net_wall_area=0.0,
        perimeter=0.0,
        openings_count=0,
        updated_at=datetime.now(timezone.utc),
        deleted=False,
    )


async def test_a_pristine_room_is_ours_to_wire():
    room = _room()
    assert await rooms_mod._electrical_is_ours_to_replace(room, _Session(room)) is True


async def test_a_hand_placed_state_layout_is_left_alone():
    room = _room(state={"electricals": [{"id": "u1", "type": "socket1", "wallId": "0"}]})
    assert await rooms_mod._electrical_is_ours_to_replace(room, _Session(room)) is False


async def test_hand_placed_lights_alone_are_enough_to_block_regeneration():
    room = _room(state={"lights": [{"id": "u1", "xMm": 100, "zMm": 100}]})
    assert await rooms_mod._electrical_is_ours_to_replace(room, _Session(room)) is False


async def test_devices_in_the_table_block_regeneration_unless_we_made_them():
    room = _room()
    assert await rooms_mod._electrical_is_ours_to_replace(
        room, _Session(room, device_count=7)
    ) is False

    stamped = _room(room_scan={"electrical_auto": {"device_count": 7}})
    assert await rooms_mod._electrical_is_ours_to_replace(
        stamped, _Session(stamped, device_count=7)
    ) is True


async def test_a_previous_auto_plan_is_ours_to_replace():
    plan = generate_electrical_plan(_conversion(L_ROOM))
    room = _room(
        state={"electricals": plan.electricals, "lights": plan.lights},
        room_scan={"electrical_auto": {"device_count": len(plan.devices)}},
    )
    session = _Session(room, device_count=len(plan.devices))
    assert await rooms_mod._electrical_is_ours_to_replace(room, session) is True


async def test_persist_writes_both_device_kinds_in_metres():
    room = _room()
    plan = generate_electrical_plan(_conversion(L_ROOM))
    session = _Session(room)
    await rooms_mod._persist_electrical_plan(room, plan, session)

    # A replace, not an append.
    assert session.deleted_device_rows == 1
    rows = session.added_devices
    assert len(rows) == len(plan.devices) + len(plan.light_points)
    assert {r.type for r in rows} <= {"socket", "switch", "light", "panel", "box"}
    assert any(r.type == "light" for r in rows)
    assert any(r.type == "panel" for r in rows)
    for row in rows:
        # Metres: a 300 mm socket is y = 0.3, and no wall runs past 25 m.
        assert 0.0 <= float(row.x) < 25.0
        assert 0.0 <= float(row.y) <= 5.0
        assert row.wall_index >= 0
    assert any(r.wall_index == 4 for r in rows), "the 5th wall must be storable"

    header = next(o for o in session.added if isinstance(o, RoomElectrical))
    assert float(header.wiring_meters) == pytest.approx(plan.wiring_meters)


async def test_persist_reuses_an_existing_plan_header():
    room = _room()
    header = RoomElectrical(room_id=room.id, wiring_meters=1.0)
    plan = generate_electrical_plan(_conversion(L_ROOM))
    session = _Session(room, header=header)
    await rooms_mod._persist_electrical_plan(room, plan, session)

    assert not [o for o in session.added if isinstance(o, RoomElectrical)]
    assert float(header.wiring_meters) == pytest.approx(plan.wiring_meters)


async def test_rerunning_replaces_rather_than_duplicates():
    room = _room()
    plan = generate_electrical_plan(_conversion(L_ROOM))

    first = _Session(room)
    await rooms_mod._persist_electrical_plan(room, plan, first)
    second = _Session(room, device_count=len(first.added_devices))
    await rooms_mod._persist_electrical_plan(room, generate_electrical_plan(_conversion(L_ROOM)), second)

    assert len(second.added_devices) == len(first.added_devices)
    assert [(r.type, r.wall_index, float(r.x)) for r in second.added_devices] == \
           [(r.type, r.wall_index, float(r.x)) for r in first.added_devices]


def test_state_merge_preserves_the_keys_the_studio_owns():
    """The shape `upload_room_scan` writes — other state keys must survive."""
    room = _room(state={"designState": {"ceiling": {"design": "non_drop"}}, "furniture": [1, 2]})
    plan = generate_electrical_plan(_conversion(L_ROOM))
    merged = {**(room.state or {}), "electricals": plan.electricals, "lights": plan.lights}
    assert merged["designState"] == {"ceiling": {"design": "non_drop"}}
    assert merged["furniture"] == [1, 2]
    assert merged["electricals"] and merged["lights"]


# ---------------------------------------------------------------------------
# End-to-end: the scan upload itself
# ---------------------------------------------------------------------------

@pytest.fixture
def upload(monkeypatch):
    """`POST /rooms/{id}/room-scan` against the session double above, so the
    real branch logic in `upload_room_scan` runs rather than a mock's."""
    from unittest.mock import AsyncMock, MagicMock

    from fastapi.testclient import TestClient

    from app.api.v1.deps import get_current_active_user
    from app.database import get_db
    from app.main import app

    room = _room()
    session = _Session(room)

    def _user():
        user = MagicMock()
        user.id = uuid.uuid4()
        user.is_active = True
        user.is_admin = False
        return user

    async def _get_db_override():
        yield session

    app.dependency_overrides[get_current_active_user] = _user
    app.dependency_overrides[get_db] = _get_db_override
    monkeypatch.setattr(rooms_mod, "upload_file", AsyncMock(return_value="stored"))

    def _post():
        return TestClient(app).post(
            f"/api/v1/rooms/{room.id}/room-scan",
            data={"room_json": _SCAN_FIXTURE},
            files={"usdz": ("scan.usdz", b"PK\x03\x04" + b"\x00" * 64, "model/vnd.usdz+zip")},
        )

    yield _post, room, session
    app.dependency_overrides.clear()


def test_upload_fills_both_stores_and_stamps_the_scan(upload):
    post, room, session = upload
    resp = post()
    assert resp.status_code == 200, resp.text

    state = room.state
    assert state["electricals"] and state["lights"]
    assert all(e["auto"] is True for e in state["electricals"])
    stamp = room.room_scan["electrical_auto"]
    assert stamp["device_count"] == len(state["electricals"])
    assert stamp["light_count"] == len(state["lights"])
    assert stamp["wiring_meters"] > 0
    # The scan's own metadata is untouched by the addition.
    assert room.room_scan["source"] == "lidar"
    assert room.room_scan["usdz_path"].endswith(".usdz")

    # …and the mobile-facing tables got their copy, inside a savepoint.
    assert session.savepoints == 1
    assert len(session.added_devices) == stamp["device_count"] + stamp["light_count"]


def test_upload_leaves_a_hand_wired_room_alone(upload):
    post, room, session = upload
    mine = [{"id": "u1", "type": "socket1", "wallId": "0", "positionMm": 500, "heightMm": 300}]
    room.state = {"electricals": mine, "designState": {"ceiling": {"design": "non_drop"}}}

    assert post().status_code == 200
    assert room.state["electricals"] == mine
    assert "lights" not in room.state
    assert "electrical_auto" not in room.room_scan
    assert not session.added_devices
    assert session.savepoints == 0
    # The scan itself still landed.
    assert room.room_scan["source"] == "lidar"


def test_a_failing_generation_never_takes_the_scan_down(upload, monkeypatch):
    post, room, session = upload
    monkeypatch.setattr(
        rooms_mod, "generate_electrical_plan",
        lambda conv: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    resp = post()
    assert resp.status_code == 200, resp.text
    assert resp.json()["room_scan"]["source"] == "lidar"
    assert "electrical_auto" not in room.room_scan
    assert not session.added_devices


def test_a_failing_persist_never_takes_the_scan_down(upload, monkeypatch):
    post, room, session = upload

    async def _boom(*args, **kwargs):
        raise RuntimeError("constraint violation")

    monkeypatch.setattr(rooms_mod, "_persist_electrical_plan", _boom)
    resp = post()
    assert resp.status_code == 200, resp.text
    assert resp.json()["room_scan"]["source"] == "lidar"
    # room.state is flushed before the savepoint, so the studio/smeta copy
    # survives even when the device-table mirror does not.
    assert room.state["electricals"]
    assert not session.added_devices
