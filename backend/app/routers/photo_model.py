"""A 3D model from a furniture photo, via Tripo.

POST /models/from-photo takes the photo, checks the caller's daily allowance,
stores the source and enqueues ``generate_model_from_photo``. The result is
polled at the existing ``GET /jobs/{job_id}`` (ownership is the ``media_jobs``
row, as for photo processing and renders). When it is done, ``result.url`` is a
GLB the studio imports like any uploaded model.
"""
from __future__ import annotations

import uuid as uuid_module

import structlog
from fastapi import APIRouter, HTTPException, Response, UploadFile, status

from app.api.v1.deps import CurrentUser, DbSession
from app.config import settings
from app.core.storage import download_file, upload_file
from app.models.media_job import MediaJob
from app.services.llm import check_and_increment_budget_for
from app.tasks.media import generate_model_from_photo

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["photo-model"])

# Tripo takes PNG, JPEG and WebP up to 20 MB.
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


@router.post(
    "/models/from-photo",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Build a 3D model (GLB) from a furniture photo",
)
async def create_model_from_photo(file: UploadFile, current_user: CurrentUser, db: DbSession) -> dict:
    if not settings.TRIPO_API_KEY or settings.MODEL_FROM_PHOTO_DAILY_LIMIT <= 0:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="3D model xizmati mavjud emas")

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
        await check_and_increment_budget_for(
            str(current_user.id), "photo_model", settings.MODEL_FROM_PHOTO_DAILY_LIMIT
        )
    except Exception as exc:  # BudgetExceededError carries a user-facing Uzbek message
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc

    source_key = f"photo-model-sources/{current_user.id}/{uuid_module.uuid4()}.{_EXT[file.content_type]}"
    try:
        await upload_file(data, source_key, content_type=file.content_type)
    except Exception as exc:
        logger.error("photo_model_source_upload_failed", key=source_key, error=str(exc))
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to store the image") from exc

    task = generate_model_from_photo.delay(str(current_user.id), source_key, file.content_type)
    db.add(MediaJob(id=task.id, user_id=current_user.id))
    logger.info("photo_model_enqueued", task_id=task.id, user_id=str(current_user.id))
    return {"job_id": task.id}


@router.get(
    "/models/from-photo/glb",
    summary="Download a model built from the caller's own photo",
)
async def get_photo_model_glb(key: str, current_user: CurrentUser) -> Response:
    """Stream the GLB through the API so the studio can fetch it same-origin, with
    its cookie, instead of depending on the storage host's CORS rules. Only the
    caller's own models: the key is a storage path, so it must stay in their
    folder and not climb out of it."""
    prefix = f"photo-models/{current_user.id}/"
    if not key.startswith(prefix) or ".." in key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    try:
        data = await download_file(key)
    except Exception as exc:
        logger.error("photo_model_read_failed", key=key, error=str(exc))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found") from exc
    return Response(content=data, media_type="model/gltf-binary")
