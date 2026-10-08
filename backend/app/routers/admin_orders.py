"""Administrators see every order and can move or cancel any of them.

The shop sees only its own orders (``routers/seller.py``); this is for the orders no shop can
act on (items that belong to no shop), for a shop that has gone quiet, and for putting right
what a shop got wrong. The same status rules apply, with the widest cancellation window.
"""
from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import AdminUser, DbSession
from app.models.order import Order
from app.models.store import Store
from app.schemas.order import ORDER_STATUSES, AdminOrderOut, OrderStatusUpdate
from app.services.order_status import ADMIN_CAN_CANCEL, change_status

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/admin/orders", tags=["admin-orders"])


def _out(order: Order, store_name: str | None) -> AdminOrderOut:
    return AdminOrderOut(
        id=order.id, user_id=order.user_id, store_id=order.store_id, store_name=store_name,
        dealer_name=order.dealer_name, total_uzs=order.total_uzs, status=order.status,
        delivery_address=order.delivery_address, phone=order.phone, payment_method=order.payment_method,
        cancelled_by=order.cancelled_by, cancel_reason=order.cancel_reason, created_at=order.created_at,
        lines=order.lines,
    )


@router.get("", response_model=list[AdminOrderOut], summary="All orders, newest first")
async def list_orders(
    admin: AdminUser,
    db: DbSession,
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
) -> list[AdminOrderOut]:
    if status_filter is not None and status_filter not in ORDER_STATUSES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Holat noto'g'ri")
    query = (
        select(Order, Store.name)
        .outerjoin(Store, Store.id == Order.store_id)
        .options(selectinload(Order.lines))
        .order_by(Order.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    if status_filter is not None:
        query = query.where(Order.status == status_filter)
    rows = (await db.execute(query)).all()
    return [_out(order, store_name) for order, store_name in rows]


@router.patch("/{order_id}/status", response_model=AdminOrderOut, summary="Move or cancel any order")
async def change_order_status(
    order_id: uuid.UUID,
    body: OrderStatusUpdate,
    admin: AdminUser,
    db: DbSession,
) -> AdminOrderOut:
    row = (await db.execute(
        select(Order, Store.name)
        .outerjoin(Store, Store.id == Order.store_id)
        .where(Order.id == order_id)
        .options(selectinload(Order.lines))
        .with_for_update(of=Order)
    )).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Buyurtma topilmadi")
    order, store_name = row

    if change_status(order, body.status, by="admin", cancellable=ADMIN_CAN_CANCEL, reason=body.reason):
        await db.flush()
        logger.info("order_status_changed", order_id=str(order.id), by="admin", admin_id=str(admin.id), status=body.status)
    return _out(order, store_name)
