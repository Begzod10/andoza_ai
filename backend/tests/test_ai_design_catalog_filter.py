"""The AI designer (and the room-builder agent) is only offered furniture it can place: pieces with a 3-D model.

A shop listing without a GLB (the photo-only demo stores, or an admin entry whose
model is not uploaded yet) shows in the shop, but the studio cannot render it, so
a plan that picked it would place an invisible piece.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql

from app.database import get_db
from app.main import app
from app.routers.ai import _load_all_furniture, _run_design
from app.services.ai_designer import DesignPlan

PLAN = DesignPlan(title="t", summary="s", walls={}, floor={}, lights=[], furniture=[])


async def test_the_designer_catalog_query_excludes_furniture_without_a_model():
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalars=lambda: MagicMock(all=lambda: [])))
    room = SimpleNamespace(name="Xona", ceiling_h=2.7, geometry=None)
    with patch("app.routers.ai.design_room", new=AsyncMock(return_value=PLAN)):
        await _run_design(room, "zamonaviy mehmonxona", None, db, "user-1")

    stmt = db.execute.await_args.args[0]
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert "furniture.glb_key IS NOT NULL" in sql
    assert "furniture.is_active IS true" in sql


async def test_the_room_builder_agent_catalog_excludes_furniture_without_a_model():
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalars=lambda: MagicMock(all=lambda: [])))
    assert await _load_all_furniture(db) == []
    sql = str(db.execute.await_args.args[0].compile(dialect=postgresql.dialect()))
    assert "furniture.glb_key IS NOT NULL" in sql


# ---------------------------------------------------------------------------
# GET /furniture?has_model=true: the studio loads only what it can place
# ---------------------------------------------------------------------------

class _ListResult:
    def scalar_one(self):
        return 0

    def scalars(self):
        return self

    def all(self):
        return []


def _list_sql(query: str) -> list[str]:
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_ListResult())
    app.dependency_overrides[get_db] = lambda: db
    try:
        response = TestClient(app).get(f"/api/v1/furniture{query}")
        assert response.status_code == 200
    finally:
        app.dependency_overrides.clear()
    return [str(c.args[0].compile(dialect=postgresql.dialect())) for c in db.execute.call_args_list]


def test_the_studio_list_has_only_models_with_a_file():
    sent = _list_sql("?has_model=true&per_page=100")
    assert len(sent) == 2  # the page and its count agree
    assert all("furniture.glb_key IS NOT NULL" in sql for sql in sent)


def test_the_shop_list_still_has_photo_only_items():
    sent = _list_sql("?per_page=100")
    assert sent and not any("glb_key IS NOT NULL" in sql for sql in sent)
