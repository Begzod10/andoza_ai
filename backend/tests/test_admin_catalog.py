"""
Admin shop/3D-model catalog tests.

Every write here is admin-only: creating a shop, uploading a model with its
category and target room, and deleting either. Storage and the DB session are
stubbed — these cover the router's contract, not Postgres.
"""
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


def _user(is_admin: bool = False):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.is_active = True
    user.is_admin = is_admin
    return user


class _Result:
    """Stands in for the object SQLAlchemy's execute() returns."""

    def __init__(self, one=None, many=()):
        self._one = one
        self._many = list(many)

    def scalar_one_or_none(self):
        return self._one

    def scalars(self):
        return self

    def all(self):
        return self._many


def _db(execute_result=None):
    db = AsyncMock()
    db.execute = AsyncMock(return_value=execute_result or _Result())
    db.flush = AsyncMock()
    db.delete = AsyncMock()
    db.add = MagicMock()

    async def _refresh(obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)
        if getattr(obj, "is_active", None) is None:
            obj.is_active = True

    db.refresh = AsyncMock(side_effect=_refresh)
    return db


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _as(user, db):
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db


GLB = b"glTF" + b"0" * 64


def _store(**overrides) -> Store:
    defaults = dict(
        id=uuid.uuid4(),
        name="Yashil Savdo",
        district="Chilonzor",
        phone=None,
        telegram=None,
        logo_color=None,
        partner_tier="standard",
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    defaults.update(overrides)
    store = Store(**{k: v for k, v in defaults.items() if k not in ("id", "created_at")})
    store.id = defaults["id"]
    store.created_at = defaults["created_at"]
    return store


class TestStoreWritesAreAdminOnly:
    def test_create_refuses_non_admin(self, client):
        db = _db()
        _as(_user(is_admin=False), db)
        response = client.post("/api/v1/admin/stores", json={"name": "Yangi do'kon"})
        assert response.status_code == 403
        db.add.assert_not_called()

    def test_update_refuses_non_admin(self, client):
        db = _db()
        _as(_user(is_admin=False), db)
        response = client.patch(f"/api/v1/admin/stores/{uuid.uuid4()}", json={"name": "X"})
        assert response.status_code == 403

    def test_delete_refuses_non_admin(self, client):
        db = _db()
        _as(_user(is_admin=False), db)
        response = client.delete(f"/api/v1/admin/stores/{uuid.uuid4()}")
        assert response.status_code == 403

    def test_list_refuses_non_admin(self, client):
        db = _db()
        _as(_user(is_admin=False), db)
        response = client.get("/api/v1/admin/stores")
        assert response.status_code == 403


class TestCreateStore:
    def test_admin_creates_shop(self, client):
        db = _db()
        _as(_user(is_admin=True), db)
        response = client.post(
            "/api/v1/admin/stores",
            json={"name": "Yashil Savdo", "district": "Chilonzor", "partner_tier": "gold"},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Yashil Savdo"
        assert body["partner_tier"] == "gold"
        db.add.assert_called_once()

    def test_rejects_unknown_partner_tier(self, client):
        db = _db()
        _as(_user(is_admin=True), db)
        response = client.post(
            "/api/v1/admin/stores",
            json={"name": "X", "partner_tier": "diamond"},
        )
        assert response.status_code == 422
        db.add.assert_not_called()


class TestUpdateStore:
    def test_partial_update_only_touches_given_fields(self, client):
        store = _store()
        db = _db(_Result(one=store))
        _as(_user(is_admin=True), db)
        response = client.patch(
            f"/api/v1/admin/stores/{store.id}",
            json={"is_active": False},
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is False
        assert response.json()["name"] == "Yashil Savdo"  # untouched

    def test_missing_store_is_404(self, client):
        db = _db(_Result(one=None))
        _as(_user(is_admin=True), db)
        response = client.patch(f"/api/v1/admin/stores/{uuid.uuid4()}", json={"name": "X"})
        assert response.status_code == 404


class TestDeleteStore:
    def test_removes_store_and_its_model_files(self, client):
        store = _store()
        furniture = Furniture(
            id=uuid.uuid4(),
            store_id=store.id,
            category="divan",
            name_uz="Divan",
            glb_key="furniture/a.glb",
            thumbnail_key="furniture/a_thumb.jpg",
        )
        store.furniture_items = [furniture]
        db = _db(_Result(one=store))
        _as(_user(is_admin=True), db)

        with patch("app.routers.admin_catalog.delete_file") as removed:
            response = client.delete(f"/api/v1/admin/stores/{store.id}")

        assert response.status_code == 204
        db.delete.assert_awaited_once_with(store)
        assert removed.call_count == 2
        removed.assert_any_call("furniture/a.glb")
        removed.assert_any_call("furniture/a_thumb.jpg")

    def test_missing_store_is_404(self, client):
        db = _db(_Result(one=None))
        _as(_user(is_admin=True), db)
        response = client.delete(f"/api/v1/admin/stores/{uuid.uuid4()}")
        assert response.status_code == 404


class TestUploadFurnitureModel:
    def _post(self, client, **form):
        data = {
            "name_uz": "Divan",
            "category": "divan",
            **form,
        }
        files = {"file": ("model.glb", io.BytesIO(GLB), "model/gltf-binary")}
        return client.post("/api/v1/admin/furniture", data=data, files=files)

    def test_refuses_non_admin(self, client):
        db = _db()
        _as(_user(is_admin=False), db)
        response = self._post(client)
        assert response.status_code == 403
        db.add.assert_not_called()

    def test_rejects_non_glb_file(self, client):
        db = _db()
        _as(_user(is_admin=True), db)
        response = client.post(
            "/api/v1/admin/furniture",
            data={"name_uz": "Divan", "category": "divan"},
            files={"file": ("model.fbx", io.BytesIO(GLB), "application/octet-stream")},
        )
        assert response.status_code == 415

    def test_rejects_unknown_category(self, client):
        db = _db()
        _as(_user(is_admin=True), db)
        response = self._post(client, category="not-a-category")
        assert response.status_code == 422

    def test_rejects_unknown_room_type(self, client):
        db = _db()
        _as(_user(is_admin=True), db)
        response = self._post(client, room_type="garaj")
        assert response.status_code == 422

    def test_rejects_empty_file(self, client):
        db = _db()
        _as(_user(is_admin=True), db)
        response = client.post(
            "/api/v1/admin/furniture",
            data={"name_uz": "Divan", "category": "divan"},
            files={"file": ("model.glb", io.BytesIO(b""), "model/gltf-binary")},
        )
        assert response.status_code == 400

    def test_rejects_unknown_store(self, client):
        db = _db(_Result(one=None))
        _as(_user(is_admin=True), db)
        response = self._post(client, store_id=str(uuid.uuid4()))
        assert response.status_code == 404

    def test_stores_model_with_room_type_and_returns_urls(self, client):
        store = _store()
        db = _db(_Result(one=store))
        _as(_user(is_admin=True), db)

        with patch(
            "app.routers.admin_catalog.upload_file",
            return_value="/media/furniture/abc.glb",
        ) as stored:
            response = self._post(
                client,
                room_type="yotoqxona",
                store_id=str(store.id),
                price_uzs="5000000",
            )

        assert response.status_code == 201
        body = response.json()
        assert body["room_type"] == "yotoqxona"
        assert body["store_name"] == "Yashil Savdo"
        assert body["glb_url"].startswith("http://")
        assert "/media/furniture/" in body["glb_url"]
        assert stored.call_args.args[1].startswith("furniture/")
        db.add.assert_called_once()


class TestUpdateFurniture:
    def test_refuses_non_admin(self, client):
        db = _db()
        _as(_user(is_admin=False), db)
        response = client.patch(f"/api/v1/admin/furniture/{uuid.uuid4()}", json={"name_uz": "X"})
        assert response.status_code == 403

    def test_partial_update(self, client):
        furniture = Furniture(
            id=uuid.uuid4(),
            store_id=None,
            category="divan",
            name_uz="Divan",
            glb_key="furniture/a.glb",
        )
        furniture.store = None
        db = _db(_Result(one=furniture))
        _as(_user(is_admin=True), db)
        response = client.patch(
            f"/api/v1/admin/furniture/{furniture.id}",
            json={"room_type": "mehmonxona", "is_active": False},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["room_type"] == "mehmonxona"
        assert body["is_active"] is False
        assert body["name_uz"] == "Divan"  # untouched

    def test_missing_is_404(self, client):
        db = _db(_Result(one=None))
        _as(_user(is_admin=True), db)
        response = client.patch(f"/api/v1/admin/furniture/{uuid.uuid4()}", json={"name_uz": "X"})
        assert response.status_code == 404


class TestDeleteFurniture:
    def test_removes_row_and_files(self, client):
        furniture = Furniture(
            id=uuid.uuid4(),
            store_id=None,
            category="divan",
            name_uz="Divan",
            glb_key="furniture/a.glb",
            thumbnail_key="furniture/a_thumb.jpg",
        )
        db = _db(_Result(one=furniture))
        _as(_user(is_admin=True), db)

        with patch("app.routers.admin_catalog.delete_file") as removed:
            response = client.delete(f"/api/v1/admin/furniture/{furniture.id}")

        assert response.status_code == 204
        db.delete.assert_awaited_once_with(furniture)
        assert removed.call_count == 2

    def test_missing_is_404(self, client):
        db = _db(_Result(one=None))
        _as(_user(is_admin=True), db)
        response = client.delete(f"/api/v1/admin/furniture/{uuid.uuid4()}")
        assert response.status_code == 404
