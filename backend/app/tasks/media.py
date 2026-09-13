"""Media processing Celery tasks – Phase 3 stubs.

These tasks are intentionally left as stubs so the task signatures and queue
routing are established before the full AI pipeline is implemented in Phase 3.
"""
from __future__ import annotations

import logging

from celery_app import app

logger = logging.getLogger(__name__)


@app.task(
    name="app.tasks.media.process_photo",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    queue="media",
)
def process_photo(self, photo_key: str, room_id: str) -> dict:
    """Placeholder task for Phase 3 photo processing pipeline.

    Will eventually:
    - Download the photo from S3
    - Run segmentation / style-transfer via the AI GPU queue
    - Upload processed variants back to S3
    - Update the room record in the database

    Args:
        photo_key: S3 object key of the original uploaded photo.
        room_id:   UUID string of the Room this photo belongs to.

    Returns:
        A status dict that will be stored as the Celery task result.
    """
    logger.info(
        "process_photo invoked (stub) – phase 3 not yet implemented",
        extra={"photo_key": photo_key, "room_id": room_id},
    )
    return {"status": "pending", "photo_key": photo_key, "room_id": room_id}


@app.task(
    name="app.tasks.media.convert_room_scan_to_glb",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="converter",
)
def convert_room_scan_to_glb(self, room_id: str, usdz_key: str) -> dict:
    """Convert a room's uploaded USDZ into a GLB for the studio's reference
    overlay, then record glb_path on the room. Best-effort: any failure just
    leaves glb_path null and the studio still renders from parametric data.

    Runs on the dedicated ``converter`` queue so only the Blender-equipped
    converter service picks it up (the plain worker has no Blender).
    """
    import asyncio

    return asyncio.run(_convert_room_scan_to_glb(room_id, usdz_key))


async def _convert_room_scan_to_glb(room_id: str, usdz_key: str) -> dict:
    import os
    import tempfile
    import uuid as _uuid

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.config import settings
    from app.core.room_scan_glb import usdz_to_glb
    from app.core.storage import download_file, upload_file
    from app.models.room import Room

    data = await download_file(usdz_key)
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, "in.usdz")
        dst = os.path.join(td, "out.glb")
        with open(src, "wb") as fh:
            fh.write(data)
        # Blender is blocking — keep it off the event loop.
        ok = await asyncio.to_thread(usdz_to_glb, src, dst)
        if not ok:
            logger.warning("convert_room_scan_to_glb: conversion failed room=%s", room_id)
            return {"status": "failed", "room_id": room_id}
        with open(dst, "rb") as fh:
            glb = fh.read()

    glb_key = usdz_key.rsplit(".", 1)[0] + ".glb"
    await upload_file(glb, glb_key, content_type="model/gltf-binary")

    # Fresh engine — a Celery task runs in its own process/loop.
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with Session() as db:
            room = (
                await db.execute(select(Room).where(Room.id == _uuid.UUID(room_id)))
            ).scalar_one_or_none()
            if room is None:
                return {"status": "room_gone", "room_id": room_id}
            scan = dict(room.room_scan or {})
            scan["glb_path"] = glb_key
            room.room_scan = scan
            await db.commit()
    finally:
        await engine.dispose()

    logger.info("convert_room_scan_to_glb: ok room=%s glb=%s", room_id, glb_key)
    return {"status": "ok", "room_id": room_id, "glb_path": glb_key}
