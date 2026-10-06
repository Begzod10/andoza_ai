"""Shop products for the estimate's own lines, safe to run on a live database.

    python -m app.seed_estimate_catalog      (deploy/remote-deploy.sh calls it)

The estimate prices a few lines it does not let the user pick: the plaster, primer and
putty under a wall finish, the skirting, the cable, the ceiling board, profile and LED
strip, the light fittings. They used to come from constants in the code ("Toshkent 2024
average"). They now come from shop products carrying a ``smeta_key`` and, for a bag or a
strip, ``pack_qty``/``pack_unit`` (see app.services.estimate_catalog).

THE PRICES BELOW ARE STARTING VALUES, not a survey. They are the constants the engine used
before, nudged a few percent between stores so there is something to compare. Edit them
to what each shop really charges; a re-run never overwrites a price or a name, only fills
a product's missing ``smeta_key`` / pack size.

Idempotent: a product is looked up by (store, name_uz) and skipped if it exists. One
transaction, separate from the catalog and norms seeders so a bad row here cannot take
them down (the same reasoning as app/seed_norms.py).
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.material import Material
from app.models.store import Store
from app.services.smeta import LIGHT_CATALOG_PRICES_UZS, LIGHT_TYPE_NAMES

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

LM, QB, SM = "Leroy Merlin Tashkent", "Qurilish Bozori", "Stroy Master"

# The pack unit each fixed key must be sold with, to be of any use to the engine.
KEY_PACK_UNIT: dict[str, str | None] = {
    "suvoq": "kg", "grunt": "kg", "shpatlyovka": "kg",
    "plintus": "m", "gipsokarton": "m2", "profil": "m", "led_lenta": "m",
    "kabel": None,  # sold per metre: no pack
}


def _p(store, name, category, unit, price, key, pack_qty=None, pack_unit=None) -> dict:
    return dict(store=store, name_uz=name, category=category, unit=unit, price_uzs=price,
                smeta_key=key, pack_qty=pack_qty, pack_unit=pack_unit)


PRODUCTS: list[dict] = [
    # wall prep: sold by the bag, the bag's kg is what the engine divides by
    _p(LM, "Knauf Rotband gips suvoq 30 kg", "gips", "qop", 66_000, "suvoq", 30, "kg"),
    _p(QB, "Volma Gips Plast suvoq 30 kg", "gips", "qop", 62_000, "suvoq", 30, "kg"),
    _p(LM, "Ceresit CT 17 grunt 5 kg", "gips", "dona", 46_000, "grunt", 5, "kg"),
    _p(QB, "Betonkontakt grunt 5 kg", "gips", "dona", 43_000, "grunt", 5, "kg"),
    _p(SM, "Knauf HP Start shpatlyovka 25 kg", "gips", "qop", 82_000, "shpatlyovka", 25, "kg"),
    # skirting: a strip of known length
    _p(LM, "PVX plintus 2.5 m", "laminat", "dona", 36_000, "plintus", 2.5, "m"),
    _p(QB, "Polistirol plintus 2.5 m", "laminat", "dona", 31_000, "plintus", 2.5, "m"),
    # ceiling: a board of known area, profile and LED strip of known length
    _p(LM, "Knauf gipsokarton 12.5 mm (1.2×2.5 m)", "gips", "dona", 96_000, "gipsokarton", 3, "m2"),
    _p(QB, "Gipsokarton list 12.5 mm (1.2×2.5 m)", "gips", "dona", 91_000, "gipsokarton", 3, "m2"),
    _p(LM, "Knauf UD/CD karkas profili 3 m", "gips", "dona", 31_000, "profil", 3, "m"),
    _p(QB, "Karkas profili 3 m", "gips", "dona", 29_000, "profil", 3, "m"),
    _p(SM, "LED lenta 12V + alyuminiy profil, 5 m", "elektr_mat", "dona", 230_000, "led_lenta", 5, "m"),
]

# Light fittings: one product per fixture type the studio can place, at two stores.
for _type, _price in LIGHT_CATALOG_PRICES_UZS.items():
    PRODUCTS.append(_p(SM, LIGHT_TYPE_NAMES[_type], "elektr_mat", "dona", _price, f"light:{_type}"))
    PRODUCTS.append(_p(LM, LIGHT_TYPE_NAMES[_type], "elektr_mat", "dona", round(_price * 1.08, -3), f"light:{_type}"))

# Products that already exist in the catalog and are the right price for a line.
ADOPT: list[dict] = [
    _p(LM, "Vetonit shpaklovka", "gips", "qop", 0, "shpatlyovka", 25, "kg"),
    _p(SM, "Elektr kabeli VVG 3x2.5", "elektr_mat", "m", 0, "kabel"),
]


async def _apply(session) -> dict[str, int]:
    """The seeding itself, against any session (a fake one in the tests)."""
    inserted = filled = skipped_store = 0
    stores = {s.name: s.id for s in (await session.execute(select(Store))).scalars().all()}
    for row in PRODUCTS + ADOPT:
        store_id = stores.get(row["store"])
        if store_id is None:
            skipped_store += 1
            log.warning("Store %r not found, skipped %r", row["store"], row["name_uz"])
            continue
        existing = await session.scalar(
            select(Material).where(Material.store_id == store_id, Material.name_uz == row["name_uz"])
        )
        if existing is None:
            if row["price_uzs"] <= 0:
                continue  # an ADOPT row whose product is not in this database
            session.add(Material(store_id=store_id, **{k: v for k, v in row.items() if k != "store"}))
            inserted += 1
            continue
        # Fill only what is missing; never touch a price or a name an admin may have edited.
        changed = False
        if existing.smeta_key is None:
            existing.smeta_key, changed = row["smeta_key"], True
        if existing.pack_qty is None and row["pack_qty"] is not None:
            existing.pack_qty, existing.pack_unit, changed = row["pack_qty"], row["pack_unit"], True
        filled += changed
    return {"inserted": inserted, "filled": filled, "skipped_store": skipped_store}


async def seed_estimate_catalog() -> dict[str, int]:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            result = await _apply(session)
    print(
        f"Estimate catalog seed complete: {result['inserted']} inserted, {result['filled']} filled in, "
        f"{result['skipped_store']} skipped (store missing)."
    )
    return result


if __name__ == "__main__":
    asyncio.run(seed_estimate_catalog())
