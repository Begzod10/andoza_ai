"""A 3D model from a furniture photo, via Tripo.

POST /models/from-photo takes the photo, checks the caller's daily allowance,
stores the source and enqueues ``generate_model_from_photo``. Only admins and
sellers (the owner of an approved shop) may build models — it spends Tripo
credits, and adding models is theirs to do, not an ordinary user's. The result is
polled at the existing ``GET /jobs/{job_id}`` (ownership is the ``media_jobs``
row, as for photo processing and renders). When it is done, ``result.url`` is a
GLB the studio imports like any uploaded model.
"""
from __future__ import annotations

import uuid as uuid_module

import structlog
from fastapi import APIRouter, HTTPException, Response, UploadFile, status
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.config import settings
from app.core.storage import download_file, upload_file
from app.models.media_job import MediaJob
from app.models.store import Store
from app.services.llm import check_and_increment_budget_for
from app.tasks.media import generate_model_from_photo

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["photo-model"])

# Tripo takes PNG, JPEG and WebP up to 20 MB.
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


async def _require_model_builder(db: DbSession, user) -> None:
    """Admins, or a seller whose shop has been approved. A pending or rejected shop
    cannot upload models either, so it has no use for this."""
    if user.is_admin:
        return
    store = (await db.execute(select(Store).where(Store.owner_user_id == user.id))).scalar_one_or_none()
    if store is None or store.status != "approved":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Faqat sotuvchi va administrator uchun")


async def _read_photo(file: UploadFile) -> bytes:
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
    return data


@router.post(
    "/models/from-photo",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Build a 3D model (GLB) from one furniture photo, or from several views of it",
)
async def create_model_from_photo(
    file: UploadFile,
    current_user: CurrentUser,
    db: DbSession,
    left: UploadFile | None = None,
    back: UploadFile | None = None,
    right: UploadFile | None = None,
) -> dict:
    """``file`` is the front (or the only) photo. Sending any of ``left`` / ``back`` /
    ``right`` as well builds from all of them together (Tripo's multiview endpoint):
    the more real angles, the less the model has to invent."""
    await _require_model_builder(db, current_user)
    if not settings.TRIPO_API_KEY or settings.MODEL_FROM_PHOTO_DAILY_LIMIT <= 0:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="3D model xizmati mavjud emas")

    # An empty file field (a browser sends one for an unfilled slot) is no view.
    extras = {name: f for name, f in (("left", left), ("back", back), ("right", right)) if f is not None and f.filename}
    uploads = {"front": file, **extras}
    payloads = {view: await _read_photo(f) for view, f in uploads.items()}

    # Spend the day's allowance only once the request is known to be valid.
    try:
        await check_and_increment_budget_for(
            str(current_user.id), "photo_model", settings.MODEL_FROM_PHOTO_DAILY_LIMIT
        )
    except Exception as exc:  # BudgetExceededError carries a user-facing Uzbek message
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc

    stored: dict[str, dict] = {}
    try:
        for view, f in uploads.items():
            key = f"photo-model-sources/{current_user.id}/{uuid_module.uuid4()}.{_EXT[f.content_type]}"
            await upload_file(payloads[view], key, content_type=f.content_type)
            stored[view] = {"key": key, "content_type": f.content_type}
    except Exception as exc:
        logger.error("photo_model_source_upload_failed", views=list(stored), error=str(exc))
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to store the image") from exc

    front = stored.pop("front")
    task = generate_model_from_photo.delay(
        str(current_user.id), front["key"], front["content_type"], stored or None,
    )
    db.add(MediaJob(id=task.id, user_id=current_user.id))
    logger.info("photo_model_enqueued", task_id=task.id, user_id=str(current_user.id), views=1 + len(stored))
    return {"job_id": task.id}


@router.get(
    "/models/from-photo/glb",
    summary="Download a model built from the caller's own photo",
)
async def get_photo_model_glb(key: str, current_user: CurrentUser, db: DbSession) -> Response:
    """Stream the GLB through the API so the studio can fetch it same-origin, with
    its cookie, instead of depending on the storage host's CORS rules. Only the
    caller's own models: the key is a storage path, so it must stay in their
    folder and not climb out of it."""
    await _require_model_builder(db, current_user)
    prefix = f"photo-models/{current_user.id}/"
    if not key.startswith(prefix) or ".." in key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    try:
        data = await download_file(key)
    except Exception as exc:
        logger.error("photo_model_read_failed", key=key, error=str(exc))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found") from exc
    return Response(content=data, media_type="model/gltf-binary")
