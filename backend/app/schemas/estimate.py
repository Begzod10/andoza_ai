from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class EstimateLine(BaseModel):
    label: str
    formula: str
    quantity: float
    unit: str
    unit_price: int
    total_uzs: int
    is_approximate: bool = False
    store_id: UUID | None = None
    category: str = ""


class EstimateResponse(BaseModel):
    id: UUID
    room_id: UUID
    lines: list[EstimateLine]
    total_uzs: int
    total_min: int
    total_max: int
    currency: str = "UZS"
    status: str = "final"
    created_at: datetime
    has_electrical: bool


class EstimateSummary(BaseModel):
    """Lightweight row used by the paginated estimate-history endpoint."""

    id: UUID
    room_id: UUID
    total_uzs: int
    currency: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedEstimates(BaseModel):
    items: list[EstimateSummary]
    total: int
    limit: int
    offset: int
