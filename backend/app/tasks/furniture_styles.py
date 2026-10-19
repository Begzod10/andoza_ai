"""Setting furniture styles with the AI, in the background.

Only furniture nobody styled (`styles_source IS NULL`) is touched, and the write
is conditional, so a style set by hand while the task runs is never overwritten.
No retries: a failure leaves `styles_source` NULL and the admin can run it again.
"""
from __future__ import annotations

import logging
import mimetypes

from app.config import settings
from app.core.cache import cache_delete_prefix
from app.core.storage import download_file
from app.services.design_image import prepare_design_image
from app.services.furniture_style_ai import classify_furniture_styles
from celery_app import app

logger = logging.getLogger(__name__)


# No `name=`: the default module-path name is what `app.tasks.*` in celery_app.py
# routes to the "default" queue, which the prod worker consumes.
@app.task(bind=True, max_retries=0)
def classify_furniture_styles_task(self, furniture_id: str) -> dict:
    import asyncio

    return asyncio.run(run_classification(furniture_id))


async def run_classification(furniture_id: str) -> dict:
    if not settings.AI_FEATURES_ENABLED:
        return {"status": "skipped", "styles": []}
    row = await _load(furniture_id)
    if row is None:
        return {"status": "skipped", "styles": []}
    name_uz, category, thumbnail_key, styles_source = row
    if styles_source is not None:
        return {"status": "skipped", "styles": []}

    image = None
    if thumbnail_key:
        try:
            data = await download_file(thumbnail_key)
            image = prepare_design_image(data, mimetypes.guess_type(thumbnail_key)[0])
        except Exception as exc:  # noqa: BLE001 — no picture: go on from the name
            logger.warning("furniture_style_thumbnail_unusable id=%s error=%s", furniture_id, exc)
            image = None

    try:
        styles = await classify_furniture_styles(name_uz, category, image)
    except Exception:
        logger.exception("furniture_style_ai_failed id=%s", furniture_id)
        return {"status": "failed", "styles": []}

    if not await _save(furniture_id, styles):
        return {"status": "skipped", "styles": []}
    await cache_delete_prefix("furniture:")
    logger.info("furniture_styles_classified id=%s styles=%s", furniture_id, styles)
    return {"status": "classified", "styles": styles}


async def _load(furniture_id: str) -> tuple[str, str, str | None, str | None] | None:
    """``(name_uz, category, thumbnail_key, styles_source)``, or None if the model is gone."""
    import uuid as _uuid

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.models.furniture import Furniture

    engine = create_async_engine(settings.DATABASE_URL)  # own process/loop
    try:
        async with engine.connect() as conn:
            row = (await conn.execute(
                select(Furniture.name_uz, Furniture.category, Furniture.thumbnail_key, Furniture.styles_source)
                .where(Furniture.id == _uuid.UUID(furniture_id))
            )).first()
            return None if row is None else (row[0], row[1], row[2], row[3])
    finally:
        await engine.dispose()


async def _save(furniture_id: str, styles: list[str]) -> bool:
    """Write the AI styles only while nobody has styled the model; False if someone did."""
    import uuid as _uuid

    from sqlalchemy import update
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.models.furniture import Furniture

    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.begin() as conn:
            result = await conn.execute(
                update(Furniture)
                .where(Furniture.id == _uuid.UUID(furniture_id), Furniture.styles_source.is_(None))
                .values(styles=styles, styles_source="ai")
            )
            return result.rowcount == 1
    finally:
        await engine.dispose()
