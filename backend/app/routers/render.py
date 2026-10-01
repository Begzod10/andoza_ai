"""Photorealistic renders of a studio screenshot, via MyArchitectAI.

POST /render takes the captured canvas, checks the caller's daily allowance,
stores the source and enqueues ``render_room_image``. The result is polled at
the existing ``GET /jobs/{job_id}`` — ownership is the same ``media_jobs`` row
photo processing already uses.
"""
from __future__ import annotations

import uuid as uuid_module
from typing import Annotated

import structlog
from fastapi import APIRouter, Form, HTTPException, UploadFile, status

from app.api.v1.deps import CurrentUser, DbSession
from app.config import settings
from app.core.storage import upload_file
from app.models.media_job import MediaJob
from app.services.llm import check_and_increment_budget_for
from app.tasks.media import render_room_image

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["render"])

_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
# The API caps a request at 10 MB and base64 adds a third — 7 MB keeps the
# encoded body under it.
_MAX_FILE_SIZE_BYTES = 7 * 1024 * 1024
_MAX_PROMPT_CHARS = 500
_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


@router.post(
    "/render",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Render a studio screenshot as a photorealistic interior",
)
async def create_render(
    file: UploadFile,
    current_user: CurrentUser,
    db: DbSession,
    prompt: Annotated[str | None, Form(max_length=_MAX_PROMPT_CHARS)] = None,
) -> dict:
    if not settings.MYARCHITECT_API_KEY or settings.RENDER_DAILY_LIMIT <= 0:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Render xizmati mavjud emas")

    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type {file.content_type!r}. Accepted: {', '.join(sorted(_ALLOWED_CONTENT_TYPES))}",
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file received")
    if len(data) > _MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {_MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB",
        )

    # Spend the day's allowance only once the request is known to be valid.
    try:
        await check_and_increment_budget_for(str(current_user.id), "render", settings.RENDER_DAILY_LIMIT)
    except Exception as exc:  # BudgetExceededError carries a user-facing Uzbek message
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc

    source_key = f"render-sources/{current_user.id}/{uuid_module.uuid4()}.{_EXT[file.content_type]}"
    try:
        await upload_file(data, source_key, content_type=file.content_type)
    except Exception as exc:
        logger.error("render_source_upload_failed", key=source_key, error=str(exc))
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to store the image") from exc

    task = render_room_image.delay(str(current_user.id), source_key, file.content_type, (prompt or "").strip() or None)
    db.add(MediaJob(id=task.id, user_id=current_user.id))
    logger.info("render_enqueued", task_id=task.id, user_id=str(current_user.id))
    return {"job_id": task.id}
