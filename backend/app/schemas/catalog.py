from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class FurnitureOut(BaseModel):
    id: UUID
    store_id: UUID | None
    store_name: str | None
    category: str
    room_type: str | None
    placement: str
    name_uz: str
    price_uzs: int | None
    # Resolved absolute URLs — the client loads glb_url straight into the
    # studio's 3D scene, so it can't be a bare storage key.
    glb_url: str | None
    thumbnail_url: str | None
    footprint_w: float | None
    footprint_d: float | None


class PaginatedFurniture(BaseModel):
    items: list[FurnitureOut]
    total: int
    page: int
    per_page: int


class StoreOut(BaseModel):
    id: UUID
    name: str
    district: str | None
    phone: str | None
    telegram: str | None
    logo_color: str | None
    partner_tier: str

    model_config = {"from_attributes": True}


class RegionOut(BaseModel):
    name: str
    code: str
    districts: list[str]
