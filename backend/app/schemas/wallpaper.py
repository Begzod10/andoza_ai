from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WallpaperUpdate(BaseModel):
    """All fields optional — a PATCH only touches what's supplied. The image
    itself isn't editable here — delete and re-upload instead, same reasoning
    as FurnitureUpdate."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    store_id: UUID | None = None
    price_uzs: int | None = Field(default=None, ge=0)
    description: str | None = None
    width_cm: float | None = Field(default=None, gt=0)
    height_cm: float | None = Field(default=None, gt=0)
    total_length_m: float | None = Field(default=None, gt=0)


class WallpaperOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    store_id: UUID | None
    store_name: str | None
    price_uzs: int | None
    description: str | None
    width_cm: float | None
    height_cm: float | None
    total_length_m: float | None
    # Absolute URL — the client loads it straight into a WebGL texture, so it
    # cannot be relative to the frontend origin.
    url: str
    content_type: str
    size_bytes: int
    created_at: datetime
