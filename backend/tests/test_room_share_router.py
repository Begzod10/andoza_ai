"""Room share-link router tests.

POST/DELETE /rooms/{id}/share are owner-only (reuse
app.services.room_access.get_owned_room, which 404s identically for "not
yours" and "doesn't exist"). GET /public/rooms/{token} has NO auth
dependency at all -- these tests are the main line of defence against it
leaking anything beyond the hand-picked read-only shape.

Mocking follows test_estimate_router.py's pattern: a scripted db.execute()
side_effect (one _Result per call, in the router's own call order) --
no Postgres required. The public endpoint also calls get_redis() directly
(not via Depends), so it's patched at the module level rather than through
app.dependency_overrides.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.room import Room


def _user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.is_active = True
    user.is_admin = False
    return user


def _room(**overrides) -> Room:
    defaults = dict(
        id=uuid.uuid4(),
        apartment_id=uuid.uuid4(),
        name="Mehmonxona",
        ceiling_h=2.7,
        geometry={"walls": [
            {"id": "A", "length": 4.0, "elements": []},
            {"id": "B", "length": 3.0, "elements": []},
            {"id": "C", "length": 4.0, "elements": []},
            {"id": "D", "length": 3.0, "elements": []},
        ]},
        surfaces={"ALL": None},
        furniture_layout=[],
        state={
            "designState": {"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
            "furniture": [{"furniture_id": "sofa-1", "x": 100, "y": 100, "rotation": 0}],
            "electricals": [{"kind": "rozetka", "x": 10}],
            "lights": [{"id": "l1", "type": "ceiling"}],
            # Deliberately present in the fixture, deliberately NOT in the
            # public allowlist -- must never reach the public response.
            "layoutPos": {"x": 1, "z": 2},
            "geometry": {"should": "not-leak-either-though-not-tested-directly"},
        },
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        openings_count=0,
        deleted=False,
        share_token=None,
    )
    defaults.update(overrides)
    return Room(**defaults)


class _Result:
    """Stands in for the object SQLAlchemy's execute() returns."""

    def __init__(self, one=None):
        self._one = one

    def scalar_one_or_none(self):
        return self._one


def _db(*results: _Result) -> AsyncMock:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=list(results))
    return db


def _as(user, db) -> None:
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db


def _fake_redis() -> MagicMock:
    """A redis whose rate-limit counter always reads as empty/under-limit."""
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    pipe = MagicMock()
    pipe.incr = AsyncMock(return_value=1)
    pipe.expire = AsyncMock(return_value=True)
    pipe.execute = AsyncMock(return_value=[1, True])
    redis.pipeline = MagicMock(return_value=pipe)
    return redis


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestCreateShareLink:
    def test_generates_a_token_for_a_room_the_user_owns(self, client):
        room = _room(share_token=None)
        db = _db(
            _Result(one=room),   # get_owned_room
            _Result(one=None),   # _generate_unique_token's collision check
        )
        _as(_user(), db)

        response = client.post(f"/api/v1/rooms/{room.id}/share")

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body["share_token"], str)
        assert len(body["share_token"]) >= 20
        assert body["share_token"] == room.share_token

    def test_calling_twice_returns_the_same_token_idempotently(self, client):
        room = _room(share_token="already-shared-abc123")
        db = _db(_Result(one=room))  # only the ownership lookup -- no regeneration
        _as(_user(), db)

        response = client.post(f"/api/v1/rooms/{room.id}/share")

        assert response.status_code == 200
        assert response.json()["share_token"] == "already-shared-abc123"

    def test_token_is_not_derived_from_the_room_id(self, client):
        room = _room(share_token=None)
        db = _db(_Result(one=room), _Result(one=None))
        _as(_user(), db)

        response = client.post(f"/api/v1/rooms/{room.id}/share")

        token = response.json()["share_token"]
        assert str(room.id) not in token
        assert str(room.id).replace("-", "") not in token

    def test_non_owner_cannot_create_a_share_link_for_someone_elses_room(self, client):
        room_id = uuid.uuid4()
        db = _db(_Result(one=None))  # get_owned_room finds nothing for this user
        _as(_user(), db)

        response = client.post(f"/api/v1/rooms/{room_id}/share")

        assert response.status_code == 404


class TestRevokeShareLink:
    def test_owner_can_revoke_an_existing_link(self, client):
        room = _room(share_token="soon-to-be-revoked")
        db = _db(_Result(one=room))
        _as(_user(), db)

        response = client.delete(f"/api/v1/rooms/{room.id}/share")

        assert response.status_code == 204
        assert room.share_token is None

    def test_non_owner_cannot_revoke_someone_elses_share_link(self, client):
        room_id = uuid.uuid4()
        db = _db(_Result(one=None))
        _as(_user(), db)

        response = client.delete(f"/api/v1/rooms/{room_id}/share")

        assert response.status_code == 404


class TestPublicRoomEndpoint:
    def test_valid_token_returns_the_readonly_shape(self, client):
        room = _room(share_token="valid-token-xyz")
        db = _db(_Result(one=room))
        app.dependency_overrides[get_db] = lambda: db

        with patch("app.routers.room_share.get_redis", return_value=_fake_redis()):
            response = client.get(f"/api/v1/public/rooms/{room.share_token}")

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == room.name
        assert body["ceiling_h"] == 2.7
        assert body["geometry"] == room.geometry
        assert body["surfaces"] == room.surfaces
        assert set(body["state"].keys()) == {"designState", "furniture", "electricals", "lights"}

    def test_response_never_contains_apartment_id_or_any_owner_reference(self, client):
        room = _room(share_token="valid-token-xyz")
        db = _db(_Result(one=room))
        app.dependency_overrides[get_db] = lambda: db

        with patch("app.routers.room_share.get_redis", return_value=_fake_redis()):
            response = client.get(f"/api/v1/public/rooms/{room.share_token}")

        body = response.json()
        assert "apartment_id" not in body
        assert "id" not in body
        assert "user_id" not in body
        assert "owner_id" not in body
        # The forbidden fields must be absent, not merely null/unused.
        assert "apartment_id" not in body.keys()

    def test_public_state_never_leaks_layout_pos_or_raw_geometry_key(self, client):
        room = _room(share_token="valid-token-xyz")
        db = _db(_Result(one=room))
        app.dependency_overrides[get_db] = lambda: db

        with patch("app.routers.room_share.get_redis", return_value=_fake_redis()):
            response = client.get(f"/api/v1/public/rooms/{room.share_token}")

        state = response.json()["state"]
        assert "layoutPos" not in state
        assert "geometry" not in state

    def test_unknown_token_returns_404(self, client):
        db = _db(_Result(one=None))
        app.dependency_overrides[get_db] = lambda: db

        with patch("app.routers.room_share.get_redis", return_value=_fake_redis()):
            response = client.get("/api/v1/public/rooms/this-token-does-not-exist")

        assert response.status_code == 404

    def test_revoked_token_404s_exactly_like_an_unknown_one(self, client):
        """The room still exists (share_token is now NULL) -- the query
        that filters on Room.share_token == token simply won't match a NULL
        column, so the router never even sees the room; same 404 either way."""
        db = _db(_Result(one=None))  # NULL share_token never matches the WHERE clause
        app.dependency_overrides[get_db] = lambda: db

        with patch("app.routers.room_share.get_redis", return_value=_fake_redis()):
            response = client.get("/api/v1/public/rooms/formerly-valid-token")

        assert response.status_code == 404
        # Not the room's data under any key.
        assert "name" not in response.json()

    def test_unknown_and_revoked_tokens_produce_byte_identical_error_bodies(self, client):
        """No response-shape or message difference between the two cases --
        that's what stops a revoked link from leaking that it used to work."""
        db1 = _db(_Result(one=None))
        app.dependency_overrides[get_db] = lambda: db1
        with patch("app.routers.room_share.get_redis", return_value=_fake_redis()):
            r1 = client.get("/api/v1/public/rooms/never-existed-token")

        db2 = _db(_Result(one=None))
        app.dependency_overrides[get_db] = lambda: db2
        with patch("app.routers.room_share.get_redis", return_value=_fake_redis()):
            r2 = client.get("/api/v1/public/rooms/formerly-valid-token")

        assert r1.status_code == r2.status_code == 404
        assert r1.json() == r2.json()

    def test_empty_state_room_returns_null_state_not_an_error(self, client):
        room = _room(share_token="valid-token-empty-state", state=None)
        db = _db(_Result(one=room))
        app.dependency_overrides[get_db] = lambda: db

        with patch("app.routers.room_share.get_redis", return_value=_fake_redis()):
            response = client.get(f"/api/v1/public/rooms/{room.share_token}")

        assert response.status_code == 200
        assert response.json()["state"] is None

    def test_rate_limit_exceeded_returns_429(self, client):
        room = _room(share_token="valid-token-xyz")
        db = _db(_Result(one=room))
        app.dependency_overrides[get_db] = lambda: db

        redis = _fake_redis()
        redis.get = AsyncMock(return_value="9999")  # already far past the limit

        with patch("app.routers.room_share.get_redis", return_value=redis):
            response = client.get(f"/api/v1/public/rooms/{room.share_token}")

        assert response.status_code == 429
