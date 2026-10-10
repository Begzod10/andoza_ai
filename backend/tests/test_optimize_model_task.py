"""Compressing a model in the background, and asking for it when a model is uploaded.

The task's database reads and writes are swapped for an in-memory row here (the
real ones are exercised against Postgres in the server image); storage and the
optimizer are stand-ins.
"""
import asyncio
import io
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import model_optimize_queue
from app.tasks import media


class _Rows:
    """One model row per (kind, id): its original key and its opt key."""

    def __init__(self, original: str | None, opt: str | None = None):
        self.rows = {} if original is None else {("furniture", "m1"): [original, opt]}
        self.vanish_before_save = False

    async def load(self, kind, model_id):
        row = self.rows.get((kind, model_id))
        return None if row is None else (row[0], row[1])

    async def save(self, kind, model_id, key):
        if self.vanish_before_save:
            self.rows.pop((kind, model_id), None)
        row = self.rows.get((kind, model_id))
        if row is None:
            return False
        row[1] = key
        return True


@pytest.fixture
def world(monkeypatch):
    def make(original="furniture/a.glb", opt=None, optimized=b"small"):
        rows = _Rows(original, opt)
        storage = {"downloads": [], "uploads": [], "deletes": []}

        async def download(key):
            storage["downloads"].append(key)
            return b"x" * 100

        async def upload(data, key, content_type="application/octet-stream"):
            storage["uploads"].append((key, data, content_type))
            return f"/media/{key}"

        async def delete(key):
            storage["deletes"].append(key)

        monkeypatch.setattr(media, "_load_model_keys", rows.load)
        monkeypatch.setattr(media, "_save_opt_key", rows.save)
        monkeypatch.setattr("app.core.storage.download_file", download)
        monkeypatch.setattr("app.core.storage.upload_file", upload)
        monkeypatch.setattr("app.core.storage.delete_file", delete)
        monkeypatch.setattr("app.services.glb_optimizer.optimize_glb_bytes", lambda data, **kw: optimized)
        return rows, storage

    return make


def _run(kind="furniture", model_id="m1"):
    return asyncio.run(media._optimize_model(kind, model_id))


class TestTask:
    def test_ok_stores_the_copy_beside_the_original(self, world):
        rows, storage = world()
        result = _run()
        assert result == {"status": "ok", "before": 100, "after": 5}
        assert storage["uploads"] == [("furniture/a.opt.glb", b"small", "model/gltf-binary")]
        assert rows.rows[("furniture", "m1")] == ["furniture/a.glb", "furniture/a.opt.glb"]

    def test_not_smaller_leaves_the_original_alone(self, world):
        rows, storage = world(optimized=None)
        assert _run()["status"] == "not_smaller"
        assert storage["uploads"] == []
        assert rows.rows[("furniture", "m1")][1] is None

    def test_an_external_url_is_never_fetched(self, world):
        _, storage = world(original="https://cdn.example.com/a.glb")
        assert _run()["status"] == "skipped"
        assert storage["downloads"] == []

    def test_a_model_that_already_has_a_copy_is_skipped(self, world):
        _, storage = world(opt="furniture/a.opt.glb")
        assert _run()["status"] == "skipped"
        assert storage["downloads"] == []

    def test_a_missing_model_is_not_an_error(self, world):
        _, storage = world(original=None)
        assert _run()["status"] == "missing"
        assert storage["uploads"] == []

    def test_a_model_deleted_while_compressing_leaves_no_orphan(self, world):
        rows, storage = world()
        rows.vanish_before_save = True
        assert _run()["status"] == "missing"
        assert storage["deletes"] == ["furniture/a.opt.glb"]

    def test_an_unknown_kind_is_refused(self, world):
        world()
        assert _run(kind="room")["status"] == "skipped"


class TestEnqueue:
    def test_a_broker_that_is_down_does_not_fail_the_caller(self, monkeypatch):
        task = MagicMock()
        task.delay.side_effect = ConnectionError("broker down")
        monkeypatch.setattr(media, "optimize_model_glb", task)
        model_optimize_queue.enqueue_optimize("furniture", "m1")  # must not raise
        task.delay.assert_called_once_with("furniture", "m1")

    def test_it_waits_for_the_commit(self, monkeypatch):
        hooks = []
        monkeypatch.setattr(model_optimize_queue, "run_after_commit", lambda db, hook: hooks.append(hook))
        sent = []
        monkeypatch.setattr(model_optimize_queue, "enqueue_optimize", lambda kind, mid: sent.append((kind, mid)))
        model_optimize_queue.enqueue_optimize_after_commit(object(), "user_model", "u1")
        assert sent == []  # nothing before the row is committed
        asyncio.run(hooks[0]())
        assert sent == [("user_model", "u1")]


# ── The three upload routes ask for it ───────────────────────────────────────

GLB = b"glTF" + b"\x02\x00\x00\x00" + b"\0" * 64


def _client(user, db):
    from fastapi.testclient import TestClient

    from app.api.v1.deps import get_current_active_user
    from app.database import get_db
    from app.main import app

    async def _get_db():
        yield db

    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = _get_db
    return TestClient(app), app


def _user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.is_active = True
    user.is_admin = True
    return user


class TestUserModelUpload:
    def _db(self, found=None):
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = found
        db.execute = AsyncMock(return_value=result)
        db.add = MagicMock()

        async def _refresh(obj, attribute_names=None):
            from datetime import datetime, timezone

            obj.id = obj.id or uuid.uuid4()
            obj.created_at = obj.created_at or datetime.now(timezone.utc)

        db.refresh = AsyncMock(side_effect=_refresh)
        return db

    def _post(self, monkeypatch, db):
        sent = []
        monkeypatch.setattr("app.routers.user_models.enqueue_optimize_after_commit",
                            lambda db, kind, mid: sent.append((kind, mid)))
        monkeypatch.setattr("app.routers.user_models.upload_file", AsyncMock(side_effect=lambda b, k, **kw: f"/media/{k}"))
        client, app = _client(_user(), db)
        try:
            r = client.post(
                "/api/v1/user-models",
                files={"file": ("chair.glb", io.BytesIO(GLB), "model/gltf-binary")},
                data={"name": "Stul", "scale": "1", "size_w_m": "1", "size_d_m": "1", "size_h_m": "1", "has_textures": "false"},
            )
        finally:
            app.dependency_overrides.clear()
        return r, sent

    def test_a_new_model_is_queued(self, monkeypatch):
        r, sent = self._post(monkeypatch, self._db())
        assert r.status_code == 201, r.text
        assert sent == [("user_model", r.json()["id"])]

    def test_the_same_file_again_is_not_queued(self, monkeypatch):
        from datetime import datetime, timezone

        from app.models.user_model import UserModel

        found = UserModel(
            id=uuid.uuid4(), user_id=uuid.uuid4(), name="Stul", scale=1.0, size_w_m=1.0, size_d_m=1.0, size_h_m=1.0,
            has_textures=False, storage_key="models/u/a.glb", opt_key="models/u/a.opt.glb", content_type="model/gltf-binary",
            size_bytes=10, sha256="x" * 64, created_at=datetime.now(timezone.utc),
        )
        r, sent = self._post(monkeypatch, self._db(found))
        assert r.status_code in (200, 201), r.text
        assert sent == []
        assert found.opt_key == "models/u/a.opt.glb"


def test_a_task_killed_mid_run_is_dropped_not_requeued():
    """The queue acks late and requeues on a lost worker (for room scans). A model
    so big that compressing it gets the worker killed would then come back
    forever and block the converter queue; this task is best-effort, so it is
    acknowledged on receipt instead."""
    assert media.optimize_model_glb.acks_late is False
    assert media.optimize_model_glb.reject_on_worker_lost is False
