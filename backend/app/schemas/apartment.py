from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.room import RoomOut


class ApartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    developer: str | None = Field(default=None, max_length=200)


class ApartmentOut(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    address: str | None
    developer: str | None
    renovation_stage: int = 1
    created_at: datetime

    model_config = {"from_attributes": True}


class ApartmentUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    developer: str | None = None
    renovation_stage: int | None = Field(default=None, ge=1, le=8)


class ApartmentWithRooms(ApartmentOut):
    rooms: list[RoomOut] = []
