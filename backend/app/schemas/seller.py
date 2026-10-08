from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.admin_catalog import FURNITURE_CATEGORIES, PLACEMENTS, ROOM_TYPES  # noqa: F401  (re-exported for the router)
from app.schemas.usta_profile import PendingUstaOut

_HEX_COLOR = r"^#[0-9A-Fa-f]{6}$"


class StoreApply(BaseModel):
    """A user's application to run a shop. The tier and status are never theirs to set."""

    name: str = Field(min_length=1, max_length=200)
    district: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    telegram: str | None = Field(default=None, max_length=100)
    logo_color: str | None = Field(default=None, pattern=_HEX_COLOR)


class SellerStoreUpdate(BaseModel):
    """All optional: a PATCH changes only what is sent."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    district: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    telegram: str | None = Field(default=None, max_length=100)
    logo_color: str | None = Field(default=None, pattern=_HEX_COLOR)


class SellerStoreOut(BaseModel):
    id: UUID
    name: str
    district: str | None
    phone: str | None
    telegram: str | None
    logo_color: str | None
    partner_tier: str
    status: str
    moderation_note: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SellerFurnitureUpdate(BaseModel):
    """What a seller may change on a model after upload. The GLB itself is not
    replaceable — delete and upload again, which sends it back through approval."""

    name_uz: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = None
    room_type: str | None = None
    placement: str | None = None
    price_uzs: int | None = Field(default=None, ge=0)
    footprint_w: float | None = Field(default=None, gt=0, le=2000)
    footprint_d: float | None = Field(default=None, gt=0, le=2000)
    height_cm: float | None = Field(default=None, gt=0, le=1000)
    # Hide an approved model from the catalog, or show it again.
    is_active: bool | None = None


class SellerFurnitureOut(BaseModel):
    id: UUID
    category: str
    room_type: str | None
    placement: str
    name_uz: str
    price_uzs: int | None
    glb_url: str | None
    thumbnail_url: str | None
    footprint_w: float | None
    footprint_d: float | None
    height_cm: float | None = None
    is_active: bool
    status: str
    moderation_note: str | None
    created_at: datetime


class SellerFurniturePage(BaseModel):
    items: list[SellerFurnitureOut]
    total: int
    page: int
    per_page: int


class RejectIn(BaseModel):
    note: str = Field(min_length=1, max_length=300)


class PendingStoreOut(SellerStoreOut):
    owner_user_id: UUID | None


class PendingFurnitureOut(SellerFurnitureOut):
    store_id: UUID | None
    store_name: str | None


class PendingOut(BaseModel):
    stores: list[PendingStoreOut]
    furniture: list[PendingFurnitureOut]
    # Craftsman applications. Defaulted so a client that predates them still parses.
    ustalar: list[PendingUstaOut] = []
