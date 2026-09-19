"""Norms-only seed entry point, safe to run on a live database.

Run inside the backend container (this is what deploy/remote-deploy.sh calls)::

    python -m app.seed_norms

Why this exists instead of ``python -m app.seeds``
--------------------------------------------------
``app.seeds`` seeds norms *and* a second, entirely separate demo catalog:
its STORES / MATERIALS / USTALAR share no natural key with the ones
``app.seed_catalog`` already seeded on production ("Hamkor Qurilish" vs
"Qurilish Bozori", and so on). Each of those seeders is idempotent against
its *own* rows, so re-running either one is safe — but running ``app.seeds``
on production would not update the existing catalog, it would add a second
one beside it: 3 more stores, 9 more materials and 5 more ustalar, all of
them visible in the Do'kon and Ustalar tabs.

Norms have no such overlap (nothing else writes the table, and
``_seed_norms`` upserts by ``material_key``), so this module exposes just
that half. Until it existed nothing anywhere called ``_seed_norms``, which
is why production ran every smeta line on hardcoded fallback constants with
an "aniq norma topilmadi" warning attached.
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import func, select

from app.database import AsyncSessionLocal
from app.models.norm import Norm
from app.seeds import NORMS, _seed_norms

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)


async def seed_norms() -> int:
    """Upsert every norm and return the resulting row count in the table."""
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await _seed_norms(session)
        total = await session.scalar(select(func.count()).select_from(Norm))
    return int(total or 0)


async def main() -> None:
    total = await seed_norms()
    print("Norms seed complete.")
    print(f"  Norms defined in app.seeds : {len(NORMS)}")
    print(f"  Norms now in the database  : {total}")


if __name__ == "__main__":
    asyncio.run(main())
