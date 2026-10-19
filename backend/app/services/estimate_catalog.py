"""The shop products the estimate prices its own lines from.

A few lines of an estimate are not something the user picks: the plaster, primer and
putty under a wall finish, the skirting, the cable, the ceiling board, the light fittings.
Each shop product that is the price for one of them carries a ``smeta_key`` (and, for a
bag or a strip, ``pack_qty``/``pack_unit``: what one pack holds). This module loads them and
keeps the cheapest per key (and, under "finish:<category>", the median floor, wallpaper
and paint, see FINISH_UNITS), so the engine (app.services.smeta.compute_estimate, which does
no I/O) is handed a plain dict.
"""
from __future__ import annotations

from typing import Any, Iterable

import structlog
from sqlalchemy import or_, select
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


# Finishes the studio can put in a room without naming a product (the AI designer and the
# ready-made styles set a floor type, a wallpaper pattern, a paint colour), and the selling
# unit a product must have to price one: a floor by the m², a wallpaper by the roll.
FINISH_UNITS: dict[str, set[str]] = {
    "laminat": {"m2"}, "parket": {"m2"}, "plitka": {"m2"}, "oboy": {"rulon"}, "boyoq": {"litr"},
}


def pick_median_finishes(materials: Iterable[Material]) -> dict[str, Material]:
    """{"finish:<category>": the median-priced active product of that finish}, the stand-in
    price for a finish nobody picked a product for (the line says so). Products compare by
    unit cost; with an even count the lower of the two middle ones is kept."""
    groups: dict[str, list[Material]] = {}
    for m in materials:
        units = FINISH_UNITS.get(str(m.category))
        if not units or str(m.unit) not in units or not m.is_active:
            continue
        groups.setdefault(f"finish:{m.category}", []).append(m)
    return {
        key: sorted(items, key=unit_cost)[(len(items) - 1) // 2]
        for key, items in groups.items()
    }


async def load_estimate_catalog(db: Any) -> dict[str, Material]:
    """Load the estimate's shop products. An empty dict (the engine's old constants) when
    there are none, or if they cannot be read: this enrichment must not take the estimate
    down with it."""
    try:
        result = await db.execute(
            select(Material)
            .options(selectinload(Material.store))
            .where(
                Material.is_active.is_(True),
                or_(Material.smeta_key.is_not(None), Material.category.in_(list(FINISH_UNITS))),
            )
        )
        rows = result.scalars().all()
        return {**pick_cheapest(rows), **pick_median_finishes(rows)}
    except Exception as exc:
        log.warning("estimate_catalog.load_failed", error=str(exc))
        return {}
