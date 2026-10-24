"""The demo-store catalog: its data file, and the seed that loads and removes it.

``app/seed_data/demo_stores/catalog.json`` is produced by
``scripts/demo_catalog/fetch.py`` from the stores' public sites. These tests pin
what the seed relies on and what the presentation shows: valid categories and
units, a photo per item, prices positive or unknown (always set for materials),
and clean product names. Then the seed itself:

* it runs only with ``DEMO_STORES`` on (or ``--force``), and only into a database
  with no demo store yet, so an admin's deletions and renames are never undone;
* ``--remove`` deletes the ``is_demo`` stores and what they own, and leaves a marker
  so the next deploy does not seed them again; ``--force`` reseeds;
* a failed seed deletes the photos it had already uploaded;
* wallpapers (a demo store's oboy, priced per roll with its roll size) go in and
  out with the stores.

No database: ``_FakeSession`` interprets the ``select(Model)[.where(col == v, ...)]``
statements the seed issues, so the real seed code runs unmodified against it.
"""
from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest
from sqlalchemy.sql.elements import BinaryExpression, BooleanClauseList, False_, True_

from app import seed_demo_stores as demo
from app.models.furniture import Furniture
from app.models.material import Material, MaterialCategory, MaterialUnit
from app.models.seed_marker import SeedMarker
from app.models.store import Store
from app.models.wallpaper import Wallpaper
from app.schemas.admin_catalog import FURNITURE_CATEGORIES, PLACEMENTS, ROOM_TYPES

CATALOG = demo.load_catalog()


# ---------------------------------------------------------------------------
# The data file
# ---------------------------------------------------------------------------

def _items(kind: str | None = None):
    for store in CATALOG["stores"]:
        for item in store["items"]:
            if kind is None or item["kind"] == kind:
                yield store, item


def test_the_catalog_has_stores_with_furniture_and_materials():
    assert len(CATALOG["stores"]) >= 5
    assert sum(1 for _ in _items("furniture")) >= 50
    assert sum(1 for _ in _items("material")) >= 1
    names = [s["name"] for s in CATALOG["stores"]]
    assert len(names) == len(set(names))
    for store in CATALOG["stores"]:
        assert store["items"], store["name"]
        assert len(store["items"]) <= 30, store["name"]
        # A real store links its site; the market-average store has none (it is no shop).
        assert store.get("website", "").startswith("https://") or _is_market_average(store)
        assert len(store["name"]) <= 200
        if store.get("phone"):
            assert len(store["phone"]) <= 20


def test_no_carpets_from_prom_uz():
    # Sanat Hali's photos are prom.uz /upload/ files, which www.prom.uz's robots.txt disallows.
    assert "sanat-hali" not in {s["slug"] for s in CATALOG["stores"]}
    # (Market-average items cite prom.uz ads in "sources" for their prices; no photo comes from there.)
    assert not any("prom.uz" in item.get("source_url", "") for _, item in _items())
    assert not (demo.DATA_DIR / "images" / "sanat-hali").exists()


def test_every_item_has_a_photo_on_disk_and_a_source():
    for store, item in _items():
        path = demo.DATA_DIR / item["image"]
        assert item["image"].startswith(f"images/{store['slug']}/"), item
        assert path.is_file(), item["image"]
        assert path.read_bytes()[8:12] == b"WEBP", item["image"]
        sources = [item["source_url"]] if "source_url" in item else item["sources"]
        assert sources and all(s.startswith("http") for s in sources), item


def _is_market_average(store: dict) -> bool:
    return all(i.get("price_basis", "").startswith("market_median") for i in store["items"])


def test_catalog_versions_are_consistent():
    version = demo.catalog_version(CATALOG)
    assert version >= 2
    for store in CATALOG["stores"]:
        for item in store["items"]:
            assert 1 <= demo.item_since(store, item) <= version, (store["name"], item["name_uz"])
    # The first version is what production already has: the 9 stores seeded before
    # catalog versions existed. New rows must come with a higher "since".
    v1 = [s for s in CATALOG["stores"] if any(demo.item_since(s, i) == 1 for i in s["items"])]
    assert len(v1) == 9
    assert sum(1 for s in v1 for i in s["items"] if demo.item_since(s, i) == 1) == 134 + 25 + 28


def test_the_window_store_is_labelled_as_average_market_prices():
    market = [s for s in CATALOG["stores"] if _is_market_average(s)]
    assert [s["slug"] for s in market] == ["deraza-bozori"]
    store = market[0]
    assert "o'rtacha narx" in store["name"]
    # No brand is presented as the seller; brands may only name a profile inside a product.
    assert not re.search(r"akfa|imzo|engelberg|ekopen", store["name"], re.I)
    note = store["moderation_note"]
    assert note.startswith("DEMO:") and "o'rtacha narx" in note and "do'kon taklifi emas" in note
    assert len(note) <= 300  # Store.moderation_note is String(300)
    assert store["since"] == 2 and "website" not in store
    cats = {i["category"] for i in store["items"]}
    assert "deraza" in cats and cats <= {"deraza", "eshik"}
    for item in store["items"]:
        assert item["kind"] == "material"
        assert item["unit"] in ("m2", "dona"), item
        # A median of real listings: the number of data points matches the cited sources.
        assert item["sample_size"] == len(item["sources"]) >= 5, item
        assert 100_000 <= item["price_uzs"] <= 5_000_000, item


def test_no_photo_on_disk_is_unreferenced():
    referenced = {item["image"] for _, item in _items()}
    on_disk = {p.relative_to(demo.DATA_DIR).as_posix() for p in (demo.DATA_DIR / "images").rglob("*.webp")}
    assert on_disk == referenced


def test_the_photos_stay_small():
    total = sum(p.stat().st_size for p in (demo.DATA_DIR / "images").rglob("*.webp"))
    assert total <= 12 * 1024 * 1024


def test_names_fit_and_are_unique_per_store():
    for store in CATALOG["stores"]:
        names = [i["name_uz"] for i in store["items"]]
        assert len(names) == len(set(names)), store["name"]  # the seed's natural key
        assert all(0 < len(n) <= 200 and n == n.strip() for n in names)


def test_names_read_like_product_names():
    for _, item in _items():
        name = item["name_uz"]
        assert not re.search(r"\(\d{1,2}\)$", name), name  # no "(2)" made-up suffixes
        assert not name.endswith("."), name
        assert not re.match(r"(Люстры|Торшеры|Одинарные светильники)\b|\w+ \[", name), name
        assert name[0] == name[0].upper(), name
        for word in name.split():  # no Latin look-alikes inside a Cyrillic word ("Cтильный")
            assert not (re.search(r"[а-яё]", word, re.I) and re.search(r"[A-Za-z]", word)), name


_BUNDLE = re.compile(
    r"комплект|гарнитур|^спальня|^гостиная|^с/с|^г/н|\d\s*стуль|\bнабор|to'plam"
    r"|\sи\s+(\w+\s+)?(тумб|стул|кресл|шкаф|диван|пуф|стол|зеркал|комод)", re.I)


def test_multi_piece_bundles_are_not_furniture():
    for _, item in _items("furniture"):
        assert not _BUNDLE.search(item["name_uz"]), item["name_uz"]
        assert "/composite/" not in item["source_url"], item


def test_furniture_uses_the_models_categories_and_prices_are_positive_or_unknown():
    for _, item in _items("furniture"):
        assert item["category"] in FURNITURE_CATEGORIES, item
        assert item.get("placement", "pol") in PLACEMENTS, item
        assert item.get("room_type") in ROOM_TYPES | {None}, item
        assert item["price_uzs"] is None or (isinstance(item["price_uzs"], int) and item["price_uzs"] > 0), item
        for key in ("footprint_w", "footprint_d", "height_cm"):
            if item.get(key) is not None:
                assert 0 < item[key] < 1000, item  # Numeric(5, 2) centimetres


def test_materials_use_the_enums_and_always_have_a_price():
    for _, item in _items("material"):
        assert item["category"] in MaterialCategory.enums, item
        assert item["unit"] in MaterialUnit.enums, item
        assert isinstance(item["price_uzs"], int) and item["price_uzs"] > 0, item


def test_wallpapers_have_a_price_a_roll_size_and_a_pattern_photo():
    from PIL import Image

    wallpapers = [item for _, item in _items("wallpaper")]
    assert 20 <= len(wallpapers) <= 30
    for item in wallpapers:
        assert item["category"] == "oboy"
        assert 0 < len(item["name_uz"]) <= 120, item  # Wallpaper.name is String(120)
        assert isinstance(item["price_uzs"], int) and item["price_uzs"] > 0, item
        assert 30 <= item["roll_width_cm"] <= 200, item
        assert 3 <= item["roll_length_m"] <= 50, item
        with Image.open(demo.DATA_DIR / item["image"]) as im:
            assert max(im.size) <= 1024


def test_lamps_hang_where_lamps_hang():
    for _, item in _items("furniture"):
        if item["category"] == "lampa":
            assert item["placement"] in ("shift", "devor", "pol"), item


# ---------------------------------------------------------------------------
# In-memory session
# ---------------------------------------------------------------------------

def _value(right):
    if isinstance(right, True_):
        return True
    if isinstance(right, False_):
        return False
    return right.value


def _criteria(whereclause) -> list[tuple[str, object]]:
    if whereclause is None:
        return []
    if isinstance(whereclause, BooleanClauseList):
        pairs: list[tuple[str, object]] = []
        for clause in whereclause.clauses:
            pairs.extend(_criteria(clause))
        return pairs
    assert isinstance(whereclause, BinaryExpression), f"unsupported: {whereclause}"
    return [(whereclause.left.name, _value(whereclause.right))]


class _Scalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _Scalars(self._rows)


class _FakeSession:
    def __init__(self) -> None:
        self.rows: list[object] = []
        self.fail_on_flush: int | None = None  # raise on the n-th flush
        self.flushes = 0

    def _match(self, stmt) -> list[object]:
        entity = stmt.column_descriptions[0]["entity"]
        wanted = _criteria(stmt.whereclause)
        return [
            r for r in self.rows
            if isinstance(r, entity) and all(getattr(r, c) == v for c, v in wanted)
        ]

    async def scalar(self, stmt):
        found = self._match(stmt)
        return found[0] if found else None

    async def execute(self, stmt):
        return _Result(self._match(stmt))

    def add(self, row) -> None:
        if isinstance(row, Store) and row.is_demo is None:
            row.is_demo = False  # the column's server default
        if getattr(row, "id", None) is None and not isinstance(row, SeedMarker):
            row.id = uuid.uuid4()
        self.rows.append(row)

    async def flush(self) -> None:
        self.flushes += 1
        if self.fail_on_flush is not None and self.flushes >= self.fail_on_flush:
            raise RuntimeError("database went away")

    async def delete(self, row) -> None:
        self.rows.remove(row)

    def of(self, model) -> list:
        return [r for r in self.rows if isinstance(r, model)]

    # `async with AsyncSessionLocal() as s, s.begin():` for the entry points
    def begin(self):
        return _Ctx(None)


class _Ctx:
    def __init__(self, value):
        self.value = value

    async def __aenter__(self):
        return self.value

    async def __aexit__(self, *exc):
        return False


class _Uploads:
    def __init__(self) -> None:
        self.keys: list[str] = []

    async def __call__(self, data: bytes, key: str, content_type: str = "") -> str:
        assert data and content_type == "image/webp"
        self.keys.append(key)
        return f"/media/{key}"


N_FURNITURE = sum(1 for _ in _items("furniture"))
N_MATERIALS = sum(1 for _ in _items("material"))
N_WALLPAPERS = sum(1 for _ in _items("wallpaper"))
N_ITEMS = N_FURNITURE + N_MATERIALS + N_WALLPAPERS


@pytest.fixture
def env(monkeypatch):
    """The entry points wired to one fake session, fake storage, and the flag on."""
    session, uploads, deleted = _FakeSession(), _Uploads(), []

    async def fake_delete(key):
        deleted.append(key)

    monkeypatch.setattr(demo, "AsyncSessionLocal", lambda: _Ctx(session))
    monkeypatch.setattr(demo, "upload_file", uploads)
    monkeypatch.setattr(demo, "delete_file", fake_delete)
    monkeypatch.setattr(demo.settings, "DEMO_STORES", True)
    return session, uploads, deleted


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------

async def test_a_first_seed_inserts_everything_marked_demo(env):
    session, uploads, _ = env
    result = await demo.seed_demo_stores()
    assert result["status"] == "seeded"
    assert (result["stores"], result["furniture"], result["materials"]) == (
        len(CATALOG["stores"]), N_FURNITURE, N_MATERIALS)
    assert result["wallpapers"] == N_WALLPAPERS
    assert len(uploads.keys) == N_ITEMS
    notes = {s["name"]: s.get("moderation_note", demo.DEMO_NOTE) for s in CATALOG["stores"]}
    for store in session.of(Store):
        assert store.is_demo is True
        assert store.moderation_note == notes[store.name]  # for humans reading the admin
        assert store.status == "approved" and store.is_active
    assert [m.key for m in session.of(SeedMarker)] == [f"demo_stores_v{demo.catalog_version(CATALOG)}"]
    assert (result["from_version"], result["version"]) == (0, demo.catalog_version(CATALOG))
    for f in session.of(Furniture):
        assert f.glb_key is None and f.status == "approved" and f.is_active
        assert f.thumbnail_key.startswith("furniture/demo/") and f.thumbnail_key.endswith(".webp")
        assert f.placement in PLACEMENTS
    for w in session.of(Wallpaper):
        assert w.kind == "oboy" and w.storage_key.startswith("wallpapers/demo/")
        assert w.width_cm and w.total_length_m and w.price_uzs > 0
        assert w.content_type == "image/webp" and w.size_bytes > 0 and len(w.sha256) == 64
        assert w.store_id in {st.id for st in session.of(Store)}
    for m in session.of(Material):
        assert m.image_url.startswith("/media/materials/demo/")
        assert m.price_uzs > 0


async def test_without_the_flag_nothing_is_seeded(env, monkeypatch):
    session, uploads, _ = env
    monkeypatch.setattr(demo.settings, "DEMO_STORES", False)
    result = await demo.seed_demo_stores()
    assert result["status"] == "disabled"
    assert session.rows == [] and uploads.keys == []


async def test_once_seeded_a_deploy_does_not_undo_admin_deletes_or_renames(env):
    session, uploads, _ = env
    await demo.seed_demo_stores()
    # An admin deletes one piece and renames another.
    pieces = session.of(Furniture)
    await session.delete(pieces[0])
    pieces[1].name_uz = "Admin bergan nom"
    before = len(session.rows)

    result = await demo.seed_demo_stores()

    assert result["status"] == "already_seeded"
    assert len(session.rows) == before
    assert len(uploads.keys) == N_ITEMS  # nothing uploaded again


async def test_after_remove_the_next_deploy_does_not_seed_again(env):
    session, uploads, _ = env
    await demo.seed_demo_stores()
    await demo.remove_demo_stores()
    assert demo.REMOVED_MARKER in [m.key for m in session.of(SeedMarker)]

    result = await demo.seed_demo_stores()

    assert result["status"] == "removed"
    assert not session.of(Store) and not session.of(Furniture) and not session.of(Material)
    assert not session.of(Wallpaper)


async def test_force_reseeds_after_a_remove_and_clears_the_marker(env, monkeypatch):
    session, _, _ = env
    monkeypatch.setattr(demo.settings, "DEMO_STORES", False)  # --force works with the flag off too
    await demo.seed_demo_stores(force=True)
    await demo.remove_demo_stores()

    result = await demo.seed_demo_stores(force=True)

    assert result["status"] == "seeded"
    assert len(session.of(Store)) == len(CATALOG["stores"])
    assert [m.key for m in session.of(SeedMarker)] == [f"demo_stores_v{demo.catalog_version(CATALOG)}"]


# ---------------------------------------------------------------------------
# Catalog versions: rows added after the first seed
# ---------------------------------------------------------------------------

def _v1_catalog() -> dict:
    """The catalog as production seeded it, before versions existed."""
    stores = []
    for s in CATALOG["stores"]:
        items = [i for i in s["items"] if demo.item_since(s, i) == 1]
        if items:
            stores.append({**s, "items": items})
    return {"stores": stores}


async def _seed_like_production_did(session, uploads):
    """Demo stores from catalog v1 and no version marker: what production has today."""
    await demo._apply(session, _v1_catalog(), upload=uploads, uploaded=[])
    assert not session.of(SeedMarker)


def _newer_items():
    return [(s, i) for s in CATALOG["stores"] for i in s["items"] if demo.item_since(s, i) > 1]


async def test_a_database_seeded_before_versions_gets_exactly_the_new_rows(env):
    session, uploads, _ = env
    await _seed_like_production_did(session, uploads)
    stores_before = set(session.of(Store))
    uploads_before = len(uploads.keys)

    result = await demo.seed_demo_stores()

    newer = _newer_items()
    assert newer, "the catalog has rows added after version 1"
    assert result["status"] == "seeded" and result["from_version"] == 1
    assert result["materials"] == len(newer)
    assert (result["furniture"], result["wallpapers"], result["existing"]) == (0, 0, 0)
    assert result["stores"] == len({s["name"] for s, _ in newer})
    added = set(session.of(Store)) - stores_before
    assert {st.name for st in added} == {"Deraza bozori — o'rtacha narx"}
    window_store = added.pop()
    assert window_store.is_demo is True and "o'rtacha narx" in window_store.moderation_note
    windows = [m for m in session.of(Material) if m.store_id == window_store.id]
    assert sorted(m.name_uz for m in windows) == sorted(i["name_uz"] for _, i in newer)
    assert len(uploads.keys) - uploads_before == len(newer)
    assert [m.key for m in session.of(SeedMarker)] == [f"demo_stores_v{demo.catalog_version(CATALOG)}"]


async def test_the_second_deploy_adds_nothing(env):
    session, uploads, _ = env
    await _seed_like_production_did(session, uploads)
    await demo.seed_demo_stores()
    rows, n_uploads = len(session.rows), len(uploads.keys)

    result = await demo.seed_demo_stores()

    assert result == {"status": "already_seeded", "version": demo.catalog_version(CATALOG)}
    assert len(session.rows) == rows and len(uploads.keys) == n_uploads


async def test_an_admin_deleted_v1_row_or_store_is_not_restored_by_a_new_version(env):
    session, uploads, _ = env
    await _seed_like_production_did(session, uploads)
    # An admin deletes one v1 material, one v1 piece of furniture and a whole v1 store.
    gone_material = session.of(Material)[0]
    gone_piece = session.of(Furniture)[0]
    await session.delete(gone_material)
    await session.delete(gone_piece)
    gone_store = next(st for st in session.of(Store) if st.id not in (gone_piece.store_id, gone_material.store_id))
    for row in [r for r in session.rows if getattr(r, "store_id", None) == gone_store.id]:
        await session.delete(row)
    await session.delete(gone_store)

    await demo.seed_demo_stores()

    assert gone_material.name_uz not in {m.name_uz for m in session.of(Material) if m.store_id == gone_material.store_id}
    assert gone_piece.name_uz not in {f.name_uz for f in session.of(Furniture) if f.store_id == gone_piece.store_id}
    assert gone_store.name not in {st.name for st in session.of(Store)}


async def test_a_removed_demo_blocks_new_versions_too(env):
    session, uploads, _ = env
    await _seed_like_production_did(session, uploads)
    await demo.remove_demo_stores()

    result = await demo.seed_demo_stores()

    assert result["status"] == "removed"
    assert not session.of(Store) and not session.of(Material)


async def test_a_new_version_reaches_a_database_already_at_an_older_marker(env, monkeypatch):
    session, uploads, _ = env
    await demo.seed_demo_stores()
    # A later catalog adds a version-3 item to an existing store.
    v3 = {"version": 3, "stores": [dict(s) for s in CATALOG["stores"]]}
    first = v3["stores"][-1]
    extra = {**first["items"][0], "name_uz": "Yangi mahsulot", "since": 3}
    v3["stores"][-1] = {**first, "items": first["items"] + [extra]}
    monkeypatch.setattr(demo, "load_catalog", lambda *a, **k: v3)

    result = await demo.seed_demo_stores()

    assert result["status"] == "seeded" and result["from_version"] == demo.catalog_version(CATALOG)
    assert (result["stores"], result["materials"], result["existing"]) == (0, 1, 0)
    assert "Yangi mahsulot" in {m.name_uz for m in session.of(Material)}
    assert [m.key for m in session.of(SeedMarker)] == ["demo_stores_v3"]


async def test_a_real_store_with_a_demo_name_is_left_alone(env):
    session, _, _ = env
    real = Store(name=CATALOG["stores"][0]["name"], partner_tier="gold", is_active=True, status="approved")
    session.add(real)
    result = await demo.seed_demo_stores()
    assert result["skipped_real_store"] == 1
    assert real.is_demo is False and real.moderation_note is None and real.partner_tier == "gold"
    assert not [f for f in session.of(Furniture) if f.store_id == real.id]


async def test_a_failed_seed_deletes_the_photos_it_uploaded(env):
    session, uploads, deleted = env
    session.fail_on_flush = 3  # dies part-way through the second store
    with pytest.raises(RuntimeError):
        await demo.seed_demo_stores()
    assert uploads.keys, "the failure should come after some uploads"
    assert sorted(deleted) == sorted(uploads.keys)


# ---------------------------------------------------------------------------
# Removing
# ---------------------------------------------------------------------------

async def test_remove_deletes_only_is_demo_stores_and_their_rows(env):
    session, uploads, deleted = env
    other = Store(name="Hamkor Qurilish", partner_tier="standard", is_active=True, status="approved")
    # A note that merely reads "DEMO:" does not make a store demo: the column does.
    lookalike = Store(name="Note only", partner_tier="standard", is_active=True, status="approved",
                      moderation_note="DEMO: typed by an admin")
    session.add(other)
    session.add(lookalike)
    kept_furniture = Furniture(store_id=other.id, category="divan", name_uz="Divan", placement="pol",
                               glb_key="furniture/x.glb", thumbnail_key="furniture/x_thumb.webp")
    kept_material = Material(store_id=other.id, category="laminat", name_uz="Laminat", unit="m2",
                             price_uzs=100_000, image_url="/media/materials/x.webp")
    admin_piece = Furniture(store_id=None, category="stol", name_uz="Stol", placement="pol")
    kept_wallpaper = Wallpaper(store_id=None, name="Mening oboyim", kind="oboy", storage_key="wallpapers/x.jpg",
                               content_type="image/jpeg", size_bytes=10, sha256="0" * 64)
    for row in (kept_furniture, kept_material, admin_piece, kept_wallpaper):
        session.add(row)
    await demo.seed_demo_stores()

    counts = await demo.remove_demo_stores()

    assert counts["stores"] == len(CATALOG["stores"])
    assert (counts["furniture"], counts["materials"], counts["wallpapers"]) == (
        N_FURNITURE, N_MATERIALS, N_WALLPAPERS)
    assert set(session.of(Store)) == {other, lookalike}
    assert set(session.of(Furniture)) == {kept_furniture, admin_piece}
    assert session.of(Material) == [kept_material]
    assert session.of(Wallpaper) == [kept_wallpaper]
    # Exactly the photos this seed uploaded, deleted after the commit.
    assert sorted(deleted) == sorted(uploads.keys)
    assert counts["files_deleted"] == len(deleted)

    again = await demo.remove_demo_stores()
    assert (again["stores"], again["furniture"], again["materials"], again["wallpapers"]) == (0, 0, 0, 0)
    assert [m.key for m in session.of(SeedMarker)].count(demo.REMOVED_MARKER) == 1


@pytest.mark.parametrize("url,key", [
    ("/media/materials/demo/a.webp", "materials/demo/a.webp"),
    ("/media/materials/other.webp", None),
    ("https://picsum.photos/seed/x/600/400", None),
    (None, None),
])
def test_only_this_seeds_material_photos_are_deleted(url, key):
    assert demo._material_image_key(url) == key


def test_the_data_dir_ships_with_the_backend():
    # The Dockerfile copies the whole backend/ dir, so the seed finds its data in the image.
    assert demo.DATA_DIR == Path(demo.__file__).resolve().parent / "seed_data" / "demo_stores"


def test_the_flag_is_off_by_default():
    from app.config import Settings

    assert Settings.model_fields["DEMO_STORES"].default is False
