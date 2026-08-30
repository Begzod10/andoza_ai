from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class FinishCreate(BaseModel):
    """Request to create or update a finish for a room surface."""

    surface: Literal["wall_a", "wall_b", "wall_c", "wall_d", "floor", "ceiling"]
    material_id: UUID | None = None
    finish_type: Literal["paint", "wallpaper", "tile", "laminate", "wood", "other"] | None = None
    color_hex: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    wall_index: int | None = Field(None, ge=0, le=3)


class FinishOut(BaseModel):
    """Response containing a single finish."""

    id: UUID
    room_id: UUID
    surface: str
    material_id: UUID | None
    finish_type: str | None
    color_hex: str | None
    wall_index: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FinishListOut(BaseModel):
    """Response containing a list of finishes for a room."""

    items: list[FinishOut] = []
    count: int = 0
