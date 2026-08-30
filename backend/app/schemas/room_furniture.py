from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class FurniturePlacementCreate(BaseModel):
    """Request to place furniture in a room."""

    furniture_id: UUID
    x: float = Field(ge=0, description="X position in cm")
    y: float = Field(ge=0, description="Y position in cm")
    rotation: float = Field(default=0, ge=0, le=360, description="Rotation angle in degrees")
    z_index: int = Field(default=0, description="Stacking order (higher = on top)")


class FurniturePlacementOut(BaseModel):
    """Response containing a single furniture placement."""

    id: UUID
    room_id: UUID
    furniture_id: UUID
    x: float
    y: float
    rotation: float
    z_index: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FurniturePlacementListOut(BaseModel):
    """Response containing a list of furniture placements for a room."""

    items: list[FurniturePlacementOut] = []
    count: int = 0
