"""
Mebel (furniture workshop) projects and price book.

What matters: everything is scoped to the current user, the project JSON is
checked for the ranges the engine relies on, and the shop catalogue knows the
sheet goods a cabinet is made of. The DB session is stubbed, as in
test_user_models.py: these cover the router's contract, not Postgres.
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.furniture_project import FurnitureProject
from app.models.material import MaterialCategory


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


def _db(*results):
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=list(results) or [_Result()])
    db.flush = AsyncMock()
    db.delete = AsyncMock()
    db.add = MagicMock()

    async def _refresh(obj, attribute_names=None):
        if getattr(obj, "id", "x") is None:
            obj.id = uuid.uuid4()
        if getattr(obj, "created_at", "x") is None:
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


def _data(**cab):
    cabinet = dict(id="c1", type="base", label="M1", width=600, height=720, depth=560, shelves=1,
                   position={"x": 0, "z": 0})
    cabinet.update(cab)
    return {"schemaVersion": 1, "name": "Oshxona", "defaults": {"board": {"thickness": 18}}, "cabinets": [cabinet]}


def _project(user_id, **kw):
    now = datetime.now(timezone.utc)
    values = dict(id=uuid.uuid4(), user_id=user_id, name="Oshxona", data=_data(), schema_version=1,
                  created_at=now, updated_at=now)
    values.update(kw)
    return FurnitureProject(**values)


def test_create_and_list_own_projects(client):
    user = _user()
    db = _db()
    _as(user, db)

    r = client.post("/api/v1/mebel/projects", json={"name": "Oshxona", "data": _data()})

    assert r.status_code == 201, r.text
    added = db.add.call_args.args[0]
    assert isinstance(added, FurnitureProject) and added.user_id == user.id
    assert r.json()["name"] == "Oshxona" and r.json()["data"]["cabinets"][0]["width"] == 600

    mine = _project(user.id)
    _as(user, _db(_Result(many=[mine])))
    r = client.get("/api/v1/mebel/projects")
    assert r.status_code == 200
    assert [p["id"] for p in r.json()] == [str(mine.id)]
    assert "data" not in r.json()[0]  # the list is light; the editor fetches one project


def test_get_foreign_project_is_404(client):
    user = _user()
    foreign = _project(uuid.uuid4())
    _as(user, _db(_Result(one=foreign)))
    assert client.get(f"/api/v1/mebel/projects/{foreign.id}").status_code == 404


def test_get_missing_project_is_404(client):
    _as(_user(), _db(_Result(one=None)))
    assert client.get(f"/api/v1/mebel/projects/{uuid.uuid4()}").status_code == 404


def test_put_updates_name_and_data(client):
    user = _user()
    mine = _project(user.id)
    _as(user, _db(_Result(one=mine)))

    r = client.put(f"/api/v1/mebel/projects/{mine.id}", json={"name": "Yangi", "data": _data(width=800)})

    assert r.status_code == 200, r.text
    assert mine.name == "Yangi" and mine.data["cabinets"][0]["width"] == 800


def test_put_foreign_project_is_404(client):
    user = _user()
    foreign = _project(uuid.uuid4())
    _as(user, _db(_Result(one=foreign)))
    r = client.put(f"/api/v1/mebel/projects/{foreign.id}", json={"name": "x", "data": _data()})
    assert r.status_code == 404
    assert foreign.name == "Oshxona"


def test_delete_own_project(client):
    user = _user()
    mine = _project(user.id)
    db = _db(_Result(one=mine))
    _as(user, db)
    assert client.delete(f"/api/v1/mebel/projects/{mine.id}").status_code == 204
    db.delete.assert_awaited_once_with(mine)


@pytest.mark.parametrize("field,value", [("width", 100), ("width", 1300), ("height", 200), ("depth", 800), ("shelves", 5)])
def test_rejects_cabinet_out_of_range(client, field, value):
    _as(_user(), _db())
    r = client.post("/api/v1/mebel/projects", json={"name": "x", "data": _data(**{field: value})})
    assert r.status_code == 422


def test_rejects_more_than_30_cabinets(client):
    _as(_user(), _db())
    data = _data()
    data["cabinets"] = data["cabinets"] * 31
    assert client.post("/api/v1/mebel/projects", json={"name": "x", "data": data}).status_code == 422


def test_rejects_unknown_schema_version(client):
    _as(_user(), _db())
    data = {**_data(), "schemaVersion": 2}
    assert client.post("/api/v1/mebel/projects", json={"name": "x", "data": data}).status_code == 422


def test_price_book_get_empty_then_put(client):
    user = _user()
    _as(user, _db(_Result(one=None)))
    r = client.get("/api/v1/mebel/price-book")
    assert r.status_code == 200 and r.json() == {}

    db = _db(_Result())
    _as(user, db)
    body = {"materials": {"m1": 520000}, "cutPerSheet": 40000, "markupPercent": 30}
    r = client.put("/api/v1/mebel/price-book", json={"data": body})
    assert r.status_code == 200, r.text
    assert r.json()["cutPerSheet"] == 40000


def test_price_book_put_is_one_upsert(client):
    """Two first saves at once must not race into a primary-key error: the
    write is a single INSERT … ON CONFLICT (user_id) DO UPDATE."""
    from sqlalchemy.dialects import postgresql

    user = _user()
    db = _db(_Result())
    _as(user, db)
    client.put("/api/v1/mebel/price-book", json={"data": {"markupPercent": 30}})

    db.add.assert_not_called()
    assert db.execute.await_count == 1
    stmt = db.execute.await_args.args[0]
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert sql.startswith("INSERT INTO price_books")
    assert "ON CONFLICT (user_id) DO UPDATE" in sql
    params = stmt.compile(dialect=postgresql.dialect()).params
    assert params["user_id"] == user.id and params["data"]["markupPercent"] == 30


def test_price_book_rejects_markup_over_300(client):
    _as(_user(), _db(_Result(one=None)))
    r = client.put("/api/v1/mebel/price-book", json={"data": {"markupPercent": 400}})
    assert r.status_code == 422


def test_requires_login(client):
    assert client.get("/api/v1/mebel/projects").status_code in (401, 403)


def test_material_category_has_sheet_goods():
    assert set(MaterialCategory.enums) >= {"ldsp", "mdf", "hdf", "kromka", "furnitura"}


@pytest.mark.parametrize("sheet", [{"length": None, "width": 2070}, {"length": 0, "width": 2070}, {"length": 2800}])
def test_rejects_a_sheet_size_the_engine_cannot_use(client, sheet):
    _as(_user(), _db())
    data = _data()
    data["defaults"]["sheet"] = sheet
    assert client.post("/api/v1/mebel/projects", json={"name": "x", "data": data}).status_code == 422


def test_rejects_a_fractional_size(client):
    _as(_user(), _db())
    assert client.post("/api/v1/mebel/projects", json={"name": "x", "data": _data(width=600.5)}).status_code == 422
