"""Cancelling an order: who may, until when, and that a reason is given.

The DB session is stubbed (the routers' contract, not Postgres).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.order import Order, OrderLine
from app.models.store import Store
from app.services import order_status as rules


def _order(status="accepted", store: Store | None = None, user_id=None) -> Order:
    order = Order(
        id=uuid.uuid4(), user_id=user_id or uuid.uuid4(), dealer_name="Mebel Plus", store_id=store.id if store else None,
        total_uzs=1_000_000, status=status, delivery_address="Chilonzor 5", phone="+998901234567",
        payment_method="cash", created_at=datetime.now(timezone.utc),
    )
    order.lines = [OrderLine(id=uuid.uuid4(), furniture_id=uuid.uuid4(), product_name="Divan", unit="dona", unit_price_uzs=1_000_000, quantity=1)]
    return order


def _store(status="approved") -> Store:
    return Store(id=uuid.uuid4(), name="Mebel Plus", status=status, is_active=True, owner_user_id=uuid.uuid4())


class _Result:
    def __init__(self, one=None, many=(), row=None):
        self._one, self._many, self._row = one, list(many), row

    def scalar_one_or_none(self):
        return self._one

    def one_or_none(self):
        return self._row

    def scalars(self):
        return self

    def all(self):
        return self._many


def _user(is_admin=False, uid=None):
    user = MagicMock()
    user.id = uid or uuid.uuid4()
    user.is_active = True
    user.is_admin = is_admin
    return user


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _as(user, *results):
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=list(results))
    db.flush = AsyncMock()
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    return db


# ── the rules themselves ─────────────────────────────────────────────────────

class TestRules:
    def _change(self, status, target, cancellable, reason=None):
        order = SimpleNamespace(status=status, cancelled_by=None, cancel_reason=None)
        return order, rules.change_status(order, target, by="x", cancellable=cancellable, reason=reason)

    @pytest.mark.parametrize("who,allowed", [
        (rules.BUYER_CAN_CANCEL, {"accepted"}),
        (rules.SELLER_CAN_CANCEL, {"accepted", "gathering"}),
        (rules.ADMIN_CAN_CANCEL, {"accepted", "gathering", "on_the_way"}),
    ])
    def test_each_party_can_cancel_only_within_its_window(self, who, allowed):
        for current in ("accepted", "gathering", "on_the_way", "delivered", "cancelled"):
            if current == "cancelled":
                continue  # asking for what it already is is a no-op, tested below
            if current in allowed:
                order, changed = self._change(current, "cancelled", who, "Sabab bor")
                assert changed and order.status == "cancelled" and order.cancel_reason == "Sabab bor"
            else:
                with pytest.raises(HTTPException) as e:
                    self._change(current, "cancelled", who, "Sabab bor")
                assert e.value.status_code == 409

    def test_a_reason_is_required_and_trimmed(self):
        for bad in (None, "", "  ", "ab"):
            with pytest.raises(HTTPException) as e:
                self._change("accepted", "cancelled", rules.SELLER_CAN_CANCEL, bad)
            assert e.value.status_code == 422
        order, _ = self._change("accepted", "cancelled", rules.SELLER_CAN_CANCEL, "  Omborda qolmadi  ")
        assert order.cancel_reason == "Omborda qolmadi"

    def test_a_long_reason_is_cut_to_what_the_column_holds(self):
        order, _ = self._change("accepted", "cancelled", rules.SELLER_CAN_CANCEL, "x" * 500)
        assert len(order.cancel_reason) == 300

    @pytest.mark.parametrize("final", ["delivered", "cancelled"])
    def test_final_statuses_do_not_move(self, final):
        for target in ("accepted", "gathering", "on_the_way", "delivered"):
            if target == final:
                continue
            with pytest.raises(HTTPException) as e:
                self._change(final, target, rules.ADMIN_CAN_CANCEL)
            assert e.value.status_code == 409

    def test_asking_for_the_status_it_has_changes_nothing(self):
        order, changed = self._change("cancelled", "cancelled", rules.BUYER_CAN_CANCEL)
        assert not changed and order.cancel_reason is None

    def test_forward_moves_still_go_one_stage_at_a_time(self):
        order, changed = self._change("accepted", "gathering", rules.SELLER_CAN_CANCEL)
        assert changed and order.status == "gathering"
        with pytest.raises(HTTPException):
            self._change("accepted", "delivered", rules.SELLER_CAN_CANCEL)

    def test_who_cancelled_is_recorded(self):
        order = SimpleNamespace(status="accepted", cancelled_by=None, cancel_reason=None)
        rules.change_status(order, "cancelled", by="buyer", cancellable=rules.BUYER_CAN_CANCEL, reason="Fikrimdan qaytdim")
        assert order.cancelled_by == "buyer"


# ── the buyer ────────────────────────────────────────────────────────────────

class TestBuyerCancel:
    def _post(self, client, db_user, order, body=None):
        _as(db_user, _Result(one=order))
        return client.post(f"/api/v1/orders/{order.id}/cancel", json=body or {})

    def test_cancels_an_order_the_shop_has_not_started(self, client):
        user = _user()
        order = _order("accepted", user_id=user.id)
        response = self._post(client, user, order, {"reason": "Fikrim o'zgardi"})
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "cancelled" and body["cancel_reason"] == "Fikrim o'zgardi" and body["cancelled_by"] == "buyer"

    def test_a_reason_is_optional_for_the_buyer(self, client):
        user = _user()
        order = _order("accepted", user_id=user.id)
        assert self._post(client, user, order).json()["cancel_reason"] == "Xaridor bekor qildi"

    def test_cannot_cancel_once_the_shop_is_gathering(self, client):
        user = _user()
        order = _order("gathering", user_id=user.id)
        response = self._post(client, user, order)
        assert response.status_code == 409
        assert order.status == "gathering"

    def test_someone_elses_order_is_not_found(self, client):
        _as(_user(), _Result(one=None))
        assert client.post(f"/api/v1/orders/{uuid.uuid4()}/cancel", json={}).status_code == 404

    def test_cancelling_twice_is_harmless(self, client):
        user = _user()
        order = _order("cancelled", user_id=user.id)
        order.cancel_reason, order.cancelled_by = "Birinchi sabab", "buyer"
        response = self._post(client, user, order, {"reason": "Boshqa sabab"})
        assert response.status_code == 200 and response.json()["cancel_reason"] == "Birinchi sabab"

    def test_the_lookup_is_scoped_to_the_caller_and_locked(self, client):
        user = _user()
        order = _order("accepted", user_id=user.id)
        db = _as(user, _Result(one=order))
        client.post(f"/api/v1/orders/{order.id}/cancel", json={})
        sql = str(db.execute.call_args_list[0].args[0].compile(compile_kwargs={"literal_binds": True}))
        assert str(user.id).replace("-", "") in sql.replace("-", "") and "FOR UPDATE" in sql


# ── the shop ─────────────────────────────────────────────────────────────────

class TestSellerCancel:
    def _patch(self, client, status, body):
        store = _store()
        order = _order(status, store)
        _as(_user(), _Result(one=store), _Result(one=order))
        return order, client.patch(f"/api/v1/seller/orders/{order.id}/status", json=body)

    def test_cancels_with_a_reason_the_buyer_will_see(self, client):
        order, response = self._patch(client, "gathering", {"status": "cancelled", "reason": "Mahsulot tugab qoldi"})
        assert response.status_code == 200
        assert response.json()["cancel_reason"] == "Mahsulot tugab qoldi" and response.json()["cancelled_by"] == "seller"

    def test_needs_a_reason(self, client):
        assert self._patch(client, "accepted", {"status": "cancelled"})[1].status_code == 422

    def test_cannot_cancel_after_it_has_left(self, client):
        order, response = self._patch(client, "on_the_way", {"status": "cancelled", "reason": "Kech qoldi"})
        assert response.status_code == 409 and order.status == "on_the_way"


# ── the administrators ───────────────────────────────────────────────────────

class TestAdminOrders:
    def test_an_ordinary_user_is_refused(self, client):
        _as(_user(is_admin=False))
        assert client.get("/api/v1/admin/orders").status_code == 403
        assert client.patch(f"/api/v1/admin/orders/{uuid.uuid4()}/status", json={"status": "gathering"}).status_code == 403

    def test_lists_every_order_with_its_shop_and_buyer(self, client):
        store = _store()
        a, b = _order("accepted", store), _order("delivered")
        _as(_user(is_admin=True), _Result(many=[(a, store.name), (b, None)]))
        body = client.get("/api/v1/admin/orders").json()
        assert [o["store_name"] for o in body] == ["Mebel Plus", None]
        assert body[0]["user_id"] and body[0]["delivery_address"] == "Chilonzor 5"

    def test_a_status_filter_reaches_the_query_and_an_unknown_one_is_refused(self, client):
        db = _as(_user(is_admin=True), _Result(many=[]))
        client.get("/api/v1/admin/orders?status=gathering")
        sql = str(db.execute.call_args_list[0].args[0].compile(compile_kwargs={"literal_binds": True}))
        assert "orders.status = 'gathering'" in sql
        _as(_user(is_admin=True))
        assert client.get("/api/v1/admin/orders?status=bogus").status_code == 422

    def test_moves_an_order_nobody_else_can_act_on(self, client):
        order = _order("accepted")  # no shop
        _as(_user(is_admin=True), _Result(row=(order, None)))
        response = client.patch(f"/api/v1/admin/orders/{order.id}/status", json={"status": "gathering"})
        assert response.status_code == 200 and response.json()["status"] == "gathering"

    def test_can_cancel_one_already_on_its_way(self, client):
        order = _order("on_the_way")
        _as(_user(is_admin=True), _Result(row=(order, None)))
        response = client.patch(f"/api/v1/admin/orders/{order.id}/status", json={"status": "cancelled", "reason": "Yo'qolgan"})
        assert response.status_code == 200 and response.json()["cancelled_by"] == "admin"

    def test_cannot_touch_a_delivered_order(self, client):
        order = _order("delivered")
        _as(_user(is_admin=True), _Result(row=(order, None)))
        assert client.patch(f"/api/v1/admin/orders/{order.id}/status", json={"status": "cancelled", "reason": "Kech"}).status_code == 409

    def test_an_unknown_order_is_not_found(self, client):
        _as(_user(is_admin=True), _Result(row=None))
        assert client.patch(f"/api/v1/admin/orders/{uuid.uuid4()}/status", json={"status": "gathering"}).status_code == 404
