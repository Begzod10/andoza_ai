from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.store import MODERATION_STATUSES


class Furniture(Base):
    __tablename__ = "furniture"
    __table_args__ = (
        CheckConstraint(
            "status IN (%s)" % ", ".join(f"'{t}'" for t in MODERATION_STATUSES),
            name="ck_furniture_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    store_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stores.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Nullable — built-in/generic items have no associated store",
    )
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name_uz: Mapped[str] = mapped_column(String(200), nullable=False)
    price_uzs: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
        comment="Retail price in UZS; null for generic catalogue items",
    )
    glb_key: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        comment="S3 key for the .glb 3-D model file",
    )
    glb_opt_key: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="Compressed copy of the .glb (meshopt + WebP); served instead of glb_key when set",
    )
    thumbnail_key: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        comment="S3 key for the model's preview image",
    )
    room_type: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        index=True,
        comment="Room this model is meant for (mehmonxona/oshxona/yotoqxona/"
                "hammom/balkon); null means usable in every room",
    )
    placement: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="pol",
        server_default="pol",
        comment="Where this model is meant to sit inside a room: "
                "pol (floor-standing) / devor (wall-mounted) / shift (ceiling-hung)",
    )
    footprint_w: Mapped[float | None] = mapped_column(
        Numeric(5, 2),
        nullable=True,
        comment="Footprint width in centimetres",
    )
    footprint_d: Mapped[float | None] = mapped_column(
        Numeric(5, 2),
        nullable=True,
        comment="Footprint depth in centimetres",
    )
    height_cm: Mapped[float | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
        comment="Height in centimetres; lets the AI layout keep tall pieces away from windows",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
        default="approved",
        server_default="approved",
        comment="pending | approved | rejected. A seller's upload starts pending (and "
                "inactive) until an admin approves it; see MODERATION_STATUSES.",
    )
    moderation_note: Mapped[str | None] = mapped_column(
        String(300), nullable=True, comment="Why an admin rejected it, shown to the seller"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    store: Mapped["Store | None"] = relationship(  # noqa: F821
        "Store",
        back_populates="furniture_items",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<Furniture id={self.id} name={self.name_uz!r} category={self.category!r}>"
