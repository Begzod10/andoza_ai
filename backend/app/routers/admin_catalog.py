from __future__ import annotations

import uuid as uuid_module

import structlog
from fastapi import APIRouter, Form, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import AdminUser, DbSession
from app.core.storage import absolute_media_url, delete_file, upload_file
from app.models.furniture import Furniture
from app.models.store import Store
from app.schemas.admin_catalog import (
    FURNITURE_CATEGORIES,
    PARTNER_TIERS,
    PLACEMENTS,
    ROOM_TYPES,
    FurnitureAdminOut,
    FurnitureUpdate,
    StoreAdminOut,
    StoreCreate,
    StoreUpdate,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["admin-catalog"])

_ALLOWED_THUMBNAIL_TYPES = {"image/jpeg", "image/png", "image/webp"}
_EXT_BY_THUMBNAIL_TYPE = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_MAX_GLB_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
_MAX_THUMBNAIL_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def _furniture_out(f: Furniture, request: Request, store_name: str | None) -> FurnitureAdminOut:
    return FurnitureAdminOut(
        id=f.id,
        store_id=f.store_id,
        store_name=store_name,
        category=f.category,
        room_type=f.room_type,
        placement=f.placement,
        name_uz=f.name_uz,
        price_uzs=f.price_uzs,
        glb_url=absolute_media_url(request, f.glb_key),
        thumbnail_url=absolute_media_url(request, f.thumbnail_key),
        footprint_w=float(f.footprint_w) if f.footprint_w is not None else None,
        footprint_d=float(f.footprint_d) if f.footprint_d is not None else None,
        is_active=f.is_active,
        created_at=f.created_at,
    )


# ---------------------------------------------------------------------------
# Shops (stores)
# ---------------------------------------------------------------------------

@router.post(
    "/stores",
    response_model=StoreAdminOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a shop (admin only)",
)
async def create_store(payload: StoreCreate, admin: AdminUser, db: DbSession) -> StoreAdminOut:
    if payload.partner_tier not in PARTNER_TIERS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"partner_tier {', '.join(sorted(PARTNER_TIERS))} dan biri bo'lishi kerak",
        )

    store = Store(
        name=payload.name,
        district=payload.district,
        phone=payload.phone,
        telegram=payload.telegram,
        logo_color=payload.logo_color,
        partner_tier=payload.partner_tier,
    )
    db.add(store)
    await db.flush()
    await db.refresh(store)

    logger.info("store_created", id=str(store.id), admin_id=str(admin.id))
    return StoreAdminOut.model_validate(store)


@router.get(
    "/stores",
    response_model=list[StoreAdminOut],
    summary="List every shop, including inactive ones (admin only)",
)
async def list_stores_admin(admin: AdminUser, db: DbSession) -> list[StoreAdminOut]:
    result = await db.execute(select(Store).order_by(Store.created_at.desc()))
    return [StoreAdminOut.model_validate(s) for s in result.scalars().all()]


@router.patch(
    "/stores/{store_id}",
    response_model=StoreAdminOut,
    summary="Update a shop's details (admin only)",
)
async def update_store(
    store_id: uuid_module.UUID,
    payload: StoreUpdate,
    admin: AdminUser,
    db: DbSession,
) -> StoreAdminOut:
    if payload.partner_tier is not None and payload.partner_tier not in PARTNER_TIERS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"partner_tier {', '.join(sorted(PARTNER_TIERS))} dan biri bo'lishi kerak",
        )

    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    if store is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Do'kon topilmadi")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(store, field, value)

    await db.flush()
    await db.refresh(store)
    logger.info("store_updated", id=str(store.id), admin_id=str(admin.id), fields=list(updates))
    return StoreAdminOut.model_validate(store)


@router.delete(
    "/stores/{store_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a shop and every 3D model it owns (admin only)",
)
async def delete_store(store_id: uuid_module.UUID, admin: AdminUser, db: DbSession):
    result = await db.execute(
        select(Store)
        .options(selectinload(Store.furniture_items), selectinload(Store.wallpapers))
        .where(Store.id == store_id)
    )
    store = result.scalar_one_or_none()
    if store is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Do'kon topilmadi")

    # The DB cascade removes the furniture/wallpaper rows; collect their file
    # keys first so the now-orphaned files don't linger in storage forever.
    stray_keys = [
        key
        for item in store.furniture_items
        for key in (item.glb_key, item.thumbnail_key)
        if key
    ] + [w.storage_key for w in store.wallpapers if w.storage_key]

    await db.delete(store)
    await db.flush()

    for key in stray_keys:
        try:
            await delete_file(key)
        except Exception as exc:  # the rows are gone; a stray file isn't worth a 500
            logger.warning("store_delete_file_failed", key=key, error=str(exc))

    logger.info("store_deleted", id=str(store_id), admin_id=str(admin.id), files_removed=len(stray_keys))


# ---------------------------------------------------------------------------
# 3D models (furniture)
# ---------------------------------------------------------------------------

@router.post(
    "/furniture",
    response_model=FurnitureAdminOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a 3D model into the shop catalog (admin only)",
)
async def upload_furniture_model(
    request: Request,
    admin: AdminUser,
    db: DbSession,
    file: UploadFile,
    name_uz: str = Form(...),
    category: str = Form(...),
    room_type: str | None = Form(default=None),
    placement: str = Form(default="pol"),
    store_id: uuid_module.UUID | None = Form(default=None),
    price_uzs: int | None = Form(default=None),
    footprint_w: float | None = Form(default=None),
    footprint_d: float | None = Form(default=None),
    thumbnail: UploadFile | None = None,
) -> FurnitureAdminOut:
    """Store the model's `.glb` (and optional preview thumbnail) and record
    it with the type of furniture (`category`) and the room it belongs in
    (`room_type`) — the two facts the shop catalog filters on."""
    if category not in FURNITURE_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"category {', '.join(sorted(FURNITURE_CATEGORIES))} dan biri bo'lishi kerak",
        )
    if room_type is not None and room_type not in ROOM_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"room_type {', '.join(sorted(ROOM_TYPES))} dan biri (yoki bo'sh) bo'lishi kerak",
        )
    if placement not in PLACEMENTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"placement {', '.join(sorted(PLACEMENTS))} dan biri bo'lishi kerak",
        )
    if price_uzs is not None and price_uzs < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="price_uzs manfiy bo'lishi mumkin emas",
        )

    store: Store | None = None
    if store_id is not None:
        result = await db.execute(select(Store).where(Store.id == store_id))
        store = result.scalar_one_or_none()
        if store is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Do'kon topilmadi")

    if not (file.filename or "").lower().endswith(".glb"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Fayl .glb formatida bo'lishi kerak",
        )
    glb_bytes = await file.read()
    if len(glb_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bo'sh fayl yuborildi")
    if len(glb_bytes) > _MAX_GLB_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Fayl hajmi {_MAX_GLB_SIZE_BYTES // (1024 * 1024)} MB dan oshmasligi kerak",
        )

    thumbnail_key: str | None = None
    if thumbnail is not None and (thumbnail.filename or ""):
        if thumbnail.content_type not in _ALLOWED_THUMBNAIL_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Rasm faqat jpeg/png/webp formatida bo'lishi mumkin",
            )
        thumb_bytes = await thumbnail.read()
        if len(thumb_bytes) > _MAX_THUMBNAIL_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Rasm hajmi {_MAX_THUMBNAIL_SIZE_BYTES // (1024 * 1024)} MB dan oshmasligi kerak",
            )
        if len(thumb_bytes) > 0:
            ext = _EXT_BY_THUMBNAIL_TYPE.get(thumbnail.content_type or "", "jpg")
            thumb_key = f"furniture/{uuid_module.uuid4()}_thumb.{ext}"
            try:
                stored = await upload_file(thumb_bytes, thumb_key, content_type=thumbnail.content_type or "image/jpeg")
            except Exception as exc:
                logger.error("furniture_thumbnail_upload_failed", key=thumb_key, error=str(exc))
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Rasmni saqlab bo'lmadi",
                ) from exc
            thumbnail_key = stored if stored.startswith("http") else thumb_key

    glb_key = f"furniture/{uuid_module.uuid4()}.glb"
    try:
        stored_glb = await upload_file(glb_bytes, glb_key, content_type="model/gltf-binary")
    except Exception as exc:
        logger.error("furniture_glb_upload_failed", key=glb_key, error=str(exc))
        if thumbnail_key:
            try:
                await delete_file(thumbnail_key)
            except Exception:  # best-effort cleanup of the half-finished upload
                pass
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Modelni saqlab bo'lmadi",
        ) from exc
    glb_key = stored_glb if stored_glb.startswith("http") else glb_key

    furniture = Furniture(
        store_id=store.id if store else None,
        category=category,
        room_type=room_type,
        placement=placement,
        name_uz=name_uz,
        price_uzs=price_uzs,
        glb_key=glb_key,
        thumbnail_key=thumbnail_key,
        footprint_w=footprint_w,
        footprint_d=footprint_d,
    )
    db.add(furniture)
    await db.flush()
    await db.refresh(furniture)

    logger.info(
        "furniture_model_uploaded",
        id=str(furniture.id),
        admin_id=str(admin.id),
        category=category,
        room_type=room_type,
    )
    return _furniture_out(furniture, request, store.name if store else None)


@router.get(
    "/furniture",
    response_model=list[FurnitureAdminOut],
    summary="List every 3D model, including inactive ones (admin only)",
)
async def list_furniture_admin(
    request: Request,
    admin: AdminUser,
    db: DbSession,
    store_id: uuid_module.UUID | None = None,
    category: str | None = None,
    room_type: str | None = None,
) -> list[FurnitureAdminOut]:
    query = select(Furniture).options(selectinload(Furniture.store))
    if store_id is not None:
        query = query.where(Furniture.store_id == store_id)
    if category is not None:
        query = query.where(Furniture.category == category)
    if room_type is not None:
        query = query.where(Furniture.room_type == room_type)

    result = await db.execute(query.order_by(Furniture.created_at.desc()))
    items = result.scalars().all()
    return [_furniture_out(f, request, f.store.name if f.store else None) for f in items]


@router.patch(
    "/furniture/{furniture_id}",
    response_model=FurnitureAdminOut,
    summary="Update a 3D model's metadata (admin only)",
)
async def update_furniture(
    furniture_id: uuid_module.UUID,
    payload: FurnitureUpdate,
    request: Request,
    admin: AdminUser,
    db: DbSession,
) -> FurnitureAdminOut:
    if payload.category is not None and payload.category not in FURNITURE_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"category {', '.join(sorted(FURNITURE_CATEGORIES))} dan biri bo'lishi kerak",
        )
    if payload.room_type is not None and payload.room_type not in ROOM_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"room_type {', '.join(sorted(ROOM_TYPES))} dan biri bo'lishi kerak",
        )
    if payload.placement is not None and payload.placement not in PLACEMENTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"placement {', '.join(sorted(PLACEMENTS))} dan biri bo'lishi kerak",
        )

    result = await db.execute(
        select(Furniture).options(selectinload(Furniture.store)).where(Furniture.id == furniture_id)
    )
    furniture = result.scalar_one_or_none()
    if furniture is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model topilmadi")

    updates = payload.model_dump(exclude_unset=True)
    new_store: Store | None = furniture.store
    if "store_id" in updates:
        if updates["store_id"] is None:
            new_store = None
        else:
            store_result = await db.execute(select(Store).where(Store.id == updates["store_id"]))
            new_store = store_result.scalar_one_or_none()
            if new_store is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Do'kon topilmadi")

    for field, value in updates.items():
        setattr(furniture, field, value)

    await db.flush()
    await db.refresh(furniture)
    logger.info("furniture_updated", id=str(furniture.id), admin_id=str(admin.id), fields=list(updates))
    return _furniture_out(furniture, request, new_store.name if new_store else None)


@router.delete(
    "/furniture/{furniture_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a 3D model and its stored files (admin only)",
)
async def delete_furniture(furniture_id: uuid_module.UUID, admin: AdminUser, db: DbSession):
    result = await db.execute(select(Furniture).where(Furniture.id == furniture_id))
    furniture = result.scalar_one_or_none()
    if furniture is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model topilmadi")

    glb_key, thumbnail_key = furniture.glb_key, furniture.thumbnail_key
    await db.delete(furniture)
    await db.flush()

    for key in (glb_key, thumbnail_key):
        if not key:
            continue
        try:
            await delete_file(key)
        except Exception as exc:  # the row is gone; a stray file is not worth a 500
            logger.warning("furniture_file_delete_failed", key=key, error=str(exc))

    logger.info("furniture_deleted", id=str(furniture_id), admin_id=str(admin.id))
