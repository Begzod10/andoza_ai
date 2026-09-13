"""Ustalar (craftsmen directory) router tests.

Covers the endpoints the mobile Ustalar tab consumes:
  - GET /api/v1/ustalar           -> list, optional ?category / ?q filter
  - GET /api/v1/ustalar/{id}      -> single profile, 404 when absent/inactive

Follows test_catalog_materials.py's pattern: a `_FakeDb` that filters an
in-memory list by inspecting the compiled SQL (so the router's real
category/ILIKE filtering is exercised) plus a get_db dependency override --
no Postgres required. The list endpoint is Redis-cached, so cache_get/set
are patched out.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models.usta import Usta


class _Result:
    """Stands in for the object SQLAlchemy's execute() returns."""

    def __init__(self, rows=(), scalar=None):
        self._rows = list(rows)
        self._scalar = scalar

    def scalars(self):
        return self

    def all(self):
        return self._rows

    def scalar_one_or_none(self):
        return self._scalar


def _usta(**overrides) -> Usta:
    defaults = dict(
        id=uuid.uuid4(),
        name="Alisher Karimov",
        category="elektrik",
        district="Chilonzor",
        lat=None,
        lng=None,
        phone="+998901234567",
        telegram=None,
        avatar_url=None,
        rating=4.8,
        jobs_count=42,
        price_min=200_000,
        price_max=400_000,
        verified=True,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    defaults.update(overrides)
    usta = Usta(**{k: v for k, v in defaults.items() if k not in ("id", "created_at")})
    usta.id = defaults["id"]
    usta.created_at = defaults["created_at"]
    return usta


def _compiled(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": True}))


class _FakeDb:
    """Filters an in-memory list of ustalar the same way the real query
    would, by inspecting the compiled SQL. Handles both the list query
    (is_active + optional category/ILIKE) and the by-id detail query."""

    def __init__(self, ustalar):
        self._ustalar = ustalar

    async def execute(self, stmt):
        sql = _compiled(stmt)

        # Detail lookup: WHERE ustalar.id = '<uuid>' AND ...
        id_match = re.search(r"ustalar\.id = '([0-9a-f-]+)'", sql, re.IGNORECASE)
        if id_match:
            # literal_binds renders the UUID as bare hex (no hyphens).
            target = id_match.group(1).replace("-", "").lower()
            match = next(
                (u for u in self._ustalar if u.id.hex == target and u.is_active),
                None,
            )
            return _Result(scalar=match)

        # List query: apply the same filters the router adds.
        rows = [u for u in self._ustalar if u.is_active]
        cat_match = re.search(r"ustalar\.category = '([^']*)'", sql, re.IGNORECASE)
        if cat_match:
            rows = [u for u in rows if u.category == cat_match.group(1)]
        q_match = re.search(r"lower\('%(.*?)%'\)", sql, re.IGNORECASE)
        if q_match:
            term = q_match.group(1).lower()
            rows = [u for u in rows if term in u.name.lower()]
        return _Result(rows=rows)


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _as_db(db):
    app.dependency_overrides[get_db] = lambda: db


def _no_cache():
    return (
        patch("app.routers.catalog.cache_get", new=AsyncMock(return_value=None)),
        patch("app.routers.catalog.cache_set", new=AsyncMock()),
    )


class TestListUstalar:
    def test_list_returns_all_active(self, client):
        db = _FakeDb([_usta(name="Alisher"), _usta(name="Bobur")])
        _as_db(db)
        cget, cset = _no_cache()
        with cget, cset:
            response = client.get("/api/v1/ustalar")
        assert response.status_code == 200
        body = response.json()
        assert {u["name"] for u in body} == {"Alisher", "Bobur"}
        # Response is a bare list (not paginated) -- the mobile decodes it directly.
        assert isinstance(body, list)

    def test_filter_by_category(self, client):
        db = _FakeDb(
            [
                _usta(name="Elektrik Bir", category="elektrik"),
                _usta(name="Santexnik Ikki", category="santexnik"),
            ]
        )
        _as_db(db)
        cget, cset = _no_cache()
        with cget, cset:
            response = client.get("/api/v1/ustalar?category=santexnik")
        assert response.status_code == 200
        body = response.json()
        assert [u["name"] for u in body] == ["Santexnik Ikki"]

    def test_filter_by_q_name_substring(self, client):
        db = _FakeDb([_usta(name="Alisher Karimov"), _usta(name="Bobur Toshev")])
        _as_db(db)
        cget, cset = _no_cache()
        with cget, cset:
            response = client.get("/api/v1/ustalar?q=bobur")
        assert response.status_code == 200
        body = response.json()
        assert [u["name"] for u in body] == ["Bobur Toshev"]

    def test_invalid_sort_returns_400(self, client):
        db = _FakeDb([])
        _as_db(db)
        cget, cset = _no_cache()
        with cget, cset:
            response = client.get("/api/v1/ustalar?sort=bogus")
        assert response.status_code == 400


class TestGetUsta:
    def test_detail_found(self, client):
        target = _usta(name="Alisher Karimov")
        db = _FakeDb([target, _usta(name="Bobur")])
        _as_db(db)
        response = client.get(f"/api/v1/ustalar/{target.id}")
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == str(target.id)
        assert body["name"] == "Alisher Karimov"
        # Full profile shape the mobile Master model maps from.
        for key in ("category", "district", "phone", "rating", "jobs_count", "verified"):
            assert key in body

    def test_detail_not_found(self, client):
        db = _FakeDb([_usta()])
        _as_db(db)
        response = client.get(f"/api/v1/ustalar/{uuid.uuid4()}")
        assert response.status_code == 404

    def test_detail_inactive_is_404(self, client):
        hidden = _usta(is_active=False)
        db = _FakeDb([hidden])
        _as_db(db)
        response = client.get(f"/api/v1/ustalar/{hidden.id}")
        assert response.status_code == 404
