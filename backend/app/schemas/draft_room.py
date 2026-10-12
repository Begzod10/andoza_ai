from __future__ import annotations

import json
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator

# A wizard snapshot is a few kilobytes (walls, openings, a design choice or
# two); the cap keeps the autosave from being used as free storage.
MAX_STATE_BYTES = 256 * 1024


def _check_size(state: dict) -> dict:
    if len(json.dumps(state, separators=(",", ":"))) > MAX_STATE_BYTES:
        raise ValueError(f"state {MAX_STATE_BYTES // 1024} KB dan oshmasligi kerak")
    return state


class DraftRoomCreate(BaseModel):
    state: dict = {}

    @field_validator("state")
    @classmethod
    def _size(cls, v: dict) -> dict:
        return _check_size(v)


class DraftRoomUpdate(BaseModel):
    state: dict

    @field_validator("state")
    @classmethod
    def _size(cls, v: dict) -> dict:
        return _check_size(v)


class DraftRoomOut(BaseModel):
    id: UUID
    state: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
