from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

VALID_ESTIMATE_STATUSES = ("draft", "final", "sent", "accepted")
_STATUS_LIST_SQL = "'{}'".format("','".join(VALID_ESTIMATE_STATUSES))


class Estimate(Base):
    """
    Immutable cost-estimate snapshot for a room.

    Once written, rows are never updated — a new Estimate is created each time
    the user recalculates.  This preserves a full history for the user and
    the usta.

    lines – ordered list of estimate line items, e.g.:
    [
        {
            "material_id": "<uuid>",
            "name_uz": "Bayramix Classic",
            "category": "boyoq",
            "unit": "litr",
            "qty": 12.5,
            "price_uzs": 45000,
            "subtotal_uzs": 562500
        },
        ...
    ]
    """

    __tablename__ = "estimates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    lines: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        comment="Ordered list of estimate line items",
    )
    total_uzs: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        comment="Sum of all line subtotals in UZS",
    )
    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        server_default="UZS",
        comment="ISO-4217-ish currency code for total_uzs (currently UZS only)",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="final",
        comment="Lifecycle status: draft | final | sent | accepted",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(f"status IN ({_STATUS_LIST_SQL})", name="ck_estimates_status"),
        Index("ix_estimates_room_id_created_at", "room_id", "created_at"),
    )

    # Relationships
    room: Mapped["Room"] = relationship(  # noqa: F821
        "Room",
        back_populates="estimates",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<Estimate id={self.id} room_id={self.room_id} "
            f"total_uzs={self.total_uzs} status={self.status!r}>"
        )
