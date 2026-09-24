"""Both catalog seeders, run together, twice — the property the deploy needs.

Production carries two *separate* real supplier catalogs, seeded months apart:

  * `app/seed_catalog.py` — Qurilish Bozori / Stroy Master / Leroy Merlin
    Tashkent, plus materials, ustalar and the multi-dealer material_offers.
  * `app/seeds.py` — Hamkor Qurilish / Unitile Toshkent / LaminatShop, plus
    9 materials and 5 ustalar. Seeded by hand in September; nothing
    automated ever ran it, so edits to that file reached no database.

`app/seed_partners.py` is the entry point that closes that gap, and the
deploy now runs both. Running a seeder against a live database is only
acceptable if it is insert-guarded on a natural key, so that is what these
tests pin: run every seeder twice, in one shared session, and there must be
exactly one row per natural key and no row written by one seeder touched by
the other.

No database is required. `_FakeSession` is a small in-memory stand-in that
interprets the `select(Entity).where(col == value [, ...])` statements these
seeders issue — the real seeder code runs unmodified against it.
"""
from __future__ import annotations

import uuid
from collections import Counter

import pytest
from sqlalchemy.sql.elements import BinaryExpression, BooleanClauseList

from app import seed_catalog, seed_partners, seeds
from app.models.material import Material
from app.models.material_offer import MaterialOffer
from app.models.store import Store
from app.models.usta import Usta


# ---------------------------------------------------------------------------
# In-memory session
# ---------------------------------------------------------------------------

def _criteria(whereclause) -> list[tuple[str, object]]:
    """Flatten `col == value [AND col == value]` into (column_name, value)."""
    if whereclause is None:
        return []
    if isinstance(whereclause, BooleanClauseList):
        pairs: list[tuple[str, object]] = []
        for clause in whereclause.clauses:
            pairs.extend(_criteria(clause))
        return pairs
    assert isinstance(whereclause, BinaryExpression), f"unsupported: {whereclause}"
    return [(whereclause.left.name, whereclause.right.value)]


class _Result:
    def __init__(self, one):
        self._one = one

    def scalar_one_or_none(self):
        return self._one


class _FakeSession:
    """Keyed lookup / add / flush, enough for every seeder in app/."""

    def __init__(self) -> None:
        self.rows: list[object] = []

    # -- query ------------------------------------------------------------
    def _match(self, stmt):
        entity = stmt.column_descriptions[0]["entity"]
        if entity is None:
            # `select(func.count()).select_from(Model)` — the row-count the
            # entry points print at the end of a run.
            table = stmt.get_final_froms()[0].name
            return sum(1 for r in self.rows if r.__tablename__ == table)
        wanted = _criteria(stmt.whereclause)
        for row in self.rows:
            if not isinstance(row, entity):
                continue
            if all(getattr(row, col) == value for col, value in wanted):
                return row
        return None

    async def execute(self, stmt):
        return _Result(self._match(stmt))

    async def scalar(self, stmt):
        return self._match(stmt)

    # -- write ------------------------------------------------------------
    def add(self, obj) -> None:
        self.rows.append(obj)

    async def flush(self) -> None:
        # Stand in for the DB-side default on the primary key, so a freshly
        # added Store/Material can be referenced by id like the real thing.
        for row in self.rows:
            if getattr(row, "id", None) is None:
                row.id = uuid.uuid4()

    async def commit(self) -> None:
        await self.flush()

    # -- transaction / context manager ------------------------------------
    def begin(self):
        return _NullCtx(self)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc) -> bool:
        return False

    # -- assertions helpers -----------------------------------------------
    def of(self, model) -> list:
        return [r for r in self.rows if isinstance(r, model)]


class _NullCtx:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *exc) -> bool:
        return False


@pytest.fixture()
def session(monkeypatch) -> _FakeSession:
    """One shared in-memory session behind every seeder's AsyncSessionLocal."""
    fake = _FakeSession()
    for module in (seeds, seed_catalog, seed_partners):
        monkeypatch.setattr(module, "AsyncSessionLocal", lambda: fake)
    return fake


async def _run_every_seeder() -> None:
    """Exactly what a deploy runs, in deploy order."""
    await seed_catalog.seed()
    await seed_partners.seed_partners()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_running_both_seeders_twice_leaves_one_row_per_natural_key(session):
    """The deploy runs both on every rollout; a second run must insert nothing."""
    await _run_every_seeder()
    after_first = len(session.rows)

    await _run_every_seeder()

    assert len(session.rows) == after_first, (
        "a second full seed run inserted extra rows — some insert is unguarded"
    )

    # One row per natural key, per the guards each seeder uses.
    store_names = [s.name for s in session.of(Store)]
    material_keys = [(m.store_id, m.name_uz) for m in session.of(Material)]
    usta_phones = [u.phone for u in session.of(Usta)]
    offer_keys = [(o.material_id, o.store_id) for o in session.of(MaterialOffer)]
    for label, keys in (
        ("store name", store_names),
        ("(store_id, name_uz)", material_keys),
        ("usta phone", usta_phones),
        ("(material_id, store_id) offer", offer_keys),
    ):
        duplicates = [k for k, n in Counter(keys).items() if n > 1]
        assert not duplicates, f"duplicate {label}: {duplicates}"

    # Both catalogs really are present — the point of running both.
    assert set(store_names) == (
        {s["name"] for s in seed_catalog.STORES} | {s["name"] for s in seeds.STORES}
    )
    assert len(usta_phones) == len(seed_catalog.USTALAR) + len(seeds.USTALAR)
    assert len(material_keys) == len(seed_catalog.MATERIALS) + len(seeds.MATERIALS)


@pytest.mark.asyncio
async def test_each_seeder_only_ever_writes_its_own_stores_materials(session):
    """Neither seeder may cross-wire a material onto the other's store.

    Both resolve a material's store by *name*, from their own STORES list,
    so a name collision between the two files is the one thing that could
    attach Hamkor Qurilish stock to Leroy Merlin. There is none today, and
    the deploy runs both, so pin it.
    """
    await _run_every_seeder()

    by_id = {s.id: s.name for s in session.of(Store)}
    own = {
        "seed_catalog": {s["name"] for s in seed_catalog.STORES},
        "seeds": {s["name"] for s in seeds.STORES},
    }
    catalog_materials = {m["name_uz"] for m in seed_catalog.MATERIALS}

    for material in session.of(Material):
        store_name = by_id[material.store_id]
        source = "seed_catalog" if material.name_uz in catalog_materials else "seeds"
        assert store_name in own[source], (
            f"{material.name_uz!r} (from {source}) landed on {store_name!r}"
        )

    # material_offers are seed_catalog's dealer-comparison feature; they must
    # not reach across into the other catalog's stores or materials.
    catalog_store_ids = {
        s.id for s in session.of(Store) if s.name in own["seed_catalog"]
    }
    catalog_material_ids = {
        m.id for m in session.of(Material) if m.name_uz in catalog_materials
    }
    for offer in session.of(MaterialOffer):
        assert offer.store_id in catalog_store_ids
        assert offer.material_id in catalog_material_ids


@pytest.mark.asyncio
async def test_seeding_does_not_overwrite_an_edited_row(session):
    """Admins edit stores/ustalar through /admin/catalog; a deploy-time
    reseed must not revert those edits back to the literals in the file."""
    await _run_every_seeder()

    usta = next(u for u in session.of(Usta) if u.phone == seeds.USTALAR[0]["phone"])
    usta.verified = False
    usta.rating = 3.0
    usta.jobs_count = 999
    material = next(
        m for m in session.of(Material) if m.name_uz == seeds.MATERIALS[0]["name_uz"]
    )
    material.price_uzs = 1

    await _run_every_seeder()

    assert usta.verified is False
    assert usta.rating == 3.0
    assert usta.jobs_count == 999
    assert material.price_uzs == 1


# ---------------------------------------------------------------------------
# Completeness of what each seeder writes
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("module", (seed_catalog, seeds), ids=("seed_catalog", "seeds"))
def test_every_seeded_usta_has_map_coordinates_and_an_avatar(module):
    """An usta without lat/lng is listed in U3 but has no pin on the U1 map,
    and one without an avatar_url renders as a bare placeholder circle.

    Driven off the module data, not a hand-written list, so a row added to
    either USTALAR without these fields fails here instead of on a deploy.
    """
    for row in module.USTALAR:
        for field in ("lat", "lng", "avatar_url"):
            assert row.get(field) is not None, (
                f"{module.__name__}: usta {row['name']!r} has no {field}"
            )
        # Tashkent, loosely — catches a swapped lat/lng or a stray decimal.
        assert 41.0 <= row["lat"] <= 41.6, row["name"]
        assert 69.0 <= row["lng"] <= 69.6, row["name"]


@pytest.mark.parametrize("module", (seed_catalog, seeds), ids=("seed_catalog", "seeds"))
def test_every_seeded_material_has_an_image(module):
    """image_url is what the S1 grid and S3 detail page show; without it the
    product card falls back to a bare icon."""
    for row in module.MATERIALS:
        assert row.get("image_url"), (
            f"{module.__name__}: material {row['name_uz']!r} has no image_url"
        )


@pytest.mark.asyncio
async def test_inserted_rows_carry_those_fields_through_to_the_database(session):
    """The data lists above are only half of it — the seeder must actually
    pass the columns to the model. Every usta/material either seeder inserts
    comes back with them set."""
    await _run_every_seeder()

    for usta in session.of(Usta):
        assert usta.lat is not None, usta.name
        assert usta.lng is not None, usta.name
        assert usta.avatar_url, usta.name
    for material in session.of(Material):
        assert material.image_url, material.name_uz
