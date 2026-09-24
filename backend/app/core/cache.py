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


async def cache_delete_prefix(prefix: str) -> None:
    """Delete every cached key starting with *prefix*.

    A catalog-style GET (materials, ustalar) caches its filtered result sets
    under keys like "ustalar:{category}:{district}" with no way to know in
    advance which combinations were ever queried — so a write that should
    invalidate them (an admin create/update/delete) scans for every key
    under the entity's prefix rather than guessing the exact key(s) touched.
    Call this after any admin write to an entity whose public list caches.

    Call it POST-commit, via database.run_after_commit(), never inline in a
    handler: handlers only flush and get_db() commits after they return, so an
    inline invalidation leaves a window in which a concurrent read repopulates
    the cache from pre-write data — and that stale entry then survives the
    full _CATALOG_CACHE_TTL of 10 minutes.

    Still deliberately NOT wrapped in a try/except: this function stays honest
    about failing, and the policy lives at the seam that owns it. Earlier this
    was argued the other way — a raise here rolled the pending write back, so
    the 500 truthfully meant "nothing changed" — but that argument depended on
    running pre-commit and no longer holds. Running after the commit, a raise
    cannot un-write anything, so _run_after_commit_hooks() logs it
    (`after_commit_hook_failed`) and lets the request succeed: the write is
    durable, and the public list may serve pre-write data until the entry's
    TTL expires. The corresponding invariant is now the mirror of the old one:
    since the commit has already happened, irreversible non-transactional work
    (deleting stored files) belongs in the same post-commit phase, not in the
    handler body where a failed commit would strand it.
    """
    redis = get_redis()
    keys = [key async for key in redis.scan_iter(match=f"{prefix}*")]
    if keys:
        await redis.delete(*keys)
