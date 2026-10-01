"""Tripo: the client's reading of the real API, the build task, and POST /models/from-photo.

Pins what the docs and the live API disagreed on: ``model`` is required and must be
a ``v3.1-20260211``-style id (not ``tripo-v3.1``); success is ``code == 0`` not an
HTTP status; credits come back on failure; the GLB link expires so it is copied.
"""
from __future__ import annotations

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.services import tripo
from app.services.llm import BudgetExceededError
from app.services.tripo import TripoClient, TripoError


@pytest.fixture(autouse=True)
def _cfg(monkeypatch):
    monkeypatch.setattr(tripo.settings, "TRIPO_API_KEY", "tsk_test")
    monkeypatch.setattr(tripo.settings, "TRIPO_API_URL", "https://openapi.example.test/v3")
    monkeypatch.setattr(tripo.settings, "TRIPO_MODEL", "v3.1-20260211")
    monkeypatch.setattr(tripo.settings, "TRIPO_FACE_LIMIT", 50000)


def _client(handler) -> TripoClient:
    return TripoClient(transport=httpx.MockTransport(handler))


def _ok(data):
    return httpx.Response(200, json={"code": 0, "data": data})


class TestClient_:
    async def test_upload_sends_multipart_with_the_bearer_key_and_returns_the_token(self):
        seen = {}

        def handler(request):
            seen["url"] = str(request.url)
            seen["auth"] = request.headers["authorization"]
            seen["ctype"] = request.headers["content-type"]
            return _ok({"file_token": "file_abc"})

        token = await _client(handler).upload_image(b"jpegbytes", "p.jpg", "image/jpeg")
        assert token == "file_abc"
        assert seen["url"] == "https://openapi.example.test/v3/files"
        assert seen["auth"] == "Bearer tsk_test"
        assert seen["ctype"].startswith("multipart/form-data")

    async def test_create_sends_the_required_model_and_furniture_friendly_options(self):
        seen = {}

        def handler(request):
            seen["url"] = str(request.url)
            seen["body"] = json.loads(request.content)
            return _ok({"task_id": "task_1"})

        task_id = await _client(handler).create_model_from_image("file_abc")
        assert task_id == "task_1"
        assert seen["url"].endswith("/generation/image-to-model")
        assert seen["body"] == {
            "input": "file_abc", "model": "v3.1-20260211", "texture": True, "pbr": True, "auto_size": True,
            "face_limit": 50000,
        }

    async def test_a_zero_face_limit_leaves_it_to_tripo(self, monkeypatch):
        monkeypatch.setattr(tripo.settings, "TRIPO_FACE_LIMIT", 0)
        seen = {}

        def handler(request):
            seen["body"] = json.loads(request.content)
            return _ok({"task_id": "t"})

        await _client(handler).create_model_from_image("file_abc")
        assert "face_limit" not in seen["body"]

    async def test_several_views_use_the_multiview_endpoint_in_tripos_order(self):
        seen = {}

        def handler(request):
            seen["url"] = str(request.url)
            seen["body"] = json.loads(request.content)
            return _ok({"task_id": "task_2"})

        task_id = await _client(handler).create_model_from_views({"right": "r", "front": "f", "back": "b"})
        assert task_id == "task_2"
        assert seen["url"].endswith("/generation/multiview-to-model")
        assert seen["body"]["inputs"] == [{"front": "f"}, {"back": "b"}, {"right": "r"}]
        assert seen["body"]["model"] == "v3.1-20260211" and seen["body"]["face_limit"] == 50000
        assert "input" not in seen["body"]

    @pytest.mark.parametrize("tokens", [{"front": "f"}, {"left": "l", "back": "b"}, {"front": "f", "top": "t"}])
    async def test_multiview_needs_a_front_and_a_second_view_and_known_names(self, tokens):
        def handler(request):  # must never be reached
            raise AssertionError("no request expected")

        with pytest.raises(TripoError):
            await _client(handler).create_model_from_views(tokens)

    async def test_a_nonzero_code_is_a_failure_even_on_http_200(self):
        body = {"code": 2010, "message": "Insufficient credits", "request_id": "req_1"}
        with pytest.raises(TripoError) as exc:
            await _client(lambda r: httpx.Response(200, json=body)).create_model_from_image("f")
        assert exc.value.code == 2010
        assert "kredit" in str(exc.value)
        assert exc.value.request_id == "req_1"

    async def test_content_policy_and_bad_files_get_readable_messages(self):
        for code, word in ((2008, "kontent"), (2004, "PNG")):
            body = {"code": code, "message": "x"}
            with pytest.raises(TripoError, match=word):
                await _client(lambda r, b=body: httpx.Response(400, json=b)).upload_image(b"x", "p.jpg", "image/jpeg")

    async def test_429_honours_retry_after_then_succeeds(self):
        calls = {"n": 0}

        def handler(request):
            calls["n"] += 1
            if calls["n"] == 1:
                return httpx.Response(429, headers={"Retry-After": "3"}, json={"code": 2000, "message": "limit"})
            return _ok({"task_id": "task_2"})

        with patch.object(tripo.asyncio, "sleep", new=AsyncMock()) as sleep:
            assert await _client(handler).create_model_from_image("f") == "task_2"
        assert calls["n"] == 2
        sleep.assert_awaited_once_with(3.0)

    async def test_429_gives_up_after_the_last_attempt(self):
        with patch.object(tripo.asyncio, "sleep", new=AsyncMock()):
            with pytest.raises(TripoError) as exc:
                await _client(lambda r: httpx.Response(429, json={"code": 2000, "message": "limit"})).create_model_from_image("f")
        assert exc.value.status == 429

    async def test_missing_key_fails_before_any_request(self, monkeypatch):
        monkeypatch.setattr(tripo.settings, "TRIPO_API_KEY", "")
        hit = {"n": 0}

        def handler(request):
            hit["n"] += 1
            return _ok({})

        with pytest.raises(TripoError):
            await _client(handler).balance()
        assert hit["n"] == 0

    async def test_balance(self):
        assert await _client(lambda r: _ok({"balance": 500.0, "frozen": 0})).balance() == 500.0


class TestWait:
    async def test_polls_until_success_and_returns_the_task(self):
        calls = {"n": 0}

        def handler(request):
            calls["n"] += 1
            if calls["n"] < 3:
                return _ok({"status": "running", "progress": 40})
            return _ok({"status": "success", "output": {"model_url": "https://cdn/m.glb"}, "credits_consumed": 30})

        with patch.object(tripo.asyncio, "sleep", new=AsyncMock()):
            task = await _client(handler).wait_for_model("t", poll_seconds=0)
        assert task["output"]["model_url"] == "https://cdn/m.glb"
        assert calls["n"] == 3

    @pytest.mark.parametrize("state", ["failed", "cancelled", "banned", "expired"])
    async def test_dead_states_raise(self, state):
        with patch.object(tripo.asyncio, "sleep", new=AsyncMock()):
            with pytest.raises(TripoError):
                await _client(lambda r: _ok({"status": state})).wait_for_model("t", poll_seconds=0)

    async def test_a_success_without_a_model_url_is_an_error(self):
        with pytest.raises(TripoError):
            await _client(lambda r: _ok({"status": "success", "output": {}})).wait_for_model("t", poll_seconds=0)

    async def test_gives_up_after_the_timeout(self):
        with patch.object(tripo.asyncio, "sleep", new=AsyncMock()):
            with pytest.raises(TripoError, match="uzoq"):
                await _client(lambda r: _ok({"status": "running"})).wait_for_model(
                    "t", poll_seconds=1, timeout_seconds=3,
                )


def _http_returning(content=b"glbbytes"):
    fetched = MagicMock(content=content)
    fetched.raise_for_status = MagicMock()
    http = MagicMock(get=AsyncMock(return_value=fetched))
    http.__aenter__ = AsyncMock(return_value=http)
    http.__aexit__ = AsyncMock(return_value=False)
    return http


class TestTask:
    async def test_builds_the_model_and_copies_the_glb_into_our_storage(self):
        from app.tasks import media

        client = MagicMock(
            upload_image=AsyncMock(return_value="file_abc"),
            create_model_from_image=AsyncMock(return_value="task_1"),
            wait_for_model=AsyncMock(return_value={"output": {"model_url": "https://cdn/m.glb"}, "credits_consumed": 30}),
        )
        with patch("app.core.storage.download_file", new=AsyncMock(return_value=b"photo")), \
             patch("app.core.storage.upload_file", new=AsyncMock(return_value="https://s3/m.glb")) as up, \
             patch("app.core.storage.delete_file", new=AsyncMock()) as delete, \
             patch("app.services.tripo.get_tripo_client", return_value=client), \
             patch("httpx.AsyncClient", return_value=_http_returning()):
            out = await media._generate_model_from_photo("u1", "photo-model-sources/u1/a.png", "image/png")

        assert out["status"] == "ok" and out["url"] == "https://s3/m.glb" and out["key"].startswith("photo-models/u1/")
        assert out["credits"] == 30
        client.upload_image.assert_awaited_once_with(b"photo", "photo.png", "image/png")
        assert up.await_args.args[0] == b"glbbytes"
        delete.assert_awaited_once_with("photo-model-sources/u1/a.png")

    async def test_several_photos_are_built_together_and_every_source_deleted(self):
        from app.tasks import media

        client = MagicMock(
            upload_image=AsyncMock(side_effect=["tok_f", "tok_l"]),
            create_model_from_image=AsyncMock(),
            create_model_from_views=AsyncMock(return_value="task_2"),
            wait_for_model=AsyncMock(return_value={"output": {"model_url": "https://cdn/m.glb"}, "credits_consumed": 30}),
        )
        views = {"left": {"key": "src/l.png", "content_type": "image/png"}}
        with patch("app.core.storage.download_file", new=AsyncMock(return_value=b"photo")), \
             patch("app.core.storage.upload_file", new=AsyncMock(return_value="https://s3/m.glb")), \
             patch("app.core.storage.delete_file", new=AsyncMock()) as delete, \
             patch("app.services.tripo.get_tripo_client", return_value=client), \
             patch("httpx.AsyncClient", return_value=_http_returning()):
            out = await media._generate_model_from_photo("u1", "src/f.jpg", "image/jpeg", views)

        assert out["status"] == "ok"
        client.create_model_from_views.assert_awaited_once_with({"front": "tok_f", "left": "tok_l"})
        client.create_model_from_image.assert_not_awaited()
        assert {c.args[0] for c in delete.await_args_list} == {"src/f.jpg", "src/l.png"}

    async def test_a_tripo_failure_is_reported_and_the_source_still_deleted(self):
        from app.tasks import media

        client = MagicMock(
            upload_image=AsyncMock(side_effect=TripoError("kredit yetarli emas", code=2010, request_id="r")),
        )
        with patch("app.core.storage.download_file", new=AsyncMock(return_value=b"photo")), \
             patch("app.core.storage.delete_file", new=AsyncMock()) as delete, \
             patch("app.services.tripo.get_tripo_client", return_value=client):
            out = await media._generate_model_from_photo("u1", "k", "image/jpeg")

        assert out == {"status": "failed", "error": "kredit yetarli emas", "request_id": "r"}
        delete.assert_awaited_once_with("k")


def _user():
    u = MagicMock()
    u.id = uuid.uuid4()
    u.is_active = True
    u.is_admin = False
    return u


class _Shop:
    """Stands in for what SQLAlchemy's execute() returns for the shop lookup."""

    def __init__(self, shop):
        self._shop = shop

    def scalar_one_or_none(self):
        return self._shop


@pytest.fixture
def api(monkeypatch):
    from app.routers import photo_model as router_mod

    monkeypatch.setattr(router_mod.settings, "TRIPO_API_KEY", "k")
    monkeypatch.setattr(router_mod.settings, "MODEL_FROM_PHOTO_DAILY_LIMIT", 3)
    db = AsyncMock()
    db.add = MagicMock()
    user = _user()
    # By default the caller is a seller with an approved shop; tests change
    # who they are through api.set_role(...).
    def set_role(role):
        user.is_admin = role == "admin"
        shop = None
        if role in ("seller", "pending", "rejected"):
            shop = MagicMock(status={"seller": "approved", "pending": "pending", "rejected": "rejected"}[role])
        db.execute = AsyncMock(return_value=_Shop(shop))
    set_role("seller")
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    c = TestClient(app)
    c.user, c.db, c.set_role = user, db, set_role
    yield c
    app.dependency_overrides.clear()


def _post(c, content=b"\xff\xd8jpeg", ctype="image/jpeg"):
    return c.post("/api/v1/models/from-photo", files={"file": ("p.jpg", content, ctype)})


class TestRoute:
    def test_happy_path_stores_the_photo_enqueues_and_records_the_job(self, api):
        with patch("app.routers.photo_model.check_and_increment_budget_for", new=AsyncMock()) as budget, \
             patch("app.routers.photo_model.upload_file", new=AsyncMock(return_value="u")) as up, \
             patch("app.routers.photo_model.generate_model_from_photo.delay", return_value=MagicMock(id="job-1")) as delay:
            res = _post(api)
        assert res.status_code == 202 and res.json() == {"job_id": "job-1"}
        budget.assert_awaited_once_with(str(api.user.id), "photo_model", 3)
        assert up.await_args.args[1].startswith(f"photo-model-sources/{api.user.id}/")
        assert delay.call_args.args == (str(api.user.id), up.await_args.args[1], "image/jpeg", None)
        api.db.add.assert_called_once()

    def test_extra_views_are_stored_and_sent_to_the_task_as_a_multiview_build(self, api):
        files = {
            "file": ("f.jpg", b"\xff\xd8front", "image/jpeg"),
            "left": ("l.png", b"\x89PNGleft", "image/png"),
            "back": ("b.jpg", b"\xff\xd8back", "image/jpeg"),
        }
        with patch("app.routers.photo_model.check_and_increment_budget_for", new=AsyncMock()) as budget, \
             patch("app.routers.photo_model.upload_file", new=AsyncMock(return_value="u")) as up, \
             patch("app.routers.photo_model.generate_model_from_photo.delay", return_value=MagicMock(id="job-2")) as delay:
            res = api.post("/api/v1/models/from-photo", files=files)
        assert res.status_code == 202
        budget.assert_awaited_once()  # one build, one allowance — however many photos
        assert up.await_count == 3
        _, front_key, front_type, extra = delay.call_args.args
        assert front_type == "image/jpeg" and set(extra) == {"left", "back"}
        assert extra["left"]["content_type"] == "image/png" and extra["left"]["key"].endswith(".png")
        assert front_key not in {v["key"] for v in extra.values()}

    def test_a_bad_extra_view_is_refused_before_any_allowance_is_spent(self, api):
        files = {"file": ("f.jpg", b"\xff\xd8front", "image/jpeg"), "left": ("l.pdf", b"%PDF", "application/pdf")}
        with patch("app.routers.photo_model.check_and_increment_budget_for", new=AsyncMock()) as budget, \
             patch("app.routers.photo_model.upload_file", new=AsyncMock()) as up:
            assert api.post("/api/v1/models/from-photo", files=files).status_code == 415
        budget.assert_not_awaited()
        up.assert_not_awaited()

    def test_over_the_daily_limit_is_429_and_nothing_is_stored(self, api):
        with patch("app.routers.photo_model.check_and_increment_budget_for", new=AsyncMock(side_effect=BudgetExceededError())), \
             patch("app.routers.photo_model.upload_file", new=AsyncMock()) as up, \
             patch("app.routers.photo_model.generate_model_from_photo.delay") as delay:
            assert _post(api).status_code == 429
        up.assert_not_awaited()
        delay.assert_not_called()

    def test_invalid_uploads_do_not_spend_the_allowance(self, api):
        with patch("app.routers.photo_model.check_and_increment_budget_for", new=AsyncMock()) as budget:
            assert _post(api, ctype="application/pdf").status_code == 415
            assert _post(api, content=b"").status_code == 400
            assert _post(api, content=b"x" * (20 * 1024 * 1024 + 1)).status_code == 413
        budget.assert_not_awaited()

    def test_no_key_or_a_zero_limit_turns_the_feature_off(self, api, monkeypatch):
        from app.routers import photo_model as router_mod

        monkeypatch.setattr(router_mod.settings, "TRIPO_API_KEY", "")
        assert _post(api).status_code == 503
        monkeypatch.setattr(router_mod.settings, "TRIPO_API_KEY", "k")
        monkeypatch.setattr(router_mod.settings, "MODEL_FROM_PHOTO_DAILY_LIMIT", 0)
        assert _post(api).status_code == 503


class TestGlbRoute:
    def test_streams_the_callers_own_model(self, api):
        key = f"photo-models/{api.user.id}/m.glb"
        with patch("app.routers.photo_model.download_file", new=AsyncMock(return_value=b"glbbytes")) as dl:
            res = api.get("/api/v1/models/from-photo/glb", params={"key": key})
        assert res.status_code == 200 and res.content == b"glbbytes"
        assert res.headers["content-type"] == "model/gltf-binary"
        dl.assert_awaited_once_with(key)

    @pytest.mark.parametrize("key", [
        "photo-models/someone-else/m.glb",
        "renders/x/a.jpg",
        "thumbnails/x.jpg",
    ])
    def test_other_peoples_files_are_404(self, api, key):
        with patch("app.routers.photo_model.download_file", new=AsyncMock()) as dl:
            assert api.get("/api/v1/models/from-photo/glb", params={"key": key}).status_code == 404
        dl.assert_not_awaited()

    def test_path_traversal_is_404(self, api):
        key = f"photo-models/{api.user.id}/../../secret"
        assert api.get("/api/v1/models/from-photo/glb", params={"key": key}).status_code == 404

    def test_a_missing_file_is_404(self, api):
        key = f"photo-models/{api.user.id}/gone.glb"
        with patch("app.routers.photo_model.download_file", new=AsyncMock(side_effect=FileNotFoundError())):
            assert api.get("/api/v1/models/from-photo/glb", params={"key": key}).status_code == 404


class TestWhoMayBuildModels:
    """Adding models is for admins and approved sellers, not every signed-in user."""

    def _post_ok(self, api):
        with patch("app.routers.photo_model.check_and_increment_budget_for", new=AsyncMock()) as budget, \
             patch("app.routers.photo_model.upload_file", new=AsyncMock(return_value="u")), \
             patch("app.routers.photo_model.generate_model_from_photo.delay", return_value=MagicMock(id="j")) as delay:
            res = _post(api)
        return res, budget, delay

    def test_an_approved_seller_may(self, api):
        api.set_role("seller")
        res, _, delay = self._post_ok(api)
        assert res.status_code == 202
        delay.assert_called_once()

    def test_an_admin_may_without_owning_a_shop(self, api):
        api.set_role("admin")
        res, _, _ = self._post_ok(api)
        assert res.status_code == 202

    @pytest.mark.parametrize("role", ["user", "pending", "rejected"])
    def test_everyone_else_is_403_and_nothing_is_spent_or_stored(self, api, role):
        api.set_role(role)
        with patch("app.routers.photo_model.check_and_increment_budget_for", new=AsyncMock()) as budget, \
             patch("app.routers.photo_model.upload_file", new=AsyncMock()) as up, \
             patch("app.routers.photo_model.generate_model_from_photo.delay") as delay:
            res = _post(api)
        assert res.status_code == 403
        budget.assert_not_awaited()
        up.assert_not_awaited()
        delay.assert_not_called()

    def test_the_glb_download_is_gated_the_same_way(self, api):
        key = f"photo-models/{api.user.id}/m.glb"
        api.set_role("user")
        with patch("app.routers.photo_model.download_file", new=AsyncMock(return_value=b"x")) as dl:
            assert api.get("/api/v1/models/from-photo/glb", params={"key": key}).status_code == 403
        dl.assert_not_awaited()
        api.set_role("seller")
        with patch("app.routers.photo_model.download_file", new=AsyncMock(return_value=b"x")):
            assert api.get("/api/v1/models/from-photo/glb", params={"key": key}).status_code == 200
