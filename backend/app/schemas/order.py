from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class OrderLineCreate(BaseModel):
    material_id: UUID | None = None
    product_name: str
    unit: str
    unit_price_uzs: int
    quantity: float


class OrderCreate(BaseModel):
    dealer_name: str
    lines: list[OrderLineCreate] = Field(..., min_length=1)


class OrderLineOut(BaseModel):
    id: UUID
    material_id: UUID | None
    product_name: str
    unit: str
    unit_price_uzs: int
    quantity: float

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: UUID
    user_id: UUID
    dealer_name: str
    total_uzs: int
    status: str
    created_at: datetime
    lines: list[OrderLineOut]

    model_config = {"from_attributes": True}
