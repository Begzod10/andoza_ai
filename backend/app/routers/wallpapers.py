from __future__ import annotations

import hashlib
import uuid as uuid_module

import structlog
from fastapi import APIRouter, Form, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import AdminUser, CurrentUser, DbSession
from app.core.storage import absolute_media_url, delete_file, upload_file
from app.models.store import Store
from app.models.wallpaper import Wallpaper
from app.schemas.wallpaper import WallpaperOut, WallpaperUpdate

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


def _out(w: Wallpaper, request: Request) -> WallpaperOut:
    return WallpaperOut(
        id=w.id,
        name=w.name,
        store_id=w.store_id,
        store_name=w.store.name if w.store else None,
        price_uzs=w.price_uzs,
        description=w.description,
        width_cm=float(w.width_cm) if w.width_cm is not None else None,
        height_cm=float(w.height_cm) if w.height_cm is not None else None,
        total_length_m=float(w.total_length_m) if w.total_length_m is not None else None,
        url=absolute_media_url(request, w.storage_key),
        content_type=w.content_type,
        size_bytes=w.size_bytes,
        created_at=w.created_at,
    )


@router.get(
    "",
    response_model=list[WallpaperOut],
    summary="List every uploaded wallpaper (shared by all users)",
)
async def list_wallpapers(
    request: Request,
    db: DbSession,
    store_id: uuid_module.UUID | None = Query(
        default=None,
        description="Filter to one shop's oboy; global library entries (no "
                    "shop) are always excluded when this is set — use the "
                    "admin catalog's unassigned view for those instead",
    ),
) -> list[WallpaperOut]:
    query = select(Wallpaper).options(selectinload(Wallpaper.store))
    if store_id is not None:
        query = query.where(Wallpaper.store_id == store_id)
    result = await db.execute(query.order_by(Wallpaper.created_at.desc()))
    return [_out(w, request) for w in result.scalars().all()]


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
    name: str | None = Form(default=None),
    store_id: uuid_module.UUID | None = Form(default=None),
    price_uzs: int | None = Form(default=None),
    description: str | None = Form(default=None),
    width_cm: float | None = Form(default=None),
    height_cm: float | None = Form(default=None),
    total_length_m: float | None = Form(default=None),
) -> WallpaperOut:
    """Store an image so every user can apply it as an oboy.

    `name`/`store_id`/`price_uzs`/`description`/`width_cm`/`height_cm`/
    `total_length_m` are all optional admin-entered metadata (name falls
    back to the filename, as before). `store_id` ties the oboy to the shop
    selling it — leave it unset and it stays a global library entry usable
    by everyone. `height_cm` is for a mural-style panel sold as one fixed
    piece; `total_length_m` is for a repeating-pattern roll sold by the metre
    — a given oboy is usually one or the other, not both. Uploads are
    permanent: the entry stays until an admin deletes it, which is what lets
    a saved room reload with its wallpaper intact.
    """
    # Plain image uploads (no metadata) stay open to every user — that's the
    # studio's own "custom oboy" wall-covering picker. But every one of these
    # fields is catalog data: not just for a brand-new entry, but also on the
    # dedup path below, which would otherwise let ANY user overwrite an
    # existing shared wallpaper's shop/price/description just by re-posting
    # the same image bytes (its sha256 is derivable from the public URL).
    if not current_user.is_admin and any(
        v is not None for v in (name, store_id, price_uzs, description, width_cm, height_cm, total_length_m)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Faqat administrator oboy nomi/narxi/do'konini belgilashi mumkin",
        )
    if price_uzs is not None and price_uzs < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="price_uzs manfiy bo'lishi mumkin emas",
        )
    store: Store | None = None
    if store_id is not None:
        store_result = await db.execute(select(Store).where(Store.id == store_id))
        store = store_result.scalar_one_or_none()
        if store is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Do'kon topilmadi")
    for field_name, value in (
        ("width_cm", width_cm), ("height_cm", height_cm), ("total_length_m", total_length_m),
    ):
        if value is not None and value <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field_name} musbat son bo'lishi kerak",
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

    # Same image twice → same entry, so the library doesn't fill up with copies.
    # Still apply any newly-given metadata — a re-upload is a reasonable way
    # for an admin to correct those on an existing entry.
    digest = hashlib.sha256(file_bytes).hexdigest()
    existing = await db.execute(
        select(Wallpaper).options(selectinload(Wallpaper.store)).where(Wallpaper.sha256 == digest)
    )
    found = existing.scalar_one_or_none()
    if found is not None:
        if name:
            found.name = name[:120]
        if store_id is not None:
            found.store_id = store.id if store else None
        if price_uzs is not None:
            found.price_uzs = price_uzs
        if description is not None:
            found.description = description
        if width_cm is not None:
            found.width_cm = width_cm
        if height_cm is not None:
            found.height_cm = height_cm
        if total_length_m is not None:
            found.total_length_m = total_length_m
        await db.flush()
        await db.refresh(found, attribute_names=["store"])
        return _out(found, request)

    ext = _EXT_BY_TYPE.get(file.content_type or "", "jpg")
    key = f"wallpapers/{uuid_module.uuid4()}.{ext}"
    try:
        stored_url = await upload_file(file_bytes, key, content_type=file.content_type or "image/jpeg")
    except Exception as exc:
        logger.error("wallpaper_upload_failed", key=key, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Rasmni saqlab bo'lmadi",
        ) from exc

    wallpaper = Wallpaper(
        name=(name or file.filename or "Oboy")[:120],
        store_id=store.id if store else None,
        price_uzs=price_uzs,
        description=description,
        width_cm=width_cm,
        height_cm=height_cm,
        total_length_m=total_length_m,
        # S3 hands back an absolute URL; local storage a key under MEDIA_ROOT
        storage_key=stored_url if stored_url.startswith("http") else key,
        content_type=file.content_type or "image/jpeg",
        size_bytes=len(file_bytes),
        sha256=digest,
        uploaded_by=current_user.id,
    )
    wallpaper.store = store  # set directly, and refresh() below must not clobber it
    db.add(wallpaper)
    await db.flush()
    # Limited to the one server-generated field actually needed — a full
    # refresh() would expire (and re-lazy-load) the `store` relationship
    # just set above, which breaks in this async context without eager loading.
    await db.refresh(wallpaper, attribute_names=["created_at"])

    logger.info("wallpaper_uploaded", id=str(wallpaper.id), user_id=str(current_user.id))
    return _out(wallpaper, request)


@router.patch(
    "/{wallpaper_id}",
    response_model=WallpaperOut,
    summary="Update a wallpaper's metadata (admins only)",
)
async def update_wallpaper(
    wallpaper_id: uuid_module.UUID,
    payload: WallpaperUpdate,
    request: Request,
    admin: AdminUser,
    db: DbSession,
) -> WallpaperOut:
    result = await db.execute(
        select(Wallpaper).options(selectinload(Wallpaper.store)).where(Wallpaper.id == wallpaper_id)
    )
    wallpaper = result.scalar_one_or_none()
    if wallpaper is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Oboy topilmadi")

    updates = payload.model_dump(exclude_unset=True)
    new_store: Store | None = wallpaper.store
    if "store_id" in updates:
        if updates["store_id"] is None:
            new_store = None
        else:
            store_result = await db.execute(select(Store).where(Store.id == updates["store_id"]))
            new_store = store_result.scalar_one_or_none()
            if new_store is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Do'kon topilmadi")

    for field, value in updates.items():
        setattr(wallpaper, field, value)

    await db.flush()
    await db.refresh(wallpaper)
    wallpaper.store = new_store  # refresh() above expired it; restore without a lazy load
    logger.info("wallpaper_updated", id=str(wallpaper.id), admin_id=str(admin.id), fields=list(updates))
    return _out(wallpaper, request)


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
        await delete_file(key)
    except Exception as exc:  # the row is gone; a stray file is not worth a 500
        logger.warning("wallpaper_file_delete_failed", key=key, error=str(exc))
