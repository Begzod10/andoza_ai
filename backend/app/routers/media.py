from __future__ import annotations

import uuid as uuid_module

import structlog
from celery.result import AsyncResult
from fastapi import APIRouter, HTTPException, UploadFile, status
from sqlalchemy import select

from app.i18n import translate_detail
from app.api.v1.deps import CurrentUser, DbSession
from celery_app import app as celery_app
from app.core.storage import upload_file
from app.models.media_job import MediaJob
from app.tasks.media import process_photo

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["media"])

# The stored extension comes from the validated content type, never from the
# client's filename: local storage is served by StaticFiles, which picks the
# response type from the extension, so "x.html" sent as image/jpeg would be
# served as a page on the API origin.
_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic"}
_ALLOWED_CONTENT_TYPES = set(_EXT)
_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


@router.post(
    "/media/photos",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload a room photo; triggers background processing",
)
async def upload_photo(
    file: UploadFile,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    """Accept a multipart image upload, validate it, store it in S3, and
    enqueue the ``process_photo`` Celery task.  Returns the Celery job ID and
    the raw photo URL so the client can poll ``/jobs/{job_id}`` for status."""
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=translate_detail(
                "Unsupported file type {content_type}. Accepted: {allowed}",
                content_type=repr(file.content_type),
                allowed=", ".join(sorted(_ALLOWED_CONTENT_TYPES)),
            ),
        )

    file_bytes = await file.read()
    if len(file_bytes) > _MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=translate_detail("File exceeds maximum allowed size of {mb} MB", mb=_MAX_FILE_SIZE_BYTES // (1024*1024)),
        )
    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file received",
        )

    photo_key = f"photos/{current_user.id}/{uuid_module.uuid4()}.{_EXT[file.content_type]}"

    try:
        photo_url = await upload_file(file_bytes, photo_key, content_type=file.content_type)
    except Exception as exc:
        logger.error("s3_upload_failed", key=photo_key, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to upload photo to storage",
        ) from exc

    task = process_photo.delay(photo_key, str(current_user.id))

    # Record ownership so GET /jobs/{job_id} can verify the caller actually
    # owns this task before returning its status/result (see MediaJob).
    db.add(MediaJob(id=task.id, user_id=current_user.id))

    logger.info("photo_uploaded", key=photo_key, task_id=task.id, user_id=str(current_user.id))
    return {"job_id": task.id, "photo_url": photo_url}


@router.get(
    "/jobs/{job_id}",
    summary="Poll Celery task status",
)
async def get_job_status(
    job_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    """Return the current state of a background Celery task.

    Ownership is enforced via the ``media_jobs`` row written at enqueue
    time: a job that doesn't exist and a job that belongs to someone else
    both come back as 404, so this endpoint can't be used to confirm
    another user's job id exists (matches the "not found" convention used
    by /orders/{order_id} etc.).
    """
    job_row = await db.execute(select(MediaJob).where(MediaJob.id == job_id))
    job = job_row.scalar_one_or_none()
    if job is None or job.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    result = AsyncResult(job_id, app=celery_app)
    return {
        "job_id": job_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }
