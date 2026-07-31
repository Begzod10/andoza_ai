from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class WallpaperOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    # Absolute URL — the client loads it straight into a WebGL texture, so it
    # cannot be relative to the frontend origin.
    url: str
    content_type: str
    size_bytes: int
    created_at: datetime
