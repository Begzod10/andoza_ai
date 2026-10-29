"""Request/response shapes for the /mebel mini-app.

Only what the engine relies on is checked here — the schema version, the
cabinet count and each cabinet's size and shelf ranges (the same limits as
frontend/src/features/mebel/engine/validate.ts). The rest of the project JSON
is the frontend's to evolve, so unknown fields are kept as they are.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_CABINETS = 30


# Size and shelf limits per cabinet type: the same as LIMITS_BY_TYPE in
# frontend/src/features/mebel/engine/validate.ts.
LIMITS_BY_TYPE: dict[str, dict[str, tuple[int, int]]] = {
    "base": {"width": (150, 1200), "height": (300, 1000), "depth": (250, 700), "shelves": (0, 4)},
    "wall": {"width": (150, 1200), "height": (300, 1000), "depth": (200, 400), "shelves": (0, 4)},
    "tall": {"width": (150, 1200), "height": (1200, 2400), "depth": (300, 650), "shelves": (0, 8)},
}


class CabinetIn(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1, max_length=64)
    # A cabinet saved before types existed is a base cabinet.
    type: Literal["base", "wall", "tall"] = "base"
    width: int
    height: int
    depth: int
    shelves: int
    doors: int | None = Field(default=None, ge=0, le=2)

    @model_validator(mode="after")
    def _fits_its_type(self) -> "CabinetIn":
        for field, (lo, hi) in LIMITS_BY_TYPE[self.type].items():
            value = getattr(self, field)
            if not lo <= value <= hi:
                raise ValueError(f"{field} {value} is outside {lo}-{hi} for a {self.type} cabinet")
        return self


class SheetIn(BaseModel):
    length: int = Field(ge=100, le=10000)
    width: int = Field(ge=100, le=10000)


class DefaultsIn(BaseModel):
    """Only the sheet size is checked: the engine divides by it."""
    model_config = ConfigDict(extra="allow")

    sheet: SheetIn | None = None


class ProjectData(BaseModel):
    model_config = ConfigDict(extra="allow")

    schemaVersion: Literal[1]
    defaults: DefaultsIn
    cabinets: list[CabinetIn] = Field(max_length=MAX_CABINETS)


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    data: ProjectData


class ProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    updated_at: datetime


class ProjectOut(ProjectSummary):
    data: dict
    schema_version: int
    created_at: datetime


class PriceBookData(BaseModel):
    model_config = ConfigDict(extra="allow")

    markupPercent: float = Field(default=0, ge=0, le=300)


class PriceBookIn(BaseModel):
    data: PriceBookData
