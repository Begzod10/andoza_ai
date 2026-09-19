"""
Pytest fixtures and configuration for AndozaAI backend tests.

Establishes environment variables before any app module imports.
Provides reusable mocks for external services (OpenAI, Redis, Meshy).
"""
import os
import tempfile
from unittest.mock import AsyncMock

import pytest
from fakeredis import FakeServer
from fakeredis.aioredis import FakeRedis

# ============================================================================
# CRITICAL: Set test environment variables BEFORE importing app modules
# This ensures app/config.py Settings() can instantiate without real DB/keys
# ============================================================================
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only-32chars!!")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("AI_FEATURES_ENABLED", "false")
os.environ.setdefault("OPENAI_API_KEY", "sk-test-key-not-real")
os.environ.setdefault("MESHY_API_KEY", "meshy-test-key-not-real")
os.environ.setdefault("ENVIRONMENT", "test")

# MEDIA_ROOT defaults to /app/media — the path inside the Docker image (see
# app/config.py). On a developer machine that directory is unwritable, and
# create_app() mkdir()s it at import time, so every test file that imports
# app.main used to die during collection unless MEDIA_ROOT was exported by
# hand. Point it at a throwaway directory instead.
if not os.environ.get("MEDIA_ROOT"):
    os.environ["MEDIA_ROOT"] = tempfile.mkdtemp(prefix="andoza-test-media-")


# ============================================================================
# In-memory Redis (autouse — no server needed to run the suite)
# ============================================================================


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):
    """Back app.core.cache.get_redis() with an in-memory Redis.

    Rate limiting, OTP storage and the catalog cache invalidation all go
    through get_redis(), so without this the suite only passes on a machine
    that happens to have a Redis listening on localhost. Each test gets its
    own FakeServer, so cached keys and rate-limit counters cannot leak from
    one test into the next.
    """
    from app.core import cache

    server = FakeServer()

    class _FakeRedisFactory:
        """Stands in for redis.asyncio.Redis inside app.core.cache."""

        @staticmethod
        def from_url(_url: str, **kwargs):
            return FakeRedis(server=server, **kwargs)

    monkeypatch.setattr(cache, "Redis", _FakeRedisFactory)
    # get_redis() caches a client per event loop; drop any client built
    # against the real Redis (and let monkeypatch put the globals back).
    monkeypatch.setattr(cache, "_redis_client", None)
    monkeypatch.setattr(cache, "_redis_client_loop", None)
    yield


# ============================================================================
# Mock Fixtures (for unit tests that mock external services)
# ============================================================================


@pytest.fixture
def mock_redis():
    """Mock Redis async client."""
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock(return_value=True)
    redis.delete = AsyncMock(return_value=1)
    redis.incr = AsyncMock(return_value=1)
    redis.expire = AsyncMock(return_value=True)

    # Mock pipeline for batched operations
    pipe = AsyncMock()
    pipe.incr = AsyncMock(return_value=pipe)
    pipe.expire = AsyncMock(return_value=pipe)
    pipe.execute = AsyncMock(return_value=[1, True])
    # pipeline() is sync, not async
    from unittest.mock import MagicMock
    redis.pipeline = MagicMock(return_value=pipe)

    return redis


@pytest.fixture
def mock_openai():
    """Mock OpenAI AsyncOpenAI client."""
    client = AsyncMock()
    client.chat.completions.create = AsyncMock(
        return_value=AsyncMock(
            choices=[AsyncMock(message=AsyncMock(content="test response"))]
        )
    )
    return client


@pytest.fixture
def mock_meshy():
    """Mock Meshy API client."""
    return AsyncMock()


# ============================================================================
# Markers for test categorization
# ============================================================================


def pytest_configure(config):
    """Register pytest markers."""
    config.addinivalue_line("markers", "unit: unit tests")
    config.addinivalue_line("markers", "integration: integration tests")
    config.addinivalue_line("markers", "slow: slow tests")
