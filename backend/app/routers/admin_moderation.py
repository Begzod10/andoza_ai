"""Admins approve or reject what sellers submit: shop applications and 3D models.

Approving makes the row live (``is_active``); rejecting keeps it hidden and gives
the seller a reason. The public catalog already filters on ``is_active`` and
caches for ten minutes, so each decision also drops the affected cache.
"""
from __future__ import annotations

import uuid as uuid_module

import structlog
from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import AdminUser, DbSession
from app.models.furniture import Furniture
from app.models.store import Store
from app.routers.admin_catalog import _invalidate_after_commit
from app.routers.seller import _out as _furniture_out
from app.schemas.seller import PendingFurnitureOut, PendingOut, PendingStoreOut, RejectIn

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/admin/moderation", tags=["admin-moderation"])


@router.get("/pending", response_model=PendingOut, summary="Shop applications and models waiting for review")
async def pending(request: Request, admin: AdminUser, db: DbSession) -> PendingOut:
    stores = (await db.execute(
        select(Store).where(Store.status == "pending").order_by(Store.created_at)
    )).scalars().all()
    models = (await db.execute(
        select(Furniture).options(selectinload(Furniture.store))
        .where(Furniture.status == "pending").order_by(Furniture.created_at)
    )).scalars().all()
    return PendingOut(
        stores=[PendingStoreOut.model_validate(s, from_attributes=True) for s in stores],
        furniture=[
            PendingFurnitureOut(
                **_furniture_out(f, request).model_dump(),
                store_id=f.store_id,
                store_name=f.store.name if f.store else None,
            )
            for f in models
        ],
    )


async def _store(db: DbSession, store_id: uuid_module.UUID) -> Store:
    s = (await db.execute(select(Store).where(Store.id == store_id))).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Do'kon topilmadi")
    return s


async def _model(db: DbSession, furniture_id: uuid_module.UUID) -> Furniture:
    f = (await db.execute(select(Furniture).where(Furniture.id == furniture_id))).scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model topilmadi")
    return f


def _decide(row, approved: bool, note: str | None) -> None:
    row.status = "approved" if approved else "rejected"
    row.is_active = approved
    row.moderation_note = None if approved else note


@router.post("/stores/{store_id}/approve", status_code=status.HTTP_204_NO_CONTENT)
async def approve_store(store_id: uuid_module.UUID, admin: AdminUser, db: DbSession) -> None:
    store = await _store(db, store_id)
    _decide(store, True, None)
    await db.flush()
    _invalidate_after_commit(db, "stores:")
    logger.info("store_approved", id=str(store_id), admin_id=str(admin.id))


@router.post("/stores/{store_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
async def reject_store(store_id: uuid_module.UUID, body: RejectIn, admin: AdminUser, db: DbSession) -> None:
    store = await _store(db, store_id)
    _decide(store, False, body.note.strip())
    await db.flush()
    _invalidate_after_commit(db, "stores:")
    _invalidate_after_commit(db, "furniture:")
    logger.info("store_rejected", id=str(store_id), admin_id=str(admin.id))


@router.post("/furniture/{furniture_id}/approve", status_code=status.HTTP_204_NO_CONTENT)
async def approve_furniture(furniture_id: uuid_module.UUID, admin: AdminUser, db: DbSession) -> None:
    f = await _model(db, furniture_id)
    _decide(f, True, None)
    await db.flush()
    _invalidate_after_commit(db, "furniture:")
    logger.info("model_approved", id=str(furniture_id), admin_id=str(admin.id))


@router.post("/furniture/{furniture_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
async def reject_furniture(furniture_id: uuid_module.UUID, body: RejectIn, admin: AdminUser, db: DbSession) -> None:
    f = await _model(db, furniture_id)
    _decide(f, False, body.note.strip())
    await db.flush()
    _invalidate_after_commit(db, "furniture:")
    logger.info("model_rejected", id=str(furniture_id), admin_id=str(admin.id))
