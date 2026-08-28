from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# ---------------------------------------------------------------------------
# Enum
# ---------------------------------------------------------------------------

OrderStatus = Enum(
    "accepted",
    "gathering",
    "on_the_way",
    "delivered",
    name="order_status",
)


class Order(Base):
    """A shop order placed by a user, containing one or more line items."""

    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dealer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    total_uzs: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(
        OrderStatus,
        nullable=False,
        default="accepted",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    lines: Mapped[list["OrderLine"]] = relationship(
        "OrderLine",
        back_populates="order",
        cascade="all, delete-orphan",
        lazy="select",
    )
    user: Mapped["User"] = relationship(  # noqa: F821
        "User",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<Order id={self.id} dealer_name={self.dealer_name!r} "
            f"total_uzs={self.total_uzs} status={self.status!r}>"
        )


class OrderLine(Base):
    """A single line item within an order."""

    __tablename__ = "order_lines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    material_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        comment="Soft reference to a material; no hard FK so mock/products don't break inserts",
    )
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str] = mapped_column(String(50), nullable=False)
    unit_price_uzs: Mapped[int] = mapped_column(BigInteger, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # Relationships
    order: Mapped["Order"] = relationship(
        "Order",
        back_populates="lines",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<OrderLine id={self.id} order_id={self.order_id} "
            f"product_name={self.product_name!r} quantity={self.quantity}>"
        )
