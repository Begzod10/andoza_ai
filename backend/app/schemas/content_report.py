from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

ReportTargetType = Literal["usta", "product", "seller", "portfolio_item", "wallpaper"]
ReportReason = Literal["spam", "inappropriate", "fraud", "other"]
ReportStatus = Literal["open", "resolved", "dismissed"]


class ReportCreate(BaseModel):
    target_type: ReportTargetType
    # The target's id as the client knows it (UUIDs, numeric ids, ...).
    target_id: str = Field(min_length=1, max_length=64)
    reason: ReportReason
    details: str | None = Field(default=None, max_length=1000)


class ReportCreated(BaseModel):
    id: UUID
    status: ReportStatus


class ReportOut(BaseModel):
    id: UUID
    reporter_id: UUID
    target_type: str
    target_id: str
    reason: str
    details: str | None
    status: str
    created_at: datetime
    resolved_at: datetime | None

    model_config = {"from_attributes": True}


class ReportDecision(BaseModel):
    status: Literal["resolved", "dismissed"]
