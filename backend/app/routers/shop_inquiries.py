"""Customers ask shops about products; shop owners read and work an inbox.

Mirrors the usta inbox (``routers/usta_profile.py``): the seller's shop is found
from the caller, and someone else's inquiry answers the same 404 as a missing one.
Also holds the seller's dashboard numbers.
"""
from __future__ import annotations

import uuid as uuid_module
from datetime import datetime, timedelta, timezone

import structlog
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentUser, DbSession
from app.models.apartment import Apartment
from app.models.furniture import Furniture
from app.models.room import Room
from app.models.room_furniture_placement import RoomFurniturePlacement
from app.models.shop_inquiry import ShopInquiry
from app.models.store import Store
from app.models.user import User
from app.routers.seller import _require_store
from app.schemas.shop_inquiry import (
    InquiryCounts,
    ProductCounts,
    SellerInquiryOut,
    SellerInquiryUpdate,
    SellerStatsOut,
    ShopInquiryCreate,
    ShopInquiryOut,
    TopProduct,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/shops", tags=["shops"])
seller_router = APIRouter(prefix="/seller", tags=["seller"])

_MAX_PER_DAY = 5


@router.post(
    "/{store_id}/inquiries",
    response_model=ShopInquiryOut,
    status_code=status.HTTP_201_CREATED,
    summary="Ask a shop about a product",
)
async def create_inquiry(
    store_id: uuid_module.UUID, body: ShopInquiryCreate, current_user: CurrentUser, db: DbSession
) -> ShopInquiry:
    store = (await db.execute(
        select(Store).where(Store.id == store_id, Store.status == "approved", Store.is_active.is_(True))
    )).scalar_one_or_none()
    if store is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Do'kon topilmadi")

    if body.furniture_id is not None:
        product = (await db.execute(
            select(Furniture).where(Furniture.id == body.furniture_id, Furniture.store_id == store.id)
        )).scalar_one_or_none()
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mahsulot topilmadi")

    if body.room_id is not None:
        room = (await db.execute(
            select(Room)
            .join(Apartment, Room.apartment_id == Apartment.id)
            .where(Room.id == body.room_id, Apartment.user_id == current_user.id, Room.deleted == False)
        )).scalar_one_or_none()
        if room is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Xona topilmadi")

    since = datetime.now(timezone.utc) - timedelta(days=1)
    recent = (await db.execute(
        select(func.count()).select_from(ShopInquiry).where(
            ShopInquiry.store_id == store.id,
            ShopInquiry.user_id == current_user.id,
            ShopInquiry.created_at >= since,
        )
    )).scalar_one()
    if recent >= _MAX_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Bugun bu do'konga juda ko'p murojaat yubordingiz, ertaga urinib ko'ring",
        )

    inquiry = ShopInquiry(
        store_id=store.id,
        user_id=current_user.id,
        furniture_id=body.furniture_id,
        room_id=body.room_id,
        message=body.message,
        status="new",
    )
    db.add(inquiry)
    await db.flush()
    await db.refresh(inquiry)
    logger.info("shop_inquiry_created", inquiry_id=str(inquiry.id), store_id=str(store.id), user_id=str(current_user.id))
    return inquiry


def _inquiry_out(inq: ShopInquiry, client: User | None, product_name: str | None, room_name: str | None) -> SellerInquiryOut:
    return SellerInquiryOut(
        id=inq.id,
        status=inq.status,
        created_at=inq.created_at,
        client_name=client.name if client else None,
        client_phone=client.phone if client else None,
        message=inq.message,
        product_name=product_name,
        room_name=room_name,
    )


@seller_router.get("/inquiries", response_model=list[SellerInquiryOut], summary="Customer inquiries sent to the caller's shop")
async def list_inquiries(current_user: CurrentUser, db: DbSession) -> list[SellerInquiryOut]:
    store = await _require_store(db, current_user)
    rows = (await db.execute(
        select(ShopInquiry, User, Furniture.name_uz, Room.name)
        .join(User, User.id == ShopInquiry.user_id)
        .outerjoin(Furniture, Furniture.id == ShopInquiry.furniture_id)
        .outerjoin(Room, Room.id == ShopInquiry.room_id)
        .where(ShopInquiry.store_id == store.id)
        .order_by(ShopInquiry.created_at.desc())
        .limit(200)
    )).all()
    return [_inquiry_out(inq, client, product, room) for inq, client, product, room in rows]


@seller_router.patch("/inquiries/{inquiry_id}", response_model=SellerInquiryOut, summary="Mark one of the caller's inquiries viewed / contacted / closed")
async def update_inquiry(
    inquiry_id: uuid_module.UUID, body: SellerInquiryUpdate, current_user: CurrentUser, db: DbSession
) -> SellerInquiryOut:
    store = await _require_store(db, current_user)
    # Another shop's inquiry and a missing one answer the same 404.
    inq = (await db.execute(
        select(ShopInquiry).where(ShopInquiry.id == inquiry_id, ShopInquiry.store_id == store.id)
    )).scalar_one_or_none()
    if inq is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Murojaat topilmadi")
    inq.status = body.status
    await db.flush()
    client = (await db.execute(select(User).where(User.id == inq.user_id))).scalar_one_or_none()
    product_name = None
    if inq.furniture_id is not None:
        product_name = (await db.execute(select(Furniture.name_uz).where(Furniture.id == inq.furniture_id))).scalar_one_or_none()
    room_name = None
    if inq.room_id is not None:
        room_name = (await db.execute(select(Room.name).where(Room.id == inq.room_id))).scalar_one_or_none()
    return _inquiry_out(inq, client, product_name, room_name)


@seller_router.get("/stats", response_model=SellerStatsOut, summary="Dashboard numbers for the caller's shop")
async def seller_stats(current_user: CurrentUser, db: DbSession) -> SellerStatsOut:
    store = await _require_store(db, current_user)

    product_rows = (await db.execute(
        select(Furniture.status, Furniture.is_active, func.count())
        .where(Furniture.store_id == store.id)
        .group_by(Furniture.status, Furniture.is_active)
    )).all()
    by_status = {"approved": 0, "pending": 0, "rejected": 0}
    visible = 0
    for st, active, n in product_rows:
        by_status[st] = by_status.get(st, 0) + n
        if st == "approved" and active:
            visible += n

    inquiry_rows = (await db.execute(
        select(ShopInquiry.status, func.count())
        .where(ShopInquiry.store_id == store.id)
        .group_by(ShopInquiry.status)
    )).all()
    inq_by_status = {st: n for st, n in inquiry_rows}

    placements_total = (await db.execute(
        select(func.count(RoomFurniturePlacement.id))
        .join(Furniture, Furniture.id == RoomFurniturePlacement.furniture_id)
        .where(Furniture.store_id == store.id)
    )).scalar_one()

    top_rows = (await db.execute(
        select(Furniture.id, Furniture.name_uz, func.count(RoomFurniturePlacement.id).label("n"))
        .join(RoomFurniturePlacement, RoomFurniturePlacement.furniture_id == Furniture.id)
        .where(Furniture.store_id == store.id)
        .group_by(Furniture.id, Furniture.name_uz)
        .order_by(func.count(RoomFurniturePlacement.id).desc())
        .limit(5)
    )).all()

    return SellerStatsOut(
        products=ProductCounts(
            total=sum(by_status.values()),
            approved=by_status["approved"],
            pending=by_status["pending"],
            rejected=by_status["rejected"],
        ),
        visible=visible,
        inquiries=InquiryCounts(total=sum(inq_by_status.values()), new=inq_by_status.get("new", 0)),
        placements_total=placements_total,
        top_products=[TopProduct(id=i, name_uz=name, placements=n) for i, name, n in top_rows],
    )
