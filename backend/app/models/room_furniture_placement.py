from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RoomFurniturePlacement(Base):
    """
    Itemized furniture placement within a room.

    Replaces the legacy RoomDecoration.furniture JSONB array, enabling
    per-item tracking of position, rotation, and z-index (stacking order).
    """

    __tablename__ = "room_furniture_placements"

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
    furniture_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("furniture.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    x: Mapped[float] = mapped_column(
        Numeric(8, 2),
        nullable=False,
        comment="X position in cm",
    )
    y: Mapped[float] = mapped_column(
        Numeric(8, 2),
        nullable=False,
        comment="Y position in cm",
    )
    rotation: Mapped[float] = mapped_column(
        Numeric(6, 2),
        nullable=False,
        default=0,
        comment="Rotation angle in degrees (0-360)",
    )
    z_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Stacking order (higher = on top)",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    room: Mapped["Room"] = relationship(  # noqa: F821
        "Room",
        lazy="select",
    )
    furniture: Mapped["Furniture"] = relationship(  # noqa: F821
        "Furniture",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<RoomFurniturePlacement room_id={self.room_id} furniture_id={self.furniture_id}>"
