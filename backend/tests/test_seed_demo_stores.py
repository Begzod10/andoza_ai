"""The demo-store catalog: its data file, and the seed that loads and removes it.

``app/seed_data/demo_stores/catalog.json`` is produced by
``scripts/demo_catalog/fetch.py`` from the stores' public sites. These tests pin
what the seed relies on: every category/unit is one the models accept, every
photo exists, furniture prices are positive or unknown, materials always have a
price. Then the seed itself: run twice it inserts once, and ``--remove`` takes
away only the DEMO stores and what they own.

No database: ``_FakeSession`` interprets the ``select(Model)[.where(col == v, ...)]``
statements the seed issues, so the real seed code runs unmodified against it.
"""
from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from sqlalchemy.sql.elements import BinaryExpression, BooleanClauseList

from app import seed_demo_stores as demo
from app.models.furniture import Furniture
from app.models.material import Material, MaterialCategory, MaterialUnit
from app.models.store import Store
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


def test_every_item_has_a_photo_on_disk_and_a_source():
    for store, item in _items():
        path = demo.DATA_DIR / item["image"]
        assert item["image"].startswith(f"images/{store['slug']}/"), item
        assert path.is_file(), item["image"]
        assert path.read_bytes()[8:12] == b"WEBP", item["image"]
        assert item["source_url"].startswith("http"), item


def test_the_photos_stay_small():
    total = sum(p.stat().st_size for p in (demo.DATA_DIR / "images").rglob("*.webp"))
    assert total <= 12 * 1024 * 1024


def test_names_fit_and_are_unique_per_store():
    for store in CATALOG["stores"]:
        names = [i["name_uz"] for i in store["items"]]
        assert len(names) == len(set(names)), store["name"]  # the seed's natural key
        assert all(0 < len(n) <= 200 and n == n.strip() for n in names)


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


def test_lamps_hang_where_lamps_hang():
    for _, item in _items("furniture"):
        if item["category"] == "lampa":
            assert item["placement"] in ("shift", "devor", "pol"), item


# ---------------------------------------------------------------------------
# In-memory session
# ---------------------------------------------------------------------------

def _criteria(whereclause) -> list[tuple[str, object]]:
    if whereclause is None:
        return []
    if isinstance(whereclause, BooleanClauseList):
        pairs: list[tuple[str, object]] = []
        for clause in whereclause.clauses:
            pairs.extend(_criteria(clause))
        return pairs
    assert isinstance(whereclause, BinaryExpression), f"unsupported: {whereclause}"
    return [(whereclause.left.name, whereclause.right.value)]


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
        if getattr(row, "id", None) is None:
            row.id = uuid.uuid4()
        self.rows.append(row)

    async def flush(self) -> None:
        for row in self.rows:
            if getattr(row, "id", None) is None:
                row.id = uuid.uuid4()

    async def delete(self, row) -> None:
        self.rows.remove(row)

    def of(self, model) -> list:
        return [r for r in self.rows if isinstance(r, model)]


class _Uploads:
    def __init__(self) -> None:
        self.keys: list[str] = []

    async def __call__(self, data: bytes, key: str, content_type: str = "") -> str:
        assert data and content_type == "image/webp"
        self.keys.append(key)
        return f"/media/{key}"


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------

async def test_seeding_twice_inserts_once():
    session, uploads = _FakeSession(), _Uploads()
    first = await demo._apply(session, CATALOG, upload=uploads)
    n_furniture = sum(1 for _ in _items("furniture"))
    n_materials = sum(1 for _ in _items("material"))
    assert first["stores"] == len(CATALOG["stores"])
    assert (first["furniture"], first["materials"]) == (n_furniture, n_materials)
    assert len(uploads.keys) == n_furniture + n_materials

    second = await demo._apply(session, CATALOG, upload=uploads)
    assert (second["stores"], second["furniture"], second["materials"]) == (0, 0, 0)
    assert second["existing"] == n_furniture + n_materials
    assert len(uploads.keys) == n_furniture + n_materials  # no photo uploaded twice
    assert len(session.of(Store)) == len(CATALOG["stores"])
    assert len(session.of(Furniture)) == n_furniture
    assert len(session.of(Material)) == n_materials


async def test_seeded_rows_are_demo_approved_and_photo_only():
    session = _FakeSession()
    await demo._apply(session, CATALOG, upload=_Uploads())
    for store in session.of(Store):
        assert store.moderation_note == demo.DEMO_NOTE and demo.is_demo(store)
        assert store.status == "approved" and store.is_active
    for f in session.of(Furniture):
        assert f.glb_key is None and f.status == "approved" and f.is_active
        assert f.thumbnail_key.startswith("furniture/demo/") and f.thumbnail_key.endswith(".webp")
        assert f.placement in PLACEMENTS
    for m in session.of(Material):
        assert m.image_url.startswith("/media/materials/demo/")
        assert m.price_uzs > 0


async def test_a_real_store_with_a_demo_name_is_left_alone():
    session = _FakeSession()
    real = Store(name=CATALOG["stores"][0]["name"], partner_tier="gold", is_active=True, status="approved")
    session.add(real)
    counts = await demo._apply(session, CATALOG, upload=_Uploads())
    assert counts["skipped_real_store"] == 1
    assert real.moderation_note is None and real.partner_tier == "gold"
    assert not [f for f in session.of(Furniture) if f.store_id == real.id]
    assert not [m for m in session.of(Material) if m.store_id == real.id]


# ---------------------------------------------------------------------------
# Removing
# ---------------------------------------------------------------------------

async def test_remove_deletes_only_demo_stores_and_their_rows():
    session = _FakeSession()
    other = Store(name="Hamkor Qurilish", partner_tier="standard", is_active=True, status="approved")
    session.add(other)
    kept_furniture = Furniture(store_id=other.id, category="divan", name_uz="Divan", placement="pol",
                               glb_key="furniture/x.glb", thumbnail_key="furniture/x_thumb.webp")
    kept_material = Material(store_id=other.id, category="laminat", name_uz="Laminat", unit="m2",
                             price_uzs=100_000, image_url="/media/materials/x.webp")
    admin_piece = Furniture(store_id=None, category="stol", name_uz="Stol", placement="pol")
    for row in (kept_furniture, kept_material, admin_piece):
        session.add(row)
    await demo._apply(session, CATALOG, upload=_Uploads())

    counts, keys = await demo._remove(session)

    assert counts["stores"] == len(CATALOG["stores"])
    assert counts["furniture"] == sum(1 for _ in _items("furniture"))
    assert counts["materials"] == sum(1 for _ in _items("material"))
    assert session.of(Store) == [other]
    assert set(session.of(Furniture)) == {kept_furniture, admin_piece}
    assert session.of(Material) == [kept_material]
    # Exactly the photos this seed uploaded, as bare storage keys.
    assert len(keys) == counts["furniture"] + counts["materials"]
    assert all(k.startswith(("furniture/demo/", "materials/demo/")) for k in keys)

    again, _ = await demo._remove(session)
    assert again == {"stores": 0, "furniture": 0, "materials": 0}


async def test_remove_entry_point_deletes_files_after_commit(monkeypatch):
    session = _FakeSession()
    await demo._apply(session, CATALOG, upload=_Uploads())

    class _Begin:
        async def __aenter__(self):
            return None

        async def __aexit__(self, *exc):
            return False

    class _Ctx:
        async def __aenter__(self):
            session.begin = lambda: _Begin()
            return session

        async def __aexit__(self, *exc):
            return False

    deleted: list[str] = []

    async def fake_delete(key):
        deleted.append(key)

    monkeypatch.setattr(demo, "AsyncSessionLocal", lambda: _Ctx())
    monkeypatch.setattr(demo, "delete_file", fake_delete)
    counts = await demo.remove_demo_stores()
    assert counts["files_deleted"] == len(deleted) == counts["furniture"] + counts["materials"]
    assert not session.of(Store)


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
