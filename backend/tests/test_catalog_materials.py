"""
Public GET /materials search-by-name (`q`) tests.

The endpoint results are cached in Redis under a key derived from the
filter params. These tests cover the search filter itself (substring
match, no match, and `q` omitted behaving exactly as before) plus a real
bug class: the cache key must vary by `q`, or two different searches
collide on the same cache entry and one search leaks the other's results.
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models.material import Material


class _Result:
    """Stands in for the object SQLAlchemy's execute() returns."""

    def __init__(self, one=None, many=()):
        self._one = one
        self._many = list(many)

    def scalar_one(self):
        return self._one

    def scalars(self):
        return self

    def all(self):
        return self._many


def _material(**overrides) -> Material:
    defaults = dict(
        id=uuid.uuid4(),
        store_id=uuid.uuid4(),
        category="boyoq",
        name_uz="Moviy bo'yoq",
        unit="litr",
        price_uzs=50_000,
        color_hex="#0000FF",
        texture_key=None,
        image_url=None,
        pbr_roughness=0.5,
        roll_width_cm=None,
        roll_length_m=None,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    defaults.update(overrides)
    material = Material(**{k: v for k, v in defaults.items() if k not in ("id", "created_at")})
    material.id = defaults["id"]
    material.created_at = defaults["created_at"]
    return material


def _compiled(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": True}))


def _is_count_query(stmt) -> bool:
    return "count(*)" in _compiled(stmt).lower()


class _FakeDb:
    """Filters an in-memory list of materials the same way the real query
    would, by inspecting the compiled SQL for the ILIKE clause the router
    adds for `q`. This exercises the router's actual filtering logic
    (including that it's applied to both `query` and `count_query`)
    without needing a real Postgres connection.
    """

    def __init__(self, materials):
        self._materials = materials
        self.executed_sql: list[str] = []

    async def execute(self, stmt):
        sql = _compiled(stmt)
        self.executed_sql.append(sql)
        filtered = self._materials
        if "ilike" in sql.lower() or "like lower" in sql.lower():
            # Extract the substring between %...% from `lower('%term%')`.
            import re

            match = re.search(r"lower\('%(.*?)%'\)", sql, re.IGNORECASE)
            if match:
                term = match.group(1).lower()
                filtered = [m for m in filtered if term in m.name_uz.lower()]
        if _is_count_query(stmt):
            return _Result(one=len(filtered))
        return _Result(many=filtered)


class _FakeCache:
    """In-memory stand-in for the Redis-backed cache_get/cache_set. Used to
    prove distinct `q` values don't collide on the same cache key."""

    def __init__(self):
        self.store: dict[str, object] = {}

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value, ttl=600):
        self.store[key] = value


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _as_db(db):
    app.dependency_overrides[get_db] = lambda: db


class TestSearchByName:
    def test_matching_substring_returns_subset(self, client):
        moviy = _material(name_uz="Moviy bo'yoq")
        qizil = _material(name_uz="Qizil bo'yoq")
        db = _FakeDb([moviy, qizil])
        _as_db(db)

        with patch("app.routers.catalog.cache_get", new=AsyncMock(return_value=None)), patch(
            "app.routers.catalog.cache_set", new=AsyncMock()
        ):
            response = client.get("/api/v1/materials?q=moviy")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert [item["name_uz"] for item in body["items"]] == ["Moviy bo'yoq"]
        # Filter must be applied to BOTH the count and the page query.
        assert sum("ilike" in sql.lower() or "like lower" in sql.lower() for sql in db.executed_sql) == 2

    def test_no_match_returns_empty(self, client):
        db = _FakeDb([_material(name_uz="Moviy bo'yoq")])
        _as_db(db)

        with patch("app.routers.catalog.cache_get", new=AsyncMock(return_value=None)), patch(
            "app.routers.catalog.cache_set", new=AsyncMock()
        ):
            response = client.get("/api/v1/materials?q=laminat")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 0
        assert body["items"] == []

    def test_q_omitted_behaves_exactly_as_before(self, client):
        moviy = _material(name_uz="Moviy bo'yoq")
        qizil = _material(name_uz="Qizil bo'yoq")
        db = _FakeDb([moviy, qizil])
        _as_db(db)

        with patch("app.routers.catalog.cache_get", new=AsyncMock(return_value=None)), patch(
            "app.routers.catalog.cache_set", new=AsyncMock()
        ):
            response = client.get("/api/v1/materials")

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 2
        assert {item["name_uz"] for item in body["items"]} == {"Moviy bo'yoq", "Qizil bo'yoq"}
        # No `q` given -> no ILIKE clause should have been added.
        assert not any("ilike" in sql.lower() or "like lower" in sql.lower() for sql in db.executed_sql)


class TestSearchCacheKeyIncludesQuery:
    """Regression test for the cache-key bug: the Redis key must vary by
    `q`, or a second, different search reuses the first search's cached
    (and now stale/wrong) result set."""

    def test_different_q_values_do_not_share_a_cache_entry(self, client):
        moviy = _material(name_uz="Moviy bo'yoq")
        laminat = _material(name_uz="Laminat premium", category="laminat")
        db = _FakeDb([moviy, laminat])
        _as_db(db)
        cache = _FakeCache()

        with patch("app.routers.catalog.cache_get", new=AsyncMock(side_effect=cache.get)), patch(
            "app.routers.catalog.cache_set", new=AsyncMock(side_effect=cache.set)
        ):
            first = client.get("/api/v1/materials?q=moviy")
            second = client.get("/api/v1/materials?q=laminat")

        assert first.status_code == 200
        assert second.status_code == 200
        first_names = {item["name_uz"] for item in first.json()["items"]}
        second_names = {item["name_uz"] for item in second.json()["items"]}

        assert first_names == {"Moviy bo'yoq"}
        # This is the bug this test guards against: without `q` in the
        # cache key, the second call would hit the first call's cache
        # entry and also come back with "Moviy bo'yoq".
        assert second_names == {"Laminat premium"}
        assert first_names != second_names

        # Two distinct cache entries should exist, one per search term.
        assert len(cache.store) == 2

    def test_same_q_value_is_served_from_cache_on_second_call(self, client):
        moviy = _material(name_uz="Moviy bo'yoq")
        db = _FakeDb([moviy])
        _as_db(db)
        cache = _FakeCache()

        with patch("app.routers.catalog.cache_get", new=AsyncMock(side_effect=cache.get)), patch(
            "app.routers.catalog.cache_set", new=AsyncMock(side_effect=cache.set)
        ):
            first = client.get("/api/v1/materials?q=moviy")
            executed_after_first = len(db.executed_sql)
            second = client.get("/api/v1/materials?q=moviy")

        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json() == second.json()
        # No additional DB round-trip on the cache hit.
        assert len(db.executed_sql) == executed_after_first
