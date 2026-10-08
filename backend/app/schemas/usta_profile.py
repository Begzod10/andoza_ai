from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.usta import UstaCategory
from app.schemas.auth import _normalize_phone

# The trades the catalog knows; a self-service application must pick one.
USTA_CATEGORIES: tuple[str, ...] = tuple(UstaCategory.enums)


def _check_category(v: str | None) -> str | None:
    if v is not None and v not in USTA_CATEGORIES:
        raise ValueError(f"Kasb {', '.join(USTA_CATEGORIES)} dan biri bo'lishi kerak")
    return v


class UstaApply(BaseModel):
    """A user's application to be listed as an usta. Rating, job count, verified
    and status are never theirs to set."""

    name: str = Field(min_length=1, max_length=200)
    category: str
    district: str | None = Field(default=None, max_length=100)
    phone: str
    telegram: str | None = Field(default=None, max_length=100)
    price_min: int | None = Field(default=None, ge=0)
    price_max: int | None = Field(default=None, ge=0)

    @field_validator("category")
    @classmethod
    def _category(cls, v: str) -> str:
        return _check_category(v)  # type: ignore[return-value]

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return _normalize_phone(v)

    @model_validator(mode="after")
    def _price_range(self) -> "UstaApply":
        if self.price_min is not None and self.price_max is not None and self.price_max < self.price_min:
            raise ValueError("Maksimal narx minimaldan kam bo'lmasligi kerak")
        return self


class UstaProfileUpdate(BaseModel):
    """All optional: a PATCH changes only what is sent."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = None
    district: str | None = Field(default=None, max_length=100)
    phone: str | None = None
    telegram: str | None = Field(default=None, max_length=100)
    price_min: int | None = Field(default=None, ge=0)
    price_max: int | None = Field(default=None, ge=0)

    @field_validator("category")
    @classmethod
    def _category(cls, v: str | None) -> str | None:
        return _check_category(v)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        return None if v is None else _normalize_phone(v)


class UstaProfileOut(BaseModel):
    id: UUID
    name: str
    category: str
    district: str | None
    phone: str
    telegram: str | None
    price_min: int | None
    price_max: int | None
    rating: float
    jobs_count: int
    verified: bool
    status: str
    moderation_note: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PendingUstaOut(UstaProfileOut):
    """What a moderator sees: the application plus who sent it."""

    owner_user_id: UUID | None = None


LEAD_STATUSES: tuple[str, ...] = ("new", "viewed", "contacted", "closed")


class UstaLeadOut(BaseModel):
    """A customer who asked this usta for work, as the usta's inbox shows it. The
    client's phone is here because contacting the usta is what created the lead."""

    id: UUID
    status: str
    created_at: datetime
    client_name: str | None
    client_phone: str | None
    room_name: str | None
    message: str | None = None
    total_uzs: int | None
    lines_count: int


class UstaLeadUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        # "new" is what a lead starts as, not something the usta moves it back to.
        if v not in LEAD_STATUSES[1:]:
            raise ValueError(f"Holat {', '.join(LEAD_STATUSES[1:])} dan biri bo'lishi kerak")
        return v
