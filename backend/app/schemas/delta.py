from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel

from app.schemas.estimate import EstimateLine
from app.schemas.room_state import RoomStateValue


class DeltaStage(BaseModel):
    stage: RoomStateValue
    label_uz: str
    already_done: bool


class DeltaResponse(BaseModel):
    room_id: UUID
    current_state: RoomStateValue

    # Reference point only — never presented as the price the user pays.
    full_lines: list[EstimateLine]
    full_total_uzs: int

    # What the user actually pays given the room's current progress.
    delta_lines: list[EstimateLine]
    delta_total_uzs: int

    delta_savings_uzs: int
    completed_stages: list[DeltaStage]
    remaining_stages: list[DeltaStage]
