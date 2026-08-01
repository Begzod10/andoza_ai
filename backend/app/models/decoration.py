from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RoomDecoration(Base):
    """
    One-to-one decoration selections for a room.

    walls     – {"material_id": "<uuid>|null", "finish": "paint|wallpaper", "color": "#RRGGBB|null"}
    floor     – {"material_id": "<uuid>|null"}
    ceiling   – {"material_id": "<uuid>|null"}
    furniture – [{"furniture_id": "<uuid>", "x": 120.0, "y": 80.0, "rotation": 90.0}, ...]
    """

    __tablename__ = "room_decorations"

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
    walls: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, comment="Wall finish selection"
    )
    floor: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, comment="Floor material selection"
    )
    ceiling: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, comment="Ceiling material selection"
    )
    furniture: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, comment="Placed furniture items"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<RoomDecoration room_id={self.room_id}>"
