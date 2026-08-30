from __future__ import annotations

import asyncio
import json
from typing import Any, Optional

from redis.asyncio import Redis

from app.config import settings

_redis_client: Optional[Redis] = None
_redis_client_loop: Optional[asyncio.AbstractEventLoop] = None


def get_redis() -> Redis:
    """Return (and lazily create) the shared async Redis client singleton.

    A connection pool is bound to the event loop that was running when it
    was first used. In production there is exactly one loop for the whole
    process lifetime, so this is a plain singleton. Under pytest, each
    `TestClient` instance can spin up its own loop, so a client created
    under a now-closed loop from a previous test would blow up with
    "Event loop is closed" on the next test that calls get_redis() from a
    new one. Recreate the client whenever the running loop has changed —
    the same rationale as the NullPool workaround for the DB engine in
    app/database.py, applied to Redis instead of SQLAlchemy connections.
    """
    global _redis_client, _redis_client_loop
    try:
        current_loop: Optional[asyncio.AbstractEventLoop] = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _redis_client is None or (
        current_loop is not None and current_loop is not _redis_client_loop
    ):
        _redis_client = Redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        _redis_client_loop = current_loop
    return _redis_client


async def cache_get(key: str) -> Optional[Any]:
    """Return the cached value for *key*, or *None* if missing / expired."""
    redis = get_redis()
    raw = await redis.get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw


async def cache_set(key: str, value: Any, ttl: int = 300) -> None:
    """Serialize *value* to JSON and store it under *key* with *ttl* seconds."""
    redis = get_redis()
    serialized = json.dumps(value, default=str)
    await redis.set(key, serialized, ex=ttl)
