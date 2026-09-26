"""Partner-catalog seed entry point, safe to run on a live database.

Run inside the backend container (this is what deploy/remote-deploy.sh calls)::

    python -m app.seed_partners

What this seeds
---------------
The stores / materials / ustalar defined in ``app.seeds`` — Hamkor Qurilish,
Unitile Toshkent and LaminatShop, their 9 materials and 5 ustalar. They are
real suppliers and have been live since they were seeded by hand in
September; they are a *second* catalog beside the one ``app.seed_catalog``
writes (Qurilish Bozori, Stroy Master, Leroy Merlin Tashkent), not a
duplicate of it. The two share no store name, no material and no usta phone.

Why this exists instead of ``python -m app.seeds``
--------------------------------------------------
``app.seeds.seed()`` also runs ``_seed_norms`` — which ``app.seed_norms``
already covers — and runs the lot in a single transaction, so one bad
material row would roll the norms back with it. Norms are what every smeta
line prices against and were missing from production for months; keeping
them on their own entry point means a catalog problem can never take them
down again. One module per concern, each separately re-runnable by hand.

Idempotency
-----------
``_seed_stores`` / ``_seed_materials`` / ``_seed_ustalar`` each look the row
up by its natural key (store ``name``, material ``(name_uz, store_id)``,
usta ``phone``) and skip it if it is already there, leaving admin edits
alone. See tests/test_seed_catalogs.py, which runs both seeders twice and
asserts one row per natural key across both catalogs.
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import func, select

from app.database import AsyncSessionLocal
from app.models.material import Material
from app.models.store import Store
from app.models.usta import Usta
from app.seeds import (
    MATERIALS,
    STORES,
    USTALAR,
    _seed_materials,
    _seed_stores,
    _seed_ustalar,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)


async def seed_partners() -> dict[str, int]:
    """Insert any missing partner rows; return the resulting table counts."""
    async with AsyncSessionLocal() as session:
        async with session.begin():
            store_map = await _seed_stores(session)
            await _seed_materials(session, store_map)
            await _seed_ustalar(session)

        totals = {}
        for label, model in (
            ("stores", Store),
            ("materials", Material),
            ("ustalar", Usta),
        ):
            totals[label] = int(
                await session.scalar(select(func.count()).select_from(model)) or 0
            )
    return totals


async def main() -> None:
    totals = await seed_partners()
    print("Partner catalog seed complete.")
    print(
        f"  Defined in app.seeds : {len(STORES)} stores,"
        f" {len(MATERIALS)} materials, {len(USTALAR)} ustalar"
    )
    print(
        f"  Now in the database  : {totals['stores']} stores,"
        f" {totals['materials']} materials, {totals['ustalar']} ustalar"
        " (both catalogs)"
    )


if __name__ == "__main__":
    asyncio.run(main())
