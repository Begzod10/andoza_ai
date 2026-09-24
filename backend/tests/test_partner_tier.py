"""`stores.partner_tier` has exactly three legal values, in every writer.

The column was a bare `String(20)` whose allowed set lived only in a comment,
so nothing rejected a made-up tier: not the seeders, not a one-off script.
The mobile shop screen (`lib/providers/shop_provider.dart`) treats anything
that is not gold/platinum as a plain, non-official dealer, so a typo never
raises — it silently downgrades a store's badge. `app/seeds.py` had in fact
drifted to "silver"/"bronze".

These tests pin the set in the three places that now know it — the model
(which builds the `ck_stores_partner_tier` CHECK), the admin schemas, and
the migration that installs the constraint — and walk both seeders' data so
a future edit with a typo fails here instead of in the app.
"""
from __future__ import annotations

import importlib.util
import pathlib

import pytest

from app import seed_catalog, seeds
from app.models.store import PARTNER_TIERS, Store
from app.schemas.admin_catalog import PARTNER_TIERS as SCHEMA_PARTNER_TIERS


def _migration_module():
    """Load the Alembic revision by path — the filename isn't importable."""
    path = (
        pathlib.Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "1786000007_add_stores_partner_tier_check.py"
    )
    spec = importlib.util.spec_from_file_location("_tier_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# One set, three definitions
# ---------------------------------------------------------------------------

def test_the_documented_set_is_the_one_the_model_enforces():
    assert set(PARTNER_TIERS) == {"standard", "gold", "platinum"}


def test_admin_schemas_and_model_agree():
    """The admin router validates against the schema copy; the database
    validates against the model copy. They must be the same list."""
    assert SCHEMA_PARTNER_TIERS == set(PARTNER_TIERS)


def test_migration_installs_a_check_over_that_same_set():
    assert set(_migration_module().TIERS) == set(PARTNER_TIERS)


def test_the_model_carries_the_check_constraint():
    """Without this the constraint only exists in a migration, and a fresh
    database built from metadata (tests, a local dev box) would not have it."""
    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in Store.__table__.constraints
        if constraint.__class__.__name__ == "CheckConstraint"
    }
    assert "ck_stores_partner_tier" in checks, checks
    sqltext = checks["ck_stores_partner_tier"]
    for tier in PARTNER_TIERS:
        assert f"'{tier}'" in sqltext, sqltext


# ---------------------------------------------------------------------------
# Both seeders
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("module", (seed_catalog, seeds), ids=("seed_catalog", "seeds"))
def test_every_seeded_store_names_a_real_tier(module):
    """Driven off the seeder data, not a hand-written list: a store added or
    re-tiered in either file with a value the app cannot render fails here.

    A bad tier is not an error anywhere downstream — it just makes the store
    render as a non-official dealer — so this is the only place it surfaces
    before a deploy writes it.
    """
    for row in module.STORES:
        assert row["partner_tier"] in PARTNER_TIERS, (
            f"{module.__name__}: store {row['name']!r} has partner_tier "
            f"{row['partner_tier']!r}, which is not one of {PARTNER_TIERS}"
        )
