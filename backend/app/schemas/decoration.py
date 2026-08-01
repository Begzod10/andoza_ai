from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class WallsDecoration(BaseModel):
    material_id: UUID | None = None
    finish: Literal["paint", "wallpaper"] = "paint"
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class FloorDecoration(BaseModel):
    material_id: UUID | None = None


class CeilingDecoration(BaseModel):
    material_id: UUID | None = None


class FurniturePlacement(BaseModel):
    furniture_id: UUID
    x: float
    y: float
    rotation: float = Field(default=0.0, ge=-360.0, le=360.0)


class DecorationUpdate(BaseModel):
    walls: WallsDecoration = Field(default_factory=WallsDecoration)
    floor: FloorDecoration = Field(default_factory=FloorDecoration)
    ceiling: CeilingDecoration = Field(default_factory=CeilingDecoration)
    furniture: list[FurniturePlacement] = Field(default_factory=list)


class DecorationOut(BaseModel):
    room_id: UUID
    walls: WallsDecoration
    floor: FloorDecoration
    ceiling: CeilingDecoration
    furniture: list[FurniturePlacement]
    updated_at: datetime

    model_config = {"from_attributes": True}
