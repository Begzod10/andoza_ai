from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentUser, DbSession
from app.models.furniture import Furniture
from app.models.material import Material
from app.models.order import Order, OrderLine
from app.schemas.order import OrderCancel, OrderCreate, OrderLineCreate, OrderOut
from app.services.order_status import BUYER_CAN_CANCEL, change_status

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/orders", tags=["orders"])


async def _resolve_line_prices(
    db: DbSession, lines: list[OrderLineCreate]
) -> tuple[dict, dict, object]:
    """Look up the authoritative price for every line: materials by
    material_id, furniture by furniture_id. The client-submitted
    unit_price_uzs is never trusted, so a line that references neither is
    refused — it would be a price the client simply made up."""
    if any(line.material_id is None and line.furniture_id is None for line in lines):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Har bir qator katalogdagi material yoki mebelga bog'langan bo'lishi kerak.",
        )

    material_ids = {line.material_id for line in lines if line.material_id is not None}
    furniture_ids = {line.furniture_id for line in lines if line.furniture_id is not None}

    # Which shop each ordered item belongs to (None: it belongs to no shop).
    store_ids: set = set()

    material_prices: dict = {}
    if material_ids:
        result = await db.execute(select(Material).where(Material.id.in_(material_ids)))
        materials = result.scalars().all()
        material_prices = {m.id: m.price_uzs for m in materials}
        store_ids |= {m.store_id for m in materials}
        if material_ids - material_prices.keys():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Noto'g'ri material ID.",
            )

    furniture_prices: dict = {}
    if furniture_ids:
        # Only what a shopper can actually see in the shop: live and approved.
        result = await db.execute(
            select(Furniture).where(
                Furniture.id.in_(furniture_ids),
                Furniture.is_active.is_(True),
                Furniture.status == "approved",
            )
        )
        found = {f.id: f for f in result.scalars().all()}
        if furniture_ids - found.keys():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Noto'g'ri mebel ID.",
            )
        unpriced = [f.name_uz for f in found.values() if not f.price_uzs]
        if unpriced:
            # No price on file means there is nothing to charge: ask the shop.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Narxi belgilanmagan, buyurtma berib bo'lmaydi: {', '.join(unpriced)}.",
            )
        furniture_prices = {fid: f.price_uzs for fid, f in found.items()}
        store_ids |= {f.store_id for f in found.values()}

    # One order goes to one shop: it is that shop that fulfils it and moves its
    # status along, so items of several shops cannot share an order.
    if len(store_ids) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bitta buyurtmada faqat bitta do'kon mahsulotlari bo'lishi mumkin.",
        )
    return material_prices, furniture_prices, next(iter(store_ids), None)


@router.post(
    "",
    response_model=OrderOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create an order for the current user; total_uzs is computed server-side",
)
async def create_order(
    body: OrderCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> OrderOut:
    material_prices, furniture_prices, store_id = await _resolve_line_prices(db, body.lines)

    def _authoritative_price(line: OrderLineCreate) -> int:
        if line.material_id is not None:
            return material_prices[line.material_id]
        return furniture_prices[line.furniture_id]

    total_uzs = round(
        sum(_authoritative_price(line) * line.quantity for line in body.lines)
    )

    order = Order(
        user_id=current_user.id,
        dealer_name=body.dealer_name,
        store_id=store_id,
        total_uzs=total_uzs,
        status="accepted",
        delivery_address=body.delivery_address,
        phone=body.phone,
        payment_method=body.payment_method,
        lines=[
            OrderLine(
                material_id=line.material_id,
                furniture_id=line.furniture_id,
                product_name=line.product_name,
                unit=line.unit,
                unit_price_uzs=_authoritative_price(line),
                quantity=line.quantity,
            )
            for line in body.lines
        ],
    )
    db.add(order)
    await db.flush()
    # Pull server-generated created_at without expiring the in-memory lines.
    await db.refresh(order, attribute_names=["created_at"])
    logger.info(
        "order_created",
        order_id=str(order.id),
        user_id=str(current_user.id),
        total_uzs=total_uzs,
        line_count=len(body.lines),
    )
    return OrderOut.model_validate(order)


@router.get(
    "",
    response_model=list[OrderOut],
    summary="List current user's orders, newest first",
)
async def list_orders(
    current_user: CurrentUser,
    db: DbSession,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
) -> list[OrderOut]:
    offset = (page - 1) * per_page
    result = await db.execute(
        select(Order)
        .where(Order.user_id == current_user.id)
        .options(selectinload(Order.lines))
        .order_by(Order.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    orders = result.scalars().all()
    return [OrderOut.model_validate(order) for order in orders]


@router.get(
    "/{order_id}",
    response_model=OrderOut,
    summary="Get a single order owned by the current user",
)
async def get_order(
    order_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> OrderOut:
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id, Order.user_id == current_user.id)
        .options(selectinload(Order.lines))
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found"
        )
    return OrderOut.model_validate(order)


@router.post(
    "/{order_id}/cancel",
    response_model=OrderOut,
    summary="Cancel one of the current user's orders, while the shop has not yet started on it",
)
async def cancel_order(
    order_id: uuid.UUID,
    body: OrderCancel,
    current_user: CurrentUser,
    db: DbSession,
) -> OrderOut:
    # Locked: a cancel racing the shop's "start gathering" must see one outcome, not both.
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id, Order.user_id == current_user.id)
        .options(selectinload(Order.lines))
        .with_for_update(of=Order)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Buyurtma topilmadi")

    reason = (body.reason or "").strip() or "Xaridor bekor qildi"
    if change_status(order, "cancelled", by="buyer", cancellable=BUYER_CAN_CANCEL, reason=reason):
        await db.flush()
        logger.info("order_cancelled", order_id=str(order.id), user_id=str(current_user.id), by="buyer")
    return OrderOut.model_validate(order)
