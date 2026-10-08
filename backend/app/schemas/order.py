from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class OrderLineCreate(BaseModel):
    material_id: UUID | None = None
    furniture_id: UUID | None = None
    product_name: str
    unit: str
    unit_price_uzs: int
    quantity: float

    @model_validator(mode="after")
    def _one_catalog_reference(self) -> "OrderLineCreate":
        if self.material_id is not None and self.furniture_id is not None:
            raise ValueError("A line is either a material or a piece of furniture, not both.")
        return self


PaymentMethod = Literal["cash", "card"]


class OrderCreate(BaseModel):
    dealer_name: str
    lines: list[OrderLineCreate] = Field(..., min_length=1)
    delivery_address: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=50)
    payment_method: PaymentMethod | None = None

    @field_validator("delivery_address", "phone")
    @classmethod
    def _blank_is_none(cls, value: str | None) -> str | None:
        """A form field left as spaces is "not given", not an address of spaces."""
        if value is None:
            return None
        value = value.strip()
        return value or None


class OrderLineOut(BaseModel):
    id: UUID
    material_id: UUID | None
    furniture_id: UUID | None = None
    product_name: str
    unit: str
    unit_price_uzs: int
    quantity: float

    model_config = {"from_attributes": True}


ORDER_STATUSES = ("accepted", "gathering", "on_the_way", "delivered")

# A shop moves an order forward one stage at a time; there is no way back and no
# skipping, so the buyer's tracking never jumps or un-delivers.
NEXT_ORDER_STATUS = {
    "accepted": "gathering",
    "gathering": "on_the_way",
    "on_the_way": "delivered",
}


class OrderStatusUpdate(BaseModel):
    status: Literal["accepted", "gathering", "on_the_way", "delivered"]


class SellerOrderOut(BaseModel):
    """An order as its shop sees it: what to bring and where. Not the buyer's account id."""

    id: UUID
    dealer_name: str
    total_uzs: int
    status: str
    delivery_address: str | None = None
    phone: str | None = None
    payment_method: str | None = None
    created_at: datetime
    lines: list[OrderLineOut]

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: UUID
    user_id: UUID
    dealer_name: str
    total_uzs: int
    status: str
    delivery_address: str | None = None
    phone: str | None = None
    payment_method: str | None = None
    created_at: datetime
    lines: list[OrderLineOut]

    model_config = {"from_attributes": True}
