from __future__ import annotations

import sys
from typing import AsyncGenerator, Awaitable, Callable

import structlog
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import settings

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------
# Under pytest, a real request-driven test (TestClient with no get_db
# override) can end up making two separate calls that each get their own
# asyncio event loop — Starlette's TestClient doesn't guarantee the same
# loop lives across two .post()/.get() calls, let alone across two test
# functions. A pooled connection is permanently bound to the loop that
# created it, so reusing one from an already-closed loop raises "Event loop
# is closed" / "attached to a different loop" on whichever call comes next.
# NullPool opens a fresh connection per checkout and closes it right after,
# so there is never a connection left over to hand back to a dead loop.
# `"pytest" in sys.modules` is set the instant the pytest process starts —
# reliable even at collection time, unlike an env var a workflow might set
# differently across environments (ENVIRONMENT=development in this repo's
# own CI, not "test").
_UNDER_PYTEST = "pytest" in sys.modules

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.ENVIRONMENT == "development",
    pool_pre_ping=True,
    **({"poolclass": NullPool} if _UNDER_PYTEST else {"pool_size": 10, "max_overflow": 20}),
)

# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# ---------------------------------------------------------------------------
# Declarative base — all models inherit from this
# ---------------------------------------------------------------------------


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Post-commit hooks
# ---------------------------------------------------------------------------
# Handlers don't commit — get_db() does, after the handler has returned. Work
# that is only correct once the write is durable (cache invalidation, deleting
# the files a just-deleted row pointed at) therefore cannot run inline in the
# handler: a concurrent reader arriving between an inline invalidation and the
# commit repopulates the cache from pre-write data, and that entry then lives
# for the full catalog TTL. Register it here instead and get_db() runs it on
# the far side of its commit.
_AFTER_COMMIT_HOOKS = "after_commit_hooks"

AfterCommitHook = Callable[[], Awaitable[None]]


def run_after_commit(session: AsyncSession, hook: AfterCommitHook) -> None:
    """Queue *hook* to run once this request's transaction has committed.

    *hook* is a zero-argument coroutine FUNCTION, not a coroutine — nothing is
    awaited if the request rolls back instead, and an un-awaited coroutine
    would only produce a "never awaited" warning. Hooks run in registration
    order, and a hook that raises is logged and skipped (see
    _run_after_commit_hooks) rather than failing the already-committed write.
    """
    session.info.setdefault(_AFTER_COMMIT_HOOKS, []).append(hook)


async def _run_after_commit_hooks(session: AsyncSession) -> None:
    """Run (and clear) the session's queued post-commit hooks — fail-open.

    The transaction is already durable by the time we get here, so a hook
    failure cannot un-write anything: raising would produce a 500 that lies to
    the admin about a row that exists. Log it loudly instead and let the
    request succeed. The cost of that choice is bounded staleness — a failed
    catalog invalidation serves pre-write data until the entry's TTL expires —
    so `after_commit_hook_failed` is the line to alert on.
    """
    hooks: list[AfterCommitHook] = session.info.pop(_AFTER_COMMIT_HOOKS, [])
    for hook in hooks:
        try:
            await hook()
        except Exception as exc:
            logger.error(
                "after_commit_hook_failed",
                hook=getattr(hook, "__name__", None) or repr(hook),
                error=str(exc),
                exc_info=True,
            )


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session and guarantee cleanup."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        else:
            # `else`, not the tail of `try`: only reached when the commit
            # above succeeded. Verified empirically against the installed
            # FastAPI (0.139.2) — success teardown is commit -> hooks ->
            # close, while both a raised HTTPException and an unhandled error
            # still give rollback -> close with no hooks run.
            await _run_after_commit_hooks(session)
        finally:
            await session.close()
