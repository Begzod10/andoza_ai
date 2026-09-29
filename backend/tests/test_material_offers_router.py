"""Material offers (multi-dealer pricing) router tests.

Covers GET /api/v1/materials/{material_id}/offers, which powers the mobile
Do'kon dealer-comparison screen (real offers replacing the old fabricated
dealers in shop_provider.dart).

The endpoint joins material_offers -> stores and returns each store's
price/delivery/badge, cheapest-first. Tests use a get_db override returning
scripted (offer, store) row tuples -- no Postgres required. Store/offer
stand-ins expose only the attributes the router reads.
"""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app


class _Result:
    def __init__(self, rows=()):
        self._rows = list(rows)

    def all(self):
        return self._rows


def _offer(material_id, store_id, price, delivery_days=2, in_stock=True):
    return SimpleNamespace(
        id=uuid.uuid4(),
        material_id=material_id,
        store_id=store_id,
        price_uzs=price,
        in_stock=in_stock,
        delivery_days=delivery_days,
    )


def _store(name, district="Chilonzor", partner_tier="gold"):
    return SimpleNamespace(id=uuid.uuid4(), name=name, district=district, partner_tier=partner_tier)


class _FakeDb:
    """Returns the pre-ordered (offer, store) rows for any query. The real
    endpoint delegates the cheapest-first ordering to SQL (ORDER BY
    price_uzs); the compiled SQL is asserted separately."""

    def __init__(self, rows):
        self._rows = rows
        self.executed_sql: list[str] = []

    async def execute(self, stmt):
        self.executed_sql.append(str(stmt.compile(compile_kwargs={"literal_binds": True})))
        return _Result(self._rows)


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _as_db(db):
    app.dependency_overrides[get_db] = lambda: db


class TestMaterialOffers:
    def test_happy_path_returns_offers_with_store_info(self, client):
        material_id = uuid.uuid4()
        s1 = _store("Rasmiy Do'kon", district="Chilonzor", partner_tier="gold")
        s2 = _store("Qurilish Bozori", district="Sergeli", partner_tier="basic")
        # Provided cheapest-first, mirroring the SQL ORDER BY price_uzs.
        rows = [
            (_offer(material_id, s1.id, 45_000, delivery_days=2), s1),
            (_offer(material_id, s2.id, 52_000, delivery_days=1), s2),
        ]
        db = _FakeDb(rows)
        _as_db(db)

        response = client.get(f"/api/v1/materials/{material_id}/offers")
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2

        first = body[0]
        assert first["store_name"] == "Rasmiy Do'kon"
        assert first["store_district"] == "Chilonzor"
        assert first["store_partner_tier"] == "gold"
        assert first["price_uzs"] == 45_000
        assert first["delivery_days"] == 2
        assert first["in_stock"] is True
        assert first["material_id"] == str(material_id)

        # Cheapest first is preserved.
        assert [o["price_uzs"] for o in body] == [45_000, 52_000]
        # ...and the endpoint asks the DB to order by price.
        assert any("order by" in sql.lower() and "price_uzs" in sql.lower() for sql in db.executed_sql)

    def test_empty_when_no_offers(self, client):
        material_id = uuid.uuid4()
        db = _FakeDb([])
        _as_db(db)

        response = client.get(f"/api/v1/materials/{material_id}/offers")
        assert response.status_code == 200
        assert response.json() == []
