from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

DeviceType = Literal["socket", "switch", "light", "panel", "box"]


class DeviceCreate(BaseModel):
    type: DeviceType
    variant: str | None = Field(default=None, max_length=50)
    wall_index: int = Field(ge=0, le=3)
    x: float
    y: float
    count: int = Field(default=1, ge=1, le=100)


class DeviceUpdate(BaseModel):
    type: DeviceType | None = None
    variant: str | None = Field(default=None, max_length=50)
    wall_index: int | None = Field(default=None, ge=0, le=3)
    x: float | None = None
    y: float | None = None
    count: int | None = Field(default=None, ge=1, le=100)


class DeviceOut(BaseModel):
    id: UUID
    room_id: UUID
    type: DeviceType
    variant: str | None
    wall_index: int
    x: float
    y: float
    count: int

    model_config = {"from_attributes": True}


class ElectricalPlanUpdate(BaseModel):
    devices: list[DeviceCreate] = Field(default_factory=list)
    wiring_meters: float | None = Field(default=None, ge=0)


class ElectricalPlanOut(BaseModel):
    room_id: UUID
    devices: list[DeviceOut]
    wiring_meters: float | None
    updated_at: datetime

    model_config = {"from_attributes": True}
