from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Valid construction-progress values shared by current_state and the
# per-surface overrides.
#
#   xom        – korobka / raw shell, no wall prep at all
#   suvoq      – plastered (wet plaster applied, not yet primed/puttied)
#   shpaklovka – primed + puttied (grunt + shpatlyovka done), ready to paint
#   tayyor     – fully finished / pardoz applied
#
# Order matters — app.services.smeta.STAGE_ORDER relies on this exact
# sequence to decide which prep stages are already complete for a room.
VALID_ROOM_STATES = ("xom", "suvoq", "shpaklovka", "tayyor")
_STATE_LIST_SQL = "'{}'".format("','".join(VALID_ROOM_STATES))


class RoomState(Base):
    """
    Construction-progress state for a room (one row per room, 1:1 with Room).

    current_state – overall room state, see VALID_ROOM_STATES above.
    floor_state / ceiling_state / walls_state – optional per-surface
                     overrides; when NULL the surface is assumed to match
                     current_state.
    """

    __tablename__ = "room_states"

    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        primary_key=True,
    )
    current_state: Mapped[str] = mapped_column(String(10), nullable=False)
    floor_state: Mapped[str | None] = mapped_column(String(10), nullable=True)
    ceiling_state: Mapped[str | None] = mapped_column(String(10), nullable=True)
    walls_state: Mapped[str | None] = mapped_column(String(10), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            f"current_state IN ({_STATE_LIST_SQL})",
            name="ck_room_states_current_state",
        ),
        CheckConstraint(
            f"floor_state IS NULL OR floor_state IN ({_STATE_LIST_SQL})",
            name="ck_room_states_floor_state",
        ),
        CheckConstraint(
            f"ceiling_state IS NULL OR ceiling_state IN ({_STATE_LIST_SQL})",
            name="ck_room_states_ceiling_state",
        ),
        CheckConstraint(
            f"walls_state IS NULL OR walls_state IN ({_STATE_LIST_SQL})",
            name="ck_room_states_walls_state",
        ),
    )

    # Relationships
    room: Mapped["Room"] = relationship(  # noqa: F821
        "Room",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<RoomState room_id={self.room_id} current_state={self.current_state!r}>"
