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

from pydantic import BaseModel, ConfigDict, Field

MAX_CABINETS = 30


class CabinetIn(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1, max_length=64)
    width: int = Field(ge=150, le=1200)
    height: int = Field(ge=300, le=1000)
    depth: int = Field(ge=250, le=700)
    shelves: int = Field(ge=0, le=4)


class ProjectData(BaseModel):
    model_config = ConfigDict(extra="allow")

    schemaVersion: Literal[1]
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
