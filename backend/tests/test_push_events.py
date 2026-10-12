"""Events that tell a user something send a push: render ready, order moved, usta lead seen.

Routers register the push to run after the request commits, so a rolled-back
request sends nothing. The DB session is stubbed; the get_db override below
runs the real post-commit hooks the way database.get_db does.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import _run_after_commit_hooks, get_db
from app.main import app
from app.models.lead import Lead
from app.models.order import Order, OrderLine
from app.models.store import Store
from app.models.usta import Usta


class _Result:
    def __init__(self, one=None, row=None):
        self._one, self._row = one, row

    def scalar_one_or_none(self):
        return self._one

    def one_or_none(self):
        return self._row


def _user(is_admin=False):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.is_active = True
    u.is_admin = is_admin
    return u


def _order(status="accepted", user_id=None) -> Order:
    order = Order(
        id=uuid.uuid4(), user_id=user_id or uuid.uuid4(), dealer_name="Mebel Plus", store_id=None,
        total_uzs=1_000_000, status=status, delivery_address="Chilonzor 5", phone="+998901234567",
        payment_method="cash", created_at=datetime.now(timezone.utc),
    )
    order.lines = [OrderLine(id=uuid.uuid4(), furniture_id=uuid.uuid4(), product_name="Divan",
                             unit="dona", unit_price_uzs=1_000_000, quantity=1)]
    return order


@pytest.fixture
def client():
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def _as(user, *results):
    db = AsyncMock()
    db.info = {}
    db.execute = AsyncMock(side_effect=list(results))
    db.flush = AsyncMock()

    async def _get_db():
        # Same ordering as database.get_db: hooks only after a successful commit.
        try:
            yield db
        except Exception:
            raise
        else:
            await _run_after_commit_hooks(db)

    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = _get_db
    return db


# -- orders ------------------------------------------------------------------

class TestOrderStatus:
    def _seller_patch(self, client, order, body):
        store = Store(id=uuid.uuid4(), name="Mebel Plus", status="approved", is_active=True, owner_user_id=uuid.uuid4())
        _as(_user(), _Result(one=store), _Result(one=order))
        return client.patch(f"/api/v1/seller/orders/{order.id}/status", json=body)

    def test_seller_moving_order_notifies_buyer(self, client):
        order = _order("accepted")
        with patch("app.routers.seller.notify") as notify:
            r = self._seller_patch(client, order, {"status": "gathering"})
        assert r.status_code == 200
        notify.assert_called_once_with(order.user_id, "order_status", {"status": "gathering"})

    def test_repeated_status_does_not_notify(self, client):
        order = _order("gathering")
        with patch("app.routers.seller.notify") as notify:
            r = self._seller_patch(client, order, {"status": "gathering"})
        assert r.status_code == 200
        notify.assert_not_called()

    def test_rejected_move_does_not_notify(self, client):
        order = _order("accepted")
        with patch("app.routers.seller.notify") as notify:
            r = self._seller_patch(client, order, {"status": "delivered"})
        assert r.status_code == 409
        notify.assert_not_called()

    def test_failure_after_registration_does_not_notify(self, client):
        order = _order("accepted")
        with patch("app.routers.seller.notify") as notify, \
             patch("app.routers.seller.SellerOrderOut.model_validate", side_effect=RuntimeError("boom")):
            r = self._seller_patch(client, order, {"status": "gathering"})
        assert r.status_code == 500
        notify.assert_not_called()

    def test_admin_cancel_notifies_buyer(self, client):
        order = _order("accepted")
        _as(_user(is_admin=True), _Result(row=(order, "Mebel Plus")))
        with patch("app.routers.admin_orders.notify") as notify:
            r = client.patch(f"/api/v1/admin/orders/{order.id}/status",
                             json={"status": "cancelled", "reason": "Omborda qolmadi"})
        assert r.status_code == 200
        notify.assert_called_once_with(order.user_id, "order_status", {"status": "cancelled"})

    def test_admin_repeat_does_not_notify(self, client):
        order = _order("accepted")
        _as(_user(is_admin=True), _Result(row=(order, "Mebel Plus")))
        with patch("app.routers.admin_orders.notify") as notify:
            r = client.patch(f"/api/v1/admin/orders/{order.id}/status", json={"status": "accepted"})
        assert r.status_code == 200
        notify.assert_not_called()

    def test_buyer_cancel_does_not_notify(self, client):
        me = _user()
        order = _order("accepted", user_id=me.id)
        _as(me, _Result(one=order))
        # Patch both the public entry point and the Celery task it enqueues, so
        # any notify() call from orders.py (however imported) is caught.
        with patch("app.services.push.notify") as notify, \
                patch("app.tasks.push.send_push.delay") as delay:
            r = client.post(f"/api/v1/orders/{order.id}/cancel", json={})
        assert r.status_code == 200
        notify.assert_not_called()
        delay.assert_not_called()


# -- usta leads --------------------------------------------------------------

class TestLeadStatus:
    def _patch(self, client, old, new):
        usta = Usta(id=uuid.uuid4())
        lead = Lead(id=uuid.uuid4(), usta_id=usta.id, user_id=uuid.uuid4(), status=old,
                    created_at=datetime.now(timezone.utc))
        lead.room_id = None
        _as(_user(), _Result(one=usta), _Result(one=lead), _Result(one=None))
        with patch("app.routers.usta_profile.notify") as notify:
            r = client.patch(f"/api/v1/usta/leads/{lead.id}", json={"status": new})
        return lead, r, notify

    @pytest.mark.parametrize("new", ["viewed", "contacted"])
    def test_lead_viewed_and_contacted_notify_client(self, client, new):
        lead, r, notify = self._patch(client, "new", new)
        assert r.status_code == 200, r.text
        notify.assert_called_once_with(lead.user_id, "lead_status", {"status": new})

    def test_lead_closed_does_not_notify(self, client):
        _, r, notify = self._patch(client, "contacted", "closed")
        assert r.status_code == 200, r.text
        notify.assert_not_called()

    def test_same_lead_status_does_not_notify(self, client):
        _, r, notify = self._patch(client, "viewed", "viewed")
        assert r.status_code == 200, r.text
        notify.assert_not_called()


# -- render ------------------------------------------------------------------

def _fake_http():
    http = MagicMock()
    http.__aenter__ = AsyncMock(return_value=http)
    http.__aexit__ = AsyncMock(return_value=False)
    fetched = MagicMock(content=b"jpeg")
    fetched.raise_for_status = MagicMock()
    http.get = AsyncMock(return_value=fetched)
    return http


@pytest.mark.asyncio
class TestRenderNotify:
    def _patches(self, api, save):
        return (
            patch("app.core.storage.download_file", new=AsyncMock(return_value=b"s")),
            patch("app.core.storage.upload_file", new=AsyncMock(return_value="https://s3/x.jpg")),
            patch("app.core.storage.delete_file", new=AsyncMock()),
            patch("app.services.myarchitect.get_myarchitect_client", return_value=api),
            patch("httpx.AsyncClient", return_value=_fake_http()),
            patch("app.tasks.media._save_render", new=save),
        )

    async def test_render_success_notifies_owner(self):
        from contextlib import ExitStack

        from app.tasks import media

        api = MagicMock(render_interior=AsyncMock(return_value="https://cdn/r.jpg"))
        with ExitStack() as stack, patch("app.services.push.notify") as notify:
            for p in self._patches(api, AsyncMock()):
                stack.enter_context(p)
            await media._render_room_image("u1", "k", "image/jpeg", "p", "room-1")
        notify.assert_called_once_with("u1", "render_ready", {"room_id": "room-1"})

    async def test_render_failure_does_not_notify(self):
        from contextlib import ExitStack

        from app.services.myarchitect import MyArchitectError
        from app.tasks import media

        api = MagicMock(render_interior=AsyncMock(side_effect=MyArchitectError("nope")))
        with ExitStack() as stack, patch("app.services.push.notify") as notify:
            for p in self._patches(api, AsyncMock()):
                stack.enter_context(p)
            out = await media._render_room_image("u1", "k", "image/jpeg", "p", "room-1")
        assert out["status"] == "failed"
        notify.assert_not_called()

    async def test_push_failure_does_not_fail_the_render(self):
        from contextlib import ExitStack

        from app.tasks import media

        api = MagicMock(render_interior=AsyncMock(return_value="https://cdn/r.jpg"))
        with ExitStack() as stack, patch("app.services.push.notify", side_effect=RuntimeError("broker down")):
            for p in self._patches(api, AsyncMock()):
                stack.enter_context(p)
            out = await media._render_room_image("u1", "k", "image/jpeg", "p", None)
        assert out["status"] == "ok"
