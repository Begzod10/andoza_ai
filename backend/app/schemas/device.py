from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class DeviceRegister(BaseModel):
    token: str = Field(min_length=1, max_length=4096)
    platform: Literal["android", "ios"]
    locale: Literal["uz", "ru", "en"] = "uz"


class DeviceUnregister(BaseModel):
    token: str = Field(min_length=1, max_length=4096)
