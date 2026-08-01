from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

FinishSurfaceType = Enum(
    "wall_a",
    "wall_b",
    "wall_c",
    "wall_d",
    "floor",
    "ceiling",
    name="finish_surface_type",
)

FinishType = Enum(
    "paint",
    "wallpaper",
    "tile",
    "laminate",
    "wood",
    "other",
    name="finish_type",
)


class RoomFinish(Base):
    """
    Itemized finish selection for a single surface in a room.

    Replaces the legacy RoomDecoration.walls/floor/ceiling JSONB blob,
    enabling per-surface tracking of material, finish type, and color.
    """

    __tablename__ = "room_finishes"

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
    surface: Mapped[str] = mapped_column(
        FinishSurfaceType, nullable=False, comment="Surface identifier (wall_a, floor, etc.)"
    )
    material_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("materials.id", ondelete="SET NULL"),
        nullable=True,
        comment="Reference to Material (e.g. paint can, wallpaper roll)",
    )
    finish_type: Mapped[str | None] = mapped_column(
        FinishType, nullable=True, comment="Type of finish (paint, wallpaper, etc.)"
    )
    color_hex: Mapped[str | None] = mapped_column(
        String(7), nullable=True, comment="Hex color code (e.g. #ff0000)"
    )
    wall_index: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="If surface is a wall, which wall (0-3)"
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
    material: Mapped["Material | None"] = relationship(  # noqa: F821
        "Material",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<RoomFinish room_id={self.room_id} surface={self.surface!r}>"
