"""Estimate lines priced from shop products: the engine, the loader, and the seed data."""
from __future__ import annotations

import math
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app import seed_estimate_catalog as seed
from app.models.material import Material, MaterialCategory, MaterialUnit
from app.models.store import Store
from app.seed_catalog import STORES as CATALOG_STORES
from app.seeds import STORES as PARTNER_STORES
from app.services import estimate_catalog as ec
from app.services.smeta import (
    LIGHT_CATALOG_PRICES_UZS,
    _electrical_line,
    _ceiling_construction_lines,
    _grunt_line,
    _light_lines,
    _plaster_line,
    _plinth_line,
    _putty_line,
    compute_estimate,
)

STORE = SimpleNamespace(name="Leroy Merlin Tashkent")


def mat(key, price, unit="qop", pack_qty=None, pack_unit=None, name="Mahsulot", active=True) -> SimpleNamespace:
    return SimpleNamespace(id=uuid.uuid4(), name_uz=name, unit=unit, price_uzs=price, pack_qty=pack_qty,
                           pack_unit=pack_unit, smeta_key=key, is_active=active, store=STORE, category="gips")


def room(**kw):
    d = dict(net_wall_area=40.0, floor_area=12.0, perimeter=14.0, openings_count=0, ceiling_h=2.7,
             geometry={"walls": []}, surfaces={}, state={}, furniture_layout=[])
    d.update(kw)
    return SimpleNamespace(**d)


class TestWallPrep:
    def test_plaster_from_a_30_kg_bag_at_the_shops_price(self):
        line = _plaster_line(room(), {}, mat("suvoq", 66_000, "qop", 30, "kg", "Rotband"))
        assert line.qty == math.ceil(40 * 8.5 / 30) == 12
        assert (line.unit_price_uzs, line.subtotal_uzs) == (66_000, 12 * 66_000)
        assert "Rotband" in line.label and "30 kg" in line.label
        assert line.store_name == "Leroy Merlin Tashkent" and line.material_id

    def test_a_different_bag_size_changes_the_bag_count(self):
        # 40 m² x 8.5 kg = 340 kg: 12 bags of 30 kg, but 14 of 25 kg
        assert _plaster_line(room(), {}, mat("suvoq", 50_000, "qop", 25, "kg")).qty == 14

    def test_primer_and_putty_use_their_own_bag_and_price(self):
        grunt = _grunt_line(room(), {}, mat("grunt", 46_000, "dona", 5, "kg", "CT 17"))
        putty = _putty_line(room(), {}, mat("shpatlyovka", 82_000, "qop", 25, "kg", "HP Start"))
        assert grunt.qty == math.ceil(math.ceil(40 * 0.15) / 5) and grunt.unit_price_uzs == 46_000
        assert putty.qty == math.ceil(40 * 1.2 / 25) and putty.unit_price_uzs == 82_000
        assert grunt.store_name and putty.store_name

    @pytest.mark.parametrize("product", [
        None,
        mat("suvoq", 66_000, "qop"),                       # shop did not say what a bag holds
        mat("suvoq", 66_000, "qop", 30, "litr"),           # wrong kind of pack
        mat("suvoq", 66_000, "m2", 30, "kg"),              # not sold by the bag
    ])
    def test_without_a_usable_product_the_old_constants_stay(self, product):
        line = _plaster_line(room(), {}, product)
        assert line.unit_price_uzs == 65_000 and line.qty == math.ceil(40 * 8.5 / 30)
        assert line.store_name is None


class TestSkirting:
    def test_strips_of_the_shops_length_at_the_shops_price(self):
        line = _plinth_line(room(perimeter=14.0), {}, mat("plintus", 36_000, "dona", 2.0, "m", "PVX"))
        assert (line.qty, line.unit, line.unit_price_uzs) == (7, "dona", 36_000)  # 14 m / 2 m strips

    def test_a_shop_that_sells_it_by_the_metre_is_charged_per_metre(self):
        line = _plinth_line(room(perimeter=14.0), {}, mat("plintus", 14_000, "m"))
        assert (line.qty, line.unit, line.subtotal_uzs) == (14, "m", 14 * 14_000)

    def test_no_product_keeps_the_2_5_m_default(self):
        assert _plinth_line(room(perimeter=14.0), {}, None).qty == math.ceil(14 / 2.5)


class TestCable:
    def test_priced_per_metre(self):
        line = _electrical_line(room(), {}, wiring_meters=20, cable=mat("kabel", 9_500, "m", name="VVG"))
        assert (line.qty, line.unit_price_uzs, line.subtotal_uzs) == (20, 9_500, 190_000)
        assert line.store_name == "Leroy Merlin Tashkent"

    def test_a_coil_is_priced_per_metre_of_its_length(self):
        line = _electrical_line(room(), {}, wiring_meters=20, cable=mat("kabel", 950_000, "dona", 100, "m"))
        assert line.unit_price_uzs == 9_500

    def test_the_measured_flag_does_not_depend_on_where_the_price_came_from(self):
        line = _electrical_line(room(), {}, wiring_meters=20, cable=mat("kabel", 9_500, "m"))
        assert line.is_approximate is False


class TestCeiling:
    def state(self):
        return {"designState": {"ceiling": {"design": "flat", "settings": {"strip": True}}}}

    def test_board_profile_and_strip_come_from_the_shop(self):
        catalog = {
            "gipsokarton": mat("gipsokarton", 96_000, "dona", 3, "m2", "Knauf list"),
            "profil": mat("profil", 30_000, "dona", 3, "m", "Karkas"),
            "led_lenta": mat("led_lenta", 230_000, "dona", 5, "m", "LED"),
        }
        board = next(ln for ln in _ceiling_construction_lines(room(state=self.state()), {}, catalog) if "Knauf" in ln.label)
        assert (board.unit, board.unit_price_uzs) == ("list", 96_000)
        profile = next(ln for ln in _ceiling_construction_lines(room(state=self.state()), {}, catalog) if ln.label == "Shift profili (karkas)")
        assert profile.unit_price_uzs == 10_000  # 30 000 per 3 m strip
        strip = next(ln for ln in _ceiling_construction_lines(room(state=self.state()), {}, catalog) if "LED" in ln.label)
        assert strip.unit_price_uzs == 46_000  # 230 000 per 5 m

    def test_a_board_priced_per_m2_is_charged_for_its_area(self):
        catalog = {"gipsokarton": mat("gipsokarton", 32_000, "m2", name="Board")}
        board = next(ln for ln in _ceiling_construction_lines(room(state=self.state()), {}, catalog) if "Board" in ln.label)
        assert board.unit == "m²" and board.subtotal_uzs == round(board.qty * 32_000)

    def test_no_catalog_keeps_the_constants(self):
        board = _ceiling_construction_lines(room(state=self.state()), {}, {})[0]
        assert board.label == "Shift gipsokartoni" and board.unit_price_uzs == 95_000


class TestLights:
    def test_a_light_type_is_priced_from_its_shop_product(self):
        r = room(state={"lights": [{"type": "pendant"}, {"type": "pendant"}]})
        line = _light_lines(r, {"light:pendant": mat("light:pendant", 275_000, "dona", name="Osma chiroq")})[0]
        assert (line.qty, line.unit_price_uzs, line.subtotal_uzs) == (2, 275_000, 550_000)
        assert line.is_approximate is False and line.store_name

    def test_a_type_with_no_product_keeps_the_reference_price(self):
        line = _light_lines(room(state={"lights": [{"type": "pendant"}]}), {})[0]
        assert line.unit_price_uzs == LIGHT_CATALOG_PRICES_UZS["pendant"]


class TestWholeEstimate:
    def test_every_prep_line_uses_the_catalog_and_the_total_follows(self):
        catalog = {
            "suvoq": mat("suvoq", 66_000, "qop", 30, "kg"),
            "grunt": mat("grunt", 46_000, "dona", 5, "kg"),
            "shpatlyovka": mat("shpatlyovka", 82_000, "qop", 25, "kg"),
            "kabel": mat("kabel", 9_500, "m"),
        }
        r = room(state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}})
        with_shop = compute_estimate(r, {}, {}, catalog=catalog)
        without = compute_estimate(r, {}, {})
        shop_lines = [ln for ln in with_shop.lines if ln.store_name]
        assert {ln.category for ln in shop_lines} >= {"suvoq", "grunt", "shpatlyovka", "elektr"}
        assert with_shop.total_uzs == sum(ln.subtotal_uzs for ln in with_shop.lines)
        assert with_shop.total_uzs != without.total_uzs

    def test_no_catalog_is_exactly_the_old_estimate(self):
        r = room(state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}})
        assert compute_estimate(r, {}, {}, catalog={}).total_uzs == compute_estimate(r, {}, {}).total_uzs


class TestLoader:
    def test_keeps_the_cheapest_per_key_by_unit_cost_not_by_sticker_price(self):
        big_bag = mat("suvoq", 70_000, "qop", 40, "kg", "40 kg")     # 1 750 / kg
        small_bag = mat("suvoq", 60_000, "qop", 30, "kg", "30 kg")   # 2 000 / kg: cheaper sticker, dearer kg
        assert ec.pick_cheapest([small_bag, big_bag])["suvoq"] is big_bag

    def test_ignores_inactive_and_unkeyed_products(self):
        picked = ec.pick_cheapest([mat("suvoq", 1, active=False), mat(None, 5), mat("grunt", 9)])
        assert set(picked) == {"grunt"}

    async def test_a_failing_query_gives_an_empty_catalog_not_an_error(self):
        db = MagicMock()
        db.execute = AsyncMock(side_effect=RuntimeError("db down"))
        assert await ec.load_estimate_catalog(db) == {}


class TestSeedData:
    ROWS = seed.PRODUCTS + seed.ADOPT
    STORE_NAMES = {s["name"] for s in CATALOG_STORES} | {s["name"] for s in PARTNER_STORES}

    def test_every_row_is_a_valid_material(self):
        categories, units = set(MaterialCategory.enums), set(MaterialUnit.enums)
        for r in self.ROWS:
            assert r["category"] in categories and r["unit"] in units, r["name_uz"]
            assert r["store"] in self.STORE_NAMES, r["store"]

    def test_pack_size_and_unit_come_together_and_match_the_key(self):
        for r in self.ROWS:
            assert (r["pack_qty"] is None) == (r["pack_unit"] is None), r["name_uz"]
            base = r["smeta_key"].split(":")[0]
            if base in seed.KEY_PACK_UNIT:
                assert r["pack_unit"] == seed.KEY_PACK_UNIT[base], r["name_uz"]
            else:
                assert base == "light" and r["smeta_key"][6:] in LIGHT_CATALOG_PRICES_UZS

    def test_names_are_unique_per_store(self):
        keys = [(r["store"], r["name_uz"]) for r in self.ROWS]
        assert len(keys) == len(set(keys))

    def test_every_estimate_line_has_at_least_one_product(self):
        keys = {r["smeta_key"] for r in self.ROWS}
        assert set(seed.KEY_PACK_UNIT) <= keys
        assert {f"light:{t}" for t in LIGHT_CATALOG_PRICES_UZS} <= keys


class _Res:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


class _FakeSession:
    """A session holding stores and materials in memory; understands the two statements the seeder issues."""

    def __init__(self, stores, materials):
        self.stores, self.materials = stores, list(materials)

    async def execute(self, stmt):
        return _Res(self.stores)

    async def scalar(self, stmt):
        p = stmt.compile().params
        store_id = next(v for k, v in p.items() if k.startswith("store_id"))
        name = next(v for k, v in p.items() if k.startswith("name_uz"))
        return next((m for m in self.materials if m.store_id == store_id and m.name_uz == name), None)

    def add(self, obj):
        self.materials.append(obj)


def _stores():
    return [Store(id=uuid.uuid4(), name=n) for n in ("Leroy Merlin Tashkent", "Qurilish Bozori", "Stroy Master")]


class TestSeeder:
    async def test_inserts_then_a_second_run_changes_nothing(self):
        session = _FakeSession(_stores(), [])
        first = await seed._apply(session)
        count = len(session.materials)
        second = await seed._apply(session)
        assert first["inserted"] == len([r for r in seed.PRODUCTS]) and first["skipped_store"] == 0
        assert second == {"inserted": 0, "filled": 0, "skipped_store": 0} and len(session.materials) == count

    async def test_an_existing_product_gets_its_key_and_pack_but_keeps_its_price_and_name(self):
        stores = _stores()
        lm = next(s for s in stores if s.name == "Leroy Merlin Tashkent")
        vetonit = Material(store_id=lm.id, name_uz="Vetonit shpaklovka", category="gips", unit="qop", price_uzs=71_000)
        session = _FakeSession(stores, [vetonit])
        await seed._apply(session)
        assert (vetonit.smeta_key, float(vetonit.pack_qty), vetonit.pack_unit) == ("shpatlyovka", 25.0, "kg")
        assert vetonit.price_uzs == 71_000 and vetonit.name_uz == "Vetonit shpaklovka"

    async def test_an_admin_set_key_is_not_overwritten(self):
        stores = _stores()
        lm = next(s for s in stores if s.name == "Leroy Merlin Tashkent")
        m = Material(store_id=lm.id, name_uz="Vetonit shpaklovka", category="gips", unit="qop", price_uzs=1,
                     smeta_key="custom", pack_qty=20, pack_unit="kg")
        await seed._apply(_FakeSession(stores, [m]))
        assert (m.smeta_key, float(m.pack_qty)) == ("custom", 20.0)

    async def test_a_missing_store_is_skipped_not_fatal(self):
        result = await seed._apply(_FakeSession([], []))
        assert result["inserted"] == 0 and result["skipped_store"] == len(seed.PRODUCTS) + len(seed.ADOPT)
