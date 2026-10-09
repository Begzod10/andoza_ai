"""Self-service account deletion. The DB session is stubbed (as in
test_usta_profile.py), so these prove the contract and the orchestration; the
FK cascades themselves are proven against real Postgres separately."""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import bcrypt
import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.store import Store
from app.models.usta import Usta
from app.routers import admin_catalog


def _user(is_admin=False, password=None):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.is_active = True
    u.is_admin = is_admin
    u.phone = "+998901234567"
    u.password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode() if password else None
    return u


class _R:
    def __init__(self, one=None, many=()):
        self._one, self._many = one, list(many)

    def scalars(self):
        return self

    def all(self):
        return self._many


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _as(user, results):
    db = AsyncMock()
    db.info = {}
    db.execute = AsyncMock(side_effect=list(results))
    db.flush = AsyncMock()
    db.delete = AsyncMock()
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    return db


URL = "/api/v1/auth/delete-account"


class TestGuards:
    def test_wrong_password_403_and_nothing_deleted(self, client):
        db = _as(_user(password="secret123"), [])
        res = client.post(URL, json={"password": "nope"})
        assert res.status_code == 403 and res.json()["detail"] == "Parol noto'g'ri"
        db.execute.assert_not_called()

    def test_missing_password_403(self, client):
        db = _as(_user(password="secret123"), [])
        res = client.post(URL, json={"password": None})
        assert res.status_code == 403
        db.execute.assert_not_called()

    def test_admin_403(self, client):
        db = _as(_user(is_admin=True), [])
        res = client.post(URL, json={"password": None})
        assert res.status_code == 403
        assert res.json()["detail"] == "Administrator hisobini bu yerdan o'chirib bo'lmaydi"
        db.execute.assert_not_called()

    def test_requires_auth(self, client):
        assert client.post(URL, json={"password": None}).status_code in (401, 403)


class TestDeletion:
    def test_passwordless_account_ok(self, client):
        db = _as(_user(), [_R(many=[]), _R(many=[]), _R(many=[]), _R(many=[]), _R(many=[]), _R()])
        res = client.post(URL, json={})
        assert res.status_code == 204 and res.content == b""
        assert db.execute.await_count == 6  # 5 key lookups + DELETE users

    def test_happy_path_deletes_store_usta_user_and_schedules_files(self, client, monkeypatch):
        u = _user(password="secret123")
        furniture = MagicMock(glb_key="f/a.glb", thumbnail_key="f/a.jpg")
        wall = MagicMock(storage_key="w/x.jpg")
        store = MagicMock(spec=Store, furniture_items=[furniture], wallpapers=[wall])
        usta = MagicMock(spec=Usta, id=uuid.uuid4())
        scan = {"usdz_path": "s/a.usdz", "glb_path": "s/a.glb", "objects": [{"glb_path": "s/o.glb"}]}
        db = _as(u, [
            _R(many=[store]), _R(many=[usta]), _R(many=["p/1.jpg"]),
            _R(many=[("t/room.jpg", scan)]),
            _R(many=[("r/1.png", None), ("r/2.png", "r/1.png")]),
            _R(many=[("m/a.glb", "m/a.jpg")]),
            _R(),
        ])
        queued = []
        monkeypatch.setattr(
            "app.services.account_deletion.run_after_commit", lambda s, h: queued.append(("otp", h))
        )
        scheduled = []
        monkeypatch.setattr(
            "app.services.account_deletion._delete_files_after_commit",
            lambda s, keys, ev: scheduled.append(keys),
        )
        invalidated = []
        monkeypatch.setattr(
            "app.services.account_deletion._invalidate_after_commit", lambda s, p: invalidated.append(p)
        )

        res = client.post(URL, json={"password": "secret123"})
        assert res.status_code == 204
        deleted = [c.args[0] for c in db.delete.await_args_list]
        assert deleted == [store, usta]
        assert invalidated == ["stores:", "furniture:", "ustalar:"]
        assert len(scheduled) == 1
        assert set(scheduled[0]) == {
            "f/a.glb", "f/a.jpg", "w/x.jpg", "p/1.jpg", "t/room.jpg", "s/a.usdz", "s/a.glb",
            "s/o.glb", "r/1.png", "r/2.png", "m/a.glb", "m/a.jpg",
        }
        assert len(scheduled[0]) == len(set(scheduled[0]))  # parent_key deduped
        assert queued  # OTP cleanup queued
        # last statement executed is the DELETE FROM users
        assert "DELETE FROM users" in str(db.execute.await_args_list[-1].args[0])

    def test_storage_failure_never_fails_the_request(self, client, monkeypatch):
        async def boom(key):
            raise RuntimeError("s3 down")

        monkeypatch.setattr(admin_catalog, "delete_file", boom)
        import asyncio

        asyncio.run(admin_catalog._delete_files(["a", "b"], "account_delete_file_failed"))  # must not raise
