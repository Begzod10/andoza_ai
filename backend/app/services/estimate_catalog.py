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
from app.models.wallpaper import Wallpaper
from app.services.smeta import WallpaperRoll, wallpaper_catalog_key

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


async def _shop_wallpapers(db: Any) -> dict[str, WallpaperRoll]:
    """Library wallpapers a shop sells by the roll (width, length and price all known), keyed
    by their storage key: the studio puts one on a wall by its image URL. Empty if they
    cannot be read, so the shop products above still price their lines."""
    try:
        result = await db.execute(
            select(Wallpaper)
            .options(selectinload(Wallpaper.store))
            .where(
                Wallpaper.kind == "oboy",
                Wallpaper.price_uzs.is_not(None),
                Wallpaper.width_cm.is_not(None),
                Wallpaper.total_length_m.is_not(None),
            )
        )
        out: dict[str, WallpaperRoll] = {}
        for w in result.scalars().all():
            if not (w.price_uzs and w.width_cm and w.total_length_m):
                continue
            out[wallpaper_catalog_key(w.storage_key)] = WallpaperRoll(
                name=w.name, price_uzs=int(w.price_uzs), roll_width_cm=float(w.width_cm),
                roll_length_m=float(w.total_length_m), store_name=w.store.name if w.store else None,
            )
        return out
    except Exception as exc:
        log.warning("estimate_catalog.wallpapers_failed", error=str(exc))
        return {}


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
        return {**pick_cheapest(rows), **pick_median_finishes(rows), **await _shop_wallpapers(db)}
    except Exception as exc:
        log.warning("estimate_catalog.load_failed", error=str(exc))
        return {}
