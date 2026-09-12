from __future__ import annotations

import hashlib
import uuid as uuid_module

import structlog
from fastapi import APIRouter, Form, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.core.storage import absolute_media_url, delete_file, upload_file
from app.models.user_model import UserModel
from app.schemas.user_model import UserModelOut, UserModelUpdate

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/user-models", tags=["user-models"])

# Everything the studio's import pipeline produces is a GLB, but browsers are
# inconsistent about the MIME they attach to one — accept the octet-stream
# fallback and verify the magic bytes instead of trusting the label.
_ALLOWED_CONTENT_TYPES = {"model/gltf-binary", "application/octet-stream"}
_GLB_MAGIC = b"glTF"
_MAX_MODEL_BYTES = 60 * 1024 * 1024  # 60 MB — furniture scans get big
_MAX_THUMB_BYTES = 2 * 1024 * 1024


def _out(m: UserModel, request: Request) -> UserModelOut:
    return UserModelOut(
        id=m.id,
        name=m.name,
        category=m.category,
        placement=m.placement,
        price_uzs=m.price_uzs,
        scale=m.scale,
        size_w_m=m.size_w_m,
        size_d_m=m.size_d_m,
        size_h_m=m.size_h_m,
        has_textures=m.has_textures,
        url=absolute_media_url(request, m.storage_key),
        thumbnail_url=absolute_media_url(request, m.thumb_key) if m.thumb_key else None,
        content_type=m.content_type,
        size_bytes=m.size_bytes,
        created_at=m.created_at,
    )


@router.get(
    "",
    response_model=list[UserModelOut],
    summary="List the current user's imported 3D models",
)
async def list_user_models(
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
) -> list[UserModelOut]:
    result = await db.execute(
        select(UserModel)
        .where(UserModel.user_id == current_user.id)
        .order_by(UserModel.created_at.desc())
    )
    return [_out(m, request) for m in result.scalars().all()]


@router.post(
    "",
    response_model=UserModelOut,
    status_code=status.HTTP_201_CREATED,
    summary="Save an imported 3D model so it survives the browser",
)
async def upload_user_model(
    request: Request,
    file: UploadFile,
    current_user: CurrentUser,
    db: DbSession,
    name: str = Form(...),
    scale: float = Form(1.0),
    size_w_m: float = Form(1.0),
    size_d_m: float = Form(1.0),
    size_h_m: float = Form(1.0),
    has_textures: bool = Form(False),
    category: str | None = Form(default=None),
    placement: str | None = Form(default=None),
    price_uzs: int | None = Form(default=None),
    thumbnail: UploadFile | None = None,
) -> UserModelOut:
    """Store the converted GLB (plus its rendered preview) under the account.

    The browser keeps its IndexedDB copy for instant loads; this copy is what
    brings the model back after cleared site data or on another device.
    """
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Faqat GLB model yuklash mumkin",
        )
    if price_uzs is not None and price_uzs < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="price_uzs manfiy bo'lishi mumkin emas",
        )

    file_bytes = await file.read()
    if len(file_bytes) < 12 or file_bytes[:4] != _GLB_MAGIC:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Fayl GLB formatida emas",
        )
    if len(file_bytes) > _MAX_MODEL_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Model hajmi {_MAX_MODEL_BYTES // (1024 * 1024)} MB dan oshmasligi kerak",
        )

    thumb_bytes: bytes | None = None
    if thumbnail is not None:
        thumb_bytes = await thumbnail.read()
        if len(thumb_bytes) == 0:
            thumb_bytes = None
        elif len(thumb_bytes) > _MAX_THUMB_BYTES or not (thumbnail.content_type or "").startswith("image/"):
            # The preview is a convenience; a broken one must not sink the model.
            thumb_bytes = None

    # Same file re-imported → same entry (per user), refreshed metadata. The
    # hash is per-user on purpose: another user's identical chair is not ours.
    digest = hashlib.sha256(file_bytes).hexdigest()
    existing = await db.execute(
        select(UserModel).where(
            UserModel.user_id == current_user.id, UserModel.sha256 == digest
        )
    )
    found = existing.scalar_one_or_none()
    if found is not None:
        found.name = name[:120]
        found.scale = scale
        found.size_w_m = size_w_m
        found.size_d_m = size_d_m
        found.size_h_m = size_h_m
        found.has_textures = has_textures
        if category is not None:
            found.category = category
        if placement is not None:
            found.placement = placement
        if price_uzs is not None:
            found.price_uzs = price_uzs
        await db.flush()
        return _out(found, request)

    key = f"models/{current_user.id}/{uuid_module.uuid4()}.glb"
    try:
        stored_url = await upload_file(file_bytes, key, content_type="model/gltf-binary")
    except Exception as exc:
        logger.error("user_model_upload_failed", key=key, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Modelni saqlab bo'lmadi",
        ) from exc

    thumb_key: str | None = None
    if thumb_bytes is not None:
        candidate = f"models/{current_user.id}/{uuid_module.uuid4()}.jpg"
        try:
            thumb_url = await upload_file(
                thumb_bytes, candidate, content_type=thumbnail.content_type or "image/jpeg"
            )
            thumb_key = thumb_url if thumb_url.startswith("http") else candidate
        except Exception as exc:
            logger.warning("user_model_thumb_upload_failed", key=candidate, error=str(exc))

    model = UserModel(
        user_id=current_user.id,
        name=name[:120],
        category=category,
        placement=placement,
        price_uzs=price_uzs,
        scale=scale,
        size_w_m=size_w_m,
        size_d_m=size_d_m,
        size_h_m=size_h_m,
        has_textures=has_textures,
        # S3 hands back an absolute URL; local storage a key under MEDIA_ROOT
        storage_key=stored_url if stored_url.startswith("http") else key,
        thumb_key=thumb_key,
        content_type="model/gltf-binary",
        size_bytes=len(file_bytes),
        sha256=digest,
    )
    db.add(model)
    await db.flush()
    await db.refresh(model, attribute_names=["created_at"])

    logger.info("user_model_uploaded", id=str(model.id), user_id=str(current_user.id))
    return _out(model, request)


@router.patch(
    "/{model_id}",
    response_model=UserModelOut,
    summary="Update an imported model's metadata (name, category, placement, price)",
)
async def update_user_model(
    model_id: uuid_module.UUID,
    payload: UserModelUpdate,
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
) -> UserModelOut:
    result = await db.execute(
        select(UserModel).where(
            UserModel.id == model_id, UserModel.user_id == current_user.id
        )
    )
    model = result.scalar_one_or_none()
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model topilmadi")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(model, field, value)
    await db.flush()
    return _out(model, request)


@router.delete(
    "/{model_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    # 204 carries no body, so the default JSON response class must be replaced
    response_class=Response,
    summary="Delete one of your imported models",
)
async def delete_user_model(
    model_id: uuid_module.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    # No `-> None` return annotation on purpose — same FastAPI 204 rule as the
    # wallpapers router.
    result = await db.execute(
        select(UserModel).where(
            UserModel.id == model_id, UserModel.user_id == current_user.id
        )
    )
    model = result.scalar_one_or_none()
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model topilmadi")

    keys = [model.storage_key] + ([model.thumb_key] if model.thumb_key else [])
    await db.delete(model)
    await db.flush()
    for key in keys:
        try:
            await delete_file(key)
        except Exception as exc:  # the row is gone; a stray file is not worth a 500
            logger.warning("user_model_file_delete_failed", key=key, error=str(exc))
