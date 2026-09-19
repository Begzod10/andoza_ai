from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class FinishCreate(BaseModel):
    """Request to create or update a finish for a room surface.

    ``surface`` is deliberately NOT a fixed value list any more. A LiDAR
    polygon room's walls are ids ``"0"``, ``"1"``, … — any hardcoded list
    (even one extended to ``wall_e``) just moves the ceiling. It is instead
    validated against the room's real geometry in the router, by
    ``app.services.room_finishes.validate_finish_surface``, which still
    accepts (and stores verbatim) the legacy ``wall_a``..``wall_d`` aliases
    plus ``floor`` / ``ceiling``.

    ``wall_index`` is likewise no longer capped at 3; the router bounds it by
    the room's actual wall count.
    """

    surface: str = Field(min_length=1, max_length=64)
    material_id: UUID | None = None
    finish_type: Literal["paint", "wallpaper", "tile", "laminate", "wood", "other"] | None = None
    color_hex: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    wall_index: int | None = Field(None, ge=0)


class FinishOut(BaseModel):
    """Response containing a single finish."""

    id: UUID
    room_id: UUID
    surface: str
    material_id: UUID | None
    finish_type: str | None
    color_hex: str | None
    wall_index: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FinishListOut(BaseModel):
    """Response containing a list of finishes for a room."""

    items: list[FinishOut] = []
    count: int = 0
