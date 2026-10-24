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
        assert store["website"].startswith("https://")
        assert len(store["name"]) <= 200
        if store.get("phone"):
            assert len(store["phone"]) <= 20


def test_no_carpets_from_prom_uz():
    # Sanat Hali's photos are prom.uz /upload/ files, which www.prom.uz's robots.txt disallows.
    assert "sanat-hali" not in {s["slug"] for s in CATALOG["stores"]}
    assert not any("prom.uz" in item["source_url"] for _, item in _items())
    assert not (demo.DATA_DIR / "images" / "sanat-hali").exists()


def test_every_item_has_a_photo_on_disk_and_a_source():
    for store, item in _items():
        path = demo.DATA_DIR / item["image"]
        assert item["image"].startswith(f"images/{store['slug']}/"), item
        assert path.is_file(), item["image"]
        assert path.read_bytes()[8:12] == b"WEBP", item["image"]
        assert item["source_url"].startswith("http"), item


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
    for store in session.of(Store):
        assert store.is_demo is True
        assert store.moderation_note == demo.DEMO_NOTE  # for humans reading the admin
        assert store.status == "approved" and store.is_active
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
    assert [m.key for m in session.of(SeedMarker)] == [demo.REMOVED_MARKER]

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
    assert not session.of(SeedMarker)


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
    assert len(session.of(SeedMarker)) == 1


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
