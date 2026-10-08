"""A seller runs one shop and uploads 3D models into the catalog.

A seller is simply a user who owns a shop (``stores.owner_user_id``). Everything
here acts on the caller's own shop and its models only — the shop is looked up
from the caller, never from an id in the request, so there is no id to swap for
someone else's. A new shop and every uploaded model start pending and inactive
and reach the public catalog only once an admin approves them (see
``routers/admin_moderation.py``).
"""
from __future__ import annotations

import uuid as uuid_module

import structlog
from fastapi import APIRouter, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentUser, DbSession
from app.core.storage import absolute_media_url, upload_file
from app.models.furniture import Furniture
from app.models.order import Order
from app.models.store import Store
from app.routers.admin_catalog import (
    _delete_files_after_commit,
    _invalidate_after_commit,
)
from app.schemas.order import OrderStatusUpdate, SellerOrderOut
from app.services.order_status import SELLER_CAN_CANCEL, change_status
from app.schemas.seller import (
    FURNITURE_CATEGORIES,
    PLACEMENTS,
    ROOM_TYPES,
    SellerFurnitureOut,
    SellerFurniturePage,
    SellerFurnitureUpdate,
    SellerStoreOut,
    SellerStoreUpdate,
    StoreApply,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/seller", tags=["seller"])

_MAX_GLB_BYTES = 50 * 1024 * 1024
_MAX_THUMB_BYTES = 5 * 1024 * 1024
# A seller's queue of unreviewed models is capped, so one account cannot bury
# the moderators in uploads.
_MAX_PENDING_MODELS = 20
_THUMB_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
# What the first bytes of each accepted file must look like. The browser's
# filename and content-type are the uploader's word; this is the file's.
_GLB_MAGIC = b"glTF"
_THUMB_MAGIC = {"image/jpeg": (b"\xff\xd8\xff",), "image/png": (b"\x89PNG",), "image/webp": (b"RIFF",)}


async def _own_store(db: DbSession, user) -> Store | None:
    return (await db.execute(select(Store).where(Store.owner_user_id == user.id))).scalar_one_or_none()


async def _require_store(db: DbSession, user) -> Store:
    store = await _own_store(db, user)
    if store is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sizda do'kon yo'q")
    return store


async def _require_approved_store(db: DbSession, user) -> Store:
    store = await _require_store(db, user)
    if store.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Do'koningiz hali tasdiqlanmagan"
            if store.status == "pending"
            else "Do'koningiz rad etilgan",
        )
    return store


def _out(f: Furniture, request: Request) -> SellerFurnitureOut:
    return SellerFurnitureOut(
        id=f.id,
        category=f.category,
        room_type=f.room_type,
        placement=f.placement,
        name_uz=f.name_uz,
        price_uzs=f.price_uzs,
        glb_url=absolute_media_url(request, f.glb_key),
        thumbnail_url=absolute_media_url(request, f.thumbnail_key),
        footprint_w=float(f.footprint_w) if f.footprint_w is not None else None,
        footprint_d=float(f.footprint_d) if f.footprint_d is not None else None,
        height_cm=float(f.height_cm) if f.height_cm is not None else None,
        is_active=f.is_active,
        status=f.status,
        moderation_note=f.moderation_note,
        created_at=f.created_at,
    )


# --------------------------------------------------------------------------- #
# The shop
# --------------------------------------------------------------------------- #

@router.get(
    "/store",
    response_model=SellerStoreOut | None,
    summary="The caller's own shop, or null if they have none (not yet a seller)",
)
async def get_store(current_user: CurrentUser, db: DbSession) -> Store | None:
    # null, not 404: "no shop yet" is the normal first state of the seller page.
    return await _own_store(db, current_user)


@router.post(
    "/store",
    response_model=SellerStoreOut,
    status_code=status.HTTP_201_CREATED,
    summary="Apply to run a shop (waits for an admin)",
)
async def apply_for_store(body: StoreApply, current_user: CurrentUser, db: DbSession) -> Store:
    if await _own_store(db, current_user) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sizda allaqachon do'kon bor")
    store = Store(
        name=body.name.strip(),
        district=body.district,
        phone=body.phone,
        telegram=body.telegram,
        logo_color=body.logo_color,
        owner_user_id=current_user.id,
        partner_tier="standard",
        status="pending",
        is_active=False,
    )
    db.add(store)
    await db.flush()
    await db.refresh(store)
    logger.info("seller_applied", store_id=str(store.id), user_id=str(current_user.id))
    return store


@router.post(
    "/store/resubmit",
    response_model=SellerStoreOut,
    summary="Send a rejected shop application back for review",
)
async def resubmit_store(current_user: CurrentUser, db: DbSession) -> Store:
    store = await _require_store(db, current_user)
    if store.status != "rejected":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Faqat rad etilgan ariza qayta yuboriladi")
    store.status = "pending"
    store.moderation_note = None
    await db.flush()
    await db.refresh(store)
    return store


@router.patch("/store", response_model=SellerStoreOut, summary="Edit the caller's own shop")
async def update_store(body: SellerStoreUpdate, current_user: CurrentUser, db: DbSession) -> Store:
    store = await _require_store(db, current_user)
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "name" and value is not None:
            value = value.strip()
        setattr(store, field, value)
    await db.flush()
    await db.refresh(store)
    if store.status == "approved":
        _invalidate_after_commit(db, "stores:")
        _invalidate_after_commit(db, "furniture:")
    return store


# --------------------------------------------------------------------------- #
# The shop's 3D models
# --------------------------------------------------------------------------- #

@router.get("/furniture", response_model=SellerFurniturePage, summary="The caller's own models, every status")
async def list_furniture(
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
) -> SellerFurniturePage:
    store = await _require_store(db, current_user)
    total = (await db.execute(
        select(func.count()).select_from(Furniture).where(Furniture.store_id == store.id)
    )).scalar_one()
    rows = (await db.execute(
        select(Furniture).where(Furniture.store_id == store.id)
        .order_by(Furniture.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )).scalars().all()
    return SellerFurniturePage(items=[_out(f, request) for f in rows], total=total, page=page, per_page=per_page)


@router.post(
    "/furniture",
    response_model=SellerFurnitureOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a 3D model (.glb) into the caller's shop; it waits for an admin",
)
async def upload_furniture(
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
    file: UploadFile,
    name_uz: str = Form(..., min_length=1, max_length=200),
    category: str = Form(...),
    room_type: str | None = Form(default=None),
    placement: str = Form(default="pol"),
    price_uzs: int | None = Form(default=None, ge=0),
    footprint_w: float | None = Form(default=None, gt=0, le=2000),
    footprint_d: float | None = Form(default=None, gt=0, le=2000),
    height_cm: float | None = Form(default=None, gt=0, le=1000),
    thumbnail: UploadFile | None = None,
) -> SellerFurnitureOut:
    store = await _require_approved_store(db, current_user)

    if category not in FURNITURE_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"category {', '.join(sorted(FURNITURE_CATEGORIES))} dan biri bo'lishi kerak")
    if room_type is not None and room_type not in ROOM_TYPES:
        raise HTTPException(status_code=422, detail=f"room_type {', '.join(sorted(ROOM_TYPES))} dan biri (yoki bo'sh) bo'lishi kerak")
    if placement not in PLACEMENTS:
        raise HTTPException(status_code=422, detail=f"placement {', '.join(sorted(PLACEMENTS))} dan biri bo'lishi kerak")

    pending = (await db.execute(
        select(func.count()).select_from(Furniture)
        .where(Furniture.store_id == store.id, Furniture.status == "pending")
    )).scalar_one()
    if pending >= _MAX_PENDING_MODELS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Tasdiqlanmagan modellar ko'p. Avval ular ko'rib chiqilishini kuting",
        )

    glb = await file.read()
    if not glb:
        raise HTTPException(status_code=400, detail="Bo'sh fayl yuborildi")
    if len(glb) > _MAX_GLB_BYTES:
        raise HTTPException(status_code=413, detail=f"Fayl hajmi {_MAX_GLB_BYTES // (1024 * 1024)} MB dan oshmasligi kerak")
    if not glb.startswith(_GLB_MAGIC):
        raise HTTPException(status_code=415, detail="Fayl haqiqiy .glb emas")

    thumb_bytes: bytes | None = None
    thumb_type = ""
    if thumbnail is not None and (thumbnail.filename or ""):
        thumb_type = thumbnail.content_type or ""
        if thumb_type not in _THUMB_EXT:
            raise HTTPException(status_code=415, detail="Rasm faqat jpeg/png/webp formatida bo'lishi mumkin")
        thumb_bytes = await thumbnail.read()
        if len(thumb_bytes) > _MAX_THUMB_BYTES:
            raise HTTPException(status_code=413, detail=f"Rasm hajmi {_MAX_THUMB_BYTES // (1024 * 1024)} MB dan oshmasligi kerak")
        if thumb_bytes and not thumb_bytes.startswith(_THUMB_MAGIC[thumb_type]):
            raise HTTPException(status_code=415, detail="Rasm fayli buzilgan yoki noto'g'ri formatda")

    thumbnail_key: str | None = None
    if thumb_bytes:
        tkey = f"furniture/{uuid_module.uuid4()}_thumb.{_THUMB_EXT[thumb_type]}"
        try:
            stored = await upload_file(thumb_bytes, tkey, content_type=thumb_type)
        except Exception as exc:
            logger.error("seller_thumbnail_upload_failed", key=tkey, error=str(exc))
            raise HTTPException(status_code=502, detail="Rasmni saqlab bo'lmadi") from exc
        thumbnail_key = stored if stored.startswith("http") else tkey

    gkey = f"furniture/{uuid_module.uuid4()}.glb"
    try:
        stored_glb = await upload_file(glb, gkey, content_type="model/gltf-binary")
    except Exception as exc:
        logger.error("seller_glb_upload_failed", key=gkey, error=str(exc))
        _delete_files_after_commit(db, [thumbnail_key], "seller_orphan_thumbnail_delete_failed")
        raise HTTPException(status_code=502, detail="Modelni saqlab bo'lmadi") from exc

    furniture = Furniture(
        store_id=store.id,
        category=category,
        room_type=room_type,
        placement=placement,
        name_uz=name_uz.strip(),
        price_uzs=price_uzs,
        glb_key=stored_glb if stored_glb.startswith("http") else gkey,
        thumbnail_key=thumbnail_key,
        footprint_w=footprint_w,
        footprint_d=footprint_d,
        height_cm=height_cm,
        status="pending",
        is_active=False,
    )
    db.add(furniture)
    await db.flush()
    await db.refresh(furniture)
    logger.info("seller_model_uploaded", id=str(furniture.id), store_id=str(store.id), user_id=str(current_user.id))
    return _out(furniture, request)


async def _own_model(db: DbSession, user, furniture_id: uuid_module.UUID) -> Furniture:
    """The model, only if it belongs to the caller's shop. Someone else's id and a
    missing one answer the same 404, so ids cannot be probed."""
    store = await _require_store(db, user)
    f = (await db.execute(select(Furniture).where(Furniture.id == furniture_id))).scalar_one_or_none()
    if f is None or f.store_id != store.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model topilmadi")
    return f


@router.patch("/furniture/{furniture_id}", response_model=SellerFurnitureOut, summary="Edit one of the caller's models")
async def update_furniture(
    furniture_id: uuid_module.UUID,
    body: SellerFurnitureUpdate,
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
) -> SellerFurnitureOut:
    f = await _own_model(db, current_user, furniture_id)
    changes = body.model_dump(exclude_unset=True)

    if "category" in changes and changes["category"] not in FURNITURE_CATEGORIES:
        raise HTTPException(status_code=422, detail="category noto'g'ri")
    if changes.get("room_type") is not None and changes["room_type"] not in ROOM_TYPES:
        raise HTTPException(status_code=422, detail="room_type noto'g'ri")
    if "placement" in changes and changes["placement"] not in PLACEMENTS:
        raise HTTPException(status_code=422, detail="placement noto'g'ri")
    # Only an approved model may be shown: this switch hides and re-shows it, it
    # does not bypass moderation.
    if changes.get("is_active") is True and f.status != "approved":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Model hali tasdiqlanmagan")

    for field, value in changes.items():
        if field == "name_uz" and value is not None:
            value = value.strip()
        setattr(f, field, value)
    await db.flush()
    await db.refresh(f)
    _invalidate_after_commit(db, "furniture:")
    return _out(f, request)


@router.delete("/furniture/{furniture_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete one of the caller's models")
async def delete_furniture(furniture_id: uuid_module.UUID, current_user: CurrentUser, db: DbSession) -> None:
    f = await _own_model(db, current_user, furniture_id)
    keys = [f.glb_key, f.thumbnail_key]
    await db.delete(f)
    await db.flush()
    _invalidate_after_commit(db, "furniture:")
    _delete_files_after_commit(db, keys, "seller_model_file_delete_failed")
    logger.info("seller_model_deleted", id=str(furniture_id), user_id=str(current_user.id))


# ── Orders for the caller's shop ─────────────────────────────────────────────


@router.get(
    "/orders",
    response_model=list[SellerOrderOut],
    summary="Orders placed with the caller's shop, newest first",
)
async def list_orders(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
) -> list[SellerOrderOut]:
    store = await _require_approved_store(db, current_user)
    result = await db.execute(
        select(Order)
        .where(Order.store_id == store.id)
        .options(selectinload(Order.lines))
        .order_by(Order.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    return [SellerOrderOut.model_validate(o) for o in result.scalars().all()]


@router.patch(
    "/orders/{order_id}/status",
    response_model=SellerOrderOut,
    summary="Move one of the shop's orders to its next stage",
)
async def advance_order(
    order_id: uuid_module.UUID,
    body: OrderStatusUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> SellerOrderOut:
    store = await _require_approved_store(db, current_user)
    # Locked for the update: two taps (or two devices) must not both read
    # "accepted" and each move it on, skipping a stage.
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id, Order.store_id == store.id)
        .options(selectinload(Order.lines))
        .with_for_update(of=Order)
    )
    order = result.scalar_one_or_none()
    if order is None:
        # Someone else's order looks exactly like one that does not exist.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Buyurtma topilmadi")

    changed = change_status(order, body.status, by="seller", cancellable=SELLER_CAN_CANCEL, reason=body.reason)
    if not changed:
        return SellerOrderOut.model_validate(order)  # a repeated tap changes nothing
    await db.flush()
    logger.info("order_status_changed", order_id=str(order.id), store_id=str(store.id), status=body.status)
    return SellerOrderOut.model_validate(order)
