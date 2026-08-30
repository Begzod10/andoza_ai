from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentUser, DbSession
from app.models.material import Material
from app.models.order import Order, OrderLine
from app.schemas.order import OrderCreate, OrderLineCreate, OrderOut

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/orders", tags=["orders"])


async def _resolve_line_prices(
    db: DbSession, lines: list[OrderLineCreate]
) -> dict:
    """Look up the authoritative price for every line that references a
    catalog material, keyed by material_id. Client-submitted unit_price_uzs
    is never trusted for these lines — it is only used as-is for genuine
    free-text lines that carry no material_id."""
    material_ids = {line.material_id for line in lines if line.material_id is not None}
    if not material_ids:
        return {}

    result = await db.execute(select(Material).where(Material.id.in_(material_ids)))
    price_by_material_id = {m.id: m.price_uzs for m in result.scalars().all()}

    missing_ids = material_ids - price_by_material_id.keys()
    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Noto'g'ri material ID.",
        )
    return price_by_material_id


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
    price_by_material_id = await _resolve_line_prices(db, body.lines)

    def _authoritative_price(line: OrderLineCreate) -> int:
        if line.material_id is not None:
            return price_by_material_id[line.material_id]
        return line.unit_price_uzs

    total_uzs = round(
        sum(_authoritative_price(line) * line.quantity for line in body.lines)
    )

    order = Order(
        user_id=current_user.id,
        dealer_name=body.dealer_name,
        total_uzs=total_uzs,
        status="accepted",
        lines=[
            OrderLine(
                material_id=line.material_id,
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
) -> list[OrderOut]:
    result = await db.execute(
        select(Order)
        .where(Order.user_id == current_user.id)
        .options(selectinload(Order.lines))
        .order_by(Order.created_at.desc())
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
