"""Finished renders are saved: the tasks record a row, the API lists and deletes them."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app


def _fake_http():
    http = MagicMock()
    http.__aenter__ = AsyncMock(return_value=http)
    http.__aexit__ = AsyncMock(return_value=False)
    fetched = MagicMock(content=b"jpeg")
    fetched.raise_for_status = MagicMock()
    http.get = AsyncMock(return_value=fetched)
    return http


@pytest.mark.asyncio
class TestTasksSaveWhatTheyMake:
    async def test_render_saves_with_room_and_prompt(self):
        from app.tasks import media

        api = MagicMock(render_interior=AsyncMock(return_value="https://cdn/r.jpg"))
        with patch("app.core.storage.download_file", new=AsyncMock(return_value=b"s")), \
             patch("app.core.storage.upload_file", new=AsyncMock(return_value="https://s3/x.jpg")), \
             patch("app.core.storage.delete_file", new=AsyncMock()), \
             patch("app.services.myarchitect.get_myarchitect_client", return_value=api), \
             patch("httpx.AsyncClient", return_value=_fake_http()), \
             patch("app.tasks.media._save_render", new=AsyncMock()) as save:
            out = await media._render_room_image("u1", "k", "image/jpeg", "warm oak", "room-1")
        kw = save.await_args.kwargs
        assert kw["key"] == out["key"] and kw["url"] == "https://s3/x.jpg"
        assert kw["kind"] == "render" and kw["room_id"] == "room-1" and kw["prompt"] == "warm oak"

    async def test_failed_render_saves_nothing(self):
        from app.services.myarchitect import MyArchitectError
        from app.tasks import media

        api = MagicMock(render_interior=AsyncMock(side_effect=MyArchitectError("boom")))
        with patch("app.core.storage.download_file", new=AsyncMock(return_value=b"s")), \
             patch("app.core.storage.delete_file", new=AsyncMock()), \
             patch("app.services.myarchitect.get_myarchitect_client", return_value=api), \
             patch("app.tasks.media._save_render", new=AsyncMock()) as save:
            await media._render_room_image("u1", "k", "image/jpeg", "p", "room-1")
        save.assert_not_awaited()

    async def test_relight_and_upscale_save_with_their_parent(self):
        from app.tasks import media

        api = MagicMock(
            set_atmosphere=AsyncMock(return_value="https://cdn/l.jpg"),
            upscale=AsyncMock(return_value="https://cdn/u.jpg"),
        )
        with patch("app.core.storage.download_file", new=AsyncMock(return_value=b"s")), \
             patch("app.core.storage.upload_file", new=AsyncMock(return_value="https://s3/x.jpg")), \
             patch("app.services.myarchitect.get_myarchitect_client", return_value=api), \
             patch("httpx.AsyncClient", return_value=_fake_http()), \
             patch("app.tasks.media._save_render", new=AsyncMock()) as save:
            await media._relight_render("u1", "renders/u1/a.jpg", "warm_lamps")
            await media._upscale_render("u1", "renders/u1/a.jpg")
        relight, upscale = (c.kwargs for c in save.await_args_list)
        assert relight["kind"] == "relight" and relight["lighting"] == "warm_lamps" and relight["parent_key"] == "renders/u1/a.jpg"
        assert upscale["kind"] == "upscale" and upscale["parent_key"] == "renders/u1/a.jpg"

    async def test_a_failed_save_does_not_fail_the_render(self):
        from app.tasks import media

        with patch("sqlalchemy.ext.asyncio.create_async_engine", side_effect=RuntimeError("db down")):
            await media._save_render("00000000-0000-0000-0000-000000000001", key="k", url="u", kind="render")


def _row(user_id, **over):
    row = MagicMock()
    row.id = uuid.uuid4()
    row.user_id = user_id
    row.key = f"renders/{user_id}/a.jpg"
    row.url = "https://s3/a.jpg"
    row.kind = "render"
    row.lighting = None
    row.prompt = "p"
    row.panorama = True
    row.parent_key = None
    row.room_id = uuid.uuid4()
    row.created_at = datetime.now(timezone.utc)
    for k, v in over.items():
        setattr(row, k, v)
    return row


@pytest.fixture
def client():
    user = MagicMock(id=uuid.uuid4(), is_active=True, is_admin=False)
    db = AsyncMock()
    db.add = MagicMock()
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    c = TestClient(app)
    c.user, c.db = user, db
    yield c
    app.dependency_overrides.clear()


class TestRoutes:
    def test_list_returns_rows(self, client):
        row = _row(client.user.id)
        client.db.execute.return_value = MagicMock(scalars=lambda: iter([row]))
        res = client.get("/api/v1/renders", params={"room_id": str(row.room_id)})
        assert res.status_code == 200
        assert res.json()[0]["key"] == row.key and res.json()[0]["kind"] == "render"

    def test_list_query_is_limited_to_the_caller(self, client):
        client.db.execute.return_value = MagicMock(scalars=lambda: iter([]))
        client.get("/api/v1/renders")
        sql = str(client.db.execute.await_args.args[0])
        assert "room_renders.user_id" in sql

    def test_delete_own_render(self, client):
        row = _row(client.user.id)
        client.db.execute.return_value = MagicMock(scalar_one_or_none=lambda: row)
        with patch("app.routers.render.delete_file", new=AsyncMock()) as gone:
            res = client.delete(f"/api/v1/renders/{row.id}")
        assert res.status_code == 204
        client.db.delete.assert_awaited_once_with(row)
        gone.assert_awaited_once_with(row.key)

    def test_cannot_delete_someone_elses(self, client):
        row = _row(uuid.uuid4())
        client.db.execute.return_value = MagicMock(scalar_one_or_none=lambda: row)
        res = client.delete(f"/api/v1/renders/{row.id}")
        assert res.status_code == 404
        client.db.delete.assert_not_awaited()

    def test_render_forwards_the_room_id(self, client, monkeypatch):
        from app.routers import render as r

        monkeypatch.setattr(r.settings, "MYARCHITECT_API_KEY", "k")
        monkeypatch.setattr(r.settings, "RENDER_DAILY_LIMIT", 3)
        room = uuid.uuid4()
        with patch("app.routers.render.check_and_increment_budget_for", new=AsyncMock()), \
             patch("app.routers.render.upload_file", new=AsyncMock(return_value="u")), \
             patch("app.routers.render.render_room_image.delay", return_value=MagicMock(id="j")) as delay:
            res = client.post("/api/v1/render", files={"file": ("s.jpg", b"\xff\xd8x", "image/jpeg")}, data={"room_id": str(room)})
        assert res.status_code == 202
        assert delay.call_args.args[4] == str(room)
