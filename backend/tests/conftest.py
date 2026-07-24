"""
Pytest fixtures and configuration for UyVision backend tests.

Establishes environment variables before any app module imports.
Provides reusable mocks for external services (OpenAI, Redis, Meshy).
"""
import os
from unittest.mock import AsyncMock

import pytest

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
