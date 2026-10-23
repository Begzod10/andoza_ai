from __future__ import annotations

import functools
import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import AdminUser, DbSession
from app.core.cache import cache_delete_prefix
from app.database import run_after_commit
from app.models.material import Material, MaterialCategory, MaterialUnit
from app.models.store import Store
from app.schemas.admin_materials import (
    AdminMaterialOut,
    MaterialCreate,
    MaterialUpdate,
    PaginatedAdminMaterials,
)
from app.services.smeta_keys import smeta_key_problem

router = APIRouter(prefix="/admin/materials", tags=["admin-materials"])

_FIELDS = (
    "category", "unit", "pack_qty", "pack_unit", "smeta_key",
    "roll_width_cm", "roll_length_m",
)


def _problem(m: dict) -> str | None:
    """First thing wrong with a material's (merged) state, or None."""
    if m["category"] not in MaterialCategory.enums:
        return "Kategoriya noto'g'ri"
    if m["unit"] not in MaterialUnit.enums:
        return "Birlik noto'g'ri"
    if (m["pack_qty"] is None) != (m["pack_unit"] is None):
        return "Qadoq hajmi va birligi birga kiritiladi"
    if m["category"] != "oboy" and (
        m["roll_width_cm"] is not None or m["roll_length_m"] is not None
    ):
        return "Rulon o'lchami faqat oboy uchun"
    return smeta_key_problem(m["smeta_key"], m["unit"], m["pack_qty"], m["pack_unit"])


def _reject(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


def _out(m: Material, store_name: str | None = None) -> AdminMaterialOut:
    out = AdminMaterialOut.model_validate(m)
    out.store_name = store_name if store_name is not None else (m.store.name if m.store else None)
    return out


@router.get("", response_model=PaginatedAdminMaterials, summary="List materials (admin only)")
async def list_materials(
    admin: AdminUser,
    db: DbSession,
    category: str | None = None,
    store_id: uuid.UUID | None = None,
    smeta: bool = False,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> PaginatedAdminMaterials:
    filters = []
    if category:
        filters.append(Material.category == category)
    if store_id:
        filters.append(Material.store_id == store_id)
    if smeta:
        filters.append(Material.smeta_key.is_not(None))
    if q:
        filters.append(Material.name_uz.ilike(f"%{q}%"))

    total = (await db.execute(select(func.count()).select_from(Material).where(*filters))).scalar_one()
    rows = (
        await db.execute(
            select(Material)
            .options(selectinload(Material.store))
            .where(*filters)
            .order_by(Material.category, Material.name_uz)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).scalars().all()
    return PaginatedAdminMaterials(
        items=[_out(m) for m in rows], total=total, page=page, per_page=per_page
    )


@router.post(
    "", response_model=AdminMaterialOut, status_code=status.HTTP_201_CREATED,
    summary="Add a material (admin only)",
)
async def create_material(body: MaterialCreate, admin: AdminUser, db: DbSession) -> AdminMaterialOut:
    problem = _problem({f: getattr(body, f) for f in _FIELDS})
    if problem:
        raise _reject(problem)
    store = await db.get(Store, body.store_id)
    if store is None:
        raise _reject("Do'kon topilmadi")

    material = Material(
        store_id=body.store_id,
        name_uz=body.name_uz,
        price_uzs=body.price_uzs,
        is_active=body.is_active,
        **{f: getattr(body, f) for f in _FIELDS},
    )
    db.add(material)
    await db.flush()
    await db.refresh(material)
    run_after_commit(db, functools.partial(cache_delete_prefix, "materials:"))
    return _out(material, store.name)


@router.patch("/{material_id}", response_model=AdminMaterialOut, summary="Edit a material (admin only)")
async def update_material(
    material_id: uuid.UUID, body: MaterialUpdate, admin: AdminUser, db: DbSession
) -> AdminMaterialOut:
    material = (
        await db.execute(
            select(Material).options(selectinload(Material.store)).where(Material.id == material_id)
        )
    ).scalar_one_or_none()
    if material is None:
        raise HTTPException(status_code=404, detail="Material topilmadi")

    changes = body.model_dump(exclude_unset=True)
    merged = {f: getattr(material, f) for f in _FIELDS}
    merged.update({k: v for k, v in changes.items() if k in _FIELDS})
    problem = _problem(merged)
    if problem:
        raise _reject(problem)

    store_name = None
    if "store_id" in changes and changes["store_id"] != material.store_id:
        store = await db.get(Store, changes["store_id"])
        if store is None:
            raise _reject("Do'kon topilmadi")
        store_name = store.name
    for key, value in changes.items():
        setattr(material, key, value)
    await db.flush()
    run_after_commit(db, functools.partial(cache_delete_prefix, "materials:"))
    return _out(material, store_name)
