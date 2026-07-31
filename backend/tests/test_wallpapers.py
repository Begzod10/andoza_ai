"""
Wallpaper library tests.

The library is shared and permanent, so the rules that matter are: only images
get in, the same image never lands twice, and only an admin can take one out.

Storage and the DB session are stubbed — these cover the router's contract,
not Postgres.
"""
import io
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.wallpaper import Wallpaper


def _user(is_admin: bool = False):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.is_active = True
    user.is_admin = is_admin
    return user


class _Result:
    """Stands in for the object SQLAlchemy's execute() returns."""

    def __init__(self, one=None, many=()):
        self._one = one
        self._many = list(many)

    def scalar_one_or_none(self):
        return self._one

    def scalars(self):
        return self

    def all(self):
        return self._many


def _db(execute_result=None):
    db = AsyncMock()
    db.execute = AsyncMock(return_value=execute_result or _Result())
    db.flush = AsyncMock()
    db.delete = AsyncMock()
    db.add = MagicMock()

    async def _refresh(obj):
        # Stand in for the DB filling in its defaults — the id is a client-side
        # default and created_at a server default, both only readable after the
        # round trip the real session makes.
        if obj.id is None:
            obj.id = uuid.uuid4()
        if obj.created_at is None:
            obj.created_at = datetime.now(timezone.utc)

    db.refresh = AsyncMock(side_effect=_refresh)
    return db


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _as(user, db):
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db


PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


class TestUpload:
    def test_rejects_non_image(self, client):
        _as(_user(), _db())
        response = client.post(
            "/api/v1/wallpapers",
            files={"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")},
        )
        assert response.status_code == 415

    def test_rejects_empty_file(self, client):
        _as(_user(), _db())
        response = client.post(
            "/api/v1/wallpapers",
            files={"file": ("empty.png", io.BytesIO(b""), "image/png")},
        )
        assert response.status_code == 400

    def test_rejects_oversized_file(self, client):
        _as(_user(), _db())
        huge = io.BytesIO(b"0" * (16 * 1024 * 1024))
        response = client.post(
            "/api/v1/wallpapers",
            files={"file": ("big.png", huge, "image/png")},
        )
        assert response.status_code == 413

    def test_stores_image_and_returns_absolute_url(self, client):
        db = _db()
        _as(_user(), db)
        with patch(
            "app.routers.wallpapers.upload_file",
            return_value="/media/wallpapers/abc.png",
        ) as stored:
            response = client.post(
                "/api/v1/wallpapers",
                files={"file": ("oboy.png", io.BytesIO(PNG), "image/png")},
            )

        assert response.status_code == 201
        body = response.json()
        # A relative path would break as a WebGL texture URL on the frontend
        assert body["url"].startswith("http://")
        # The URL is rebuilt from the stored key rather than echoing whatever
        # the storage backend returned, so S3 and local storage agree
        assert "/media/wallpapers/" in body["url"]
        assert body["url"].endswith(".png")
        assert body["name"] == "oboy.png"
        assert stored.call_args.args[1].startswith("wallpapers/")
        db.add.assert_called_once()

    def test_same_image_twice_reuses_the_entry(self, client):
        existing = Wallpaper(
            id=uuid.uuid4(),
            name="oboy.png",
            storage_key="wallpapers/existing.png",
            content_type="image/png",
            size_bytes=len(PNG),
            sha256="whatever",
        )
        existing.created_at = datetime.now(timezone.utc)
        db = _db(_Result(one=existing))
        _as(_user(), db)

        with patch("app.routers.wallpapers.upload_file") as stored:
            response = client.post(
                "/api/v1/wallpapers",
                files={"file": ("oboy.png", io.BytesIO(PNG), "image/png")},
            )

        assert response.status_code == 201
        assert response.json()["id"] == str(existing.id)
        stored.assert_not_called()  # nothing re-uploaded
        db.add.assert_not_called()  # and no duplicate row


class TestDelete:
    def test_non_admin_is_refused(self, client):
        db = _db()
        _as(_user(is_admin=False), db)
        response = client.delete(f"/api/v1/wallpapers/{uuid.uuid4()}")
        assert response.status_code == 403
        db.delete.assert_not_called()

    def test_admin_removes_row_and_file(self, client):
        wallpaper = Wallpaper(
            id=uuid.uuid4(),
            name="oboy.png",
            storage_key="wallpapers/gone.png",
            content_type="image/png",
            size_bytes=10,
            sha256="hash",
        )
        db = _db(_Result(one=wallpaper))
        _as(_user(is_admin=True), db)

        with patch("app.routers.wallpapers.delete_file") as removed:
            response = client.delete(f"/api/v1/wallpapers/{wallpaper.id}")

        assert response.status_code == 204
        db.delete.assert_awaited_once()
        removed.assert_called_once_with("wallpapers/gone.png")

    def test_missing_wallpaper_is_404(self, client):
        _as(_user(is_admin=True), _db(_Result(one=None)))
        response = client.delete(f"/api/v1/wallpapers/{uuid.uuid4()}")
        assert response.status_code == 404
