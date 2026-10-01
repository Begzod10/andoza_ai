"""Meshy integration: the client's reading of the real API, and the router's guards.

These pin the things that were wrong when the integration first shipped: the base
path (/openapi/v1, not /v2), the create response ({"result": id}, not {"id": id}),
CANCELED being terminal, task_error being surfaced, ownership of a task, and the
GLB being copied off Meshy's 3-day, expiring links.
"""
from __future__ import annotations

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user, get_current_user
from app.database import get_db
from app.main import app
from app.services import meshy
from app.services.meshy import MeshyClient, MeshyError, normalize_base_url


@pytest.fixture(autouse=True)
def _cfg(monkeypatch):
    monkeypatch.setattr(meshy.settings, "MESHY_API_KEY", "k")
    monkeypatch.setattr(meshy.settings, "MESHY_API_URL", "https://api.meshy.ai/openapi/v1")


def _patched_transport(handler):
    """MeshyClient builds its own httpx.AsyncClient — route it through a mock transport."""
    real = httpx.AsyncClient

    def factory(*a, **kw):
        kw["transport"] = httpx.MockTransport(handler)
        return real(*a, **kw)

    return patch.object(meshy.httpx, "AsyncClient", side_effect=factory)


class TestBaseUrl:
    def test_the_old_v2_value_is_replaced_with_the_real_path(self):
        assert normalize_base_url("https://api.meshy.ai/v2") == "https://api.meshy.ai/openapi/v1"
        assert normalize_base_url("") == "https://api.meshy.ai/openapi/v1"

    def test_a_correct_or_custom_value_is_kept(self):
        assert normalize_base_url("https://api.meshy.ai/openapi/v1/") == "https://api.meshy.ai/openapi/v1"
        assert normalize_base_url("https://proxy.test/meshy") == "https://proxy.test/meshy"


class TestMeshyClient:
    async def test_create_reads_the_task_id_from_result_and_hits_the_real_path(self):
        seen = {}

        def handler(request):
            seen["url"] = str(request.url)
            seen["auth"] = request.headers["authorization"]
            seen["body"] = json.loads(request.content)
            return httpx.Response(200, json={"result": "task-123"})

        with _patched_transport(handler):
            out = await MeshyClient().convert_image_to_3d("https://img.test/a.png", wait=False)

        assert out == {"task_id": "task-123", "status": "RUNNING"}
        assert seen["url"] == "https://api.meshy.ai/openapi/v1/image-to-3d"
        assert seen["auth"] == "Bearer k"
        assert seen["body"]["image_url"] == "https://img.test/a.png"

    async def test_insufficient_funds_is_readable(self):
        with _patched_transport(lambda r: httpx.Response(402, json={"message": "x"})):
            with pytest.raises(MeshyError, match="mablag'"):
                await MeshyClient().image_to_3d("https://img.test/a.png")

    async def test_a_response_without_an_id_is_an_error(self):
        with _patched_transport(lambda r: httpx.Response(200, json={})):
            with pytest.raises(MeshyError):
                await MeshyClient().image_to_3d("https://img.test/a.png")

    @pytest.mark.parametrize("state", ["FAILED", "CANCELED"])
    async def test_failed_and_canceled_stop_the_wait_with_the_task_error(self, state):
        body = {"status": state, "task_error": {"message": "image_too_complex"}}
        with _patched_transport(lambda r: httpx.Response(200, json=body)):
            with pytest.raises(MeshyError, match="image_too_complex"):
                await MeshyClient().wait_for_completion("t", max_polls=3, poll_interval=0)

    async def test_wait_returns_the_succeeded_task(self):
        calls = {"n": 0}

        def handler(request):
            calls["n"] += 1
            if calls["n"] < 2:
                return httpx.Response(200, json={"status": "IN_PROGRESS", "progress": 40})
            return httpx.Response(200, json={"status": "SUCCEEDED", "model_urls": {"glb": "https://m/x.glb"}})

        with _patched_transport(handler):
            task = await MeshyClient().wait_for_completion("t", max_polls=5, poll_interval=0)
        assert task["model_urls"]["glb"] == "https://m/x.glb"


def _user():
    u = MagicMock()
    u.id = uuid.uuid4()
    u.is_active = True
    u.is_admin = False
    return u


class _Result:
    def __init__(self, one=None):
        self._one = one

    def scalar_one_or_none(self):
        return self._one


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _as(user, owned_task=None):
    from app.models.media_job import MediaJob

    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(return_value=_Result(MediaJob(id=owned_task, user_id=user.id) if owned_task else None))
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    return db


class TestRouter:
    def test_served_under_v1_and_at_the_legacy_path(self, client):
        _as(_user())
        for prefix in ("/api/v1/meshy", "/api/meshy"):
            assert client.get(f"{prefix}/task/nope").status_code == 404  # 404 = owned-check, not a missing route

    def test_someone_elses_task_is_a_404(self, client):
        _as(_user(), owned_task=None)
        with patch("app.routers.meshy.get_meshy_client") as get:
            res = client.get("/api/v1/meshy/task/abc")
        assert res.status_code == 404
        get.assert_not_called()

    def test_convert_records_the_owner(self, client):
        db = _as(_user())
        fake = MagicMock(convert_image_to_3d=AsyncMock(return_value={"task_id": "t1", "status": "RUNNING"}))
        with patch("app.routers.meshy.get_meshy_client", return_value=fake):
            res = client.post("/api/v1/meshy/convert", json={"image_url": "https://img.test/a.png"})
        assert res.status_code == 200
        db.add.assert_called_once()

    def test_a_finished_task_gets_its_glb_copied_to_our_storage_once(self, client):
        user = _user()
        _as(user, owned_task="t1")
        fake = MagicMock(get_task=AsyncMock(return_value={
            "status": "SUCCEEDED", "progress": 100,
            "model_urls": {"glb": "https://assets.meshy.ai/x.glb?Expires=1", "fbx": "https://assets.meshy.ai/x.fbx"},
        }))
        redis = MagicMock(get=AsyncMock(side_effect=[None, "https://s3/m.glb"]), set=AsyncMock())
        fetched = MagicMock(content=b"glbbytes")
        fetched.raise_for_status = MagicMock()
        http = MagicMock(get=AsyncMock(return_value=fetched))
        http.__aenter__ = AsyncMock(return_value=http)
        http.__aexit__ = AsyncMock(return_value=False)

        with patch("app.routers.meshy.get_meshy_client", return_value=fake), \
             patch("app.routers.meshy.get_redis", return_value=redis), \
             patch("app.routers.meshy.httpx.AsyncClient", return_value=http), \
             patch("app.routers.meshy.upload_file", new=AsyncMock(return_value="https://s3/m.glb")) as up:
            first = client.get("/api/v1/meshy/task/t1").json()
            second = client.get("/api/v1/meshy/task/t1").json()

        assert first["model_urls"]["glb"] == "https://s3/m.glb"
        assert first["model_urls"]["fbx"].startswith("https://assets.meshy.ai")  # only the GLB is kept
        assert second["model_urls"]["glb"] == "https://s3/m.glb"
        assert up.await_count == 1  # the second poll came from the cache
        assert up.await_args.args[1] == f"meshy-models/{user.id}/t1.glb"

    def test_a_failed_task_reports_why(self, client):
        _as(_user(), owned_task="t2")
        fake = MagicMock(get_task=AsyncMock(return_value={"status": "FAILED", "task_error": {"message": "image_too_complex"}}))
        with patch("app.routers.meshy.get_meshy_client", return_value=fake):
            body = client.get("/api/v1/meshy/task/t2").json()
        assert body["status"] == "FAILED" and body["error"] == "image_too_complex"

    def test_a_failed_copy_falls_back_to_meshys_link(self, client):
        _as(_user(), owned_task="t3")
        fake = MagicMock(get_task=AsyncMock(return_value={"status": "SUCCEEDED", "model_urls": {"glb": "https://assets.meshy.ai/x.glb"}}))
        redis = MagicMock(get=AsyncMock(return_value=None), set=AsyncMock())
        boom = MagicMock()
        boom.__aenter__ = AsyncMock(side_effect=httpx.ConnectError("down"))
        boom.__aexit__ = AsyncMock(return_value=False)
        with patch("app.routers.meshy.get_meshy_client", return_value=fake), \
             patch("app.routers.meshy.get_redis", return_value=redis), \
             patch("app.routers.meshy.httpx.AsyncClient", return_value=boom):
            body = client.get("/api/v1/meshy/task/t3").json()
        assert body["model_urls"]["glb"] == "https://assets.meshy.ai/x.glb"
