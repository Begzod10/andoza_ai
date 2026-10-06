"""The shop products the estimate prices its own lines from.

A few lines of an estimate are not something the user picks: the plaster, primer and
putty under a wall finish, the skirting, the cable, the ceiling board, the light fittings.
Each shop product that is the price for one of them carries a ``smeta_key`` (and, for a
bag or a strip, ``pack_qty``/``pack_unit``: what one pack holds). This module loads them and
keeps the cheapest per key, so the engine (app.services.smeta.compute_estimate, which does
no I/O) is handed a plain dict.
"""
from __future__ import annotations

from typing import Any, Iterable

import structlog
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.material import Material

log = structlog.get_logger(__name__)


def unit_cost(material: Material) -> float:
    """What a product costs per unit of what it holds, so a 30 kg bag and a 25 kg bag
    compare fairly. A product without a pack size compares by its own price."""
    pack = float(material.pack_qty) if material.pack_qty else 0.0
    return material.price_uzs / pack if pack > 0 else float(material.price_uzs)


def pick_cheapest(materials: Iterable[Material]) -> dict[str, Material]:
    """{smeta_key: the cheapest active product for it}."""
    best: dict[str, Material] = {}
    for m in materials:
        if not m.smeta_key or not m.is_active:
            continue
        if m.smeta_key not in best or unit_cost(m) < unit_cost(best[m.smeta_key]):
            best[m.smeta_key] = m
    return best


async def load_estimate_catalog(db: Any) -> dict[str, Material]:
    """Load the estimate's shop products. An empty dict (the engine's old constants) when
    there are none, or if they cannot be read: this enrichment must not take the estimate
    down with it."""
    try:
        result = await db.execute(
            select(Material)
            .options(selectinload(Material.store))
            .where(Material.smeta_key.is_not(None), Material.is_active.is_(True))
        )
        return pick_cheapest(result.scalars().all())
    except Exception as exc:
        log.warning("estimate_catalog.load_failed", error=str(exc))
        return {}
