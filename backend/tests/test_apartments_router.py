"""
Reading an apartment must not destroy its soft-deleted rooms.

Apartment.rooms is `cascade="all, delete-orphan"`. The routers used to hide
deleted rooms by assigning a filtered list back to that relationship
(`apt.rooms = [r for r in apt.rooms if not r.deleted]`), which turns every
deleted room into an orphan, and the request's commit then DELETEs the row
together with its estimates, finishes and state. Hiding has to happen on the
response only; the ORM collection must come out of the request untouched.

The DB session is stubbed; the ORM objects are real (transient) instances.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.apartment import Apartment
from app.models.room import Room


class _Result:
    def __init__(self, items):
        self._items = items

    def scalar_one_or_none(self):
        return self._items[0] if self._items else None

    def scalars(self):
        return self

    def all(self):
        return self._items


def _room(apartment_id, name, deleted):
    room = Room(
        id=uuid.uuid4(), apartment_id=apartment_id, name=name, ceiling_h=2.7, geometry=None,
        surfaces=None, furniture_layout=None, state=None, room_scan=None, floor_area=12,
        net_wall_area=30, perimeter=14, openings_count=0, deleted=deleted,
        updated_at=datetime.now(timezone.utc),
    )
    return room


@pytest.fixture
def setup():
    user = MagicMock(id=uuid.uuid4(), is_active=True, is_admin=False)
    apartment = Apartment(
        id=uuid.uuid4(), user_id=user.id, name="Uy", address=None, developer=None,
        renovation_stage=1, created_at=datetime.now(timezone.utc),
    )
    live = _room(apartment.id, "Yashash", deleted=False)
    gone = _room(apartment.id, "O'chirilgan", deleted=True)
    apartment.rooms = [live, gone]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_Result([apartment]))
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_active_user] = lambda: user
    yield TestClient(app), apartment, live, gone
    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "call",
    [
        lambda c, a: c.get("/api/v1/apartments"),
        lambda c, a: c.get(f"/api/v1/apartments/{a.id}"),
        lambda c, a: c.patch(f"/api/v1/apartments/{a.id}", json={"name": "Yangi"}),
    ],
    ids=["list", "get", "patch"],
)
def test_deleted_rooms_are_hidden_but_not_orphaned(setup, call):
    client, apartment, live, gone = setup

    response = call(client, apartment)

    assert response.status_code == 200
    body = response.json()
    rooms = (body[0] if isinstance(body, list) else body)["rooms"]
    assert [r["name"] for r in rooms] == ["Yashash"]
    # Still in the collection, so the commit has nothing to delete-orphan.
    assert gone in apartment.rooms


def test_include_deleted_returns_them(setup):
    client, apartment, live, gone = setup
    rooms = client.get(f"/api/v1/apartments/{apartment.id}?include_deleted=true").json()["rooms"]
    assert {r["name"] for r in rooms} == {"Yashash", "O'chirilgan"}
