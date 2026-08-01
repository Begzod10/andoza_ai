from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

ElectricalDeviceType = Enum(
    "socket",
    "switch",
    "light",
    "panel",
    "box",
    name="electrical_device_type",
)


class RoomElectrical(Base):
    """
    One-to-one electrical plan header for a room.

    Holds plan-level metadata (currently just wiring length). Individual
    devices live in :class:`ElectricalDevice`, joined on ``room_id``.
    """

    __tablename__ = "room_electrical"

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
        unique=True,
        index=True,
    )
    wiring_meters: Mapped[float | None] = mapped_column(
        Numeric(8, 2), nullable=True, comment="Total cable run length in metres"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<RoomElectrical room_id={self.room_id} wiring_meters={self.wiring_meters}>"


class ElectricalDevice(Base):
    """A single device (socket, switch, light, panel, box) placed on a wall."""

    __tablename__ = "electrical_devices"
    __table_args__ = (
        CheckConstraint("wall_index >= 0 AND wall_index <= 3", name="ck_electrical_device_wall_index"),
        CheckConstraint("count >= 1", name="ck_electrical_device_count_positive"),
    )

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
    type: Mapped[str] = mapped_column(ElectricalDeviceType, nullable=False)
    variant: Mapped[str | None] = mapped_column(String(50), nullable=True)
    wall_index: Mapped[int] = mapped_column(Integer, nullable=False)
    x: Mapped[float] = mapped_column(Numeric(8, 4), nullable=False)
    y: Mapped[float] = mapped_column(Numeric(8, 4), nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
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

    def __repr__(self) -> str:
        return f"<ElectricalDevice id={self.id} type={self.type!r} wall_index={self.wall_index}>"
