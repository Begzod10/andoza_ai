"""
Wall and opening CRUD under /rooms/{id}/walls.

Two faults made these endpoints unusable: rooms.ceiling_h comes back from
Postgres as a Decimal, and `float * Decimal` raised TypeError on every valid
request; and the bodies were plain dicts turned into models inside the
handler, so a bad body was a pydantic error and a 500 instead of a 422.

The owned-room lookup is stubbed with a real (transient) Room whose
ceiling_h is a Decimal, as Postgres returns it.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.room import Room


def _room() -> Room:
    walls = [{"id": w, "length": 4.0 if w in "AC" else 3.0, "elements": []} for w in "ABCD"]
    return Room(
        id=uuid.uuid4(), apartment_id=uuid.uuid4(), name="Xona", ceiling_h=Decimal("2.70"),
        geometry={"walls": walls, "vertices": None}, surfaces=None, furniture_layout=None, state=None,
        room_scan=None, floor_area=12, net_wall_area=37.8, perimeter=14, openings_count=0,
        deleted=False, updated_at=datetime.now(timezone.utc),
    )


@pytest.fixture
def setup():
    room = _room()
    db = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_active_user] = lambda: MagicMock(id=uuid.uuid4(), is_active=True)
    with patch("app.routers.rooms._get_owned_room", new=AsyncMock(return_value=room)):
        yield TestClient(app), room
    app.dependency_overrides.clear()


def test_adding_a_wall_works_and_recomputes(setup):
    client, room = setup
    # Three walls so far; the fourth closes a plain rectangle (a fifth would
    # need the polygon's vertices, which is a 422 of its own).
    room.geometry = {"walls": room.geometry["walls"][:3], "vertices": None}
    response = client.post(f"/api/v1/rooms/{room.id}/walls", json={"length": 3})
    assert response.status_code == 201
    assert len(room.geometry["walls"]) == 4
    assert room.perimeter == 14


def test_changing_a_wall_length_works_and_recomputes(setup):
    client, room = setup
    response = client.patch(f"/api/v1/rooms/{room.id}/walls/A", json={"length": 4.5})
    assert response.status_code == 200
    assert room.geometry["walls"][0]["length"] == 4.5


def test_adding_an_opening_works_and_counts_it(setup):
    client, room = setup
    response = client.post(
        f"/api/v1/rooms/{room.id}/walls/A/openings", json={"type": "eshik", "width": 1, "height": 2}
    )
    assert response.status_code == 201
    assert room.openings_count == 1


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("post", "walls", {"length": 100}),
        ("post", "walls", {"length": "abc"}),
        ("patch", "walls/A", {"length": 100}),
        ("patch", "walls/A", {"elements": "garbage"}),
        ("post", "walls/A/openings", {"type": "tuynuk", "width": 1, "height": 2}),
        ("post", "walls/A/openings", {"type": "eshik"}),
    ],
)
def test_a_bad_body_is_422(setup, method, path, body):
    client, room = setup
    response = getattr(client, method)(f"/api/v1/rooms/{room.id}/{path}", json=body)
    assert response.status_code == 422
