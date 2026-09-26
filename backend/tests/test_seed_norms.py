"""Norms seeding — the entry point the deploy actually calls.

Production ran with `select count(*) from norms` = 0 for its whole life:
`app/seeds.py` defined the norms and a `_seed_norms()` to write them, but
nothing anywhere called it, and `deploy/remote-deploy.sh` only ran
`app.seed_catalog`, which does not touch norms at all. Every smeta line
therefore priced off hardcoded fallback constants with an "aniq norma
topilmadi" warning attached.

`app/seed_norms.py` is the norms-only entry point added for the deploy. It
is deliberately NOT `app.seeds`: that module seeds its catalog in the same
transaction, and norms must not be able to fail because of a material row.
The catalog half now has its own entry point too (`app.seed_partners`) —
see tests/test_seed_catalogs.py for the cross-catalog properties.

No database is required — `_seed_norms` only ever issues one
`select(Norm).where(Norm.material_key == ...)` per row, so a tiny in-memory
stand-in exercises the real code path.
"""
from __future__ import annotations

import pytest

from app.models.norm import Norm
from app.seeds import NORMS, _seed_norms


class _Result:
    def __init__(self, one):
        self._one = one

    def scalar_one_or_none(self):
        return self._one


class _FakeSession:
    """Just enough session for `_seed_norms`: keyed lookup, add, flush."""

    def __init__(self) -> None:
        self.rows: list[Norm] = []

    async def execute(self, stmt):
        # The only statement _seed_norms issues is a material_key lookup;
        # pull the bound value straight off the compiled WHERE clause.
        key = next(iter(stmt.compile().params.values()))
        match = next((n for n in self.rows if n.material_key == key), None)
        return _Result(match)

    def add(self, obj: Norm) -> None:
        self.rows.append(obj)

    async def flush(self) -> None:
        pass


@pytest.mark.asyncio
async def test_seeding_twice_leaves_one_row_per_material_key():
    """The deploy runs this on every rollout — it must upsert, not append."""
    session = _FakeSession()

    await _seed_norms(session)
    first_pass = [n.material_key for n in session.rows]

    await _seed_norms(session)
    second_pass = [n.material_key for n in session.rows]

    assert sorted(first_pass) == sorted(second_pass), (
        "a second run must not insert a single extra norm row"
    )
    assert len(second_pass) == len(set(second_pass)) == len(NORMS)


@pytest.mark.asyncio
async def test_seeding_an_existing_norm_refreshes_its_values():
    """An already-seeded norm is updated in place, so correcting a coverage
    figure in NORMS reaches production on the next deploy."""
    session = _FakeSession()
    await _seed_norms(session)

    target = session.rows[0]
    target.coverage_per_unit = -1.0
    target.coats = 99

    await _seed_norms(session)

    expected = next(n for n in NORMS if n["material_key"] == target.material_key)
    assert target.coverage_per_unit == expected["coverage_per_unit"]
    assert target.coats == expected["coats"]
    assert len(session.rows) == len(NORMS)


def test_norms_cover_the_keys_the_smeta_engine_looks_up():
    """Spot-check that the seeded keys are the ones smeta.py asks for — a
    norm table that seeds fine but misses `elektr_kabel` still leaves the
    electrical line on its hardcoded constants."""
    keys = {n["material_key"] for n in NORMS}
    for key in ("boyoq", "oboy", "laminat", "plitka", "plintus", "elektr_kabel"):
        assert key in keys


def test_both_catalogs_are_seeded_and_neither_clobbers_the_other():
    """The two seeders describe two different sets of real suppliers.

    This used to assert disjointness as a *hazard* — the reason the deploy
    ran only one of them. Both catalogs are confirmed real and both are now
    seeded on every deploy, so what is worth pinning is that they stay
    addressable as two: distinct natural keys, so neither seeder's guard
    can match the other's row and silently rewrite or skip it.

    Convergence is allowed, but it has to be deliberate — if a store name
    or an usta phone is ever shared, the two files must first agree on who
    owns that row, because both will then be looking at it on every deploy.
    """
    from app import seed_catalog, seed_partners, seeds

    # Both halves of app/seeds.py have an automated entry point; neither can
    # go back to being edit-it-and-nothing-happens.
    assert callable(seed_partners.seed_partners)

    shared_stores = {s["name"] for s in seeds.STORES} & {
        s["name"] for s in seed_catalog.STORES
    }
    assert not shared_stores, f"both seeders now own store(s) {shared_stores}"

    shared_phones = {u["phone"] for u in seeds.USTALAR} & {
        u["phone"] for u in seed_catalog.USTALAR
    }
    assert not shared_phones, f"both seeders now own usta phone(s) {shared_phones}"

    # Materials key on (name_uz, store); with store names disjoint the pairs
    # cannot collide, but pin the names too — they are what a reader compares.
    shared_materials = {m["name_uz"] for m in seeds.MATERIALS} & {
        m["name_uz"] for m in seed_catalog.MATERIALS
    }
    assert not shared_materials, f"both seeders now own material(s) {shared_materials}"


def test_seed_norms_entry_point_touches_norms_only():
    """`python -m app.seed_norms` must not pull in the store/material/usta
    seeders — norms stay runnable no matter what the catalog is doing."""
    import ast
    import inspect

    from app import seed_norms

    tree = ast.parse(inspect.getsource(seed_norms))
    called = {
        node.func.id
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    }
    assert "_seed_norms" in called
    assert called.isdisjoint({"_seed_stores", "_seed_materials", "_seed_ustalar", "seed"})
    assert callable(seed_norms.seed_norms)
