"""Setting furniture styles with the AI in the background.

The row read and the conditional write are swapped for in-memory stand-ins (the
real ones run against Postgres in the server image); storage and the AI are fakes.
"""
import asyncio
from unittest.mock import MagicMock

import pytest

import celery_app
from app.config import settings
from app.services import furniture_style_queue
from app.tasks import furniture_styles as fs

TASK_NAME = "app.tasks.furniture_styles.classify_furniture_styles_task"


@pytest.fixture
def world(monkeypatch):
    def make(row=("Loft divan", "divan", "furniture/t.jpg", None), save_ok=True,
             ai=None, download=None, ai_enabled=True):
        calls = {"ai": [], "saved": [], "cache": [], "downloads": []}

        async def load(fid):
            return row

        async def save(fid, styles):
            calls["saved"].append((fid, styles))
            return save_ok

        async def classify(name, category, image):
            calls["ai"].append((name, category, image))
            if isinstance(ai, Exception):
                raise ai
            return ai if ai is not None else ["loft"]

        async def dl(key):
            calls["downloads"].append(key)
            if isinstance(download, Exception):
                raise download
            return download if download is not None else b"\xff\xd8\xff" + b"0" * 10

        async def cache(prefix):
            calls["cache"].append(prefix)

        monkeypatch.setattr(fs, "_load", load)
        monkeypatch.setattr(fs, "_save", save)
        monkeypatch.setattr(fs, "classify_furniture_styles", classify)
        monkeypatch.setattr(fs, "download_file", dl)
        monkeypatch.setattr(fs, "cache_delete_prefix", cache)
        monkeypatch.setattr(fs, "prepare_design_image", lambda data, ct: MagicMock(name="img"))
        monkeypatch.setattr(settings, "AI_FEATURES_ENABLED", ai_enabled)
        return calls

    return make


def _run():
    return asyncio.run(fs.run_classification("f1"))


class TestRun:
    def test_unstyled_furniture_gets_the_ai_styles(self, world):
        calls = world()
        assert _run() == {"status": "classified", "styles": ["loft"]}
        assert calls["saved"] == [("f1", ["loft"])]
        assert calls["cache"] == ["furniture:"]
        assert calls["ai"][0][2] is not None

    def test_manually_styled_furniture_is_left_alone(self, world):
        calls = world(row=("Divan", "divan", None, "manual"))
        assert _run()["status"] == "skipped"
        assert calls["ai"] == [] and calls["saved"] == []

    def test_missing_furniture_is_skipped(self, world):
        calls = world(row=None)
        assert _run()["status"] == "skipped"
        assert calls["ai"] == []

    def test_a_style_set_by_hand_meanwhile_is_not_overwritten(self, world):
        calls = world(save_ok=False)
        assert _run()["status"] == "skipped"
        assert calls["cache"] == []

    def test_an_ai_error_saves_nothing(self, world):
        calls = world(ai=RuntimeError("llm down"))
        assert _run()["status"] == "failed"
        assert calls["saved"] == []

    def test_a_failing_download_saves_nothing_and_skips_the_ai(self, world):
        # A picture exists but cannot be read: do not settle for a name-only guess
        # (it would be saved as 'ai' for good); leave it for the next run.
        calls = world(download=FileNotFoundError("gone"))
        assert _run() == {"status": "failed", "styles": []}
        assert calls["ai"] == [] and calls["saved"] == [] and calls["cache"] == []

    def test_a_thumbnail_that_is_not_an_image_saves_nothing(self, world, monkeypatch):
        calls = world()

        def bad(data, ct):
            raise ValueError("not an image")

        monkeypatch.setattr(fs, "prepare_design_image", bad)
        assert _run() == {"status": "failed", "styles": []}
        assert calls["ai"] == [] and calls["saved"] == []

    def test_a_public_s3_url_thumbnail_is_downloaded_by_its_key(self, world, monkeypatch):
        monkeypatch.setattr(settings, "S3_ENDPOINT_URL", "https://s3.example.uz")
        monkeypatch.setattr(settings, "S3_BUCKET", "andoza")
        calls = world(row=("Divan", "divan", "https://s3.example.uz/andoza/furniture/t.jpg", None))
        assert _run()["status"] == "classified"
        assert calls["downloads"] == ["furniture/t.jpg"]
        assert calls["ai"][0][2] is not None

    def test_no_thumbnail_key_means_a_name_only_call(self, world):
        calls = world(row=("Divan", "divan", None, None))
        assert _run()["status"] == "classified"
        assert calls["downloads"] == []
        assert calls["ai"] == [("Divan", "divan", None)]

    def test_ai_switched_off_skips(self, world):
        calls = world(ai_enabled=False)
        assert _run()["status"] == "skipped"
        assert calls["ai"] == []


class TestRouting:
    def test_task_is_registered_and_routed_to_the_default_queue(self):
        assert TASK_NAME in celery_app.app.tasks
        route = celery_app.app.amqp.router.route({}, TASK_NAME)
        assert route["queue"].name == "default"

    def test_the_task_has_no_rate_limit(self):
        # A Celery rate limit parks waiting tasks in the prefetch window, which then
        # blocks push notifications on the same worker for the whole backfill.
        assert fs.classify_furniture_styles_task.rate_limit is None


class TestQueue:
    def test_a_broken_broker_does_not_raise(self, monkeypatch):
        def boom(*a, **k):
            raise RuntimeError("broker down")

        monkeypatch.setattr(fs.classify_furniture_styles_task, "delay", boom)
        furniture_style_queue.enqueue_style("f1")
