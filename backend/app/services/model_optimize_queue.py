"""Ask the converter to compress a newly uploaded 3D model.

Best-effort on purpose: the upload has already succeeded, and the original file
is served until (or unless) the compressed copy exists. A broker that is down
costs the speed-up, never the upload.
"""
from __future__ import annotations

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import run_after_commit

log = structlog.get_logger(__name__)


def enqueue_optimize(kind: str, model_id: str) -> None:
    """Queue `optimize_model_glb` for one model; never raises."""
    try:
        from app.tasks import media

        media.optimize_model_glb.delay(kind, model_id)
    except Exception as exc:  # noqa: BLE001 — broker down, Celery missing: keep the upload
        log.warning("glb_optimize_enqueue_failed", kind=kind, model_id=model_id, error=str(exc))


def enqueue_optimize_after_commit(db: AsyncSession, kind: str, model_id: str) -> None:
    """The same, once this request's transaction has committed — before that the
    task could look the row up and not find it."""
    async def _hook() -> None:
        enqueue_optimize(kind, model_id)

    run_after_commit(db, _hook)
