from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# ---------------------------------------------------------------------------
# Value lists (see below — these are NOT Postgres enums)
# ---------------------------------------------------------------------------

# Historical value list, kept for reference and for the legacy aliases the
# API still accepts. `surface` is NOT constrained to it any more: a finish may
# also name the room's own geometry wall id ("0".."N"), so an N-wall LiDAR
# polygon can have every one of its walls finished. See
# app.services.room_finishes for the full rationale.
LEGACY_FINISH_SURFACES: tuple[str, ...] = (
    "wall_a",
    "wall_b",
    "wall_c",
    "wall_d",
    "floor",
    "ceiling",
)

# Same story as the surface column below: these were declared as SQLAlchemy
# `Enum(..., name=...)`, which makes the asyncpg dialect bind every value as
# `$n::finish_surface_type` / `$n::finish_type` — Postgres types that were
# NEVER created. The table has always been plain VARCHAR + CHECK constraints
# (see alembic 1785000002), so EVERY write through the finishes API raised
# `UndefinedObjectError: type "finish_type" does not exist` and 500'd. Both
# columns are now declared as the String they actually are; the value lists
# stay enforced by the DB CHECK constraints and by the Pydantic schema.
LEGACY_FINISH_TYPES: tuple[str, ...] = (
    "paint",
    "wallpaper",
    "tile",
    "laminate",
    "wood",
    "other",
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
        String(64),
        nullable=False,
        comment=(
            "Surface identifier: 'floor', 'ceiling', a legacy 'wall_a'..'wall_d' "
            "alias, or the room's own geometry.walls[].id (e.g. '0'..'4')"
        ),
    )
    material_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("materials.id", ondelete="SET NULL"),
        nullable=True,
        comment="Reference to Material (e.g. paint can, wallpaper roll)",
    )
    finish_type: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="Type of finish (paint, wallpaper, etc.)"
    )
    color_hex: Mapped[str | None] = mapped_column(
        String(7), nullable=True, comment="Hex color code (e.g. #ff0000)"
    )
    wall_index: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="If surface is a wall, its positional index in geometry.walls (0-based)",
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
