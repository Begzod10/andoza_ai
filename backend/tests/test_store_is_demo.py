"""stores.is_demo: the column that marks a presentation (demo) store.

It used to be a "DEMO:" prefix in moderation_note, which an admin's approve wipes
(approval sets moderation_note to None), so the marker could be lost by a click.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.models.store import Store
from app.routers.admin_moderation import _decide
from app.schemas.admin_catalog import StoreAdminOut


def test_the_column_defaults_to_false_on_the_server():
    col = Store.__table__.c.is_demo
    assert col.nullable is False
    assert str(col.server_default.arg) == "false"


def test_approving_or_rejecting_keeps_is_demo():
    for approved in (True, False):
        store = Store(name="Dafna", status="pending", is_active=False, is_demo=True,
                      moderation_note="DEMO: shartnomasiz namuna ma'lumot")
        _decide(store, approved, None if approved else "sabab")
        assert store.is_demo is True


def test_the_admin_store_list_says_which_stores_are_demo():
    store = Store(id=uuid4(), name="Dafna", partner_tier="standard", is_active=True, is_demo=True,
                  created_at=datetime.now(timezone.utc))
    assert StoreAdminOut.model_validate(store).is_demo is True


def test_the_migration_adds_the_column_and_the_seed_marker_table():
    import importlib.util
    from pathlib import Path

    path = next(Path(__file__).resolve().parents[1].glob("alembic/versions/1786000041_*.py"))
    spec = importlib.util.spec_from_file_location("m41", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert (mod.revision, mod.down_revision) == ("1786000041", "1786000040")
    source = path.read_text()
    assert "is_demo" in source and "seed_markers" in source
