"""Security regression: access/refresh JWTs must only appear in the JSON
response body for native app clients (Flutter / legacy Capacitor shell).
Web (browser) requests must get cookies only, so an XSS bug in the web
client's fetch()/axios handling can't exfiltrate a token it never receives.

Detection lives in app/routers/auth.py::_is_native_client() and checks, in
order:
  1. `X-Client-Type: mobile` header (set by the Flutter app's Dio client)
  2. `Origin` matching one of settings.NATIVE_APP_ORIGINS (the fixed
     Capacitor/WebView origins CORS always allow-lists)

Covers: POST /auth/login, /auth/register, /auth/otp/verify, /auth/refresh.
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


class _FakeUserDb:
    """In-memory stand-in for the users table, keyed by username -- enough
    to exercise register -> login -> refresh round-trips without Postgres."""

    def __init__(self):
        self._users_by_username: dict[str, object] = {}
        self._users_by_id: dict[str, object] = {}

    async def execute(self, stmt):
        compiled = stmt.compile()
        params = compiled.params
        # Both `User.username == ...` (login/register) and `User.id == ...`
        # (refresh) queries land here; try id first since UUIDs never
        # collide with usernames.
        for value in params.values():
            if value in self._users_by_id:
                return _Result(scalar=self._users_by_id[value])
        username = next(iter(params.values()), None)
        return _Result(scalar=self._users_by_username.get(username))

    def add(self, obj):
        self._users_by_username[obj.username] = obj

    async def flush(self):
        pass

    async def refresh(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)
        if getattr(obj, "is_admin", None) is None:
            obj.is_admin = False
        self._users_by_id[str(obj.id)] = obj
        self._users_by_username[obj.username] = obj


@pytest.fixture
def db_client():
    """TestClient with one shared in-memory user store, and its own cookie
    jar so a login's Set-Cookie is replayed automatically on the next
    request made with the same client (needed for the /refresh tests)."""
    db = _FakeUserDb()
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def _register_and_get_response(client: TestClient, headers: dict | None = None):
    suffix = uuid.uuid4().hex[:10]
    return client.post(
        "/api/v1/auth/register",
        json={"username": f"gate_{suffix}", "password": "Secret123!"},
        headers=headers or {},
    )


class TestLoginTokenGating:
    def test_native_header_gets_tokens_in_body(self, db_client):
        register = _register_and_get_response(db_client, headers={"X-Client-Type": "mobile"})
        assert register.status_code == 201
        username = register.json()["user"]["username"]

        response = db_client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": "Secret123!"},
            headers={"X-Client-Type": "mobile"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["access_token"]
        assert body["refresh_token"]

    def test_web_request_omits_tokens_from_body(self, db_client):
        register = _register_and_get_response(db_client)  # no native signal
        assert register.status_code == 201
        assert register.json()["access_token"] is None
        username = register.json()["user"]["username"]

        response = db_client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": "Secret123!"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["access_token"] is None
        assert body["refresh_token"] is None

    def test_web_request_still_gets_cookies(self, db_client):
        register = _register_and_get_response(db_client)
        username = register.json()["user"]["username"]

        response = db_client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": "Secret123!"},
        )

        set_cookie_headers = response.headers.get_list("set-cookie")
        assert any(h.startswith("token=") and "HttpOnly" in h for h in set_cookie_headers)
        assert any(
            h.startswith("refresh_token=") and "HttpOnly" in h for h in set_cookie_headers
        )

    def test_capacitor_origin_is_treated_as_native(self, db_client):
        """Legacy WebView-based native shell: no custom header, but its
        Origin is one of the fixed native origins CORS always allows."""
        register = _register_and_get_response(
            db_client, headers={"Origin": "capacitor://localhost"}
        )
        username = register.json()["user"]["username"]

        response = db_client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": "Secret123!"},
            headers={"Origin": "capacitor://localhost"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["access_token"]
        assert body["refresh_token"]

    def test_arbitrary_origin_is_not_treated_as_native(self, db_client):
        register = _register_and_get_response(db_client)
        username = register.json()["user"]["username"]

        response = db_client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": "Secret123!"},
            headers={"Origin": "https://evil.example.com"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["access_token"] is None
        assert body["refresh_token"] is None


class TestRefreshTokenGating:
    def test_native_refresh_gets_tokens_in_body(self, db_client):
        register = _register_and_get_response(db_client, headers={"X-Client-Type": "mobile"})
        # TestClient's cookie jar doesn't reliably replay path-scoped cookies
        # (refresh_token is scoped to /api/v1/auth/refresh) across requests,
        # so pass it explicitly -- exactly what a real client with a cookie
        # jar would do automatically.
        refresh_cookie = register.cookies.get("refresh_token")
        assert refresh_cookie

        response = db_client.post(
            "/api/v1/auth/refresh",
            cookies={"refresh_token": refresh_cookie},
            headers={"X-Client-Type": "mobile"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["access_token"]
        assert body["refresh_token"]

    def test_web_refresh_omits_tokens_from_body(self, db_client):
        register = _register_and_get_response(db_client)  # web registration
        refresh_cookie = register.cookies.get("refresh_token")
        assert refresh_cookie

        response = db_client.post(
            "/api/v1/auth/refresh",
            cookies={"refresh_token": refresh_cookie},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["access_token"] is None
        assert body["refresh_token"] is None


class TestOtpVerifyTokenGating:
    """otp/verify doesn't touch the DB the same way as login/register, so
    mock verify_otp directly rather than seed real Redis OTP state."""

    def test_native_otp_verify_gets_tokens_in_body(self, db_client, mock_redis):
        with patch("app.routers.auth.get_redis", return_value=mock_redis), patch(
            "app.routers.auth.verify_otp", return_value=True
        ):
            response = db_client.post(
                "/api/v1/auth/otp/verify",
                json={"phone": "+998901234567", "code": "123456"},
                headers={"X-Client-Type": "mobile"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["access_token"]
        assert body["refresh_token"]

    def test_web_otp_verify_omits_tokens_from_body(self, db_client, mock_redis):
        with patch("app.routers.auth.get_redis", return_value=mock_redis), patch(
            "app.routers.auth.verify_otp", return_value=True
        ):
            response = db_client.post(
                "/api/v1/auth/otp/verify",
                json={"phone": "+998901234567", "code": "123456"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["access_token"] is None
        assert body["refresh_token"] is None

        set_cookie_headers = response.headers.get_list("set-cookie")
        assert any(h.startswith("token=") for h in set_cookie_headers)
        assert any(h.startswith("refresh_token=") for h in set_cookie_headers)
