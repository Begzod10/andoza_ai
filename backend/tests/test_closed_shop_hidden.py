"""
A shop that is pending, rejected or switched off (stores.is_active = false)
must take its catalog with it: its furniture and materials disappear from the
public lists and can no longer be ordered. Otherwise a shopper orders from a
rejected shop whose owner is locked out of /seller/orders, and nobody can
fulfil the order.

Items with no shop (store_id IS NULL, admin-owned) stay visible.

The DB is stubbed; the tests read the SQL the routers send, the same way
test_catalog_materials.py does.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app


class _Result:
    def __init__(self, one=0, many=()):
        self._one = one
        self._many = list(many)

    def scalar_one(self):
        return self._one

    def scalar_one_or_none(self):
        return None

    def scalars(self):
        return self

    def all(self):
        return self._many


def _compiled(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()


def _hides_closed_shops(sql: str) -> bool:
    return "stores.is_active" in sql and "store_id is null" in sql


@pytest.fixture
def db():
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_Result())
    app.dependency_overrides[get_db] = lambda: db
    yield db
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    yield TestClient(app)


@pytest.mark.parametrize("path", ["/api/v1/furniture", "/api/v1/materials"])
def test_public_lists_hide_items_of_closed_shops(client, db, path):
    response = client.get(path)
    assert response.status_code == 200
    sent = [_compiled(call.args[0]) for call in db.execute.call_args_list]
    assert sent, "the list query was never sent"
    # Both the page query and the count query, or the total disagrees with the page.
    assert all(_hides_closed_shops(sql) for sql in sent), sent


@pytest.mark.parametrize("ref", ["furniture_id", "material_id"])
def test_items_of_closed_shops_cannot_be_ordered(client, db, ref):
    user = MagicMock(id=uuid.uuid4(), is_active=True, is_admin=False)
    app.dependency_overrides[get_current_active_user] = lambda: user
    line = {ref: str(uuid.uuid4()), "product_name": "x", "unit": "dona", "unit_price_uzs": 1, "quantity": 1}

    response = client.post("/api/v1/orders", json={"dealer_name": "x", "lines": [line]})

    assert response.status_code == 400  # nothing found: the shop is closed
    lookup = _compiled(db.execute.call_args_list[0].args[0])
    assert _hides_closed_shops(lookup), lookup
