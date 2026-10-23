"""Admin materials API: add, edit and hide shop products (mocked session)."""
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.material import Material
from app.models.store import Store

from tests.test_admin_catalog import _Result, _as, _db, _run_post_commit, _user  # noqa: F401

URL = "/api/v1/admin/materials"


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _store(name="Yashil Savdo"):
    s = Store(name=name)
    s.id = uuid.uuid4()
    return s


def _material(**kw):
    store = kw.pop("store", None) or _store()
    d = dict(
        category="gips", name_uz="Suvoq", unit="qop", price_uzs=50000,
        pack_qty=None, pack_unit=None, smeta_key=None,
        roll_width_cm=None, roll_length_m=None, color_hex=None,
        image_url=None, is_active=True,
    )
    d.update(kw)
    m = Material(store_id=store.id, **d)
    m.id = uuid.uuid4()
    m.store = store
    return m


def _admin_db(store=None, material=None):
    db = _db(_Result(one=material))
    db.get = AsyncMock(return_value=store)
    _as(_user(is_admin=True), db)
    return db


def _body(**kw):
    d = dict(
        store_id=str(uuid.uuid4()), category="gips", name_uz="Galtel 2m", unit="dona",
        price_uzs=12000, pack_qty=2, pack_unit="m", smeta_key="galtel",
    )
    d.update(kw)
    return d


class TestCreate:
    def test_creates(self, client):
        db = _admin_db(store=_store("Ideal"))
        r = client.post(URL, json=_body(smeta_key="  galtel "))
        assert r.status_code == 201, r.text
        added = db.add.call_args[0][0]
        assert added.name_uz == "Galtel 2m" and added.smeta_key == "galtel"
        assert added.pack_qty == 2 and added.pack_unit == "m" and added.is_active is True
        assert r.json()["store_name"] == "Ideal"

    def test_blank_smeta_key_is_none(self, client):
        db = _admin_db(store=_store())
        r = client.post(URL, json=_body(smeta_key="  ", pack_qty=None, pack_unit=None))
        assert r.status_code == 201, r.text
        assert db.add.call_args[0][0].smeta_key is None

    @pytest.mark.parametrize("override,msg", [
        ({"category": "xxx"}, "Kategoriya noto'g'ri"),
        ({"unit": "xxx"}, "Birlik noto'g'ri"),
        ({"pack_unit": None}, "Qadoq hajmi va birligi birga kiritiladi"),
        ({"pack_qty": None}, "Qadoq hajmi va birligi birga kiritiladi"),
        ({"roll_width_cm": 53}, "Rulon o'lchami faqat oboy uchun"),
        ({"smeta_key": "suvoq"}, "suvoq uchun qadoq birligi kg bo'lishi kerak"),
        ({"smeta_key": "nomalum"}, "Bunday smeta kaliti yo'q"),
    ])
    def test_422_messages(self, client, override, msg):
        db = _admin_db(store=_store())
        r = client.post(URL, json=_body(**override))
        assert r.status_code == 422
        assert r.json()["detail"] == msg
        db.add.assert_not_called()

    def test_zero_price(self, client):
        db = _admin_db(store=_store())
        assert client.post(URL, json=_body(price_uzs=0)).status_code == 422
        db.add.assert_not_called()

    def test_unknown_store(self, client):
        db = _admin_db(store=None)
        r = client.post(URL, json=_body())
        assert r.status_code == 422 and r.json()["detail"] == "Do'kon topilmadi"
        db.add.assert_not_called()

    def test_clears_cache_after_commit(self, client, monkeypatch):
        calls = []

        async def fake(prefix):
            calls.append(prefix)

        monkeypatch.setattr("app.routers.admin_materials.cache_delete_prefix", fake)
        db = _admin_db(store=_store())
        assert client.post(URL, json=_body()).status_code == 201
        assert calls == []
        _run_post_commit(db)
        assert calls == ["materials:"]

    def test_non_admin_403(self, client):
        _as(_user(is_admin=False), _db())
        assert client.post(URL, json=_body()).status_code == 403
        assert client.get(URL).status_code == 403
        assert client.patch(f"{URL}/{uuid.uuid4()}", json={}).status_code == 403


class TestUpdate:
    def test_category_change_with_roll_size_is_422(self, client):
        m = _material(category="oboy", unit="rulon", roll_width_cm=53, roll_length_m=10)
        _admin_db(material=m)
        r = client.patch(f"{URL}/{m.id}", json={"category": "boyoq"})
        assert r.status_code == 422
        assert r.json()["detail"] == "Rulon o'lchami faqat oboy uchun"
        assert m.category == "oboy"

    def test_remove_smeta_key(self, client):
        m = _material(smeta_key="suvoq", pack_qty=25, pack_unit="kg")
        _admin_db(material=m)
        r = client.patch(f"{URL}/{m.id}", json={"smeta_key": None})
        assert r.status_code == 200, r.text
        assert m.smeta_key is None and r.json()["smeta_key"] is None

    def test_hide(self, client):
        m = _material()
        db = _admin_db(material=m)
        r = client.patch(f"{URL}/{m.id}", json={"is_active": False})
        assert r.status_code == 200
        assert m.is_active is False and r.json()["is_active"] is False
        assert r.json()["name_uz"] == "Suvoq"
        _run_post_commit(db)

    def test_merged_state_checked(self, client):
        m = _material(smeta_key="suvoq", pack_qty=25, pack_unit="kg")
        _admin_db(material=m)
        r = client.patch(f"{URL}/{m.id}", json={"pack_unit": "m"})
        assert r.status_code == 422
        assert r.json()["detail"] == "suvoq uchun qadoq birligi kg bo'lishi kerak"

    def test_not_found(self, client):
        _admin_db(material=None)
        assert client.patch(f"{URL}/{uuid.uuid4()}", json={"is_active": False}).status_code == 404

    def test_null_price_rejected(self, client):
        _admin_db(material=_material())
        assert client.patch(f"{URL}/{uuid.uuid4()}", json={"price_uzs": None}).status_code == 422


class TestList:
    def test_filters(self, client):
        m = _material()
        db = _db(_Result(one=1, many=[m]))
        _as(_user(is_admin=True), db)
        r = client.get(URL, params={"smeta": "true", "category": "gips", "q": "O'sim"})
        assert r.status_code == 200, r.text
        assert r.json()["items"][0]["store_name"] == "Yashil Savdo"
        stmt = db.execute.call_args_list[-1][0][0]
        sql = str(stmt.compile(dialect=postgresql.dialect()))
        assert "smeta_key IS NOT NULL" in sql
        assert "materials.category =" in sql
        assert "materials.name_uz ILIKE %(name_uz_1)s" in sql
        compiled = stmt.compile(dialect=postgresql.dialect())
        assert "%O'sim%" in compiled.params.values()
        assert "O'sim" not in sql  # bound, never interpolated

    def test_rows_with_the_same_name_keep_a_stable_order(self, client):
        db = _db(_Result(one=0, many=[]))
        _as(_user(is_admin=True), db)
        client.get(URL)
        sql = str(db.execute.call_args_list[-1][0][0].compile(dialect=postgresql.dialect()))
        assert sql.split("ORDER BY")[1].split("LIMIT")[0].strip().endswith("materials.id")

    def test_percent_and_underscore_in_the_search_are_literal(self, client):
        db = _db(_Result(one=0, many=[]))
        _as(_user(is_admin=True), db)
        client.get(URL, params={"q": "50%_off"})
        compiled = db.execute.call_args_list[-1][0][0].compile(dialect=postgresql.dialect())
        assert "%50\\%\\_off%" in compiled.params.values()
        assert "ESCAPE" in str(compiled)

    def test_a_material_of_a_closed_shop_says_so(self, client):
        closed = _store("Yopiq"); closed.is_active = False
        open_ = _store("Ochiq"); open_.is_active = True
        db = _db(_Result(one=2, many=[_material(store=closed), _material(store=open_)]))
        _as(_user(is_admin=True), db)
        items = client.get(URL).json()["items"]
        assert [i["store_open"] for i in items] == [False, True]


class TestPackUnit:
    def test_an_unknown_pack_unit_gets_an_uzbek_message(self, client):
        _admin_db(store=_store())
        r = client.post(URL, json=_body(pack_unit="кг"))
        assert r.status_code == 422 and r.json()["detail"] == "Qadoq birligi noto'g'ri"


class TestPricePatch:
    def test_a_price_only_edit_changes_just_the_price(self, client):
        m = _material(price_uzs=50000)
        _admin_db(material=m)
        r = client.patch(f"{URL}/{m.id}", json={"price_uzs": 61000})
        assert r.status_code == 200 and m.price_uzs == 61000 and m.category == "gips"
