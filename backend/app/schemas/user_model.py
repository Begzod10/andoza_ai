from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UserModelUpdate(BaseModel):
    """All fields optional — a PATCH only touches what's supplied. The GLB
    itself isn't editable here — delete and re-import instead, same reasoning
    as WallpaperUpdate."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = Field(default=None, max_length=32)
    placement: str | None = Field(default=None, max_length=16)
    price_uzs: int | None = Field(default=None, ge=0)


class UserModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    category: str | None
    placement: str | None
    price_uzs: int | None
    scale: float
    size_w_m: float
    size_d_m: float
    size_h_m: float
    has_textures: bool
    # Absolute URLs — the GLB is fetched straight into the WebGL loader, so
    # neither can be relative to the frontend origin.
    url: str
    thumbnail_url: str | None
    content_type: str
    size_bytes: int
    created_at: datetime
