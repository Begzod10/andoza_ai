"""Auth unit tests — no database or network required.

Tests cover:
  - verify_refresh_token: valid refresh token, access token rejected, expired token
  - verify_token: valid access token, refresh token rejected
  - verify_otp: correct code returns True, wrong code returns False, missing key returns False
  - _set_auth_cookie / _set_refresh_cookie: cookie attributes (httponly, samesite, path)
  - OTP per-IP rate limit: 11th request raises 429
"""
from __future__ import annotations

import importlib.util
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Response
from fastapi.testclient import TestClient
from jose import jwt

# ---------------------------------------------------------------------------
# Minimal environment so Settings() can instantiate without real DB/secrets
# ---------------------------------------------------------------------------
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only-32chars!!")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

# ---------------------------------------------------------------------------
# Imports under test (must come after env is set)
# ---------------------------------------------------------------------------
from app.core.security import (
    ALGORITHM,
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
    verify_token,
)
from app.core.sms import verify_otp


def _load_auth_module():
    """Load app/routers/auth.py directly, bypassing routers/__init__.py
    which would pull in heavy optional dependencies (celery, boto3, etc.)."""
    auth_path = Path(__file__).parent.parent / "app" / "routers" / "auth.py"
    spec = importlib.util.spec_from_file_location("app.routers.auth", auth_path)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    # Pre-register so transitive imports within auth.py can find it
    sys.modules.setdefault("app.routers.auth", mod)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


_auth_mod = _load_auth_module()
_set_auth_cookie = _auth_mod._set_auth_cookie
_set_refresh_cookie = _auth_mod._set_refresh_cookie


class FakeRedis:
    """Simulates the subset of the Redis API the rate-limit helpers use,
    backed by a plain in-memory dict — no real Redis needed."""

    def __init__(self):
        self.counters: dict[str, int] = {}

    async def get(self, key: str):
        # decode_responses=True → return strings, not bytes
        val = self.counters.get(key, 0)
        return str(val) if val else None

    async def incr(self, key: str) -> int:
        self.counters[key] = self.counters.get(key, 0) + 1
        return self.counters[key]

    async def expire(self, key: str, ttl: int) -> None:
        pass  # no-op in tests

    async def set(self, key: str, value: str, ex: int = 0) -> None:
        self.counters[key] = value  # type: ignore[assignment]

    def pipeline(self):
        return FakePipeline(self)


class FakePipeline:
    def __init__(self, redis: "FakeRedis"):
        self._redis = redis
        self._cmds: list = []

    async def incr(self, key: str) -> None:
        self._cmds.append(("incr", key))

    async def expire(self, key: str, ttl: int) -> None:
        self._cmds.append(("expire", key, ttl))

    async def execute(self):
        results = []
        for cmd in self._cmds:
            if cmd[0] == "incr":
                results.append(await self._redis.incr(cmd[1]))
            else:
                results.append(None)
        self._cmds.clear()
        return results


class FakeScalarResult:
    """Stands in for SQLAlchemy's Result when the query should find nothing —
    both login and register look up an existing user by username first."""

    def scalar_one_or_none(self):
        return None


class FakeDb:
    """Minimal AsyncSession stand-in: no user ever exists, so register()
    proceeds to create one and login() falls through to 'invalid credentials'.
    flush() fills in the server-side defaults (id, created_at, ...) that a
    real INSERT would generate, so UserOut.model_validate() has what it needs."""

    def __init__(self):
        self._pending: list = []

    async def execute(self, *args, **kwargs):
        return FakeScalarResult()

    def add(self, obj) -> None:
        self._pending.append(obj)

    async def flush(self) -> None:
        for obj in self._pending:
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            if getattr(obj, "created_at", None) is None:
                obj.created_at = datetime.now(timezone.utc)
            if getattr(obj, "is_active", None) is None:
                obj.is_active = True
            if getattr(obj, "is_admin", None) is None:
                obj.is_admin = False
        self._pending.clear()


# ===========================================================================
# security.py — verify_refresh_token
# ===========================================================================


class TestVerifyRefreshToken:
    def test_valid_refresh_token_returns_subject(self):
        token = create_refresh_token("user-123")
        result = verify_refresh_token(token)
        assert result == "user-123"

    def test_access_token_rejected_by_verify_refresh(self):
        """An access token must NOT be accepted as a refresh token."""
        access = create_access_token("user-123")
        result = verify_refresh_token(access)
        assert result is None

    def test_expired_refresh_token_returns_none(self):
        from app.config import settings

        payload = {
            "sub": "user-456",
            "exp": int(time.time()) - 1,  # already expired
            "type": "refresh",
        }
        expired_token = jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)
        result = verify_refresh_token(expired_token)
        assert result is None

    def test_tampered_token_returns_none(self):
        token = create_refresh_token("user-789")
        tampered = token[:-4] + "XXXX"
        result = verify_refresh_token(tampered)
        assert result is None

    def test_random_string_returns_none(self):
        result = verify_refresh_token("not.a.jwt")
        assert result is None


# ===========================================================================
# security.py — verify_token (access)
# ===========================================================================


class TestVerifyToken:
    def test_valid_access_token_returns_subject(self):
        token = create_access_token("user-abc")
        result = verify_token(token)
        assert result == "user-abc"

    def test_refresh_token_rejected_by_verify_token(self):
        """A refresh token must NOT be accepted as an access token."""
        refresh = create_refresh_token("user-abc")
        result = verify_token(refresh)
        assert result is None

    def test_expired_access_token_returns_none(self):
        from app.config import settings

        payload = {
            "sub": "user-exp",
            "exp": int(time.time()) - 1,
            "type": "access",
        }
        expired_token = jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)
        result = verify_token(expired_token)
        assert result is None


# ===========================================================================
# sms.py — verify_otp (mocked Redis)
# ===========================================================================


class TestVerifyOtp:
    @pytest.mark.asyncio
    async def test_correct_code_returns_true(self):
        # Redis is configured with decode_responses=True so values are plain strings.
        redis_mock = AsyncMock()
        redis_mock.get.return_value = "123456"
        redis_mock.delete = AsyncMock()

        result = await verify_otp("+998901234567", "123456", redis_mock)

        assert result is True
        redis_mock.delete.assert_called_once_with("otp:+998901234567")

    @pytest.mark.asyncio
    async def test_wrong_code_returns_false(self):
        redis_mock = AsyncMock()
        redis_mock.get.return_value = "123456"

        result = await verify_otp("+998901234567", "999999", redis_mock)

        assert result is False
        redis_mock.delete.assert_not_called()

    @pytest.mark.asyncio
    async def test_missing_key_returns_false(self):
        redis_mock = AsyncMock()
        redis_mock.get.return_value = None

        result = await verify_otp("+998901234567", "123456", redis_mock)

        assert result is False

    @pytest.mark.asyncio
    async def test_constant_time_comparison_used(self):
        """Verify that secrets.compare_digest is used (timing-safe)."""
        import secrets as _secrets

        redis_mock = AsyncMock()
        redis_mock.get.return_value = "111111"

        with patch.object(_secrets, "compare_digest", wraps=_secrets.compare_digest) as mock_cd:
            await verify_otp("+998901234567", "222222", redis_mock)
            mock_cd.assert_called_once()


# ===========================================================================
# auth.py — cookie helper attributes
# ===========================================================================


class TestCookieHelpers:
    def test_set_auth_cookie_is_httponly(self):
        response = Response()
        token = create_access_token("u1")
        _set_auth_cookie(response, token)

        raw = response.headers.get("set-cookie", "")
        assert "HttpOnly" in raw
        assert "token=" in raw

    def test_set_refresh_cookie_scoped_to_refresh_path(self):
        response = Response()
        token = create_refresh_token("u1")
        _set_refresh_cookie(response, token)

        raw = response.headers.get("set-cookie", "")
        assert "HttpOnly" in raw
        assert "refresh_token=" in raw
        assert "/api/v1/auth/refresh" in raw

    def test_set_auth_cookie_samesite_lax(self):
        response = Response()
        _set_auth_cookie(response, create_access_token("u1"))
        raw = response.headers.get("set-cookie", "")
        assert "SameSite=lax" in raw


# ===========================================================================
# OTP per-IP rate limit — integration-lite with mocked Redis + FastAPI
# ===========================================================================


class TestOtpIpRateLimit:
    """Simulate 11 OTP requests from the same IP and assert the 11th returns 429."""

    def _make_app(self):
        """Build a minimal FastAPI app that wires the auth router with mocked deps.

        We load the auth module directly (not via routers/__init__.py) to avoid
        pulling in heavy optional deps like celery and boto3.
        """
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(_auth_mod.router, prefix="/api/v1")
        return app

    def test_eleventh_request_returns_429(self):
        import asyncio

        # We use a plain dict to simulate Redis counters (no real Redis needed).
        counters: dict[str, int] = {}

        class FakeRedis:
            async def get(self, key: str):
                # decode_responses=True → return strings, not bytes
                val = counters.get(key, 0)
                return str(val) if val else None

            async def incr(self, key: str) -> int:
                counters[key] = counters.get(key, 0) + 1
                return counters[key]

            async def expire(self, key: str, ttl: int) -> None:
                pass  # no-op in tests

            async def set(self, key: str, value: str, ex: int = 0) -> None:
                counters[key] = value  # type: ignore[assignment]

            def pipeline(self):
                return FakePipeline(self)

        class FakePipeline:
            def __init__(self, redis: FakeRedis):
                self._redis = redis
                self._cmds: list = []

            async def incr(self, key: str) -> None:
                self._cmds.append(("incr", key))

            async def expire(self, key: str, ttl: int) -> None:
                self._cmds.append(("expire", key, ttl))

            async def execute(self):
                results = []
                for cmd in self._cmds:
                    if cmd[0] == "incr":
                        results.append(await self._redis.incr(cmd[1]))
                    else:
                        results.append(None)
                self._cmds.clear()
                return results

        fake_redis = FakeRedis()

        # Use patch.object on the already-loaded module object to avoid triggering
        # app/routers/__init__.py which imports heavy optional deps (celery, boto3).
        with patch.object(_auth_mod, "get_redis", return_value=fake_redis):
            with patch.object(_auth_mod, "send_otp", new=AsyncMock(return_value=True)):
                with patch.object(_auth_mod, "store_otp", new=AsyncMock()):
                    app = self._make_app()
                    client = TestClient(app, raise_server_exceptions=False)

                    responses = []
                    for i in range(11):
                        # Use a unique phone per request so the per-phone limit (3)
                        # is never triggered — we are testing only the per-IP limit (10).
                        phone = f"+99890{i:07d}"
                        r = client.post(
                            "/api/v1/auth/otp/request",
                            json={"phone": phone},
                            headers={"X-Real-IP": "192.168.1.1"},
                        )
                        responses.append(r.status_code)

        # First 10 should succeed (200), the 11th should be 429
        assert all(s == 200 for s in responses[:10]), f"Expected 200s, got {responses[:10]}"
        assert responses[10] == 429, f"Expected 429 on request 11, got {responses[10]}"


# ===========================================================================
# Password login/register rate limits — mocked Redis + FastAPI, mocked DB
# ===========================================================================


def _make_router_only_app():
    """Minimal FastAPI app wiring just the auth router, loaded directly to
    avoid app/routers/__init__.py's heavy optional deps (celery, boto3)."""
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(_auth_mod.router, prefix="/api/v1")
    return app


class TestLoginRateLimit:
    """POST /api/v1/auth/login is throttled by IP and by username, independently."""

    def test_eleventh_attempt_for_same_username_returns_429(self):
        """Per-username lockout (limit 10): repeated attempts against one
        account get 429 on the 11th try, even though the per-IP limit (20)
        has not been reached yet."""
        fake_redis = FakeRedis()
        fake_db = FakeDb()

        with patch.object(_auth_mod, "get_redis", return_value=fake_redis):
            app = _make_router_only_app()
            app.dependency_overrides[_auth_mod.get_db] = lambda: fake_db
            client = TestClient(app, raise_server_exceptions=False)

            responses = []
            bodies = []
            for _ in range(11):
                r = client.post(
                    "/api/v1/auth/login",
                    json={"username": "victim_user", "password": "wrong-pass"},
                )
                responses.append(r.status_code)
                bodies.append(r.json())

        # First 10 reach the credential check and fail with 401 (no such user
        # in FakeDb); the 11th is blocked by the per-username rate limit.
        assert all(s == 401 for s in responses[:10]), f"Expected 401s, got {responses[:10]}"
        assert responses[10] == 429, f"Expected 429 on attempt 11, got {responses[10]}"
        assert "urinish" in bodies[10]["detail"].lower()

    def test_twentyfirst_attempt_from_same_ip_returns_429(self):
        """Per-IP throttle (limit 20): spraying many *different* usernames
        from one IP gets 429 on the 21st attempt, even though each username
        is only tried once (well under the per-username limit of 10)."""
        fake_redis = FakeRedis()
        fake_db = FakeDb()

        with patch.object(_auth_mod, "get_redis", return_value=fake_redis):
            app = _make_router_only_app()
            app.dependency_overrides[_auth_mod.get_db] = lambda: fake_db
            client = TestClient(app, raise_server_exceptions=False)

            responses = []
            for i in range(21):
                r = client.post(
                    "/api/v1/auth/login",
                    json={"username": f"user_{i}", "password": "wrong-pass"},
                )
                responses.append(r.status_code)

        assert all(s == 401 for s in responses[:20]), f"Expected 401s, got {responses[:20]}"
        assert responses[20] == 429, f"Expected 429 on attempt 21, got {responses[20]}"


class TestRegisterRateLimit:
    """POST /api/v1/auth/register is throttled per-IP to block mass account creation."""

    def test_twentyfirst_registration_from_same_ip_returns_429(self):
        fake_redis = FakeRedis()
        fake_db = FakeDb()

        with patch.object(_auth_mod, "get_redis", return_value=fake_redis):
            app = _make_router_only_app()
            app.dependency_overrides[_auth_mod.get_db] = lambda: fake_db
            client = TestClient(app, raise_server_exceptions=False)

            responses = []
            for i in range(21):
                r = client.post(
                    "/api/v1/auth/register",
                    json={
                        "username": f"newuser_{i}",
                        "password": "SomePassword123",
                    },
                )
                responses.append(r.status_code)

        assert all(s == 201 for s in responses[:20]), f"Expected 201s, got {responses[:20]}"
        assert responses[20] == 429, f"Expected 429 on registration 21, got {responses[20]}"
