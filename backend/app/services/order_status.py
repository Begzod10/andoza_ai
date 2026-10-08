"""How an order's status may change, and who may change it.

An order moves forward one stage at a time (accepted, gathering, on the way, delivered) and may
be cancelled while it is still with the shop. Delivered and cancelled are final. The same rules
serve the buyer, the shop and the administrators; they differ only in how far along an order may
still be cancelled by each:

  * the buyer, only before the shop has started on it (accepted);
  * the shop, until it has left (accepted, gathering);
  * an administrator, until it is delivered.
"""
from __future__ import annotations

from fastapi import HTTPException, status

from app.schemas.order import NEXT_ORDER_STATUS

BUYER_CAN_CANCEL = frozenset({"accepted"})
SELLER_CAN_CANCEL = frozenset({"accepted", "gathering"})
ADMIN_CAN_CANCEL = frozenset({"accepted", "gathering", "on_the_way"})

_MIN_REASON = 3


def change_status(order, target: str, *, by: str, cancellable: frozenset[str], reason: str | None = None) -> bool:
    """Move ``order`` to ``target`` if the rules allow it. Returns whether anything changed
    (asking for the status it already has is a no-op, so a repeated tap is harmless); raises the
    HTTP error the caller should answer with when it is not allowed."""
    if target == order.status:
        return False

    if target == "cancelled":
        if order.status not in cancellable:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bu bosqichda buyurtmani bekor qilib bo'lmaydi.",
            )
        reason = (reason or "").strip()
        if len(reason) < _MIN_REASON:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Bekor qilish sababini yozing.",
            )
        order.status = "cancelled"
        order.cancelled_by = by
        order.cancel_reason = reason[:300]
        return True

    if NEXT_ORDER_STATUS.get(order.status) != target:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Buyurtma holatini faqat keyingi bosqichga o'tkazish mumkin.",
        )
    order.status = target
    return True
