"""Norms seeding — the entry point the deploy actually calls.

Production ran with `select count(*) from norms` = 0 for its whole life:
`app/seeds.py` defined the norms and a `_seed_norms()` to write them, but
nothing anywhere called it, and `deploy/remote-deploy.sh` only ran
`app.seed_catalog`, which does not touch norms at all. Every smeta line
therefore priced off hardcoded fallback constants with an "aniq norma
topilmadi" warning attached.

`app/seed_norms.py` is the norms-only entry point added for the deploy. It
is deliberately NOT `app.seeds`, and test_seeds_catalogs_are_disjoint below
is the reason: the two seeders' demo catalogs share no natural key, so
running `app.seeds` on production would add a second catalog beside the
live one rather than updating it.

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


def test_seeds_catalogs_are_disjoint_from_seed_catalog():
    """Why the deploy calls `app.seed_norms` and not `app.seeds`.

    Each seeder is idempotent against its OWN rows (seeds.py guards on
    store name / (name_uz, store_id) / phone), but the two define entirely
    different demo catalogs. Running app.seeds on production would not
    update the catalog seed_catalog already wrote — it would insert a
    second one beside it, visible in the Do'kon and Ustalar tabs. If these
    ever genuinely converge, revisit that decision deliberately rather than
    by accident.
    """
    from app import seed_catalog, seeds

    assert not ({s["name"] for s in seeds.STORES}
                & {s["name"] for s in seed_catalog.STORES})
    assert not ({u["phone"] for u in seeds.USTALAR}
                & {u["phone"] for u in seed_catalog.USTALAR})


def test_seed_norms_entry_point_touches_norms_only():
    """`python -m app.seed_norms` must not pull in the store/material/usta
    seeders — that is the entire safety property it exists to provide."""
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
