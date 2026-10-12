"""Send a push notification to all of a user's phones through Firebase (FCM)."""
from __future__ import annotations

import logging
import os
import threading

from celery_app import app

logger = logging.getLogger(__name__)

_init_lock = threading.Lock()
_firebase_ready = False
_warned_disabled = False


def _ensure_firebase() -> bool:
    """Initialise firebase_admin once per worker process. False = pushes are off
    (no credentials file configured, or it does not exist)."""
    global _firebase_ready, _warned_disabled
    if _firebase_ready:
        return True
    from app.config import settings

    path = settings.FIREBASE_CREDENTIALS_FILE
    if not path or not os.path.isfile(path):
        if not _warned_disabled:
            _warned_disabled = True
            logger.warning("push disabled: FIREBASE_CREDENTIALS_FILE is empty or missing")
        return False
    with _init_lock:
        if not _firebase_ready:
            import firebase_admin
            from firebase_admin import credentials

            firebase_admin.initialize_app(credentials.Certificate(path))
            _firebase_ready = True
    return True


async def _open_session():
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.config import settings

    engine = create_async_engine(settings.DATABASE_URL)  # own process/loop
    return engine, async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _load_tokens(user_id: str) -> list[tuple[str, str]]:
    """``(token, locale)`` of every phone registered for the user."""
    import uuid

    from sqlalchemy import select

    from app.models.device_token import DeviceToken

    engine, Session = await _open_session()
    try:
        async with Session() as db:
            rows = await db.execute(
                select(DeviceToken.token, DeviceToken.locale).where(DeviceToken.user_id == uuid.UUID(user_id))
            )
            return [(t, loc) for t, loc in rows.all()]
    finally:
        await engine.dispose()


async def _delete_tokens(tokens: list[str]) -> None:
    from sqlalchemy import delete

    from app.models.device_token import DeviceToken

    engine, Session = await _open_session()
    try:
        async with Session() as db:
            await db.execute(delete(DeviceToken).where(DeviceToken.token.in_(tokens)))
            await db.commit()
    finally:
        await engine.dispose()


def _is_dead_token(exc: Exception | None) -> bool:
    if exc is None:
        return False
    from firebase_admin import exceptions, messaging

    if isinstance(exc, messaging.UnregisteredError):
        return True
    return isinstance(exc, exceptions.InvalidArgumentError) and "token" in str(exc).lower()


@app.task(
    name="app.tasks.push.send_push",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    queue="default",
)
def send_push(self, user_id: str, kind: str, params: dict) -> dict:
    """Push *kind* to every phone of *user_id*, in each phone's own language.
    Tokens FCM reports as dead are deleted. Returns ``{"sent": n, "removed": m}``,
    or ``{"status": "disabled"}`` when Firebase is not configured."""
    import asyncio

    from firebase_admin import exceptions, messaging

    from app.services.push_messages import build_message

    if not _ensure_firebase():
        return {"status": "disabled"}

    devices = asyncio.run(_load_tokens(user_id))
    if not devices:
        return {"sent": 0, "removed": 0}

    messages = []
    for token, locale in devices:
        title, body, route = build_message(kind, params or {}, locale)
        messages.append(
            messaging.Message(
                token=token,
                notification=messaging.Notification(title=title, body=body),
                data={"kind": kind, "route": route},
                android=messaging.AndroidConfig(
                    priority="high",
                    notification=messaging.AndroidNotification(channel_id="andoza_updates"),
                ),
            )
        )

    try:
        batch = messaging.send_each(messages)
    except (exceptions.UnavailableError, exceptions.InternalError) as exc:
        raise self.retry(exc=exc)

    dead = [
        token
        for (token, _), resp in zip(devices, batch.responses)
        if not resp.success and _is_dead_token(resp.exception)
    ]
    if dead:
        asyncio.run(_delete_tokens(dead))
    sent = sum(1 for r in batch.responses if r.success)
    logger.info("push kind=%s user=%s sent=%d removed=%d", kind, user_id, sent, len(dead))
    return {"sent": sent, "removed": len(dead)}
