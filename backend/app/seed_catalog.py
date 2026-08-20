"""Idempotent catalog seed for the mobile Do'kon and Ustalar tabs.

Mirrors the Flutter app's hardcoded mock data so the deployed database is not
empty:
  * `shopCatalogProvider`  (lib/providers/shop_provider.dart)   -> stores + materials
  * `mockMastersProvider`  (lib/providers/masters_provider.dart) -> ustalar

Run inside the backend container:

    python -m app.seed_catalog

Safe to run repeatedly: every insert checks a natural key first and skips rows
that already exist (store by name, material by (store_id, name_uz), usta by
(name, phone)).
"""
from __future__ import annotations

import asyncio
import re
import unicodedata

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.material import Material, MaterialCategory, MaterialUnit
from app.models.material_offer import MaterialOffer
from app.models.store import Store
from app.models.usta import Usta, UstaCategory

# ---------------------------------------------------------------------------
# Guard: fail loudly if any literal below drifts from the DB enum definition.
# The model enums are SQLAlchemy Enum() type objects (not Python enums), so we
# validate our string literals against their `.enums` tuple instead.
# ---------------------------------------------------------------------------
_MATERIAL_CATEGORIES = set(MaterialCategory.enums)
_MATERIAL_UNITS = set(MaterialUnit.enums)
_USTA_CATEGORIES = set(UstaCategory.enums)


def _cat(value: str) -> str:
    assert value in _MATERIAL_CATEGORIES, f"bad material category {value!r}"
    return value


def _unit(value: str) -> str:
    assert value in _MATERIAL_UNITS, f"bad material unit {value!r}"
    return value


def _usta_cat(value: str) -> str:
    assert value in _USTA_CATEGORIES, f"bad usta category {value!r}"
    return value


def _slugify(value: str) -> str:
    """URL-safe ascii slug: lowercase, ascii, hyphen-separated.

    e.g. "Vetonit shpaklovka" -> "vetonit-shpaklovka".
    """
    ascii_value = (
        unicodedata.normalize("NFKD", value)
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")


# ---------------------------------------------------------------------------
# Stores — three partners with varied tiers/districts.
# ---------------------------------------------------------------------------
STORES = [
    {
        "name": "Qurilish Bozori",
        "district": "Sergeli",
        "phone": "+998711002030",
        "telegram": "@qurilishbozori",
        "logo_color": "#F59E0B",
        "partner_tier": "standard",
    },
    {
        "name": "Stroy Master",
        "district": "Chilonzor",
        "phone": "+998711002031",
        "telegram": "@stroymaster",
        "logo_color": "#0EA5E9",
        "partner_tier": "gold",
    },
    {
        "name": "Leroy Merlin Tashkent",
        "district": "Yunusobod",
        "phone": "+998711002032",
        "telegram": "@leroymerlin_uz",
        "logo_color": "#10B981",
        "partner_tier": "platinum",
    },
]

# ---------------------------------------------------------------------------
# Materials — mirror of shopCatalogProvider. `store` picks which store above
# (by name) owns the row. Category/unit map the Flutter ShopCategory/unit onto
# the backend enums:
#   gips->gips, oboy->oboy, boyoq->boyoq, laminat->laminat, parket->parket,
#   sement->sement, santexnika->santexnika, kafel->plitka, elektr->elektr_mat
#   unit 'L'->litr, 'm²'->m2, 'qop'->qop, 'rulon'->rulon, 'dona'->dona, 'm'->m
# ---------------------------------------------------------------------------
MATERIALS = [
    {
        "store": "Leroy Merlin Tashkent",
        "name_uz": "Vetonit shpaklovka",
        "category": _cat("gips"),
        "unit": _unit("qop"),
        "price_uzs": 68000,
    },
    {
        "store": "Stroy Master",
        "name_uz": "Vinil devor qog'ozi",
        "category": _cat("oboy"),
        "unit": _unit("rulon"),
        "price_uzs": 145000,
    },
    {
        "store": "Stroy Master",
        "name_uz": "Akril devor bo'yog'i",
        "category": _cat("boyoq"),
        "unit": _unit("litr"),
        "price_uzs": 45000,
    },
    {
        "store": "Leroy Merlin Tashkent",
        "name_uz": "Laminat pol qoplamasi",
        "category": _cat("laminat"),
        "unit": _unit("m2"),
        "price_uzs": 118000,
    },
    {
        "store": "Qurilish Bozori",
        "name_uz": "Podloshka (izolyatsiya)",
        "category": _cat("laminat"),
        "unit": _unit("m2"),
        "price_uzs": 22000,
    },
    {
        "store": "Leroy Merlin Tashkent",
        "name_uz": "Keramik kafel",
        "category": _cat("plitka"),
        "unit": _unit("m2"),
        "price_uzs": 96000,
    },
    {
        "store": "Leroy Merlin Tashkent",
        "name_uz": "Massiv parket",
        "category": _cat("parket"),
        "unit": _unit("m2"),
        "price_uzs": 210000,
    },
    {
        "store": "Qurilish Bozori",
        "name_uz": "Sement M400",
        "category": _cat("sement"),
        "unit": _unit("qop"),
        "price_uzs": 38000,
    },
    {
        "store": "Stroy Master",
        "name_uz": "Rozetka (o'rnatilgan)",
        "category": _cat("elektr_mat"),
        "unit": _unit("dona"),
        "price_uzs": 34000,
    },
    {
        "store": "Stroy Master",
        "name_uz": "Elektr kabeli VVG 3x2.5",
        "category": _cat("elektr_mat"),
        "unit": _unit("m"),
        "price_uzs": 9500,
    },
    {
        "store": "Leroy Merlin Tashkent",
        "name_uz": "Aralashtirgich to'plami",
        "category": _cat("santexnika"),
        "unit": _unit("dona"),
        "price_uzs": 780000,
    },
]

# ---------------------------------------------------------------------------
# Ustalar — mirror of mockMastersProvider. Trade -> UstaCategory:
#   elektrik->elektrik, suvoqchi->malyar, kafelchi->laminat (no tiler enum;
#   laminat is the closest finishing-surface trade), santexnik->santexnik,
#   duradgor->brigada (no carpenter enum; brigada = general contractor).
# lat/lng are the real Tashkent coordinates from the mobile mock.
# ---------------------------------------------------------------------------
USTALAR = [
    {
        "name": "Akmal Yusupov",
        "category": _usta_cat("elektrik"),
        "district": "Chilonzor",
        "phone": "+998901112201",
        "telegram": "@akmal_elektrik",
        "rating": 4.8,
        "jobs_count": 127,
        "price_min": 150000,
        "price_max": 400000,
        "verified": True,
        "lat": 41.2995,
        "lng": 69.2401,
    },
    {
        "name": "Dilnoza Rashidova",
        "category": _usta_cat("malyar"),
        "district": "Yunusobod",
        "phone": "+998901112202",
        "telegram": "@dilnoza_suvoq",
        "rating": 4.6,
        "jobs_count": 84,
        "price_min": 120000,
        "price_max": 300000,
        "verified": True,
        "lat": 41.3111,
        "lng": 69.2797,
    },
    {
        "name": "Sherzod Nazarov",
        "category": _usta_cat("laminat"),
        "district": "Sergeli",
        "phone": "+998901112203",
        "telegram": "@sherzod_kafel",
        "rating": 4.9,
        "jobs_count": 203,
        "price_min": 180000,
        "price_max": 500000,
        "verified": True,
        "lat": 41.2856,
        "lng": 69.2034,
    },
    {
        "name": "Ravshan Tursunov",
        "category": _usta_cat("santexnik"),
        "district": "Mirzo Ulug'bek",
        "phone": "+998901112204",
        "telegram": "@ravshan_santex",
        "rating": 4.5,
        "jobs_count": 61,
        "price_min": 140000,
        "price_max": 350000,
        "verified": False,
        "lat": 41.3264,
        "lng": 69.2298,
    },
    {
        "name": "Botir Ergashev",
        "category": _usta_cat("brigada"),
        "district": "Shayxontohur",
        "phone": "+998901112205",
        "telegram": "@botir_duradgor",
        "rating": 4.7,
        "jobs_count": 95,
        "price_min": 200000,
        "price_max": 600000,
        "verified": True,
        "lat": 41.2775,
        "lng": 69.2843,
    },
]

# ---------------------------------------------------------------------------
# Deterministic image URLs. Materials use picsum keyed by a slug of name_uz;
# ustalar use pravatar keyed by phone. Both load reliably over HTTPS.
# ---------------------------------------------------------------------------
for _m in MATERIALS:
    _m["image_url"] = f"https://picsum.photos/seed/{_slugify(_m['name_uz'])}/600/400"

for _u in USTALAR:
    _u["avatar_url"] = f"https://i.pravatar.cc/300?u={_u['phone']}"


# ---------------------------------------------------------------------------
# Multi-dealer pricing. Every material is offered by all three seeded stores:
#   * its OWN store sells at the base price (factor 1.0);
#   * the two OTHER stores sell at deterministically-varied prices.
# Prices/delivery/stock are derived purely from store index + material index
# (no randomness), so re-running the seed is stable and idempotent.
# ---------------------------------------------------------------------------
STORE_ORDER = [s["name"] for s in STORES]
# Per-store price factors applied when a store is NOT the material's own store.
_OTHER_FACTORS = [0.92, 1.12, 1.22]


async def seed() -> None:
    stores_inserted = stores_skipped = 0
    materials_inserted = materials_skipped = materials_backfilled = 0
    ustalar_inserted = ustalar_skipped = ustalar_backfilled = 0
    offers_inserted = offers_skipped = 0

    async with AsyncSessionLocal() as session:
        # --- Stores -------------------------------------------------------
        store_ids: dict[str, object] = {}
        for row in STORES:
            existing = await session.scalar(
                select(Store).where(Store.name == row["name"])
            )
            if existing is not None:
                store_ids[row["name"]] = existing.id
                stores_skipped += 1
                continue
            store = Store(**row)
            session.add(store)
            await session.flush()  # populate store.id
            store_ids[row["name"]] = store.id
            stores_inserted += 1

        # --- Materials ----------------------------------------------------
        # Track (material_id, base_price, own_store_id) so we can create the
        # cross-store offers below.
        material_targets: list[tuple[object, int, object]] = []
        for row in MATERIALS:
            store_id = store_ids[row["store"]]
            existing = await session.scalar(
                select(Material).where(
                    Material.store_id == store_id,
                    Material.name_uz == row["name_uz"],
                )
            )
            if existing is not None:
                # Backfill image_url on a previously-seeded row.
                if existing.image_url is None:
                    existing.image_url = row["image_url"]
                    materials_backfilled += 1
                materials_skipped += 1
                material_targets.append((existing.id, existing.price_uzs, store_id))
                continue
            material = Material(
                store_id=store_id,
                name_uz=row["name_uz"],
                category=row["category"],
                unit=row["unit"],
                price_uzs=row["price_uzs"],
                image_url=row["image_url"],
            )
            session.add(material)
            await session.flush()  # populate material.id
            material_targets.append((material.id, row["price_uzs"], store_id))
            materials_inserted += 1

        # --- Ustalar ------------------------------------------------------
        for row in USTALAR:
            existing = await session.scalar(
                select(Usta).where(
                    Usta.name == row["name"],
                    Usta.phone == row["phone"],
                )
            )
            if existing is not None:
                # Backfill avatar_url on a previously-seeded row.
                if existing.avatar_url is None:
                    existing.avatar_url = row["avatar_url"]
                    ustalar_backfilled += 1
                ustalar_skipped += 1
                continue
            session.add(Usta(is_active=True, **row))
            ustalar_inserted += 1

        # --- Material offers (multi-dealer pricing) -----------------------
        # Each material gets one offer per seeded store: its own store at the
        # base price, and the other two stores at varied prices/delivery.
        store_id_list = [store_ids[name] for name in STORE_ORDER]
        for mi, (material_id, base_price, own_store_id) in enumerate(material_targets):
            for si, store_id in enumerate(store_id_list):
                if store_id == own_store_id:
                    factor = 1.0
                else:
                    factor = _OTHER_FACTORS[(si + mi) % len(_OTHER_FACTORS)]
                price = int(round(base_price * factor))
                delivery_days = (si + mi) % 4 + 1  # 1..4
                # Own store is always in stock; others occasionally out.
                in_stock = store_id == own_store_id or (si * 3 + mi) % 7 != 0

                existing_offer = await session.scalar(
                    select(MaterialOffer).where(
                        MaterialOffer.material_id == material_id,
                        MaterialOffer.store_id == store_id,
                    )
                )
                if existing_offer is not None:
                    offers_skipped += 1
                    continue
                session.add(
                    MaterialOffer(
                        material_id=material_id,
                        store_id=store_id,
                        price_uzs=price,
                        in_stock=in_stock,
                        delivery_days=delivery_days,
                    )
                )
                offers_inserted += 1

        await session.commit()

    print("Seed complete.")
    print(f"  Stores    : inserted {stores_inserted}, skipped {stores_skipped}")
    print(
        f"  Materials : inserted {materials_inserted}, skipped {materials_skipped}"
        f" (image_url backfilled {materials_backfilled})"
    )
    print(
        f"  Ustalar   : inserted {ustalar_inserted}, skipped {ustalar_skipped}"
        f" (avatar_url backfilled {ustalar_backfilled})"
    )
    print(f"  Offers    : inserted {offers_inserted}, skipped {offers_skipped}")


if __name__ == "__main__":
    asyncio.run(seed())
