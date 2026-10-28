"""furniture.model_yaw: the column and its CHECK, the API fields, the footprint swap on PATCH."""
from __future__ import annotations

import importlib.util
import io
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.furniture import Furniture

from tests.test_admin_catalog import GLB, _as, _db, _Result, _user


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _furniture(yaw=0, w=232, d=197) -> Furniture:
    f = Furniture(
        id=uuid.uuid4(), store_id=None, category="divan", placement="pol",
        name_uz="Divan", glb_key="furniture/a.glb", footprint_w=w, footprint_d=d, model_yaw=yaw,
    )
    f.store = None
    return f


def _patch(client, f, body):
    _as(_user(is_admin=True), _db(_Result(one=f)))
    return client.patch(f"/api/v1/admin/furniture/{f.id}", json=body)


# ---- migration ------------------------------------------------------------ #

def test_migration_adds_model_yaw_with_check(monkeypatch):
    path = next(Path(__file__).resolve().parents[1].glob("alembic/versions/1786000043_*.py"))
    spec = importlib.util.spec_from_file_location("m43", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert (mod.revision, mod.down_revision) == ("1786000043", "1786000042")

    fake = MagicMock()
    monkeypatch.setattr(mod, "op", fake)
    mod.upgrade()
    table, column = fake.add_column.call_args.args
    assert table == "furniture" and column.name == "model_yaw"
    assert column.nullable is False and str(column.server_default.arg) == "0"
    assert fake.create_check_constraint.call_args.args[:2] == ("ck_furniture_model_yaw", "furniture")
    assert "0, 90, 180, 270" in fake.create_check_constraint.call_args.args[2]

    fake.reset_mock()
    mod.downgrade()
    assert fake.mock_calls[0] == (
        "drop_constraint", ("ck_furniture_model_yaw", "furniture"), {"type_": "check"})
    assert fake.drop_column.call_args.args == ("furniture", "model_yaw")


def test_model_declares_the_same_check():
    names = {c.name for c in Furniture.__table__.constraints}
    assert "ck_furniture_model_yaw" in names


# ---- PATCH ---------------------------------------------------------------- #

def test_patch_parity_change_swaps_footprint(client):
    f = _furniture(yaw=0, w=232, d=197)
    r = _patch(client, f, {"model_yaw": 270})
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["model_yaw"], body["footprint_w"], body["footprint_d"]) == (270, 197, 232)


def test_patch_same_parity_keeps_footprint(client):
    f = _furniture(yaw=90, w=197, d=232)
    body = _patch(client, f, {"model_yaw": 270}).json()
    assert (body["model_yaw"], body["footprint_w"], body["footprint_d"]) == (270, 197, 232)


def test_patch_with_footprint_does_not_swap(client):
    f = _furniture(yaw=0, w=232, d=197)
    body = _patch(client, f, {"model_yaw": 90, "footprint_w": 200, "footprint_d": 160}).json()
    assert (body["model_yaw"], body["footprint_w"], body["footprint_d"]) == (90, 200, 160)


def test_patch_bad_yaw_is_422(client):
    assert _patch(client, _furniture(), {"model_yaw": 45}).status_code == 422


# ---- output --------------------------------------------------------------- #

def test_catalog_and_admin_out_carry_model_yaw(client):
    f = _furniture(yaw=180)
    f.created_at = datetime.now(timezone.utc)
    f.is_active = True

    _as(_user(is_admin=True), _db(_Result(many=[f])))
    assert client.get("/api/v1/admin/furniture").json()[0]["model_yaw"] == 180

    db = _db()
    db.execute = AsyncMock(side_effect=[_Result(one=1), _Result(many=[f])])
    _as(_user(), db)
    with patch("app.routers.catalog.cache_get", AsyncMock(return_value=None)) as get, \
            patch("app.routers.catalog.cache_set", AsyncMock()):
        body = client.get("/api/v1/furniture").json()
    assert body["items"][0]["model_yaw"] == 180
    assert get.call_args.args[0].startswith("furniture:v3:")


# ---- upload --------------------------------------------------------------- #

def _upload(client, **form):
    _as(_user(is_admin=True), _db())
    files = {"file": ("model.glb", io.BytesIO(GLB), "model/gltf-binary")}
    with patch("app.routers.admin_catalog.upload_file", return_value="/media/furniture/abc.glb"):
        return client.post("/api/v1/admin/furniture", data={"name_uz": "Divan", "category": "divan", **form}, files=files)


def test_upload_takes_model_yaw_form_field(client):
    r = _upload(client, model_yaw="270")
    assert r.status_code == 201, r.text
    assert r.json()["model_yaw"] == 270
    assert _upload(client).json()["model_yaw"] == 0
    assert _upload(client, model_yaw="45").status_code == 422
