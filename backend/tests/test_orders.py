"""
Order pricing tests.

The core invariant under test: total_uzs and each line's unit_price_uzs must
never be trusted from the client when a line references a real catalog
material — the server looks up Material.price_uzs and uses that instead.
Free-text lines (no material_id) are the one case where the client-submitted
price is legitimate and stands as-is.

Storage and the DB session are stubbed — these cover the router's contract,
not Postgres.
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
from app.models.material import Material


def _user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.is_active = True
    user.is_admin = False
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


def _assign_defaults(obj) -> None:
    if getattr(obj, "id", None) is None:
        obj.id = uuid.uuid4()
    if getattr(obj, "created_at", None) is None:
        obj.created_at = datetime.now(timezone.utc)


def _db(execute_result=None):
    db = AsyncMock()
    db.execute = AsyncMock(return_value=execute_result or _Result())
    pending: list = []

    def _add(obj) -> None:
        pending.append(obj)

    async def _flush() -> None:
        # A real INSERT would assign the ORM-side UUID default to the order
        # itself and to every cascaded child line — mirror that here so
        # OrderOut.model_validate() has real ids to read, same as Postgres
        # would produce.
        for obj in pending:
            _assign_defaults(obj)
            for line in getattr(obj, "lines", []) or []:
                _assign_defaults(line)
        pending.clear()

    async def _refresh(obj, attribute_names=None):
        _assign_defaults(obj)

    db.add = MagicMock(side_effect=_add)
    db.flush = AsyncMock(side_effect=_flush)
    db.refresh = AsyncMock(side_effect=_refresh)
    return db


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _as(user, db):
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db


def _material(**overrides) -> Material:
    defaults = dict(
        id=uuid.uuid4(),
        store_id=uuid.uuid4(),
        category="boyoq",
        name_uz="Oq bo'yoq",
        unit="litr",
        price_uzs=50_000,
        is_active=True,
    )
    defaults.update(overrides)
    return Material(**defaults)


class TestOrderPricingTrustsTheServer:
    def test_bogus_client_price_is_overridden_by_material_catalog_price(self, client):
        """Client submits unit_price_uzs=1 for a line that references a real
        material priced at 50,000 UZS — the response must reflect 50,000,
        not the attacker-controlled value."""
        material = _material(price_uzs=50_000)
        db = _db(_Result(many=[material]))
        _as(_user(), db)

        response = client.post(
            "/api/v1/orders",
            json={
                "dealer_name": "Test Dealer",
                "lines": [
                    {
                        "material_id": str(material.id),
                        "product_name": "Oq bo'yoq",
                        "unit": "litr",
                        "unit_price_uzs": 1,  # attacker-controlled, must be ignored
                        "quantity": 3,
                    }
                ],
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["total_uzs"] == 150_000  # 50,000 * 3, not 1 * 3
        assert body["lines"][0]["unit_price_uzs"] == 50_000

    def test_free_text_line_without_material_id_keeps_client_price(self, client):
        """A line with no material_id has no catalog price to check against,
        so the client-submitted price is legitimate and stands."""
        db = _db(_Result(many=[]))
        _as(_user(), db)

        response = client.post(
            "/api/v1/orders",
            json={
                "dealer_name": "Test Dealer",
                "lines": [
                    {
                        "material_id": None,
                        "product_name": "Custom item",
                        "unit": "dona",
                        "unit_price_uzs": 12_345,
                        "quantity": 2,
                    }
                ],
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["total_uzs"] == 24_690
        assert body["lines"][0]["unit_price_uzs"] == 12_345

    def test_unknown_material_id_is_rejected(self, client):
        """A material_id that doesn't resolve to a real row must not silently
        fall back to the client's price — that would defeat the whole check."""
        db = _db(_Result(many=[]))  # lookup finds nothing
        _as(_user(), db)

        response = client.post(
            "/api/v1/orders",
            json={
                "dealer_name": "Test Dealer",
                "lines": [
                    {
                        "material_id": str(uuid.uuid4()),
                        "product_name": "Ghost material",
                        "unit": "dona",
                        "unit_price_uzs": 999,
                        "quantity": 1,
                    }
                ],
            },
        )

        assert response.status_code == 400
        db.add.assert_not_called()

    def test_mixed_catalog_and_free_text_lines(self, client):
        """One catalog line and one free-text line in the same order: the
        catalog line's price is overridden, the free-text line's is not."""
        material = _material(price_uzs=20_000)
        db = _db(_Result(many=[material]))
        _as(_user(), db)

        response = client.post(
            "/api/v1/orders",
            json={
                "dealer_name": "Test Dealer",
                "lines": [
                    {
                        "material_id": str(material.id),
                        "product_name": "Catalog item",
                        "unit": "litr",
                        "unit_price_uzs": 1,
                        "quantity": 2,
                    },
                    {
                        "material_id": None,
                        "product_name": "Custom item",
                        "unit": "dona",
                        "unit_price_uzs": 5_000,
                        "quantity": 1,
                    },
                ],
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["total_uzs"] == 20_000 * 2 + 5_000
        by_name = {line["product_name"]: line["unit_price_uzs"] for line in body["lines"]}
        assert by_name["Catalog item"] == 20_000
        assert by_name["Custom item"] == 5_000
