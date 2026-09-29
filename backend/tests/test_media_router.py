"""
IDOR regression tests for GET /jobs/{job_id}.

Job ids are Celery task ids returned from POST /media/photos. They are UUIDs
but were never bound to the requesting user — any authenticated user who
learned/guessed another user's job id could poll their processing status
and result. `media_jobs` now records ownership at enqueue time, and
get_job_status() must reject a request for a job it doesn't own.

Storage, Celery and the DB session are stubbed — these cover the router's
authorization contract, not S3/Celery/Postgres.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.media_job import MediaJob


def _user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.is_active = True
    user.is_admin = False
    return user


class _Result:
    """Stands in for the object SQLAlchemy's execute() returns."""

    def __init__(self, one=None):
        self._one = one

    def scalar_one_or_none(self):
        return self._one


def _db(execute_result=None):
    db = AsyncMock()
    db.execute = AsyncMock(return_value=execute_result or _Result())
    db.add = MagicMock()
    return db


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _as(user, db):
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db


class TestJobStatusOwnershipCheck:
    def test_owner_can_fetch_their_own_job_status(self, client):
        """User A created the job — polling it returns the Celery status."""
        user_a = _user()
        job_id = str(uuid.uuid4())
        job_row = MediaJob(id=job_id, user_id=user_a.id)
        db = _db(_Result(one=job_row))
        _as(user_a, db)

        fake_async_result = MagicMock()
        fake_async_result.status = "SUCCESS"
        fake_async_result.ready.return_value = True
        fake_async_result.result = {"status": "ok"}

        with patch("app.routers.media.AsyncResult", return_value=fake_async_result):
            response = client.get(f"/api/v1/jobs/{job_id}")

        assert response.status_code == 200
        body = response.json()
        assert body["job_id"] == job_id
        assert body["status"] == "SUCCESS"
        assert body["result"] == {"status": "ok"}

    def test_other_user_cannot_fetch_someone_elses_job_status(self, client):
        """User B tries to poll user A's job id — must be rejected as not
        found, not leak the job's status/result."""
        user_a_id = uuid.uuid4()
        user_b = _user()
        job_id = str(uuid.uuid4())
        # The row exists, but belongs to user A, not the requester (user B).
        job_row = MediaJob(id=job_id, user_id=user_a_id)
        db = _db(_Result(one=job_row))
        _as(user_b, db)

        fake_async_result = MagicMock()
        fake_async_result.status = "SUCCESS"
        fake_async_result.ready.return_value = True
        fake_async_result.result = {"secret": "user-a-data"}

        with patch("app.routers.media.AsyncResult", return_value=fake_async_result) as mocked:
            response = client.get(f"/api/v1/jobs/{job_id}")

        assert response.status_code == 404
        assert "user-a-data" not in response.text
        # Ownership must be rejected before Celery is ever consulted.
        mocked.assert_not_called()

    def test_unknown_job_id_is_not_found(self, client):
        """A job id that was never enqueued (or a guessed/forged UUID)
        returns 404, same as one owned by someone else — so this endpoint
        can't be used to enumerate which job ids exist."""
        user = _user()
        db = _db(_Result(one=None))
        _as(user, db)

        with patch("app.routers.media.AsyncResult") as mocked:
            response = client.get(f"/api/v1/jobs/{uuid.uuid4()}")

        assert response.status_code == 404
        mocked.assert_not_called()

    def test_malformed_job_id_is_not_found_not_a_500(self, client):
        """job_id is an opaque string in the route, not validated as a UUID
        — a malformed value must fail as a normal missing-row lookup, not
        blow up as a DB-level invalid-UUID error."""
        user = _user()
        db = _db(_Result(one=None))
        _as(user, db)

        with patch("app.routers.media.AsyncResult") as mocked:
            response = client.get("/api/v1/jobs/not-a-uuid-at-all")

        assert response.status_code == 404
        mocked.assert_not_called()

    def test_uploading_a_photo_records_job_ownership(self, client):
        """POST /media/photos must persist a MediaJob row binding the new
        Celery task id to the uploading user, or ownership has nothing to
        check against later."""
        user = _user()
        db = _db()
        _as(user, db)

        fake_task = MagicMock()
        fake_task.id = str(uuid.uuid4())

        with (
            patch("app.routers.media.upload_file", new=AsyncMock(return_value="https://cdn.example/x.jpg")),
            patch("app.routers.media.process_photo.delay", return_value=fake_task),
        ):
            response = client.post(
                "/api/v1/media/photos",
                files={"file": ("photo.jpg", b"fake-bytes", "image/jpeg")},
            )

        assert response.status_code == 202
        assert response.json()["job_id"] == fake_task.id
        db.add.assert_called_once()
        added_job = db.add.call_args[0][0]
        assert isinstance(added_job, MediaJob)
        assert added_job.id == fake_task.id
        assert added_job.user_id == user.id
