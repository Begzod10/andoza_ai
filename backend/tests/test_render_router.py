"""POST /render: validation, the daily allowance, and what gets enqueued.

Storage, Redis, Celery and the DB session are stubbed — these cover the
router's contract, not those services.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.services.llm import BudgetExceededError


def _user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.is_active = True
    user.is_admin = False
    return user


@pytest.fixture
def client(monkeypatch):
    from app.routers import render as render_router

    monkeypatch.setattr(render_router.settings, "MYARCHITECT_API_KEY", "k")
    monkeypatch.setattr(render_router.settings, "RENDER_DAILY_LIMIT", 3)
    db = AsyncMock()
    db.add = MagicMock()
    user = _user()
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    c = TestClient(app)
    c.user, c.db = user, db
    yield c
    app.dependency_overrides.clear()


def _post(client, content=b"\xff\xd8jpeg", ctype="image/jpeg", **data):
    return client.post("/api/v1/render", files={"file": ("shot.jpg", content, ctype)}, data=data)


def test_happy_path_stores_source_enqueues_and_records_the_job(client):
    task = MagicMock(id="job-1")
    with patch("app.routers.render.check_and_increment_budget_for", new=AsyncMock()) as budget, \
         patch("app.routers.render.upload_file", new=AsyncMock(return_value="u")) as upload, \
         patch("app.routers.render.render_room_image.delay", return_value=task) as delay:
        res = _post(client, prompt="  warm oak  ")

    assert res.status_code == 202
    assert res.json() == {"job_id": "job-1"}
    budget.assert_awaited_once_with(str(client.user.id), "render", 3)
    assert upload.await_args.args[1].startswith(f"render-sources/{client.user.id}/")
    args = delay.call_args.args
    assert args[0] == str(client.user.id) and args[2] == "image/jpeg" and args[3] == "warm oak"
    client.db.add.assert_called_once()


def test_over_the_daily_limit_is_429_and_nothing_is_stored(client):
    with patch("app.routers.render.check_and_increment_budget_for", new=AsyncMock(side_effect=BudgetExceededError())), \
         patch("app.routers.render.upload_file", new=AsyncMock()) as upload, \
         patch("app.routers.render.render_room_image.delay") as delay:
        res = _post(client)
    assert res.status_code == 429
    upload.assert_not_awaited()
    delay.assert_not_called()


def test_invalid_uploads_do_not_spend_the_allowance(client):
    with patch("app.routers.render.check_and_increment_budget_for", new=AsyncMock()) as budget:
        assert _post(client, ctype="application/pdf").status_code == 415
        assert _post(client, content=b"").status_code == 400
        assert _post(client, content=b"x" * (7 * 1024 * 1024 + 1)).status_code == 413
    budget.assert_not_awaited()


def test_unconfigured_key_or_zero_limit_turns_the_feature_off(client, monkeypatch):
    from app.routers import render as render_router

    monkeypatch.setattr(render_router.settings, "MYARCHITECT_API_KEY", "")
    assert _post(client).status_code == 503
    monkeypatch.setattr(render_router.settings, "MYARCHITECT_API_KEY", "k")
    monkeypatch.setattr(render_router.settings, "RENDER_DAILY_LIMIT", 0)
    assert _post(client).status_code == 503


class TestRenderTask:
    """The Celery task body: success keeps the render, failure is reported not raised."""

    async def test_success_copies_the_render_into_our_storage_and_cleans_up(self):
        from app.tasks import media

        fake_http = MagicMock()
        fake_http.__aenter__ = AsyncMock(return_value=fake_http)
        fake_http.__aexit__ = AsyncMock(return_value=False)
        fetched = MagicMock(content=b"jpegbytes")
        fetched.raise_for_status = MagicMock()
        fake_http.get = AsyncMock(return_value=fetched)
        client = MagicMock(
            render_interior=AsyncMock(return_value="https://cdn.test/r.jpg"),
            auto_prompt=AsyncMock(return_value="should not be used"),
        )

        with patch("app.core.storage.download_file", new=AsyncMock(return_value=b"src")), \
             patch("app.core.storage.upload_file", new=AsyncMock(return_value="https://s3/x.jpg")) as up, \
             patch("app.core.storage.delete_file", new=AsyncMock()) as delete, \
             patch("app.services.myarchitect.get_myarchitect_client", return_value=client), \
             patch("httpx.AsyncClient", return_value=fake_http):
            out = await media._render_room_image("u1", "render-sources/u1/a.jpg", "image/jpeg", "p")

        assert out["status"] == "ok" and out["url"] == "https://s3/x.jpg" and out["key"].startswith("renders/u1/")
        assert up.await_args.args[0] == b"jpegbytes"
        delete.assert_awaited_once_with("render-sources/u1/a.jpg")

    async def test_provider_failure_is_returned_with_the_request_id(self):
        from app.services.myarchitect import MyArchitectError
        from app.tasks import media

        client = MagicMock(
            render_interior=AsyncMock(side_effect=MyArchitectError("boom", request_id="rq")),
            auto_prompt=AsyncMock(return_value="a room"),
        )
        with patch("app.core.storage.download_file", new=AsyncMock(return_value=b"src")), \
             patch("app.core.storage.delete_file", new=AsyncMock()) as delete, \
             patch("app.services.myarchitect.get_myarchitect_client", return_value=client):
            out = await media._render_room_image("u1", "k", "image/jpeg", None)

        assert out == {"status": "failed", "error": "boom", "request_id": "rq"}
        delete.assert_awaited_once_with("k")


def _http_returning(content=b"jpegbytes"):
    fetched = MagicMock(content=content)
    fetched.raise_for_status = MagicMock()
    http = MagicMock(get=AsyncMock(return_value=fetched))
    http.__aenter__ = AsyncMock(return_value=http)
    http.__aexit__ = AsyncMock(return_value=False)
    return http


class TestAutoPrompt:
    async def _run(self, client, prompt):
        from app.tasks import media

        with patch("app.core.storage.download_file", new=AsyncMock(return_value=b"src")), \
             patch("app.core.storage.upload_file", new=AsyncMock(return_value="https://s3/x.jpg")), \
             patch("app.core.storage.delete_file", new=AsyncMock()), \
             patch("app.services.myarchitect.get_myarchitect_client", return_value=client), \
             patch("httpx.AsyncClient", return_value=_http_returning()):
            return await media._render_room_image("u1", "k", "image/jpeg", prompt)

    async def test_an_empty_prompt_is_filled_by_auto_prompt_and_reported_back(self):
        client = MagicMock(
            auto_prompt=AsyncMock(return_value="oak floor, white walls"),
            render_interior=AsyncMock(return_value="https://cdn.test/r.jpg"),
        )
        out = await self._run(client, None)
        assert client.render_interior.await_args.kwargs["prompt"] == "oak floor, white walls"
        assert out["status"] == "ok" and out["prompt"] == "oak floor, white walls"

    async def test_the_users_own_prompt_is_kept_and_costs_no_extra_call(self):
        client = MagicMock(auto_prompt=AsyncMock(), render_interior=AsyncMock(return_value="https://cdn.test/r.jpg"))
        out = await self._run(client, "warm light")
        client.auto_prompt.assert_not_awaited()
        assert client.render_interior.await_args.kwargs["prompt"] == "warm light"
        assert out["prompt"] == "warm light"

    async def test_a_failed_description_does_not_cost_the_user_the_render(self):
        from app.services.myarchitect import MyArchitectError

        client = MagicMock(
            auto_prompt=AsyncMock(side_effect=MyArchitectError("down")),
            render_interior=AsyncMock(return_value="https://cdn.test/r.jpg"),
        )
        out = await self._run(client, None)
        assert out["status"] == "ok" and out["prompt"] is None
        assert client.render_interior.await_args.kwargs["prompt"] is None


class TestRelightTask:
    async def test_relights_the_stored_render_and_keeps_the_result(self):
        from app.tasks import media

        client = MagicMock(set_atmosphere=AsyncMock(return_value="https://cdn.test/lit.jpg"))
        with patch("app.core.storage.download_file", new=AsyncMock(return_value=b"orig")) as dl, \
             patch("app.core.storage.upload_file", new=AsyncMock(return_value="https://s3/lit.jpg")) as up, \
             patch("app.services.myarchitect.get_myarchitect_client", return_value=client), \
             patch("httpx.AsyncClient", return_value=_http_returning(b"litbytes")):
            out = await media._relight_render("u1", "renders/u1/a.jpg", "warm_lamps")

        dl.assert_awaited_once_with("renders/u1/a.jpg")
        assert client.set_atmosphere.await_args.args[1] == "warm_lamps"
        assert out["status"] == "ok" and out["lighting"] == "warm_lamps" and out["key"].startswith("renders/u1/")
        assert up.await_args.args[0] == b"litbytes"

    async def test_a_provider_failure_is_reported(self):
        from app.services.myarchitect import MyArchitectError
        from app.tasks import media

        client = MagicMock(set_atmosphere=AsyncMock(side_effect=MyArchitectError("nope", request_id=7)))
        with patch("app.core.storage.download_file", new=AsyncMock(return_value=b"orig")), \
             patch("app.services.myarchitect.get_myarchitect_client", return_value=client):
            out = await media._relight_render("u1", "renders/u1/a.jpg", "warm_lamps")
        assert out == {"status": "failed", "error": "nope", "request_id": 7}


class TestRelightRoute:
    def _key(self, client):
        return f"renders/{client.user.id}/abc.jpg"

    def test_happy_path_enqueues_and_spends_one_allowance(self, client):
        task = MagicMock(id="job-9")
        with patch("app.routers.render.check_and_increment_budget_for", new=AsyncMock()) as budget, \
             patch("app.routers.render.relight_render.delay", return_value=task) as delay:
            res = client.post("/api/v1/render/relight", json={"render_key": self._key(client), "lighting": "golden_light"})
        assert res.status_code == 202 and res.json() == {"job_id": "job-9"}
        budget.assert_awaited_once()
        assert delay.call_args.args == (str(client.user.id), self._key(client), "golden_light")
        client.db.add.assert_called_once()

    def test_unknown_lighting_is_422(self, client):
        res = client.post("/api/v1/render/relight", json={"render_key": self._key(client), "lighting": "disco"})
        assert res.status_code == 422

    @pytest.mark.parametrize("key", [
        "renders/someone-else/abc.jpg",
        "render-sources/x/abc.jpg",
        "thumbnails/x.jpg",
    ])
    def test_only_the_callers_own_renders_can_be_relit(self, client, key):
        with patch("app.routers.render.relight_render.delay") as delay:
            res = client.post("/api/v1/render/relight", json={"render_key": key, "lighting": "warm_lamps"})
        assert res.status_code == 404
        delay.assert_not_called()

    def test_path_traversal_is_refused(self, client):
        key = f"renders/{client.user.id}/../../secrets.jpg"
        res = client.post("/api/v1/render/relight", json={"render_key": key, "lighting": "warm_lamps"})
        assert res.status_code == 404

    def test_over_the_limit_is_429(self, client):
        with patch("app.routers.render.check_and_increment_budget_for", new=AsyncMock(side_effect=BudgetExceededError())), \
             patch("app.routers.render.relight_render.delay") as delay:
            res = client.post("/api/v1/render/relight", json={"render_key": self._key(client), "lighting": "warm_lamps"})
        assert res.status_code == 429
        delay.assert_not_called()
