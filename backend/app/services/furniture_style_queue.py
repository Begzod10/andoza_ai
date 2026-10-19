"""Ask the AI to set the styles of an unstyled furniture model.

Best-effort on purpose: the upload has already succeeded, and a model without
styles is still a working model. A broker that is down costs the AI pass (the
admin can run it again later), never the upload.
"""
from __future__ import annotations

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import run_after_commit

log = structlog.get_logger(__name__)


def enqueue_style(furniture_id: str) -> None:
    """Queue `classify_furniture_styles_task` for one model; never raises."""
    try:
        from app.tasks import furniture_styles

        furniture_styles.classify_furniture_styles_task.delay(furniture_id)
    except Exception as exc:  # noqa: BLE001 — broker down, Celery missing: keep the upload
        log.warning("furniture_style_enqueue_failed", furniture_id=furniture_id, error=str(exc))


def enqueue_style_after_commit(db: AsyncSession, furniture_id: str) -> None:
    """The same, once this request's transaction has committed — before that the
    task could look the row up and not find it."""
    async def _hook() -> None:
        enqueue_style(furniture_id)

    run_after_commit(db, _hook)
