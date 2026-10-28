"""The public shop page: GET /stores/{id}, GET /furniture?store=, GET /furniture/{id}.

A shop's page in the mobile app lists its own models, and the studio places one
model by id (`?place=`). Only open shops and live models are served: a pending,
rejected or switched-off shop is is_active=False and must stay hidden.
"""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models.furniture import Furniture
from app.models.store import Store


class _Result:
    def __init__(self, rows):
        self._rows = list(rows)

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None

    def scalar_one(self):
        return self._rows[0]

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


def _compiled(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": True}))


class _FakeDb:
    """Answers the catalog queries from in-memory rows, applying the filters
    the compiled SQL asks for (store id, item id, is_active)."""

    def __init__(self, stores, furniture):
        self.stores = stores
        self.furniture = furniture
        self.statements: list[str] = []

    async def execute(self, stmt):
        sql = _compiled(stmt)
        self.statements.append(sql)
        lowered = sql.lower()
        open_ids = {s.id for s in self.stores if s.is_active}

        def mentions(value) -> bool:
            return value.hex in sql.replace("-", "")

        if "from furniture" in lowered:
            rows = [
                f for f in self.furniture
                if f.is_active and (f.store_id is None or f.store_id in open_ids)
            ]
            if "furniture.store_id = " in lowered:
                rows = [f for f in rows if f.store_id is not None and mentions(f.store_id)]
            if "furniture.id = " in lowered:
                rows = [f for f in rows if mentions(f.id)]
            if "count(*)" in lowered:
                return _Result([len(rows)])
            return _Result(rows)

        rows = [s for s in self.stores if s.is_active and mentions(s.id)]
        return _Result(rows)


def _store(**overrides) -> Store:
    values = dict(
        name="Mebel Plus", district="Chilonzor", phone="+998901234567",
        telegram="@mebelplus", logo_color="#123456", partner_tier="gold", is_active=True,
    )
    values.update(overrides)
    store = Store(**values)
    store.id = uuid.uuid4()
    return store


def _furniture(store: Store | None, **overrides) -> Furniture:
    values = dict(
        category="divan", name_uz="Divan", price_uzs=4_500_000, placement="pol",
        model_yaw=0, glb_key="furniture/a.glb", thumbnail_key="furniture/a.png",
        footprint_w=220.0, footprint_d=90.0, height_cm=80.0, is_active=True, styles=[],
        store_id=store.id if store else None,
    )
    values.update(overrides)
    item = Furniture(**values)
    item.id = uuid.uuid4()
    item.created_at = datetime.now(timezone.utc)
    item.store = store
    return item


@pytest.fixture
def db():
    open_shop = _store()
    other_shop = _store(name="Boshqa")
    closed_shop = _store(name="Yopiq", is_active=False)
    fake = _FakeDb(
        [open_shop, other_shop, closed_shop],
        [
            _furniture(open_shop, name_uz="Divan"),
            _furniture(open_shop, name_uz="Stol", is_active=False),
            _furniture(other_shop, name_uz="Stul"),
            _furniture(closed_shop, name_uz="Karavot"),
        ],
    )

    async def _get_db():
        yield fake

    app.dependency_overrides[get_db] = _get_db
    yield fake
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def client():
    return TestClient(app)


def test_store_page_returns_an_open_shop(client, db):
    shop = db.stores[0]
    res = client.get(f"/api/v1/stores/{shop.id}")
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == str(shop.id)
    assert body["name"] == "Mebel Plus"
    assert body["telegram"] == "@mebelplus"
    assert body["partner_tier"] == "gold"


def test_store_page_hides_a_closed_shop(client, db):
    res = client.get(f"/api/v1/stores/{db.stores[2].id}")
    assert res.status_code == 404
    # The query itself must ask for an open shop, not lean on the fake.
    assert "stores.is_active IS true" in db.statements[-1]


def test_store_page_unknown_id_is_404(client, db):
    assert client.get(f"/api/v1/stores/{uuid.uuid4()}").status_code == 404


def test_store_page_rejects_a_malformed_id(client, db):
    assert client.get("/api/v1/stores/not-a-uuid").status_code == 422


def test_furniture_filters_by_store(client, db):
    shop = db.stores[0]
    res = client.get("/api/v1/furniture", params={"store": str(shop.id)})
    assert res.status_code == 200
    body = res.json()
    assert [i["name_uz"] for i in body["items"]] == ["Divan"]
    assert body["total"] == 1
    assert body["items"][0]["store_name"] == "Mebel Plus"
    # The filter is on both the page and its count.
    filtered = [s for s in db.statements if "furniture.store_id = " in s.lower()]
    assert len(filtered) == 2


def test_furniture_without_store_lists_every_open_shop(client, db):
    res = client.get("/api/v1/furniture")
    assert sorted(i["name_uz"] for i in res.json()["items"]) == ["Divan", "Stul"]


def test_furniture_cache_key_varies_by_store(client, db):
    first = client.get("/api/v1/furniture", params={"store": str(db.stores[0].id)}).json()
    second = client.get("/api/v1/furniture", params={"store": str(db.stores[1].id)}).json()
    assert [i["name_uz"] for i in first["items"]] == ["Divan"]
    assert [i["name_uz"] for i in second["items"]] == ["Stul"]


def test_furniture_item_by_id(client, db):
    item = db.furniture[0]
    res = client.get(f"/api/v1/furniture/{item.id}")
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == str(item.id)
    assert body["glb_url"].endswith("furniture/a.glb")
    assert body["footprint_w"] == 220.0


@pytest.mark.parametrize("index", [1, 3])  # inactive model; model of a closed shop
def test_furniture_item_hides_what_is_not_live(client, db, index):
    res = client.get(f"/api/v1/furniture/{db.furniture[index].id}")
    assert res.status_code == 404
    sql = db.statements[-1]
    assert "furniture.is_active IS true" in sql
    assert "furniture.store_id IN (SELECT stores.id" in sql


def test_furniture_item_unknown_id_is_404(client, db):
    assert client.get(f"/api/v1/furniture/{uuid.uuid4()}").status_code == 404
