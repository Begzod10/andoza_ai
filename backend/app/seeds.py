"""Seed data and seed functions for UyTa'mir.

Defines:
  - NORMS (upsert by material_key)
  - STORES — Hamkor Qurilish, Unitile Toshkent, LaminatShop
  - MATERIALS — 9 rows, realistic Tashkent 2024 prices
  - USTALAR — 5 craftsmen

Rows carry every field the mobile app renders, on a par with
``app.seed_catalog``: a material has an ``image_url`` and an usta has
``lat``/``lng`` (U1 map pin) plus an ``avatar_url``. tests/test_seed_catalogs.py
pins that, so a row added below without them fails the suite.

This module is the *data*; the deploy runs it through two single-purpose
entry points, so editing the lists below does reach production:

  - ``python -m app.seed_norms``    -> NORMS
  - ``python -m app.seed_partners`` -> STORES / MATERIALS / USTALAR

``app.seed_catalog`` seeds a second, entirely separate real catalog
(Qurilish Bozori, Stroy Master, Leroy Merlin Tashkent). The two share no
store name, no material and no usta phone; both are seeded on every deploy
and neither touches the other's rows — see tests/test_seed_catalogs.py.

``seed()`` below still runs everything at once for a local/first-time
database::

    cd backend
    python -m app.seeds

On a live database prefer the two entry points: they are independent, so a
catalog problem cannot roll the norms back with it.

Every function here is insert-guarded on a natural key (store ``name``,
material ``(name_uz, store_id)``, usta ``phone``), and an existing row is
left exactly as it is — admins edit stores and ustalar through
/admin/catalog, and a deploy-time reseed must not revert those edits.
Norms are the one exception: nothing but this file writes them, so they are
upserted and a corrected coverage figure reaches production on the next
deploy.
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.material import Material
from app.models.norm import Norm
from app.models.store import Store
from app.models.usta import Usta
# Same slug helper the other catalog uses, so both files build the same
# image-URL shape from a material name. Data-free formatting helper only —
# the two catalogs stay independent otherwise.
from app.seed_catalog import _slugify

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Seed data definitions
# ---------------------------------------------------------------------------

NORMS: list[dict] = [
    {
        "material_key": "boyoq",
        "coverage_per_unit": 9.0,
        "coats": 2,
        "waste_factor": 1.0,
        "notes": "9 m²/litr, 2 qatlam",
        "params": None,
    },
    {
        "material_key": "grunt",
        "coverage_per_unit": 0.15,
        "coats": 1,
        "waste_factor": 1.0,
        "notes": "0.15 kg/m²",
        "params": {
            "rate_kg_m2": 0.15,
            "bag_kg": 5,
            "bag_price_uzs": 45000,
        },
    },
    {
        "material_key": "shpatlyovka",
        "coverage_per_unit": 1.2,
        "coats": 1,
        "waste_factor": 1.0,
        "notes": "1.2 kg/m²",
        "params": {
            "rate_kg_m2": 1.2,
            "bag_kg": 25,
            "bag_price_uzs": 85000,
        },
    },
    {
        "material_key": "oboy",
        "coverage_per_unit": 1.0,
        "coats": 1,
        "waste_factor": 1.0,
        "notes": "rulon 1.06×10.05m",
        "params": {
            "roll_width_m": 1.06,
            "roll_length_m": 10.05,
        },
    },
    {
        "material_key": "laminat",
        "coverage_per_unit": 2.13,
        "coats": 1,
        "waste_factor": 1.07,
        "notes": "2.13 m²/quti, 7% chiqindi",
        "params": {
            "pack_m2": 2.13,
        },
    },
    {
        "material_key": "plitka",
        "coverage_per_unit": 1.0,
        "coats": 1,
        "waste_factor": 1.10,
        "notes": "10% chiqindi",
        "params": None,
    },
    # Plinth strip norm
    {
        "material_key": "plintus",
        "coverage_per_unit": 1.0,
        "coats": 1,
        "waste_factor": 1.0,
        "notes": "2.5 m dona, 35 000 UZS/dona",
        "params": {
            "piece_m": 2.5,
            "piece_price_uzs": 35000,
        },
    },
    # Electrical cable norm
    {
        "material_key": "elektr_kabel",
        "coverage_per_unit": 1.0,
        "coats": 1,
        "waste_factor": 1.0,
        "notes": "Taxminiy elektr kabel hisob normasi",
        "params": {
            "points_default": 8,
            "avg_run_m": 8.0,
            "slack": 1.15,
            "price_per_m_uzs": 10000,
        },
    },
    # Per-pattern wallpaper waste factors
    {
        "material_key": "oboy_tekstura",
        "coverage_per_unit": 1.0,
        "coats": 1,
        "waste_factor": 1.05,
        "notes": "Tekstura naqshli oboy uchun isrof koeffitsienti",
        "params": None,
    },
    {
        "material_key": "oboy_yolli",
        "coverage_per_unit": 1.0,
        "coats": 1,
        "waste_factor": 1.10,
        "notes": "Yo'lli naqshli oboy uchun isrof koeffitsienti",
        "params": None,
    },
    {
        "material_key": "oboy_damask",
        "coverage_per_unit": 1.0,
        "coats": 1,
        "waste_factor": 1.15,
        "notes": "Damask naqshli oboy uchun isrof koeffitsienti",
        "params": None,
    },
    {
        "material_key": "oboy_geometrik",
        "coverage_per_unit": 1.0,
        "coats": 1,
        "waste_factor": 1.15,
        "notes": "Geometrik naqshli oboy uchun isrof koeffitsienti",
        "params": None,
    },
    {
        "material_key": "oboy_gul",
        "coverage_per_unit": 1.0,
        "coats": 1,
        "waste_factor": 1.15,
        "notes": "Gul naqshli oboy uchun isrof koeffitsienti",
        "params": None,
    },
    {
        "material_key": "oboy_bolalar",
        "coverage_per_unit": 1.0,
        "coats": 1,
        "waste_factor": 1.15,
        "notes": "Bolalar naqshli oboy uchun isrof koeffitsienti",
        "params": None,
    },
]

# Stores: name, district, phone, telegram, logo_color, partner_tier.
# NOTE: these three are already live in production, and _seed_stores is
# insert-only — the telegram/logo_color below therefore only reach a fresh
# database. Backfilling the existing rows is a separate one-off job.
#
# partner_tier must be one of app.models.store.PARTNER_TIERS (standard |
# gold | platinum) — ck_stores_partner_tier rejects anything else. Two of
# these rows used to name tiers outside that set; the app has never had
# them, and the shop screen renders any non-gold/platinum tier as a plain
# dealer, so they only ever meant "standard" in practice. The live rows were
# created by hand through the admin API, which validated the tier, and say
# standard — matching that here invents nothing.
STORES: list[dict] = [
    {
        "name": "Hamkor Qurilish",
        "district": "Chilonzor",
        "phone": "+998901234567",
        "telegram": "@hamkor_qurilish",
        "logo_color": "#2563EB",
        "partner_tier": "gold",
    },
    {
        "name": "Unitile Toshkent",
        "district": "Yunusobod",
        "phone": "+998901234568",
        "telegram": "@unitile_toshkent",
        "logo_color": "#DC2626",
        "partner_tier": "standard",
    },
    {
        "name": "LaminatShop",
        "district": "Mirzo-Ulugbek",
        "phone": "+998901234569",
        "telegram": "@laminatshop_uz",
        "logo_color": "#7C3AED",
        "partner_tier": "standard",
    },
]

# Materials: store_name_ref, category, name_uz, unit, price_uzs, color_hex, pbr_roughness
MATERIALS: list[dict] = [
    # ---------- boyoq (Hamkor Qurilish) --------------------------------
    {
        "store_ref": "Hamkor Qurilish",
        "category": "boyoq",
        "name_uz": "Tikkurila Euro 3 Oq",
        "unit": "litr",
        "price_uzs": 45_000,
        "color_hex": "#FFFFFF",
        "pbr_roughness": 0.90,
    },
    {
        "store_ref": "Hamkor Qurilish",
        "category": "boyoq",
        "name_uz": "Tikkurila Optiva Kulrang",
        "unit": "litr",
        "price_uzs": 48_000,
        "color_hex": "#C0BFBC",
        "pbr_roughness": 0.85,
    },
    {
        "store_ref": "Hamkor Qurilish",
        "category": "boyoq",
        "name_uz": "Dulux Mos Sariq",
        "unit": "litr",
        "price_uzs": 42_000,
        "color_hex": "#F5E6C8",
        "pbr_roughness": 0.90,
    },
    # ---------- oboy (Hamkor Qurilish) ---------------------------------
    {
        "store_ref": "Hamkor Qurilish",
        "category": "oboy",
        "name_uz": "Arthouse Gullar",
        "unit": "rulon",
        "price_uzs": 85_000,
        "color_hex": "#F2DDD0",
        "pbr_roughness": 0.80,
    },
    {
        "store_ref": "Hamkor Qurilish",
        "category": "oboy",
        "name_uz": "Grandeco Geometrik",
        "unit": "rulon",
        "price_uzs": 95_000,
        "color_hex": "#E8E0D5",
        "pbr_roughness": 0.75,
    },
    # ---------- laminat (LaminatShop) ----------------------------------
    {
        "store_ref": "LaminatShop",
        "category": "laminat",
        "name_uz": "Quick-Step Yong'och",
        "unit": "m2",
        "price_uzs": 180_000,
        "color_hex": "#8B6F47",
        "pbr_roughness": 0.70,
        "texture_key": "parquet",
    },
    {
        "store_ref": "LaminatShop",
        "category": "laminat",
        "name_uz": "Tarkett Tik",
        "unit": "m2",
        "price_uzs": 210_000,
        "color_hex": "#5C4033",
        "pbr_roughness": 0.65,
        "texture_key": "parquet_herringbone",
    },
    # ---------- plitka (Unitile Toshkent) ------------------------------
    {
        "store_ref": "Unitile Toshkent",
        "category": "plitka",
        "name_uz": "Estima Oq 60×60",
        "unit": "m2",
        "price_uzs": 165_000,
        "color_hex": "#F8F8F8",
        "pbr_roughness": 0.20,
        "texture_key": "tile_ceramic",
    },
    {
        "store_ref": "Unitile Toshkent",
        "category": "plitka",
        "name_uz": "Estima Beton 60×60",
        "unit": "m2",
        "price_uzs": 175_000,
        "color_hex": "#9E9E9E",
        "pbr_roughness": 0.30,
        "texture_key": "concrete",
    },
]

# Ustalar: name, category, district, phone, telegram, lat, lng, verified,
# rating, jobs_count, price_min, price_max.
#
# lat/lng exist so the row gets a pin on the U1 map — an usta without them is
# listed in U3 but invisible on the map. These are DEMO COORDINATES, not
# surveyed business addresses: each one is its district's anchor point from
# app.seed_catalog.USTALAR (which took them from the Flutter mock in
# lib/providers/masters_provider.dart, since replaced by backend wiring),
# nudged a few hundred metres so two pins never land on the same spot. Treat
# them as "somewhere in this district", which is all the U4 profile claims —
# it draws an approximate-area circle, never an exact pin.
USTALAR: list[dict] = [
    {
        "name": "Sardor Karimov",
        "category": "elektrik",
        "district": "Chilonzor",
        "phone": "+998901111101",
        "telegram": "@sardor_elektrik",
        "lat": 41.2962,
        "lng": 69.2438,
        "verified": True,
        "rating": 4.80,
        "jobs_count": 127,
        # price per point (nuqta): 50 000 – 80 000 UZS
        "price_min": 50_000,
        "price_max": 80_000,
    },
    {
        "name": "Jahongir Toshmatov",
        "category": "malyar",
        "district": "Yunusobod",
        "phone": "+998901111102",
        "telegram": "@jahongir_malyar",
        "lat": 41.3148,
        "lng": 69.2761,
        "verified": True,
        "rating": 4.60,
        "jobs_count": 89,
        "price_min": 40_000,
        "price_max": 65_000,
    },
    {
        "name": "Bekzod Ergashev",
        "category": "laminat",
        "district": "Mirzo-Ulugbek",
        "phone": "+998901111103",
        "telegram": "@bekzod_laminat",
        "lat": 41.3229,
        "lng": 69.2335,
        "verified": True,
        "rating": 4.90,
        "jobs_count": 203,
        "price_min": 35_000,
        "price_max": 55_000,
    },
    {
        "name": "Ulugbek Nazarov",
        "category": "santexnik",
        "district": "Shayxontohur",
        "phone": "+998901111104",
        "telegram": "@ulugbek_santex",
        "lat": 41.2812,
        "lng": 69.2806,
        "verified": True,
        "rating": 4.50,
        "jobs_count": 56,
        "price_min": 60_000,
        "price_max": 100_000,
    },
    {
        "name": "Dilnoza Yusupova",
        "category": "brigada",
        "district": "Chilonzor",
        "phone": "+998901111105",
        "telegram": "@dilnoza_brigada",
        "lat": 41.3031,
        "lng": 69.2367,
        "verified": True,
        "rating": 4.70,
        "jobs_count": 34,
        "price_min": 200_000,
        "price_max": 350_000,
    },
]


# ---------------------------------------------------------------------------
# Deterministic image URLs, derived so a row added above can't forget them.
# Same placeholder services and key scheme as app.seed_catalog: materials use
# picsum keyed by a slug of name_uz, ustalar use pravatar keyed by phone. Both
# are placeholders for a real product photo / profile picture; the shop cards
# (S1/S3) and the U1 map pins fall back to a bare icon without them.
# ---------------------------------------------------------------------------
for _m in MATERIALS:
    _m["image_url"] = f"https://picsum.photos/seed/{_slugify(_m['name_uz'])}/600/400"

for _u in USTALAR:
    _u["avatar_url"] = f"https://i.pravatar.cc/300?u={_u['phone']}"


# ---------------------------------------------------------------------------
# Seed functions
# ---------------------------------------------------------------------------

async def _seed_norms(session) -> None:
    """Upsert norms by material_key."""
    for data in NORMS:
        result = await session.execute(
            select(Norm).where(Norm.material_key == data["material_key"])
        )
        norm = result.scalar_one_or_none()
        if norm is None:
            norm = Norm(**data)
            session.add(norm)
            log.info("Norm created: %s", data["material_key"])
        else:
            norm.coverage_per_unit = data["coverage_per_unit"]
            norm.coats = data["coats"]
            norm.waste_factor = data["waste_factor"]
            norm.notes = data["notes"]
            norm.params = data.get("params")
            log.info("Norm updated: %s", data["material_key"])
    await session.flush()


async def _seed_stores(session) -> dict[str, Store]:
    """Insert stores that don't exist yet (matched by name). Return name→Store map.

    An existing store is returned untouched — see the module docstring.
    """
    store_map: dict[str, Store] = {}
    for data in STORES:
        result = await session.execute(
            select(Store).where(Store.name == data["name"])
        )
        store = result.scalar_one_or_none()
        if store is None:
            store = Store(
                name=data["name"],
                district=data["district"],
                phone=data["phone"],
                telegram=data["telegram"],
                logo_color=data["logo_color"],
                partner_tier=data["partner_tier"],
                is_active=True,
            )
            session.add(store)
            await session.flush()
            log.info("Store created: %s", store.name)
        else:
            log.info("Store already exists: %s", store.name)
        store_map[store.name] = store
    return store_map


async def _seed_materials(session, store_map: dict[str, Store]) -> None:
    """Insert materials that don't exist (matched by name_uz + store).

    An existing material is left alone, price included.
    """
    for data in MATERIALS:
        store = store_map.get(data["store_ref"])
        if store is None:
            log.warning("Store not found for material %s — skipping", data["name_uz"])
            continue

        result = await session.execute(
            select(Material).where(
                Material.name_uz == data["name_uz"],
                Material.store_id == store.id,
            )
        )
        material = result.scalar_one_or_none()
        if material is None:
            material = Material(
                store_id=store.id,
                category=data["category"],
                name_uz=data["name_uz"],
                unit=data["unit"],
                price_uzs=data["price_uzs"],
                image_url=data["image_url"],
                color_hex=data["color_hex"],
                pbr_roughness=data["pbr_roughness"],
                texture_key=data.get("texture_key"),
                is_active=True,
            )
            session.add(material)
            log.info("Material created: %s (%s)", data["name_uz"], data["category"])
        else:
            log.info("Material already exists: %s", data["name_uz"])
    await session.flush()


async def _seed_ustalar(session) -> None:
    """Insert ustalar that don't exist (matched by phone).

    An existing usta is left alone: rating/jobs_count/verified are admin- and
    app-maintained, not ours to reset.
    """
    for data in USTALAR:
        result = await session.execute(
            select(Usta).where(Usta.phone == data["phone"])
        )
        usta = result.scalar_one_or_none()
        if usta is None:
            usta = Usta(
                name=data["name"],
                category=data["category"],
                district=data["district"],
                lat=data["lat"],
                lng=data["lng"],
                phone=data["phone"],
                telegram=data["telegram"],
                avatar_url=data["avatar_url"],
                verified=data["verified"],
                rating=data["rating"],
                jobs_count=data["jobs_count"],
                price_min=data["price_min"],
                price_max=data["price_max"],
                is_active=True,
            )
            session.add(usta)
            log.info("Usta created: %s (%s)", data["name"], data["category"])
        else:
            log.info("Usta already exists: %s", data["name"])
    await session.flush()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def seed() -> None:
    """Run every seed operation in a single transaction.

    Convenient for a fresh local database. The deploy uses the split entry
    points instead (app.seed_norms + app.seed_partners), so that a failure
    in one half cannot roll back the other.
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            log.info("=== UyTa'mir seed started ===")
            await _seed_norms(session)
            store_map = await _seed_stores(session)
            await _seed_materials(session, store_map)
            await _seed_ustalar(session)
            log.info("=== Seed completed successfully ===")


if __name__ == "__main__":
    asyncio.run(seed())
