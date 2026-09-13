"""room-scan endpoint tests (mocked DB, no Postgres — mirrors
test_room_share_router.py). Covers the happy path (server overwrites geometry +
stores metadata), and rejection of wrong-type / oversized / malformed uploads.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

import app.routers.rooms as rooms_mod
from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.room import Room

_FIXTURE = (Path(__file__).parent / "fixtures" / "captured_room_sample.json").read_text()


def _user():
    u = MagicMock()
    u.id = uuid.uuid4()
    u.is_active = True
    u.is_admin = False
    return u


def _room() -> Room:
    return Room(
        id=uuid.uuid4(),
        apartment_id=uuid.uuid4(),
        name="Xona",
        ceiling_h=2.7,
        geometry={"walls": [{"id": "A", "length": 3.0, "elements": []}]},
        surfaces=None,
        furniture_layout=[],
        state=None,
        room_scan=None,
        floor_area=0.0,
        net_wall_area=0.0,
        perimeter=0.0,
        openings_count=0,
        updated_at=datetime.now(timezone.utc),
        deleted=False,
    )


class _Result:
    def __init__(self, room):
        self._room = room

    def scalar_one_or_none(self):
        return self._room


@pytest.fixture
def ctx(monkeypatch):
    room = _room()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_Result(room))
    db.flush = AsyncMock()

    async def _get_db_override():
        yield db

    app.dependency_overrides[get_current_active_user] = _user
    app.dependency_overrides[get_db] = _get_db_override
    # Don't touch real storage.
    monkeypatch.setattr(rooms_mod, "upload_file", AsyncMock(return_value="stored"))

    yield TestClient(app), room, db
    app.dependency_overrides.clear()


def _usdz(name="scan.usdz", size=64):
    return {"usdz": (name, b"PK\x03\x04" + b"\x00" * size, "model/vnd.usdz+zip")}


def test_happy_path_overwrites_geometry_and_stores_metadata(ctx):
    client, room, db = ctx
    resp = client.post(
        f"/api/v1/rooms/{room.id}/room-scan",
        data={"room_json": _FIXTURE},
        files=_usdz(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Server overwrote geometry with the 4-wall converted room.
    assert len(body["geometry"]["walls"]) == 4
    scan = body["room_scan"]
    assert scan["source"] == "lidar"
    assert scan["roomplan_version"] == "roomplan-1"
    assert scan["object_count"] == 2
    assert scan["usdz_path"].endswith(".usdz")
    assert scan["glb_path"] is None
    rooms_mod.upload_file.assert_awaited_once()
    db.flush.assert_awaited()


def test_rejects_non_usdz_file(ctx):
    client, room, _ = ctx
    resp = client.post(
        f"/api/v1/rooms/{room.id}/room-scan",
        data={"room_json": _FIXTURE},
        files={"usdz": ("scan.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 400


def test_rejects_malformed_room_json(ctx):
    client, room, _ = ctx
    resp = client.post(
        f"/api/v1/rooms/{room.id}/room-scan",
        data={"room_json": "not json at all"},
        files=_usdz(),
    )
    assert resp.status_code == 422


def test_rejects_oversized_usdz(ctx, monkeypatch):
    client, room, _ = ctx
    monkeypatch.setattr(rooms_mod, "_MAX_USDZ_BYTES", 16)
    resp = client.post(
        f"/api/v1/rooms/{room.id}/room-scan",
        data={"room_json": _FIXTURE},
        files=_usdz(size=1024),
    )
    assert resp.status_code == 413


# ── Phase 6: per-object Object-Capture upload ──────────────────────────────

def _with_scan_objects(room, n=1):
    room.room_scan = {
        "source": "lidar",
        "objects": [
            {"category": "table", "x": 1.0, "y": 1.0, "width": 1.0,
             "depth": 1.0, "height": 0.7, "rotation": 0.0, "confidence": "high"}
            for _ in range(n)
        ],
    }


def test_object_upload_attaches_usdz_and_pending_glb(ctx):
    client, room, db = ctx
    _with_scan_objects(room)
    resp = client.post(
        f"/api/v1/rooms/{room.id}/room-scan/objects",
        data={"object_index": "0"},
        files=_usdz(),
    )
    assert resp.status_code == 200, resp.text
    obj = resp.json()["room_scan"]["objects"][0]
    assert obj["usdz_path"].endswith(".usdz")
    assert obj["glb_path"] is None
    rooms_mod.upload_file.assert_awaited()
    db.flush.assert_awaited()


def test_object_upload_bad_index_404(ctx):
    client, room, _ = ctx
    _with_scan_objects(room, n=0)
    resp = client.post(
        f"/api/v1/rooms/{room.id}/room-scan/objects",
        data={"object_index": "5"},
        files=_usdz(),
    )
    assert resp.status_code == 404


def test_object_upload_rejects_non_usdz(ctx):
    client, room, _ = ctx
    _with_scan_objects(room)
    resp = client.post(
        f"/api/v1/rooms/{room.id}/room-scan/objects",
        data={"object_index": "0"},
        files={"usdz": ("obj.txt", b"x", "text/plain")},
    )
    assert resp.status_code == 400
