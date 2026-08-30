from __future__ import annotations

import sys
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import settings

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
        finally:
            await session.close()
