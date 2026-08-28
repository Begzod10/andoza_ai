from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

# Keep in sync with app.models.room_state.VALID_ROOM_STATES
RoomStateValue = Literal["xom", "suvoq", "shpaklovka", "tayyor"]


class RoomStateIn(BaseModel):
    """Body for POST /rooms/{room_id}/state — create or fully replace."""

    current_state: RoomStateValue
    floor_state: RoomStateValue | None = None
    ceiling_state: RoomStateValue | None = None
    walls_state: RoomStateValue | None = None


class RoomStatePatch(BaseModel):
    """Body for PATCH /rooms/{room_id}/state — partial update."""

    current_state: RoomStateValue | None = None
    floor_state: RoomStateValue | None = None
    ceiling_state: RoomStateValue | None = None
    walls_state: RoomStateValue | None = None


class RoomStateOut(BaseModel):
    room_id: UUID
    current_state: RoomStateValue
    floor_state: RoomStateValue | None
    ceiling_state: RoomStateValue | None
    walls_state: RoomStateValue | None
    updated_at: datetime

    model_config = {"from_attributes": True}
