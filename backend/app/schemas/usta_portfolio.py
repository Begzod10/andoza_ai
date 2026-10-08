from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PortfolioItemOut(BaseModel):
    id: UUID
    image_url: str | None
    caption: str | None
    created_at: datetime
