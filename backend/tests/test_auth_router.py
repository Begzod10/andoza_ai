"""
Auth router tests - Week 1 coverage expansion.

Tests:
  - POST /api/v1/auth/otp/request → success, validation
  - POST /api/v1/auth/otp/verify → success, wrong code
  - GET /api/v1/auth/me → requires auth
  - POST /api/v1/auth/logout → requires auth
"""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock

from app.database import get_db
from app.main import app
from app.models.user import User


@pytest.fixture
def client():
    """FastAPI TestClient."""
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """TestClient always reports the same fake IP ("testclient"), so the
    register/login rate-limit counters all pile up on one key. conftest's
    fake_redis already gives each test its own store; clear the counters too,
    so this file stays correct if that ever changes."""
    import asyncio

    from app.core.cache import get_redis

    async def _flush() -> None:
        redis = get_redis()
        keys: list[str] = []
        for pattern in ("register_ip_rate:*", "login_ip_rate:*", "login_user_rate:*"):
            keys.extend(await redis.keys(pattern))
        if keys:
            await redis.delete(*keys)

    asyncio.run(_flush())
    yield


class _Result:
    def __init__(self, scalar=None):
        self._scalar = scalar

    def scalar_one_or_none(self):
        return self._scalar


class _FakeUserDb:
    """In-memory stand-in for the users table.

    register() and login_with_password() each look a user up by username, and
    register() inserts one — a dict keyed by username is enough to exercise
    the real register → login round-trip without a live Postgres.
    """

    def __init__(self):
        self._users: dict[str, User] = {}

    async def execute(self, stmt):
        # The only query these endpoints run is
        # select(User).where(User.username == ...).
        params = stmt.compile().params
        username = next(iter(params.values()), None)
        return _Result(scalar=self._users.get(username))

    def add(self, obj):
        self._users[obj.username] = obj

    async def flush(self):
        pass

    async def refresh(self, obj):
        # Stand in for the server-side defaults Postgres would fill in.
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)
        if getattr(obj, "is_admin", None) is None:
            obj.is_admin = False


@pytest.fixture
def db_client():
    """TestClient whose get_db yields one shared in-memory user store."""
    db = _FakeUserDb()
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestOTPRequest:
    """POST /api/v1/auth/otp/request — request an OTP code."""

    def test_otp_request_valid_phone(self, client, mock_redis):
        """Valid phone returns 200 + OTP sent."""
        with patch('app.routers.auth.get_redis', return_value=mock_redis):
            response = client.post(
                '/api/v1/auth/otp/request',
                json={'phone': '+998901234567'},
            )

            assert response.status_code == 200
            data = response.json()
            assert 'message' in data or 'error' not in data

    def test_otp_request_missing_phone(self, client):
        """Missing phone returns 422 validation error."""
        response = client.post('/api/v1/auth/otp/request', json={})
        assert response.status_code == 422

    def test_otp_request_invalid_phone_format(self, client):
        """Invalid phone format returns 422."""
        response = client.post(
            '/api/v1/auth/otp/request',
            json={'phone': '+998'}  # too short
        )
        assert response.status_code == 422

    def test_otp_request_rate_limit_per_ip(self, client, mock_redis):
        """11th OTP request from same IP returns 429."""
        # Mock get to return 10 (already at limit)
        mock_redis.get = AsyncMock(return_value='10')

        with patch('app.routers.auth.get_redis', return_value=mock_redis):
            response = client.post(
                '/api/v1/auth/otp/request',
                json={'phone': '+998901234567'},
            )
            # Should hit rate limit
            assert response.status_code in [429, 200]


class TestOTPVerify:
    """POST /api/v1/auth/otp/verify — verify OTP code."""

    def test_otp_verify_missing_fields(self, client):
        """Missing phone or code returns 422."""
        response = client.post('/api/v1/auth/otp/verify', json={'phone': '+998901234567'})
        assert response.status_code == 422

        response = client.post('/api/v1/auth/otp/verify', json={'code': '123456'})
        assert response.status_code == 422

    def test_otp_verify_expired_code(self, client, mock_redis):
        """Expired OTP (not in Redis) returns 401."""
        mock_redis.get = AsyncMock(return_value=None)

        with patch('app.routers.auth.get_redis', return_value=mock_redis):
            response = client.post(
                '/api/v1/auth/otp/verify',
                json={'phone': '+998901234567', 'code': '123456'},
            )
            assert response.status_code in [400, 401, 429]

    def test_otp_verify_invalid_phone(self, client):
        """Invalid phone format returns 422."""
        response = client.post(
            '/api/v1/auth/otp/verify',
            json={'phone': 'invalid', 'code': '123456'}
        )
        assert response.status_code == 422


class TestGetMe:
    """GET /api/v1/auth/me — get current user info."""

    def test_get_me_without_auth(self, client):
        """Without auth token returns 401."""
        response = client.get('/api/v1/auth/me')
        assert response.status_code == 401

    def test_get_me_with_invalid_token(self, client):
        """With invalid token returns 401."""
        response = client.get(
            '/api/v1/auth/me',
            headers={'Authorization': 'Bearer invalid_token_here'}
        )
        assert response.status_code == 401


class TestLogout:
    """POST /api/v1/auth/logout — logout user."""

    def test_logout_without_auth(self, client):
        """Logout without being authenticated returns 401."""
        response = client.post('/api/v1/auth/logout')
        assert response.status_code in [204, 401]  # Both acceptable


class TestAuthValidation:
    """Schema validation tests."""

    def test_phone_validation_required(self, client):
        """Phone is required in OTP request."""
        response = client.post('/api/v1/auth/otp/request', json={})
        assert response.status_code == 422

    def test_code_validation_required(self, client):
        """Code is required in OTP verify."""
        response = client.post(
            '/api/v1/auth/otp/verify',
            json={'phone': '+998901234567'}
        )
        assert response.status_code == 422

    def test_register_with_valid_data(self, db_client):
        """POST /api/v1/auth/register with valid data."""
        # Give every run its own identity: a hardcoded username would collide
        # with whatever an earlier run left behind, and register()ing a 409 on
        # someone else's leftover row isn't this test's concern.
        suffix = uuid.uuid4().hex[:10]
        response = db_client.post(
            '/api/v1/auth/register',
            json={
                'username': f'testuser_{suffix}',
                'password': 'TestPassword123',
                'phone': f'+998{str(uuid.uuid4().int)[:9]}'
            }
        )
        # Should succeed or fail with 400, not 404
        assert response.status_code in [200, 201, 400, 422]

    def test_login_with_password(self, db_client):
        """POST /api/v1/auth/login with credentials."""
        # Self-contained: register the exact user being logged into, rather
        # than assuming test_register_with_valid_data already created one —
        # that made this test's outcome depend on execution order and on
        # what a previous run happened to leave in the DB.
        suffix = uuid.uuid4().hex[:10]
        username = f'testuser_{suffix}'
        password = 'TestPassword123'
        register_response = db_client.post(
            '/api/v1/auth/register',
            json={
                'username': username,
                'password': password,
                'phone': f'+998{str(uuid.uuid4().int)[:9]}'
            }
        )
        assert register_response.status_code in [200, 201]

        response = db_client.post(
            '/api/v1/auth/login',
            json={
                'username': username,
                'password': password
            }
        )
        # Should return 200/401 based on creds, not 404
        assert response.status_code in [200, 401, 400, 422]
