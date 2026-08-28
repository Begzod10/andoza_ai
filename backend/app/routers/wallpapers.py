from __future__ import annotations

import hashlib
import uuid as uuid_module

import structlog
from fastapi import APIRouter, Form, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.core.storage import absolute_media_url, delete_file, upload_file
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

# Which panel an image belongs to: 'oboy' is a wallpaper pattern, 'suvoq' a
# bare wall surface (concrete, plaster), 'shpaklovka' a filled-and-sanded one.
# The last two are separate phases of the same wall and a photo of one is no
# use as the other, so they get separate shelves rather than one merged list.
# Anything else is rejected rather than stored, so the column stays a closed
# set the client can filter on.
_KINDS = {"oboy", "suvoq", "shpaklovka"}


@router.get(
    "",
    response_model=list[WallpaperOut],
    summary="List uploaded wallpapers (shared by all users)",
)
async def list_wallpapers(
    request: Request,
    db: DbSession,
    kind: str | None = Query(
        None,
        description="Only images uploaded for this panel ('oboy' or 'suvoq'). Omit for all.",
    ),
) -> list[WallpaperOut]:
    """Omitting `kind` returns the whole library, which is what the oboy picker
    wants — it can use any image. Suvoq asks for its own kind so a user gets
    back the surfaces they uploaded rather than every pattern on the server."""
    if kind is not None and kind not in _KINDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"kind must be one of: {', '.join(sorted(_KINDS))}",
        )
    stmt = select(Wallpaper).order_by(Wallpaper.created_at.desc())
    if kind is not None:
        stmt = stmt.where(Wallpaper.kind == kind)
    result = await db.execute(stmt)
    return [
        WallpaperOut(
            id=w.id,
            name=w.name,
            kind=w.kind,
            url=absolute_media_url(request, w.storage_key),
            content_type=w.content_type,
            size_bytes=w.size_bytes,
            created_at=w.created_at,
        )
        for w in result.scalars().all()
    ]


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
    kind: str = Form("oboy", description="'oboy' (pattern) or 'suvoq' (wall surface)"),
) -> WallpaperOut:
    """Store an image so every user can apply it to a wall.

    Uploads are permanent: the entry stays until an admin deletes it, which is
    what lets a saved room reload with its wallpaper intact.
    """
    if kind not in _KINDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"kind must be one of: {', '.join(sorted(_KINDS))}",
        )
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
        # Re-uploading a known image from a different panel moves it there.
        # Without this the upload appears to succeed and the image never shows
        # up in the library the user just uploaded it to.
        if found.kind != kind:
            found.kind = kind
            await db.flush()
        return WallpaperOut(
            id=found.id,
            name=found.name,
            kind=found.kind,
            url=absolute_media_url(request, found.storage_key),
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
        kind=kind,
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

    logger.info(
        "wallpaper_uploaded", id=str(wallpaper.id), kind=kind, user_id=str(current_user.id)
    )
    return WallpaperOut(
        id=wallpaper.id,
        name=wallpaper.name,
        kind=wallpaper.kind,
        url=absolute_media_url(request, wallpaper.storage_key),
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
