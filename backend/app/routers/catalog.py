from __future__ import annotations

import json
from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import cache_get, cache_set
from app.core.storage import absolute_media_url
from app.core.uz_regions import UZ_REGIONS
from app.database import get_db
from app.models.furniture import Furniture
from app.models.material import Material
from app.models.material_offer import MaterialOffer
from app.models.store import Store
from app.models.usta import Usta
from app.schemas.catalog import FurnitureOut, PaginatedFurniture, RegionOut, StoreOut
from app.schemas.material import MaterialOut, PaginatedMaterials
from app.schemas.material_offer import MaterialOfferOut
from app.schemas.usta import UstaOut

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["catalog"])

_CATALOG_CACHE_TTL = 600  # 10 minutes

DbSession = Annotated[AsyncSession, Depends(get_db)]


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

@router.get(
    "/materials",
    response_model=PaginatedMaterials,
    summary="Paginated active materials; results cached for 10 min",
)
async def list_materials(
    db: DbSession,
    category: str | None = Query(default=None),
    store: UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> PaginatedMaterials:
    cache_key = f"materials:{category}:{store}:{page}:{per_page}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return PaginatedMaterials.model_validate(cached)

    query = select(Material).where(Material.is_active.is_(True))
    count_query = select(func.count()).select_from(Material).where(Material.is_active.is_(True))

    if category:
        query = query.where(Material.category == category)
        count_query = count_query.where(Material.category == category)
    if store:
        query = query.where(Material.store_id == store)
        count_query = count_query.where(Material.store_id == store)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * per_page
    result = await db.execute(query.offset(offset).limit(per_page))
    materials = result.scalars().all()

    payload = PaginatedMaterials(
        items=[MaterialOut.model_validate(m) for m in materials],
        total=total,
        page=page,
        per_page=per_page,
    )
    await cache_set(cache_key, payload.model_dump(mode="json"), ttl=_CATALOG_CACHE_TTL)
    return payload


# ---------------------------------------------------------------------------
# Material offers (multi-dealer pricing / dealer comparison)
# ---------------------------------------------------------------------------

@router.get(
    "/materials/{material_id}/offers",
    response_model=list[MaterialOfferOut],
    summary="Offers for a material across stores, cheapest first",
)
async def list_material_offers(
    material_id: UUID,
    db: DbSession,
) -> list[MaterialOfferOut]:
    result = await db.execute(
        select(MaterialOffer, Store)
        .join(Store, MaterialOffer.store_id == Store.id)
        .where(MaterialOffer.material_id == material_id)
        .order_by(MaterialOffer.price_uzs)
    )
    return [
        MaterialOfferOut(
            id=offer.id,
            material_id=offer.material_id,
            store_id=offer.store_id,
            store_name=store.name,
            store_district=store.district,
            store_partner_tier=store.partner_tier,
            price_uzs=offer.price_uzs,
            in_stock=offer.in_stock,
            delivery_days=offer.delivery_days,
        )
        for offer, store in result.all()
    ]


# ---------------------------------------------------------------------------
# Furniture
# ---------------------------------------------------------------------------

def _furniture_out(request: Request, f: Furniture) -> FurnitureOut:
    return FurnitureOut(
        id=f.id,
        store_id=f.store_id,
        store_name=f.store.name if f.store else None,
        category=f.category,
        room_type=f.room_type,
        placement=f.placement,
        name_uz=f.name_uz,
        price_uzs=f.price_uzs,
        glb_url=absolute_media_url(request, f.glb_key),
        thumbnail_url=absolute_media_url(request, f.thumbnail_key),
        footprint_w=f.footprint_w,
        footprint_d=f.footprint_d,
    )


@router.get(
    "/furniture",
    response_model=PaginatedFurniture,
    summary="Paginated furniture items",
)
async def list_furniture(
    request: Request,
    db: DbSession,
    category: str | None = Query(default=None),
    room_type: str | None = Query(
        default=None,
        description="Filter to models for this room; models with no room_type "
                    "(usable everywhere) are always included",
    ),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> PaginatedFurniture:
    # glb_url/thumbnail_url are resolved per-request (they embed the request's
    # host), so the cache stores the already-resolved payload — safe as long
    # as storage is served from a stable base URL for the TTL window.
    cache_key = f"furniture:{category}:{room_type}:{page}:{per_page}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return PaginatedFurniture.model_validate(cached)

    query = (
        select(Furniture)
        .options(selectinload(Furniture.store))
        .where(Furniture.is_active.is_(True))
    )
    count_query = select(func.count()).select_from(Furniture).where(Furniture.is_active.is_(True))

    if category:
        query = query.where(Furniture.category == category)
        count_query = count_query.where(Furniture.category == category)
    if room_type:
        room_filter = Furniture.room_type.is_(None) | (Furniture.room_type == room_type)
        query = query.where(room_filter)
        count_query = count_query.where(room_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * per_page
    result = await db.execute(query.offset(offset).limit(per_page))
    items = result.scalars().all()

    payload = PaginatedFurniture(
        items=[_furniture_out(request, f) for f in items],
        total=total,
        page=page,
        per_page=per_page,
    )
    await cache_set(cache_key, payload.model_dump(mode="json"), ttl=_CATALOG_CACHE_TTL)
    return payload


# ---------------------------------------------------------------------------
# Stores
# ---------------------------------------------------------------------------

@router.get(
    "/stores",
    response_model=list[StoreOut],
    summary="List active partner stores",
)
async def list_stores(db: DbSession) -> list[StoreOut]:
    cached = await cache_get("stores:active")
    if cached is not None:
        return [StoreOut.model_validate(s) for s in cached]

    result = await db.execute(
        select(Store).where(Store.is_active.is_(True)).order_by(Store.partner_tier, Store.name)
    )
    stores = result.scalars().all()
    payload = [StoreOut.model_validate(s) for s in stores]
    await cache_set(
        "stores:active",
        [s.model_dump(mode="json") for s in payload],
        ttl=_CATALOG_CACHE_TTL,
    )
    return payload


# ---------------------------------------------------------------------------
# Ustalar
# ---------------------------------------------------------------------------

@router.get(
    "/ustalar",
    response_model=list[UstaOut],
    summary="List craftsmen, filterable by category and district",
)
async def list_ustalar(
    db: DbSession,
    category: str | None = Query(default=None),
    district: str | None = Query(default=None),
) -> list[UstaOut]:
    cache_key = f"ustalar:{category}:{district}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return [UstaOut.model_validate(u) for u in cached]

    query = select(Usta).where(Usta.is_active.is_(True))
    if category:
        query = query.where(Usta.category == category)
    if district:
        query = query.where(Usta.district == district)

    result = await db.execute(query.order_by(Usta.rating.desc()))
    ustalar = result.scalars().all()
    payload = [UstaOut.model_validate(u) for u in ustalar]
    await cache_set(
        cache_key,
        [u.model_dump(mode="json") for u in payload],
        ttl=_CATALOG_CACHE_TTL,
    )
    return payload


# ---------------------------------------------------------------------------
# Regions (viloyat/tuman reference data — no DB table, static list)
# ---------------------------------------------------------------------------

@router.get(
    "/regions",
    response_model=list[RegionOut],
    summary="O'zbekiston viloyatlari va ularning tumanlari",
)
async def list_regions() -> list[RegionOut]:
    return [
        RegionOut(name=name, code=code, districts=list(districts))
        for name, (code, districts) in UZ_REGIONS.items()
    ]
