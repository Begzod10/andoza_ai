from __future__ import annotations

import hashlib
import uuid as uuid_module

import structlog
from fastapi import APIRouter, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.config import settings
from app.core.storage import delete_file, upload_file
from app.models.wallpaper import Wallpaper
from app.schemas.wallpaper import WallpaperOut

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/wallpapers", tags=["wallpapers"])

# Images only. Anything the browser can decode into a WebGL texture qualifies;
# HEIC is accepted because phones produce it, even though it needs conversion
# client-side to preview.
_ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/avif",
    "image/heic",
    "image/heif",
}
_EXT_BY_TYPE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/bmp": "bmp",
    "image/avif": "avif",
    "image/heic": "heic",
    "image/heif": "heif",
}
_MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB


def _absolute(request: Request, url: str) -> str:
    """Local storage returns a host-relative path; make it absolute."""
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return f"{str(request.base_url).rstrip('/')}{url}"


@router.get(
    "",
    response_model=list[WallpaperOut],
    summary="List every uploaded wallpaper (shared by all users)",
)
async def list_wallpapers(request: Request, db: DbSession) -> list[WallpaperOut]:
    result = await db.execute(select(Wallpaper).order_by(Wallpaper.created_at.desc()))
    return [
        WallpaperOut(
            id=w.id,
            name=w.name,
            url=_absolute(request, _public_url(w.storage_key)),
            content_type=w.content_type,
            size_bytes=w.size_bytes,
            created_at=w.created_at,
        )
        for w in result.scalars().all()
    ]


def _public_url(storage_key: str) -> str:
    """URL for a stored key — S3 objects are already absolute."""
    if storage_key.startswith("http://") or storage_key.startswith("https://"):
        return storage_key
    return f"{settings.MEDIA_URL_PREFIX}/{storage_key}"


@router.post(
    "",
    response_model=WallpaperOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a wallpaper image to the shared library",
)
async def upload_wallpaper(
    request: Request,
    file: UploadFile,
    current_user: CurrentUser,
    db: DbSession,
) -> WallpaperOut:
    """Store an image so every user can apply it as an oboy.

    Uploads are permanent: the entry stays until an admin deletes it, which is
    what lets a saved room reload with its wallpaper intact.
    """
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Faqat rasm yuklash mumkin ({', '.join(sorted(_EXT_BY_TYPE.values()))})",
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bo'sh fayl yuborildi",
        )
    if len(file_bytes) > _MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Rasm hajmi {_MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB dan oshmasligi kerak",
        )

    # Same image twice → same entry, so the library doesn't fill up with copies
    digest = hashlib.sha256(file_bytes).hexdigest()
    existing = await db.execute(select(Wallpaper).where(Wallpaper.sha256 == digest))
    found = existing.scalar_one_or_none()
    if found is not None:
        return WallpaperOut(
            id=found.id,
            name=found.name,
            url=_absolute(request, _public_url(found.storage_key)),
            content_type=found.content_type,
            size_bytes=found.size_bytes,
            created_at=found.created_at,
        )

    ext = _EXT_BY_TYPE.get(file.content_type or "", "jpg")
    key = f"wallpapers/{uuid_module.uuid4()}.{ext}"
    try:
        stored_url = upload_file(file_bytes, key, content_type=file.content_type or "image/jpeg")
    except Exception as exc:
        logger.error("wallpaper_upload_failed", key=key, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Rasmni saqlab bo'lmadi",
        ) from exc

    wallpaper = Wallpaper(
        name=(file.filename or "Oboy")[:120],
        # S3 hands back an absolute URL; local storage a key under MEDIA_ROOT
        storage_key=stored_url if stored_url.startswith("http") else key,
        content_type=file.content_type or "image/jpeg",
        size_bytes=len(file_bytes),
        sha256=digest,
        uploaded_by=current_user.id,
    )
    db.add(wallpaper)
    await db.flush()
    await db.refresh(wallpaper)

    logger.info("wallpaper_uploaded", id=str(wallpaper.id), user_id=str(current_user.id))
    return WallpaperOut(
        id=wallpaper.id,
        name=wallpaper.name,
        url=_absolute(request, _public_url(wallpaper.storage_key)),
        content_type=wallpaper.content_type,
        size_bytes=wallpaper.size_bytes,
        created_at=wallpaper.created_at,
    )


@router.delete(
    "/{wallpaper_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    # 204 carries no body, so the default JSON response class must be replaced
    response_class=Response,
    summary="Remove a wallpaper from the library (admins only)",
)
async def delete_wallpaper(
    wallpaper_id: uuid_module.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    # No `-> None` return annotation on purpose: with postponed annotations
    # (`from __future__ import annotations`) FastAPI resolves it into a
    # response field, which a 204 may not have — the app refuses to start.
    """Deleting is an admin action on purpose: the library is shared, and a
    room saved with this wallpaper stops rendering it once the file is gone."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Faqat administrator o'chira oladi",
        )

    result = await db.execute(select(Wallpaper).where(Wallpaper.id == wallpaper_id))
    wallpaper = result.scalar_one_or_none()
    if wallpaper is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Oboy topilmadi")

    key = wallpaper.storage_key
    await db.delete(wallpaper)
    await db.flush()
    try:
        delete_file(key)
    except Exception as exc:  # the row is gone; a stray file is not worth a 500
        logger.warning("wallpaper_file_delete_failed", key=key, error=str(exc))
