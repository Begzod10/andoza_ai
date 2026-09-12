"""
User 3D-model persistence tests.

The rules that matter: only real GLBs get in, everything is scoped to the
current user (list, patch, delete), and re-uploading the same bytes updates
the existing entry instead of duplicating it.

Storage and the DB session are stubbed — these cover the router's contract,
not Postgres.
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
from app.models.user_model import UserModel


def _user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.is_active = True
    user.is_admin = False
    return user


class _Result:
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

    async def _refresh(obj, attribute_names=None):
        if obj.id is None:
            obj.id = uuid.uuid4()
        if obj.created_at is None:
            obj.created_at = datetime.now(timezone.utc)

    db.refresh = AsyncMock(side_effect=_refresh)
    return db


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _as(user, db):
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db


GLB = b"glTF" + b"\x02\x00\x00\x00" + b"0" * 64


def _model(user_id=None, **kw):
    defaults = dict(
        id=uuid.uuid4(),
        user_id=user_id or uuid.uuid4(),
        name="divan.glb",
        category="divan",
        placement="pol",
        price_uzs=1_500_000,
        scale=0.01,
        size_w_m=1.8,
        size_d_m=0.9,
        size_h_m=0.8,
        has_textures=True,
        storage_key="models/u/a.glb",
        thumb_key=None,
        content_type="model/gltf-binary",
        size_bytes=len(GLB),
        sha256="hash",
        created_at=datetime.now(timezone.utc),
    )
    defaults.update(kw)
    return UserModel(**defaults)


class TestUpload:
    @patch("app.routers.user_models.upload_file", new_callable=AsyncMock, return_value="models/u/a.glb")
    def test_upload_persists_and_echoes_metadata(self, upload_mock, client):
        user = _user()
        _as(user, _db())
        response = client.post(
            "/api/v1/user-models",
            files={"file": ("divan.glb", io.BytesIO(GLB), "model/gltf-binary")},
            data={
                "name": "divan",
                "scale": "0.01",
                "size_w_m": "1.8",
                "size_d_m": "0.9",
                "size_h_m": "0.8",
                "has_textures": "true",
                "category": "divan",
                "price_uzs": "1500000",
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "divan"
        assert body["category"] == "divan"
        assert body["size_w_m"] == 1.8
        assert body["has_textures"] is True
        assert upload_mock.await_count == 1

    def test_rejects_non_glb_bytes(self, client):
        _as(_user(), _db())
        response = client.post(
            "/api/v1/user-models",
            files={"file": ("fake.glb", io.BytesIO(b"not a model"), "model/gltf-binary")},
            data={"name": "x"},
        )
        assert response.status_code == 415

    def test_rejects_wrong_content_type(self, client):
        _as(_user(), _db())
        response = client.post(
            "/api/v1/user-models",
            files={"file": ("a.png", io.BytesIO(GLB), "image/png")},
            data={"name": "x"},
        )
        assert response.status_code == 415

    @patch("app.routers.user_models.upload_file", new_callable=AsyncMock)
    def test_same_bytes_update_existing_entry(self, upload_mock, client):
        user = _user()
        existing = _model(user_id=user.id, name="old")
        _as(user, _db(_Result(one=existing)))
        response = client.post(
            "/api/v1/user-models",
            files={"file": ("new-name.glb", io.BytesIO(GLB), "model/gltf-binary")},
            data={"name": "new name", "category": "stol"},
        )
        assert response.status_code == 201
        assert response.json()["name"] == "new name"
        assert existing.category == "stol"
        upload_mock.assert_not_awaited()  # no second copy of the bytes


class TestList:
    def test_lists_own_models(self, client):
        user = _user()
        rows = [_model(user_id=user.id), _model(user_id=user.id)]
        _as(user, _db(_Result(many=rows)))
        response = client.get("/api/v1/user-models")
        assert response.status_code == 200
        assert len(response.json()) == 2
        assert response.json()[0]["url"].endswith("/media/models/u/a.glb")


class TestUpdate:
    def test_patch_touches_only_given_fields(self, client):
        user = _user()
        model = _model(user_id=user.id)
        _as(user, _db(_Result(one=model)))
        response = client.patch(
            f"/api/v1/user-models/{model.id}",
            json={"price_uzs": 900000},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["price_uzs"] == 900000
        assert body["name"] == "divan.glb"  # untouched

    def test_missing_model_is_404(self, client):
        _as(_user(), _db(_Result(one=None)))
        response = client.patch(f"/api/v1/user-models/{uuid.uuid4()}", json={"name": "X"})
        assert response.status_code == 404


class TestDelete:
    @patch("app.routers.user_models.delete_file", new_callable=AsyncMock)
    def test_delete_removes_row_and_files(self, delete_mock, client):
        user = _user()
        model = _model(user_id=user.id, thumb_key="models/u/a.jpg")
        db = _db(_Result(one=model))
        _as(user, db)
        response = client.delete(f"/api/v1/user-models/{model.id}")
        assert response.status_code == 204
        db.delete.assert_awaited_once_with(model)
        assert delete_mock.await_count == 2  # GLB + thumbnail

    def test_missing_model_is_404(self, client):
        _as(_user(), _db(_Result(one=None)))
        response = client.delete(f"/api/v1/user-models/{uuid.uuid4()}")
        assert response.status_code == 404
