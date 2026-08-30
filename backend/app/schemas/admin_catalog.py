from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Kept in sync with frontend/src/lib/furnitureCatalog.ts (FurnitureCategory)
FURNITURE_CATEGORIES = {"divan", "stol", "stul", "karavot", "shkaf", "lampa", "boshqa"}

# Kept in sync with frontend/src/locale/uz.ts wizard room-type labels.
# A model with room_type=None is usable in every room ("barchasi").
ROOM_TYPES = {"mehmonxona", "oshxona", "yotoqxona", "hammom", "balkon"}

PARTNER_TIERS = {"standard", "gold", "platinum"}


class StoreCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    district: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    telegram: str | None = Field(default=None, max_length=100)
    logo_color: str | None = Field(default=None, max_length=7)
    partner_tier: str = Field(default="standard")


class StoreUpdate(BaseModel):
    """All fields optional — a PATCH only touches what's supplied."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    district: str | None = None
    phone: str | None = None
    telegram: str | None = None
    logo_color: str | None = None
    partner_tier: str | None = None
    is_active: bool | None = None


class StoreAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    district: str | None
    phone: str | None
    telegram: str | None
    logo_color: str | None
    partner_tier: str
    is_active: bool
    created_at: datetime


class FurnitureUpdate(BaseModel):
    """All fields optional — a PATCH only touches what's supplied. Replacing
    the GLB/thumbnail file itself is not supported here: delete and re-upload
    instead, so a stored file is never silently swapped under a live id."""

    name_uz: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = None
    room_type: str | None = None
    store_id: UUID | None = None
    price_uzs: int | None = Field(default=None, ge=0)
    footprint_w: float | None = Field(default=None, gt=0)
    footprint_d: float | None = Field(default=None, gt=0)
    is_active: bool | None = None


class FurnitureAdminOut(BaseModel):
    id: UUID
    store_id: UUID | None
    store_name: str | None
    category: str
    room_type: str | None
    name_uz: str
    price_uzs: int | None
    glb_url: str | None
    thumbnail_url: str | None
    footprint_w: float | None
    footprint_d: float | None
    is_active: bool
    created_at: datetime
