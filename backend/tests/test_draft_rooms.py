"""
/draft-rooms: the wizard's autosave.

It used to need no sign-in and take any amount of JSON: anyone could store
10 MB rows in Postgres, and anyone holding a draft id could read, overwrite
or delete it. Drafts now belong to the signed-in user who made them, other
people's drafts are 404, and the state is capped in size.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.draft_room import DraftRoom


class _Result:
    def __init__(self, row=None):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _as(user, row=None):
    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(return_value=_Result(row))

    async def _refresh(obj):
        obj.id = obj.id or uuid.uuid4()
        obj.created_at = obj.updated_at = datetime.now(timezone.utc)

    db.refresh = AsyncMock(side_effect=_refresh)
    app.dependency_overrides[get_db] = lambda: db
    if user is not None:
        app.dependency_overrides[get_current_active_user] = lambda: user
    return db


def _user():
    return MagicMock(id=uuid.uuid4(), is_active=True, is_admin=False)


@pytest.mark.parametrize(
    ("method", "path"),
    [("post", ""), ("get", "/{id}"), ("patch", "/{id}"), ("delete", "/{id}")],
)
def test_drafts_need_a_signed_in_user(client, method, path):
    _as(None)
    url = "/api/v1/draft-rooms" + path.format(id=uuid.uuid4())
    kwargs = {"json": {"state": {}}} if method in ("post", "patch") else {}
    assert getattr(client, method)(url, **kwargs).status_code == 401


def test_a_new_draft_belongs_to_its_creator(client):
    user = _user()
    db = _as(user)
    assert client.post("/api/v1/draft-rooms", json={"state": {"wizardStep": 1}}).status_code == 201
    assert db.add.call_args.args[0].user_id == user.id


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_a_draft_is_looked_up_only_among_the_callers_own(client, method):
    user = _user()
    db = _as(user, row=None)  # someone else's draft is simply not found
    kwargs = {"json": {"state": {}}} if method == "patch" else {}
    response = getattr(client, method)(f"/api/v1/draft-rooms/{uuid.uuid4()}", **kwargs)
    assert response.status_code == 404
    stmt = db.execute.call_args.args[0]
    assert "draft_rooms.user_id = " in str(stmt).lower()
    assert user.id in stmt.compile().params.values()


@pytest.mark.parametrize("method", ["post", "patch"])
def test_an_oversized_state_is_refused(client, method):
    user = _user()
    draft = DraftRoom(id=uuid.uuid4(), user_id=user.id, state={})
    _as(user, row=draft)
    huge = {"blob": "x" * 300_000}
    url = "/api/v1/draft-rooms" + ("" if method == "post" else f"/{draft.id}")
    assert getattr(client, method)(url, json={"state": huge}).status_code == 422
