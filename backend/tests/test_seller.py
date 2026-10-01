"""Sellers: a user who owns a shop uploads 3D models; admins approve what they submit.

What these pin: a seller only ever touches their own shop and models (the shop is
found from the caller, a foreign model id is a plain 404), a new shop and every
upload start pending and hidden, a file must really be a GLB, and only admins can
decide. Storage and the DB session are stubbed.
"""
from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.furniture import Furniture
from app.models.store import Store

GLB = b"glTF" + b"\x02\x00\x00\x00" + b"x" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"x" * 32


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

    def scalar_one(self):
        return self._one

    def scalars(self):
        return self

    def all(self):
        return self._many


def _store(owner, status="approved", **kw):
    s = Store(
        id=uuid.uuid4(), name="Mebel Plus", district=None, phone=None, telegram=None, logo_color=None,
        partner_tier="standard", owner_user_id=owner.id, status=status, is_active=status == "approved",
        moderation_note=None, created_at=datetime.now(timezone.utc),
    )
    for k, v in kw.items():
        setattr(s, k, v)
    return s


def _model(store, status="approved", **kw):
    f = Furniture(
        id=uuid.uuid4(), store_id=store.id if store else None, category="divan", room_type=None,
        placement="pol", name_uz="Divan", price_uzs=1000, glb_key="furniture/a.glb", thumbnail_key=None,
        footprint_w=None, footprint_d=None, is_active=status == "approved", status=status,
        moderation_note=None, created_at=datetime.now(timezone.utc),
    )
    for k, v in kw.items():
        setattr(f, k, v)
    return f


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
    db.add = MagicMock()

    async def _refresh(obj):
        # What the database fills in on insert.
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)

    db.refresh = AsyncMock(side_effect=_refresh)
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    return db


def _upload(client, data=GLB, **fields):
    form = {"name_uz": "Divan", "category": "divan", **fields}
    files = {"file": ("m.glb", io.BytesIO(data), "model/gltf-binary")}
    thumb = form.pop("_thumb", None)
    if thumb:
        files["thumbnail"] = ("t.jpg", io.BytesIO(thumb[0]), thumb[1])
    return client.post("/api/v1/seller/furniture", data=form, files=files)


class TestShop:
    def test_no_shop_yet_is_null_not_an_error(self, client):
        _as(_user(), [_R(None)])
        res = client.get("/api/v1/seller/store")
        assert res.status_code == 200 and res.json() is None

    def test_a_rejected_application_can_be_sent_back(self, client):
        u = _user()
        store = _store(u, "rejected", moderation_note="Telefon noto'g'ri")
        _as(u, [_R(store)])
        assert client.post("/api/v1/seller/store/resubmit").status_code == 200
        assert (store.status, store.moderation_note, store.is_active) == ("pending", None, False)

    def test_only_a_rejected_application_can_be_resubmitted(self, client):
        for status in ("pending", "approved"):
            u = _user()
            _as(u, [_R(_store(u, status))])
            assert client.post("/api/v1/seller/store/resubmit").status_code == 409
        _as(_user(), [_R(None)])
        assert client.post("/api/v1/seller/store/resubmit").status_code == 404

    def test_applying_creates_a_pending_hidden_shop_owned_by_the_caller(self, client):
        u = _user()
        db = _as(u, [_R(None)])
        res = client.post("/api/v1/seller/store", json={
            "name": "  Mebel Plus ", "district": "Chilonzor", "partner_tier": "platinum", "status": "approved", "is_active": True,
        })
        assert res.status_code == 201
        added = db.add.call_args.args[0]
        assert added.owner_user_id == u.id
        assert (added.status, added.is_active, added.partner_tier, added.name) == ("pending", False, "standard", "Mebel Plus")

    def test_a_second_shop_is_409(self, client):
        u = _user()
        _as(u, [_R(_store(u))])
        assert client.post("/api/v1/seller/store", json={"name": "Another"}).status_code == 409

    def test_a_bad_colour_is_422(self, client):
        _as(_user(), [_R(None)])
        assert client.post("/api/v1/seller/store", json={"name": "X", "logo_color": "red"}).status_code == 422

    def test_editing_cannot_touch_tier_or_status(self, client):
        u = _user()
        store = _store(u)
        _as(u, [_R(store)])
        res = client.patch("/api/v1/seller/store", json={"name": "New name", "partner_tier": "platinum", "status": "pending"})
        assert res.status_code == 200
        assert store.name == "New name" and store.partner_tier == "standard" and store.status == "approved"


class TestUpload:
    def test_a_pending_or_rejected_shop_cannot_upload(self, client):
        for status in ("pending", "rejected"):
            u = _user()
            _as(u, [_R(_store(u, status))])
            assert _upload(client).status_code == 403

    def test_no_shop_is_404(self, client):
        _as(_user(), [_R(None)])
        assert _upload(client).status_code == 404

    def test_an_upload_is_stored_pending_and_hidden_in_the_callers_shop(self, client):
        u = _user()
        store = _store(u)
        db = _as(u, [_R(store), _R(0)])
        with patch("app.routers.seller.upload_file", new=AsyncMock(return_value="furniture/x.glb")) as up:
            res = _upload(client, price_uzs="150000", placement="pol")
        assert res.status_code == 201
        f = db.add.call_args.args[0]
        assert (f.store_id, f.status, f.is_active, f.price_uzs) == (store.id, "pending", False, 150000)
        assert up.await_args.args[0] == GLB

    def test_a_file_that_is_not_a_glb_is_refused_even_if_named_glb(self, client):
        u = _user()
        _as(u, [_R(_store(u)), _R(0)])
        with patch("app.routers.seller.upload_file", new=AsyncMock()) as up:
            assert _upload(client, data=b"<html>not a model</html>").status_code == 415
        up.assert_not_awaited()

    def test_oversize_and_empty_files_are_refused(self, client):
        u = _user()
        _as(u, [_R(_store(u)), _R(0), _R(_store(u)), _R(0)])
        assert _upload(client, data=b"").status_code == 400
        assert _upload(client, data=GLB + b"x" * (50 * 1024 * 1024)).status_code == 413

    @pytest.mark.parametrize("field,value", [("category", "spaceship"), ("room_type", "garage"), ("placement", "floating")])
    def test_unknown_choices_are_422(self, client, field, value):
        u = _user()
        _as(u, [_R(_store(u)), _R(0)])
        assert _upload(client, **{field: value}).status_code == 422

    def test_too_many_unreviewed_models_is_429(self, client):
        u = _user()
        _as(u, [_R(_store(u)), _R(20)])
        with patch("app.routers.seller.upload_file", new=AsyncMock()) as up:
            assert _upload(client).status_code == 429
        up.assert_not_awaited()

    def test_a_thumbnail_must_really_be_an_image(self, client):
        u = _user()
        _as(u, [_R(_store(u)), _R(0)])
        with patch("app.routers.seller.upload_file", new=AsyncMock()):
            assert _upload(client, _thumb=(b"not an image", "image/jpeg")).status_code == 415

    def test_a_good_thumbnail_is_stored_too(self, client):
        u = _user()
        _as(u, [_R(_store(u)), _R(0)])
        with patch("app.routers.seller.upload_file", new=AsyncMock(side_effect=["furniture/t.jpg", "furniture/m.glb"])) as up:
            assert _upload(client, _thumb=(JPEG, "image/jpeg")).status_code == 201
        assert up.await_count == 2


class TestOwnModels:
    def test_listing_returns_the_callers_models_with_status(self, client):
        u = _user()
        store = _store(u)
        pending = _model(store, "pending", name_uz="Yangi")
        _as(u, [_R(store), _R(2), _R(many=[pending, _model(store)])])
        body = client.get("/api/v1/seller/furniture").json()
        assert body["total"] == 2 and [i["status"] for i in body["items"]] == ["pending", "approved"]

    def test_a_foreign_or_missing_model_is_404_for_edit_and_delete(self, client):
        u = _user()
        other_shop = _store(_user())
        theirs = _model(other_shop)
        for call in ("patch", "delete"):
            _as(u, [_R(_store(u)), _R(theirs)])
            kw = {"json": {"price_uzs": 1}} if call == "patch" else {}
            assert getattr(client, call)(f"/api/v1/seller/furniture/{theirs.id}", **kw).status_code == 404
        _as(u, [_R(_store(u)), _R(None)])
        assert client.delete(f"/api/v1/seller/furniture/{uuid.uuid4()}").status_code == 404

    def test_edit_changes_price_and_can_hide_an_approved_model(self, client):
        u = _user()
        store = _store(u)
        m = _model(store)
        _as(u, [_R(store), _R(m)])
        res = client.patch(f"/api/v1/seller/furniture/{m.id}", json={"price_uzs": 99, "is_active": False})
        assert res.status_code == 200 and (m.price_uzs, m.is_active) == (99, False)

    def test_a_pending_model_cannot_be_switched_on_to_skip_review(self, client):
        u = _user()
        store = _store(u)
        m = _model(store, "pending")
        _as(u, [_R(store), _R(m)])
        assert client.patch(f"/api/v1/seller/furniture/{m.id}", json={"is_active": True}).status_code == 403
        assert m.is_active is False

    def test_a_seller_cannot_set_the_moderation_status(self, client):
        u = _user()
        store = _store(u)
        m = _model(store, "pending")
        _as(u, [_R(store), _R(m)])
        client.patch(f"/api/v1/seller/furniture/{m.id}", json={"status": "approved"})
        assert m.status == "pending"

    def test_delete_removes_the_row_and_its_files(self, client):
        u = _user()
        store = _store(u)
        m = _model(store, thumbnail_key="furniture/t.jpg")
        db = _as(u, [_R(store), _R(m)])
        assert client.delete(f"/api/v1/seller/furniture/{m.id}").status_code == 204
        db.delete.assert_awaited_once_with(m)


class TestModeration:
    def test_only_admins_may_decide(self, client):
        _as(_user(), [])
        assert client.get("/api/v1/admin/moderation/pending").status_code == 403
        assert client.post(f"/api/v1/admin/moderation/furniture/{uuid.uuid4()}/approve").status_code == 403

    def test_approving_a_shop_makes_it_live(self, client):
        owner = _user()
        store = _store(owner, "pending")
        _as(_user(is_admin=True), [_R(store)])
        assert client.post(f"/api/v1/admin/moderation/stores/{store.id}/approve").status_code == 204
        assert (store.status, store.is_active, store.moderation_note) == ("approved", True, None)

    def test_rejecting_needs_a_reason_and_keeps_it_hidden(self, client):
        owner = _user()
        store = _store(owner, "pending")
        _as(_user(is_admin=True), [_R(store)])
        assert client.post(f"/api/v1/admin/moderation/stores/{store.id}/reject", json={}).status_code == 422
        _as(_user(is_admin=True), [_R(store)])
        res = client.post(f"/api/v1/admin/moderation/stores/{store.id}/reject", json={"note": "Telefon noto'g'ri"})
        assert res.status_code == 204
        assert (store.status, store.is_active, store.moderation_note) == ("rejected", False, "Telefon noto'g'ri")

    def test_approving_and_rejecting_a_model(self, client):
        store = _store(_user())
        m = _model(store, "pending")
        _as(_user(is_admin=True), [_R(m)])
        assert client.post(f"/api/v1/admin/moderation/furniture/{m.id}/approve").status_code == 204
        assert (m.status, m.is_active) == ("approved", True)
        _as(_user(is_admin=True), [_R(m)])
        assert client.post(f"/api/v1/admin/moderation/furniture/{m.id}/reject", json={"note": "Sifatsiz"}).status_code == 204
        assert (m.status, m.is_active, m.moderation_note) == ("rejected", False, "Sifatsiz")

    def test_a_missing_item_is_404(self, client):
        _as(_user(is_admin=True), [_R(None)])
        assert client.post(f"/api/v1/admin/moderation/furniture/{uuid.uuid4()}/approve").status_code == 404

    def test_the_pending_queue_lists_shops_and_models(self, client):
        owner = _user()
        store = _store(owner, "pending")
        m = _model(store, "pending")
        m.store = store
        _as(_user(is_admin=True), [_R(many=[store]), _R(many=[m])])
        body = client.get("/api/v1/admin/moderation/pending").json()
        assert [s["id"] for s in body["stores"]] == [str(store.id)]
        assert body["furniture"][0]["store_name"] == "Mebel Plus"
        assert body["furniture"][0]["status"] == "pending"
