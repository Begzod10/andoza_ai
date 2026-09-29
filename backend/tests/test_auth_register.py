"""Regression test for POST /api/v1/auth/register.

The bug this guards against: register() created the user with db.flush()
but did not reload it, so server-side defaults (created_at, is_admin) were
unpopulated and UserOut serialisation produced an incomplete LoginResponse
(→ 500). register() must return the SAME complete shape as /login:
a fully-populated user, plus access_token + refresh_token when the request
is from a native app client (see _is_native_client() in auth.py) — web
requests get the cookies only and null tokens in the body.

Uses a get_db override whose refresh() populates the server defaults the
real Postgres would fill in, so the test asserts the endpoint's contract
without needing a database.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app


class _Result:
    def __init__(self, scalar=None):
        self._scalar = scalar

    def scalar_one_or_none(self):
        return self._scalar


class _FakeDb:
    """No existing username; refresh() fills the server-side defaults."""

    async def execute(self, stmt):
        return _Result(scalar=None)

    def add(self, obj):
        self._added = obj

    async def flush(self):
        pass

    async def refresh(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)
        if getattr(obj, "is_admin", None) is None:
            obj.is_admin = False


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_register_returns_complete_login_response(client, mock_redis):
    """Native app request (X-Client-Type: mobile) gets tokens in the body,
    same shape as a native /login response."""
    app.dependency_overrides[get_db] = lambda: _FakeDb()

    with patch("app.routers.auth.get_redis", return_value=mock_redis):
        response = client.post(
            "/api/v1/auth/register",
            json={"username": "newuser", "password": "Secret123", "name": "New User"},
            headers={"X-Client-Type": "mobile"},
        )

    assert response.status_code == 201
    body = response.json()

    # Tokens present (same shape as /login) -- this is a native request.
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["token_type"] == "bearer"

    # User is fully populated -- created_at proves the row was reloaded, i.e.
    # the response is NOT an incomplete LoginResponse.
    user = body["user"]
    assert user["id"]
    assert user["username"] == "newuser"
    assert user["name"] == "New User"
    assert user["created_at"]
    assert user["is_admin"] is False


def test_register_web_request_omits_tokens_from_body(client, mock_redis):
    """A plain (browser) request -- no X-Client-Type header, no native
    Origin -- must NOT get access_token/refresh_token in the JSON body.
    Only the HttpOnly cookies carry the JWTs for web clients."""
    app.dependency_overrides[get_db] = lambda: _FakeDb()

    with patch("app.routers.auth.get_redis", return_value=mock_redis):
        response = client.post(
            "/api/v1/auth/register",
            json={"username": "webuser", "password": "Secret123", "name": "Web User"},
        )

    assert response.status_code == 201
    body = response.json()

    assert body["access_token"] is None
    assert body["refresh_token"] is None

    # Cookies are still set regardless of client type.
    set_cookie_headers = response.headers.get_list("set-cookie")
    assert any(h.startswith("token=") for h in set_cookie_headers)
    assert any(h.startswith("refresh_token=") for h in set_cookie_headers)
