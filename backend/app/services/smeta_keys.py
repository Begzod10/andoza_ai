"""The estimate product keys (``Material.smeta_key``) and the pack each one needs.

One list shared by the seed script and the admin materials API, so a product can only
carry a key the estimate engine understands, sold in a form the engine can price.
"""
from __future__ import annotations

from app.i18n import translate_detail
from app.services.smeta import _SOLD_BY_PACK_UNITS, LIGHT_CATALOG_PRICES_UZS

# The pack unit each fixed key must be sold with, to be of any use to the engine.
KEY_PACK_UNIT: dict[str, str | None] = {
    "suvoq": "kg", "grunt": "kg", "shpatlyovka": "kg",
    "plintus": "m", "gipsokarton": "m2", "profil": "m", "led_lenta": "m",
    "galtel": "m",
    "kabel": None,  # sold per metre: no pack
}

LIGHT_KEYS: frozenset[str] = frozenset(f"light:{t}" for t in LIGHT_CATALOG_PRICES_UZS)
ALL_SMETA_KEYS: frozenset[str] = frozenset(KEY_PACK_UNIT) | LIGHT_KEYS


def smeta_key_problem(key: str | None, unit: str, pack_qty: float | None,
                      pack_unit: str | None) -> str | None:
    """Why this key does not fit the product's unit/pack, or None when it does."""
    if key is None:
        return None
    if key not in ALL_SMETA_KEYS:
        return "Bunday smeta kaliti yo'q"
    if key in LIGHT_KEYS:
        return None if unit == "dona" else "chiroq dona bilan sotilishi kerak"
    need = KEY_PACK_UNIT[key]
    if need is None:  # kabel
        return None if unit == "m" else "kabel metrlab (m) sotilishi kerak"
    # A pack only counts for the engine when the product is sold by the pack.
    if unit == need or (pack_qty is not None and pack_unit == need and unit in _SOLD_BY_PACK_UNITS):
        return None
    return translate_detail("{key} uchun qadoq birligi {need} bo'lishi kerak", key=key, need=need)
