"""Norms-only seed entry point, safe to run on a live database.

Run inside the backend container (this is what deploy/remote-deploy.sh calls)::

    python -m app.seed_norms

Why this exists instead of ``python -m app.seeds``
--------------------------------------------------
``app.seeds.seed()`` seeds norms *and* its store/material/usta catalog, in
one transaction. That catalog is real and is now seeded on every deploy too
— by ``app.seed_partners`` — but it is kept on its own entry point so that
a bad catalog row can never roll the norms back with it. Norms are what
every smeta line prices against: until this module existed nothing anywhere
called ``_seed_norms``, and production ran every line on hardcoded fallback
constants with an "aniq norma topilmadi" warning attached. That must not
become possible again as a side effect of a catalog edit.

Norms are also the only table here that is a pure upsert (nothing else
writes them, and ``_seed_norms`` keys on ``material_key``), so correcting a
coverage figure in ``NORMS`` reaches production on the next deploy.
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
