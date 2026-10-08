"""
A shop sees the orders placed with it and moves them along one stage at a time.

The DB session is stubbed (the router's contract, not Postgres): the first
execute() is the shop lookup, the second the order lookup.
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
from app.models.order import Order, OrderLine
from app.models.store import Store


class _Result:
    def __init__(self, one=None, many=()):
        self._one, self._many = one, list(many)

    def scalar_one_or_none(self):
        return self._one

    def scalars(self):
        return self

    def all(self):
        return self._many


def _user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.is_active = True
    user.is_admin = False
    return user


def _store(status="approved") -> Store:
    return Store(id=uuid.uuid4(), name="Mebel Plus", status=status, is_active=True, owner_user_id=uuid.uuid4())


def _order(store: Store, status="accepted") -> Order:
    order = Order(
        id=uuid.uuid4(), user_id=uuid.uuid4(), dealer_name=store.name, store_id=store.id, total_uzs=4_500_000,
        status=status, delivery_address="Chilonzor 5", phone="+998901234567", payment_method="cash",
        created_at=datetime.now(timezone.utc),
    )
    order.lines = [OrderLine(
        id=uuid.uuid4(), furniture_id=uuid.uuid4(), product_name="Divan", unit="dona",
        unit_price_uzs=4_500_000, quantity=1,
    )]
    return order


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _as(db):
    app.dependency_overrides[get_current_active_user] = lambda: _user()
    app.dependency_overrides[get_db] = lambda: db


def _db(*results):
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=list(results))
    db.flush = AsyncMock()
    return db


class TestListOrders:
    def test_the_shop_sees_its_orders_with_where_to_deliver(self, client):
        store = _store()
        order = _order(store)
        _as(_db(_Result(one=store), _Result(many=[order])))
        body = client.get("/api/v1/seller/orders").json()
        assert len(body) == 1
        assert body[0]["delivery_address"] == "Chilonzor 5" and body[0]["phone"] == "+998901234567"
        assert body[0]["lines"][0]["product_name"] == "Divan"

    def test_the_buyers_account_id_is_not_shown_to_the_shop(self, client):
        store = _store()
        _as(_db(_Result(one=store), _Result(many=[_order(store)])))
        assert "user_id" not in client.get("/api/v1/seller/orders").json()[0]

    def test_only_this_shops_orders_are_asked_for(self, client):
        store = _store()
        db = _db(_Result(one=store), _Result(many=[]))
        _as(db)
        client.get("/api/v1/seller/orders")
        sql = str(db.execute.call_args_list[1].args[0].compile(compile_kwargs={"literal_binds": True}))
        assert str(store.id).replace("-", "") in sql.replace("-", "")
        assert "orders.store_id" in sql

    def test_a_user_with_no_shop_is_told_so(self, client):
        _as(_db(_Result(one=None)))
        assert client.get("/api/v1/seller/orders").status_code == 404

    def test_a_shop_not_yet_approved_sees_nothing(self, client):
        _as(_db(_Result(one=_store("pending"))))
        assert client.get("/api/v1/seller/orders").status_code == 403


class TestAdvanceOrder:
    def _patch(self, client, db, order_id, status):
        _as(db)
        return client.patch(f"/api/v1/seller/orders/{order_id}/status", json={"status": status})

    @pytest.mark.parametrize("current,nxt", [("accepted", "gathering"), ("gathering", "on_the_way"), ("on_the_way", "delivered")])
    def test_moves_one_stage_forward(self, client, current, nxt):
        store = _store()
        order = _order(store, current)
        response = self._patch(client, _db(_Result(one=store), _Result(one=order)), order.id, nxt)
        assert response.status_code == 200
        assert response.json()["status"] == nxt
        assert order.status == nxt

    @pytest.mark.parametrize("current,target", [
        ("accepted", "on_the_way"), ("accepted", "delivered"), ("gathering", "delivered"),
        ("gathering", "accepted"), ("delivered", "on_the_way"), ("delivered", "accepted"),
    ])
    def test_cannot_skip_a_stage_or_go_back(self, client, current, target):
        store = _store()
        order = _order(store, current)
        response = self._patch(client, _db(_Result(one=store), _Result(one=order)), order.id, target)
        assert response.status_code == 409
        assert order.status == current

    def test_repeating_the_current_status_changes_nothing(self, client):
        store = _store()
        order = _order(store, "gathering")
        response = self._patch(client, _db(_Result(one=store), _Result(one=order)), order.id, "gathering")
        assert response.status_code == 200 and order.status == "gathering"

    def test_another_shops_order_is_not_found(self, client):
        store = _store()
        # the query is scoped to this shop's id, so someone else's order finds nothing
        response = self._patch(client, _db(_Result(one=store), _Result(one=None)), uuid.uuid4(), "gathering")
        assert response.status_code == 404

    def test_the_lookup_is_scoped_to_the_callers_shop_and_locked(self, client):
        store = _store()
        db = _db(_Result(one=store), _Result(one=None))
        self._patch(client, db, uuid.uuid4(), "gathering")
        sql = str(db.execute.call_args_list[1].args[0].compile(compile_kwargs={"literal_binds": True}))
        assert str(store.id).replace("-", "") in sql.replace("-", "")
        assert "FOR UPDATE" in sql

    def test_an_unknown_status_is_rejected(self, client):
        store = _store()
        assert self._patch(client, _db(_Result(one=store)), uuid.uuid4(), "shipped").status_code == 422

    def test_a_shop_not_yet_approved_cannot_change_orders(self, client):
        assert self._patch(client, _db(_Result(one=_store("rejected"))), uuid.uuid4(), "gathering").status_code == 403
