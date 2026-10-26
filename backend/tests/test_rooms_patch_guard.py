"""PATCH /rooms/{id} with expected_updated_at: a write against a room that changed since the
caller read it is refused (409) and writes nothing; without the field nothing changes."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app

STORED = datetime(2026, 10, 27, 9, 30, 15, 123456, tzinfo=timezone.utc)


_OUT = {
    "id": str(uuid.uuid4()), "apartment_id": str(uuid.uuid4()), "name": "x", "ceiling_h": None,
    "geometry": None, "surfaces": None, "furniture_layout": None, "state": None, "floor_area": None,
    "net_wall_area": None, "perimeter": None, "openings_count": 0, "updated_at": STORED.isoformat(),
}


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _room():
    room = MagicMock()
    room.name = "Old"
    room.updated_at = STORED
    return room


def _patch(client, room, body):
    db = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_active_user] = lambda: MagicMock(id=uuid.uuid4(), is_active=True)
    with patch("app.routers.rooms._get_owned_room", new=AsyncMock(return_value=room)), \
         patch("app.routers.rooms.RoomOut.model_validate", return_value=MagicMock()), \
         patch("app.routers.rooms._with_thumbnail_url", return_value=_OUT):
        res = client.patch(f"/api/v1/rooms/{uuid.uuid4()}", json=body, headers={"Accept-Language": "en"})
    return res, db


def test_patch_with_matching_updated_at_writes(client):
    room = _room()
    for stamp in (STORED.isoformat(), "2026-10-27T09:30:15.123456Z", "2026-10-27T14:30:15.123456+05:00"):
        room.name = "Old"
        res, db = _patch(client, room, {"name": "New", "expected_updated_at": stamp})
        assert res.status_code == 200, (stamp, res.text)
        assert room.name == "New"
        db.flush.assert_awaited()


def test_patch_with_stale_updated_at_is_409_and_writes_nothing(client):
    room = _room()
    res, db = _patch(client, room, {"name": "New", "expected_updated_at": "2026-10-27T09:30:15.123455Z"})
    assert res.status_code == 409
    assert res.json()["detail"] == "The room was changed elsewhere. Reload it before saving."
    assert room.name == "Old"
    db.flush.assert_not_awaited()


def test_patch_without_guard_unchanged(client):
    room = _room()
    res, db = _patch(client, room, {"name": "New"})
    assert res.status_code == 200
    assert room.name == "New"
    db.flush.assert_awaited()
