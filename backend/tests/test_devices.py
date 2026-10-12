"""POST/DELETE /api/v1/devices — a phone registers its push token."""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.device_token import DeviceToken
from app.models.user import User


class _Result:
    def __init__(self, scalar=None):
        self._scalar = scalar

    def scalar_one_or_none(self):
        return self._scalar


class _FakeDeviceDb:
    """In-memory device_tokens table, keyed by token (it is unique)."""

    def __init__(self):
        self.rows: dict[str, DeviceToken] = {}

    async def execute(self, stmt):
        params = stmt.compile().params
        token = next((v for v in params.values() if isinstance(v, str)), None)
        return _Result(scalar=self.rows.get(token))

    def add(self, obj):
        self.rows[obj.token] = obj

    async def delete(self, obj):
        self.rows.pop(obj.token, None)

    async def flush(self):
        pass


def _user():
    return User(id=uuid.uuid4(), is_active=True, is_admin=False)


@pytest.fixture
def db():
    fake = _FakeDeviceDb()
    app.dependency_overrides[get_db] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


@pytest.fixture
def client(db):
    return TestClient(app)


def _as(user):
    app.dependency_overrides[get_current_active_user] = lambda: user


def test_register_new_token(client, db):
    user = _user()
    _as(user)

    res = client.post("/api/v1/devices", json={"token": "t1", "platform": "android", "locale": "ru"})

    assert res.status_code == 204, res.text
    assert len(db.rows) == 1
    row = db.rows["t1"]
    assert row.user_id == user.id
    assert row.platform == "android"
    assert row.locale == "ru"


def test_register_same_token_updates_locale(client, db):
    _as(_user())
    client.post("/api/v1/devices", json={"token": "t1", "platform": "ios"})
    assert db.rows["t1"].locale == "uz"

    res = client.post("/api/v1/devices", json={"token": "t1", "platform": "ios", "locale": "ru"})

    assert res.status_code == 204
    assert len(db.rows) == 1
    assert db.rows["t1"].locale == "ru"


def test_token_moves_to_new_account(client, db):
    a, b = _user(), _user()
    _as(a)
    client.post("/api/v1/devices", json={"token": "t1", "platform": "android"})
    _as(b)

    res = client.post("/api/v1/devices", json={"token": "t1", "platform": "android"})

    assert res.status_code == 204
    assert len(db.rows) == 1
    assert db.rows["t1"].user_id == b.id


def test_unregister_own_token(client, db):
    _as(_user())
    client.post("/api/v1/devices", json={"token": "t1", "platform": "android"})

    res = client.request("DELETE", "/api/v1/devices", json={"token": "t1"})

    assert res.status_code == 204
    assert db.rows == {}


def test_unregister_someone_elses_token_keeps_it(client, db):
    a, b = _user(), _user()
    _as(a)
    client.post("/api/v1/devices", json={"token": "t1", "platform": "android"})
    _as(b)

    res = client.request("DELETE", "/api/v1/devices", json={"token": "t1"})

    assert res.status_code == 204
    assert db.rows["t1"].user_id == a.id


def test_devices_require_auth(client, db):
    assert client.post("/api/v1/devices", json={"token": "t", "platform": "ios"}).status_code == 401
    assert client.request("DELETE", "/api/v1/devices", json={"token": "t"}).status_code == 401
