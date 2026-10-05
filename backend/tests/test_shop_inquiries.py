"""Shop inquiries and seller stats. The DB session is stubbed; each test's
``db.execute`` side_effect follows the router's query order exactly."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.shop_inquiry import ShopInquiry
from app.models.store import Store
from app.models.user import User


def _user():
    u = MagicMock()
    u.id = uuid.uuid4()
    u.is_active = True
    u.is_admin = False
    return u


class _R:
    def __init__(self, one=None, many=()):
        self._one, self._many = one, list(many)

    def scalar_one_or_none(self):
        return self._one

    def scalar_one(self):
        return self._one

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
    db.add = MagicMock()

    async def _refresh(obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)

    db.refresh = AsyncMock(side_effect=_refresh)
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    return db


def _store(owner=None, status="approved"):
    return Store(id=uuid.uuid4(), name="Mebel", owner_user_id=owner.id if owner else uuid.uuid4(),
                 status=status, is_active=status == "approved")


def _inquiry(store, **kw):
    inq = ShopInquiry(id=uuid.uuid4(), store_id=store.id, user_id=uuid.uuid4(), furniture_id=None, room_id=None,
                      message="Narxi qancha?", status="new", created_at=datetime.now(timezone.utc))
    for k, v in kw.items():
        setattr(inq, k, v)
    return inq


class TestCreateInquiry:
    def test_happy_path(self, client):
        u = _user()
        store = _store()
        db = _as(u, [_R(store), _R(0)])
        res = client.post(f"/api/v1/shops/{store.id}/inquiries", json={"message": "  Narxi qancha?  "})
        assert res.status_code == 201
        body = res.json()
        assert body["status"] == "new" and body["message"] == "Narxi qancha?"
        assert body["store_id"] == str(store.id) and body["furniture_id"] is None
        db.add.assert_called_once()

    def test_store_not_found(self, client):
        _as(_user(), [_R(None)])
        assert client.post(f"/api/v1/shops/{uuid.uuid4()}/inquiries", json={}).status_code == 404

    def test_product_of_another_store_is_404(self, client):
        _as(_user(), [_R(_store()), _R(None)])
        res = client.post(f"/api/v1/shops/{uuid.uuid4()}/inquiries", json={"furniture_id": str(uuid.uuid4())})
        assert res.status_code == 404

    def test_rate_limit(self, client):
        store = _store()
        _as(_user(), [_R(store), _R(5)])
        res = client.post(f"/api/v1/shops/{store.id}/inquiries", json={})
        assert res.status_code == 429

    def test_message_too_long_is_422(self, client):
        _as(_user(), [])
        assert client.post(f"/api/v1/shops/{uuid.uuid4()}/inquiries", json={"message": "x" * 501}).status_code == 422


class TestSellerInbox:
    def test_inbox_lists_inquiries_with_client_and_product(self, client):
        u = _user()
        store = _store(u)
        inq = _inquiry(store)
        customer = User(id=inq.user_id, name="Vali", phone="+998909998877")
        _as(u, [_R(store), _R(many=[(inq, customer, "Divan", "Mehmonxona")])])
        body = client.get("/api/v1/seller/inquiries").json()
        assert len(body) == 1
        assert (body[0]["client_name"], body[0]["client_phone"]) == ("Vali", "+998909998877")
        assert (body[0]["product_name"], body[0]["room_name"], body[0]["status"]) == ("Divan", "Mehmonxona", "new")
        assert body[0]["message"] == "Narxi qancha?"

    def test_status_moves_forward_but_never_back_to_new(self, client):
        u = _user()
        store = _store(u)
        inq = _inquiry(store)
        _as(u, [_R(store), _R(inq), _R(User(id=inq.user_id, name="Vali", phone=None))])
        res = client.patch(f"/api/v1/seller/inquiries/{inq.id}", json={"status": "contacted"})
        assert res.status_code == 200 and inq.status == "contacted"
        _as(u, [_R(store)])
        assert client.patch(f"/api/v1/seller/inquiries/{inq.id}", json={"status": "new"}).status_code == 422

    def test_another_shops_inquiry_is_404(self, client):
        u = _user()
        _as(u, [_R(_store(u)), _R(None)])
        assert client.patch(f"/api/v1/seller/inquiries/{uuid.uuid4()}", json={"status": "closed"}).status_code == 404

    def test_no_shop_no_inbox(self, client):
        _as(_user(), [_R(None)])
        assert client.get("/api/v1/seller/inquiries").status_code == 404


class TestSellerStats:
    def test_shape(self, client):
        u = _user()
        store = _store(u)
        pid = uuid.uuid4()
        _as(u, [
            _R(store),
            _R(many=[("approved", True, 3), ("approved", False, 1), ("pending", False, 2), ("rejected", False, 1)]),
            _R(many=[("new", 2), ("closed", 1)]),
            _R(7),
            _R(many=[(pid, "Divan", 5)]),
        ])
        body = client.get("/api/v1/seller/stats").json()
        assert body == {
            "products": {"total": 7, "approved": 4, "pending": 2, "rejected": 1},
            "visible": 3,
            "inquiries": {"total": 3, "new": 2},
            "placements_total": 7,
            "top_products": [{"id": str(pid), "name_uz": "Divan", "placements": 5}],
        }
