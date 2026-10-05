"""Ustalar as users: a craftsman applies from the app and waits for an admin.

Same shape as the seller tests: the profile is found from the caller (never an id
in the request), a new application starts pending and hidden, the caller cannot
set rating/verified/status, and only admins decide. The DB session is stubbed.
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
from app.models.store import Store
from app.models.usta import Usta
from app.routers.account import roles_for


def _user(is_admin=False):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.is_active = True
    u.is_admin = is_admin
    return u


class _R:
    def __init__(self, one=None, many=()):
        self._one, self._many = one, list(many)

    def scalar_one_or_none(self):
        return self._one

    def scalars(self):
        return self

    def all(self):
        return self._many


def _usta(owner, status="approved", **kw):
    u = Usta(
        id=uuid.uuid4(), name="Aziz usta", category="elektrik", district="Chilonzor", lat=None, lng=None,
        phone="+998901234567", telegram=None, avatar_url=None, rating=0, jobs_count=0, price_min=None,
        price_max=None, verified=status == "approved", is_active=status == "approved", owner_user_id=owner.id,
        status=status, moderation_note=None, created_at=datetime.now(timezone.utc),
    )
    for k, v in kw.items():
        setattr(u, k, v)
    return u


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


APPLY = {"name": "  Aziz usta ", "category": "elektrik", "district": "Chilonzor", "phone": "998901234567"}


class TestProfile:
    def test_no_profile_yet_is_null_not_an_error(self, client):
        _as(_user(), [_R(None)])
        res = client.get("/api/v1/usta/profile")
        assert res.status_code == 200 and res.json() is None

    def test_applying_creates_a_pending_hidden_profile_owned_by_the_caller(self, client):
        u = _user()
        db = _as(u, [_R(None)])
        res = client.post("/api/v1/usta/profile", json={
            **APPLY, "rating": 5, "verified": True, "status": "approved", "is_active": True, "jobs_count": 99,
        })
        assert res.status_code == 201
        added = db.add.call_args.args[0]
        assert added.owner_user_id == u.id
        assert (added.status, added.is_active, added.verified, added.name) == ("pending", False, False, "Aziz usta")
        assert (float(added.rating), added.jobs_count) == (0, 0)
        assert added.phone == "+998901234567"  # normalised like a login phone

    def test_a_second_profile_is_409(self, client):
        u = _user()
        _as(u, [_R(_usta(u))])
        assert client.post("/api/v1/usta/profile", json=APPLY).status_code == 409

    def test_an_unknown_trade_a_bad_phone_or_an_inverted_price_range_is_422(self, client):
        for bad in (
            {"category": "dasturchi"},
            {"phone": "12345"},
            {"price_min": 500_000, "price_max": 100_000},
        ):
            _as(_user(), [_R(None)])
            assert client.post("/api/v1/usta/profile", json={**APPLY, **bad}).status_code == 422

    def test_a_rejected_application_can_be_sent_back(self, client):
        u = _user()
        usta = _usta(u, "rejected", moderation_note="Telefon noto'g'ri")
        _as(u, [_R(usta)])
        assert client.post("/api/v1/usta/profile/resubmit").status_code == 200
        assert (usta.status, usta.moderation_note, usta.is_active) == ("pending", None, False)

    def test_only_a_rejected_application_can_be_resubmitted(self, client):
        for status in ("pending", "approved"):
            u = _user()
            _as(u, [_R(_usta(u, status))])
            assert client.post("/api/v1/usta/profile/resubmit").status_code == 409
        _as(_user(), [_R(None)])
        assert client.post("/api/v1/usta/profile/resubmit").status_code == 404

    def test_editing_changes_only_what_is_sent_and_never_the_moderation_fields(self, client):
        u = _user()
        usta = _usta(u, "approved")
        _as(u, [_R(usta)])
        res = client.patch("/api/v1/usta/profile", json={"district": "Yunusobod", "status": "rejected", "verified": False})
        assert res.status_code == 200
        assert (usta.district, usta.name, usta.status, usta.verified) == ("Yunusobod", "Aziz usta", "approved", True)

    def test_a_null_name_cannot_blank_a_required_field(self, client):
        u = _user()
        usta = _usta(u)
        _as(u, [_R(usta)])
        assert client.patch("/api/v1/usta/profile", json={"phone": None}).status_code == 200
        assert usta.phone == "+998901234567"

    def test_editing_without_a_profile_is_404(self, client):
        _as(_user(), [_R(None)])
        assert client.patch("/api/v1/usta/profile", json={"district": "X"}).status_code == 404


class TestModeration:
    def test_only_admins_may_decide(self, client):
        _as(_user(), [])
        assert client.post(f"/api/v1/admin/moderation/ustalar/{uuid.uuid4()}/approve").status_code == 403

    def test_approving_lists_and_verifies_the_craftsman(self, client):
        usta = _usta(_user(), "pending")
        _as(_user(is_admin=True), [_R(usta)])
        assert client.post(f"/api/v1/admin/moderation/ustalar/{usta.id}/approve").status_code == 204
        assert (usta.status, usta.is_active, usta.verified, usta.moderation_note) == ("approved", True, True, None)

    def test_rejecting_needs_a_reason_and_keeps_them_hidden(self, client):
        usta = _usta(_user(), "pending")
        _as(_user(is_admin=True), [_R(usta)])
        assert client.post(f"/api/v1/admin/moderation/ustalar/{usta.id}/reject", json={}).status_code == 422
        _as(_user(is_admin=True), [_R(usta)])
        res = client.post(f"/api/v1/admin/moderation/ustalar/{usta.id}/reject", json={"note": "Telefon noto'g'ri"})
        assert res.status_code == 204
        assert (usta.status, usta.is_active, usta.verified, usta.moderation_note) == ("rejected", False, False, "Telefon noto'g'ri")

    def test_a_missing_craftsman_is_404(self, client):
        _as(_user(is_admin=True), [_R(None)])
        assert client.post(f"/api/v1/admin/moderation/ustalar/{uuid.uuid4()}/approve").status_code == 404

    def test_the_pending_queue_lists_craftsmen_too(self, client):
        usta = _usta(_user(), "pending")
        _as(_user(is_admin=True), [_R(many=[]), _R(many=[]), _R(many=[usta])])
        body = client.get("/api/v1/admin/moderation/pending").json()
        assert [u["id"] for u in body["ustalar"]] == [str(usta.id)]
        assert body["ustalar"][0]["status"] == "pending"


class TestAccountRoles:
    def test_everyone_is_a_user_and_the_rest_is_owning_a_business(self):
        assert roles_for(is_admin=False, has_store=False, has_usta=False) == ["user"]
        assert roles_for(is_admin=False, has_store=True, has_usta=False) == ["user", "shop_owner"]
        assert roles_for(is_admin=False, has_store=False, has_usta=True) == ["user", "usta"]
        assert roles_for(is_admin=True, has_store=True, has_usta=True) == ["user", "shop_owner", "usta", "admin"]

    def test_roles_endpoint_reports_each_business_in_any_status(self, client):
        u = _user()
        store = Store(id=uuid.uuid4(), name="Mebel Plus", status="pending", owner_user_id=u.id)
        usta = _usta(u, "rejected")
        _as(u, [_R(store), _R(usta)])
        body = client.get("/api/v1/account/roles").json()
        assert body["roles"] == ["user", "shop_owner", "usta"]
        assert (body["store_status"], body["store_name"]) == ("pending", "Mebel Plus")
        assert (body["usta_status"], body["usta_name"]) == ("rejected", "Aziz usta")

    def test_a_plain_user_has_only_the_user_role(self, client):
        _as(_user(), [_R(None), _R(None)])
        body = client.get("/api/v1/account/roles").json()
        assert body == {"roles": ["user"], "store_status": None, "store_name": None, "usta_status": None, "usta_name": None}
