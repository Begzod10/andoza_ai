"""rooms.room_type: allowed ids, the name guess (= migration back-fill), the API."""
from __future__ import annotations

import importlib.util
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.apartment import Apartment
from app.models.room import Room
from app.schemas.room import ROOM_TYPES as SCHEMA_ROOM_TYPES, RoomOut
from app.services.room_type import GUESS_RULES, ROOM_TYPES, guess_room_type

_WALLS = [{"id": f"w{i}", "length": 4.0} for i in range(4)]
_BODY = {"name": "Zal", "ceiling_h": 2.7, "geometry": {"walls": _WALLS}}


def test_room_types_order():
    assert ROOM_TYPES == ("mehmonxona", "yotoqxona", "bolalar", "oshxona", "kabinet", "hammom", "balkon")
    assert SCHEMA_ROOM_TYPES is ROOM_TYPES


@pytest.mark.parametrize(
    "name, expected",
    [
        ("Bolalar yotoqxonasi", "bolalar"),
        ("Детская", "bolalar"),
        ("Yotoqxona", "yotoqxona"),
        ("Спальня", "yotoqxona"),
        ("Oshxona", "oshxona"),
        ("КУХНЯ", "oshxona"),
        ("Kabinet", "kabinet"),
        ("Ish xona", "kabinet"),
        ("Кабинет", "kabinet"),
        ("Hammom", "hammom"),
        ("Vanna xonasi", "hammom"),
        ("Ванная", "hammom"),
        ("Санузел", "hammom"),
        ("Balkon", "balkon"),
        ("Балкон", "balkon"),
        ("Mehmonxona", "mehmonxona"),
        ("Zal", "mehmonxona"),
        ("Гостиная", "mehmonxona"),
        ("Xona 2", None),
        ("", None),
    ],
)
def test_guess_room_type(name, expected):
    assert guess_room_type(name) == expected


# ---- API ------------------------------------------------------------------ #

class _Result:
    def __init__(self, item):
        self._item = item

    def scalar_one_or_none(self):
        return self._item


def _room(room_type=None):
    return Room(
        id=uuid.uuid4(), apartment_id=uuid.uuid4(), name="Zal", room_type=room_type, ceiling_h=2.7,
        geometry=None, surfaces=None, furniture_layout=None, state=None, room_scan=None,
        floor_area=12, net_wall_area=30, perimeter=14, openings_count=0, deleted=False,
        updated_at=datetime.now(timezone.utc),
    )


@pytest.fixture
def client_db():
    user = MagicMock(id=uuid.uuid4(), is_active=True, is_admin=False)
    db = AsyncMock()
    db.add = MagicMock()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_active_user] = lambda: user
    yield TestClient(app), db
    app.dependency_overrides.clear()


def _create(client_db, **extra):
    client, db = client_db
    apt = Apartment(id=uuid.uuid4(), user_id=uuid.uuid4(), name="Uy")
    created = []

    async def flush():
        for room in db.add.call_args_list[-1:]:
            r = room.args[0]
            r.id = uuid.uuid4()
            r.openings_count = r.openings_count or 0
            r.deleted = False
            r.updated_at = datetime.now(timezone.utc)
            created.append(r)

    db.execute = AsyncMock(return_value=_Result(apt))
    db.flush = flush
    resp = client.post(f"/api/v1/apartments/{apt.id}/rooms", json={**_BODY, **extra})
    return resp, created


def test_create_room_with_type(client_db):
    resp, created = _create(client_db, room_type="oshxona")
    assert resp.status_code == 201, resp.text
    assert resp.json()["room_type"] == "oshxona"
    assert created[0].room_type == "oshxona"


def test_create_room_without_type_is_null(client_db):
    resp, _ = _create(client_db)
    assert resp.status_code == 201
    assert resp.json()["room_type"] is None


def test_invalid_room_type_422(client_db):
    resp, _ = _create(client_db, room_type="garaj")
    assert resp.status_code == 422
    client, db = client_db
    db.execute = AsyncMock(return_value=_Result(_room()))
    assert client.patch(f"/api/v1/rooms/{uuid.uuid4()}", json={"room_type": "garaj"}).status_code == 422


def test_patch_room_type_set_and_clear(client_db):
    client, db = client_db
    room = _room("hammom")
    db.execute = AsyncMock(return_value=_Result(room))
    url = f"/api/v1/rooms/{room.id}"

    # absent -> unchanged
    assert client.patch(url, json={"name": "Yangi"}).json()["room_type"] == "hammom"
    assert room.room_type == "hammom"
    # set
    assert client.patch(url, json={"room_type": "kabinet"}).json()["room_type"] == "kabinet"
    # explicit null -> cleared
    assert client.patch(url, json={"room_type": None}).json()["room_type"] is None
    assert room.room_type is None


def test_room_out_has_room_type():
    assert "room_type" in RoomOut.model_fields
    assert RoomOut.model_validate(_room("balkon")).room_type == "balkon"
    assert RoomOut.model_validate(_room()).room_type is None


# ---- migration ------------------------------------------------------------ #

def _migration():
    path = next(Path(__file__).resolve().parents[1].glob("alembic/versions/1786000042_*.py"))
    spec = importlib.util.spec_from_file_location("m42", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migration_revision_chain_and_frozen_table_matches_service():
    mod = _migration()
    assert (mod.revision, mod.down_revision) == ("1786000042", "1786000041")
    assert mod._TYPES == ROOM_TYPES
    assert mod._RULES == GUESS_RULES


def test_migration_backfill_statements():
    stmts = _migration().backfill_statements()
    assert len(stmts) == 7
    assert all("room_type IS NULL" in s for s in stmts)  # never overwrites a set type
    assert "'bolalar'" in stmts[0] and "'mehmonxona'" in stmts[-1]


def test_migration_upgrade_and_downgrade_calls(monkeypatch):
    mod = _migration()
    calls = []
    fake = MagicMock()
    fake.add_column.side_effect = lambda *a, **k: calls.append(("add_column", a[0]))
    fake.create_check_constraint.side_effect = lambda *a, **k: calls.append(("check", a[0]))
    fake.execute.side_effect = lambda s: calls.append(("sql", s))
    fake.drop_constraint.side_effect = lambda *a, **k: calls.append(("drop_check", a[0]))
    fake.drop_column.side_effect = lambda *a, **k: calls.append(("drop_column", a[1]))
    monkeypatch.setattr(mod, "op", fake)
    mod.upgrade()
    assert [c[0] for c in calls[:2]] == ["add_column", "check"]
    assert [c[0] for c in calls[2:]] == ["sql"] * 7
    calls.clear()
    mod.downgrade()
    assert calls == [("drop_check", "ck_rooms_room_type"), ("drop_column", "room_type")]
