from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

PACK_UNITS = ("kg", "litr", "m", "m2", "dona")
_NOT_NULLABLE = ("store_id", "category", "name_uz", "unit", "price_uzs", "is_active")


def _clean_key(value: str | None) -> str | None:
    """Trim the smeta key; an empty one means "no key"."""
    if value is None:
        return None
    return value.strip() or None


class _MaterialFields(BaseModel):
    # category/unit are checked against the DB enums in the router, so a bad
    # value gets an Uzbek message instead of a pydantic one.
    category: str | None = None
    name_uz: str | None = Field(default=None, min_length=1, max_length=200)
    unit: str | None = None
    price_uzs: int | None = Field(default=None, gt=0)
    pack_qty: float | None = Field(default=None, gt=0)
    pack_unit: str | None = Field(default=None, pattern=r"^(kg|litr|m|m2|dona)$")
    smeta_key: str | None = Field(default=None, max_length=40)
    roll_width_cm: float | None = Field(default=None, gt=0)
    roll_length_m: float | None = Field(default=None, gt=0)

    @field_validator("smeta_key", mode="before")
    @classmethod
    def _strip_key(cls, v):
        return _clean_key(v) if isinstance(v, str) or v is None else v


class MaterialCreate(_MaterialFields):
    store_id: UUID
    category: str
    name_uz: str = Field(min_length=1, max_length=200)
    unit: str
    price_uzs: int = Field(gt=0)
    is_active: bool = True


class MaterialUpdate(_MaterialFields):
    store_id: UUID | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def _no_null_required(self):
        for name in self.model_fields_set:
            if name in _NOT_NULLABLE and getattr(self, name) is None:
                raise ValueError(f"{name} bo'sh bo'lishi mumkin emas")
        return self


class AdminMaterialOut(BaseModel):
    id: UUID
    store_id: UUID
    store_name: str | None = None
    category: str
    name_uz: str
    unit: str
    price_uzs: int
    pack_qty: float | None = None
    pack_unit: str | None = None
    smeta_key: str | None = None
    roll_width_cm: float | None = None
    roll_length_m: float | None = None
    color_hex: str | None = None
    image_url: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class PaginatedAdminMaterials(BaseModel):
    items: list[AdminMaterialOut]
    total: int
    page: int
    per_page: int
