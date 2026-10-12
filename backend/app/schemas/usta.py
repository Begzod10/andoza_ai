from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.auth import _normalize_phone


class UstaOut(BaseModel):
    id: UUID
    name: str
    category: str
    district: str | None
    lat: float | None = None
    lng: float | None = None
    phone: str
    telegram: str | None
    avatar_url: str | None = None
    rating: float
    jobs_count: int
    price_min: int | None
    price_max: int | None
    verified: bool

    model_config = {"from_attributes": True}


class LeadCreate(BaseModel):
    usta_id: UUID
    room_id: UUID | None = None
    message: str | None = Field(default=None, max_length=500)
    # Typed on the request form ("+998 90 123 45 67"). A username-only account
    # has no phone of its own, so without this the usta cannot call back.
    contact_phone: str | None = Field(default=None, max_length=30)

    @field_validator("contact_phone")
    @classmethod
    def _contact_phone(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        return _normalize_phone(re.sub(r"[\s\-()]", "", v))


class LeadOut(BaseModel):
    id: UUID
    usta_id: UUID
    user_id: UUID
    room_id: UUID | None
    smeta_snapshot: dict | None
    message: str | None = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
