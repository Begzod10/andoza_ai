from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class MaterialOfferOut(BaseModel):
    id: UUID
    material_id: UUID
    store_id: UUID
    store_name: str
    store_district: str | None
    store_partner_tier: str
    price_uzs: int
    in_stock: bool
    delivery_days: int

    model_config = {"from_attributes": True}
