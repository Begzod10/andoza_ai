from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.shop_inquiry import INQUIRY_STATUSES


class ShopInquiryCreate(BaseModel):
    furniture_id: UUID | None = None
    room_id: UUID | None = None
    message: str | None = Field(default=None, max_length=500)

    @field_validator("message")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        v = v.strip() if v else None
        return v or None


class ShopInquiryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    store_id: UUID
    furniture_id: UUID | None
    room_id: UUID | None
    message: str | None
    status: str
    created_at: datetime


class SellerInquiryOut(BaseModel):
    id: UUID
    status: str
    created_at: datetime
    client_name: str | None
    client_phone: str | None
    message: str | None
    product_name: str | None
    room_name: str | None


class SellerInquiryUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        # "new" is what an inquiry starts as, not something the seller moves it back to.
        if v not in INQUIRY_STATUSES[1:]:
            raise ValueError(f"Holat {', '.join(INQUIRY_STATUSES[1:])} dan biri bo'lishi kerak")
        return v


class ProductCounts(BaseModel):
    total: int
    approved: int
    pending: int
    rejected: int


class InquiryCounts(BaseModel):
    total: int
    new: int


class TopProduct(BaseModel):
    id: UUID
    name_uz: str
    placements: int


class SellerStatsOut(BaseModel):
    products: ProductCounts
    visible: int
    inquiries: InquiryCounts
    placements_total: int
    top_products: list[TopProduct]
