import pytest

from app.services.smeta import LIGHT_CATALOG_PRICES_UZS
from app.services.smeta_keys import LIGHT_KEYS, smeta_key_problem


@pytest.mark.parametrize(("key", "unit", "pack_qty", "pack_unit"), [
    (None, "qop", None, None),
    ("suvoq", "qop", 30, "kg"),
    ("plintus", "m", None, None),          # sold by the metre
    ("plintus", "dona", 2.5, "m"),
    ("galtel", "m", None, None),
    ("galtel", "dona", 2, "m"),
    ("gipsokarton", "dona", 3, "m2"),
    ("kabel", "m", None, None),
    ("light:chandelier", "dona", None, None),
])
def test_valid_combinations(key, unit, pack_qty, pack_unit):
    assert smeta_key_problem(key, unit, pack_qty, pack_unit) is None


@pytest.mark.parametrize(("key", "unit", "pack_qty", "pack_unit", "message"), [
    ("barokko", "dona", None, None, "Bunday smeta kaliti yo'q"),
    ("suvoq", "qop", None, None, "suvoq uchun qadoq birligi kg bo'lishi kerak"),
    ("suvoq", "qop", 30, "litr", "suvoq uchun qadoq birligi kg bo'lishi kerak"),
    ("galtel", "dona", None, None, "galtel uchun qadoq birligi m bo'lishi kerak"),
    ("plintus", "litr", 2, "m", "plintus uchun qadoq birligi m bo'lishi kerak"),
    ("kabel", "dona", None, None, "kabel metrlab (m) sotilishi kerak"),
    ("light:chandelier", "m", None, None, "chiroq dona bilan sotilishi kerak"),
])
def test_invalid_combinations(key, unit, pack_qty, pack_unit, message):
    assert smeta_key_problem(key, unit, pack_qty, pack_unit) == message


def test_every_light_type_has_a_key():
    assert {f"light:{t}" for t in LIGHT_CATALOG_PRICES_UZS} == LIGHT_KEYS
