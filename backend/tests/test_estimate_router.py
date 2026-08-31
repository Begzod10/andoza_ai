"""Estimate router tests (Fix 1) — stage gating must reach the HTTP layer.

The bug: preview/create/PDF all called compute_estimate(room, materials_map,
norms_map) with no current_state/floor_state/ceiling_state, so a raw room's
prep lines (suvoq, and grunt/shpatlyovka for wallpaper-only rooms) never
appeared on the main Hisoblagich page — regardless of what the smeta engine
itself supports.

The DB session is stubbed with a scripted db.execute() side_effect (one
result per call, in the exact order the router issues them) — no Postgres
required, mirroring the pattern in test_orders.py.
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.estimate import Estimate
from app.models.material import Material
from app.models.norm import Norm
from app.models.room import Room
from app.models.room_state import RoomState
from app.services import currency


@pytest.fixture(autouse=True)
def _prime_currency_cache():
    """Prevent a real outbound call to the CBU rate API — prime the
    in-process cache the router's get_usd_rate() call reads from."""
    currency._cache.rate = 12_700.0
    currency._cache.fetched_at = time.monotonic()
    yield
    currency._cache.rate = None
    currency._cache.fetched_at = 0.0


def _user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.is_active = True
    user.is_admin = False
    return user


def _room(**overrides) -> Room:
    defaults = dict(
        id=uuid.uuid4(),
        apartment_id=uuid.uuid4(),
        name="Mehmonxona",
        ceiling_h=2.7,
        geometry={"walls": [
            {"id": "A", "length": 4.0, "elements": []},
            {"id": "B", "length": 3.0, "elements": []},
            {"id": "C", "length": 4.0, "elements": []},
            {"id": "D", "length": 3.0, "elements": []},
        ]},
        surfaces={"ALL": None},
        furniture_layout=[],
        state={"wallCoverings": {"ALL": {"kind": "paint", "color": "#fff"}}},
        floor_area=12.0,
        net_wall_area=37.8,
        perimeter=14.0,
        openings_count=0,
    )
    defaults.update(overrides)
    return Room(**defaults)


def _material(**overrides) -> Material:
    defaults = dict(
        id=uuid.uuid4(),
        store_id=uuid.uuid4(),
        category="boyoq",
        name_uz="Oq bo'yoq",
        unit="litr",
        price_uzs=25_000,
        is_active=True,
    )
    defaults.update(overrides)
    return Material(**defaults)


def _norm(**overrides) -> Norm:
    defaults = dict(
        id=uuid.uuid4(),
        material_key="boyoq",
        coverage_per_unit=9.0,
        coats=2,
        waste_factor=1.1,
        params=None,
    )
    defaults.update(overrides)
    return Norm(**defaults)


class _Result:
    """Stands in for the object SQLAlchemy's execute() returns."""

    def __init__(self, one=None, many=()):
        self._one = one
        self._many = list(many)

    def scalar_one_or_none(self):
        return self._one

    def scalar_one(self):
        return self._one

    def scalars(self):
        return self

    def all(self):
        return self._many


def _db(*results: _Result) -> AsyncMock:
    """A db whose execute() returns *results* in order, one per call."""
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=list(results))
    return db


def _as(user, db) -> None:
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestPreviewEstimateStageGating:
    """POST /rooms/{id}/estimate/preview must load the room's RoomState and
    pass it into compute_estimate — not silently default to "no stage"."""

    def test_room_with_no_state_row_defaults_to_xom_and_includes_plaster(self, client):
        """No RoomState row at all → safest default is "xom" (raw shell):
        the response must include a suvoq (plaster) line."""
        paint_mat = _material(price_uzs=25_000)
        room = _room(surfaces={"ALL": str(paint_mat.id)})
        db = _db(
            _Result(one=room),                # _load_room_for_user
            _Result(many=[paint_mat]),        # _load_materials
            _Result(many=[_norm()]),          # _load_norms (boyoq)
            _Result(one=None),                # _load_stage → no RoomState row
        )
        _as(_user(), db)

        response = client.post(f"/api/v1/rooms/{room.id}/estimate/preview")

        assert response.status_code == 200
        body = response.json()
        categories = [ln["category"] for ln in body["lines"]]
        assert "suvoq" in categories, (
            "a room with no recorded construction stage must default to "
            "'xom' (raw) and include the plaster line — this is the exact "
            "Fix 1 bug: the route used to never pass a stage at all"
        )

    def test_room_already_shpaklovka_skips_prep_lines(self, client):
        """A room recorded as already primed+puttied ("shpaklovka") must NOT
        get suvoq/grunt/shpatlyovka lines — only the paint finish."""
        paint_mat = _material(price_uzs=25_000)
        room = _room(surfaces={"ALL": str(paint_mat.id)})
        room_state = RoomState(room_id=room.id, current_state="shpaklovka")
        db = _db(
            _Result(one=room),
            _Result(many=[paint_mat]),
            _Result(many=[_norm()]),
            _Result(one=room_state),
        )
        _as(_user(), db)

        response = client.post(f"/api/v1/rooms/{room.id}/estimate/preview")

        assert response.status_code == 200
        categories = [ln["category"] for ln in response.json()["lines"]]
        assert "suvoq" not in categories
        assert "grunt" not in categories
        assert "shpatlyovka" not in categories
        assert "boyoq" in categories


class TestGetEstimateTotalsRecomputedFromLines:
    """GET /api/v1/estimates/{id} (Fix 5) — totals must be recomputed from
    the stored lines JSONB, not trusted from the row's total_uzs column —
    so an old snapshot written before the exact/approx split existed still
    renders the FULL total, not the historically-understated one."""

    def test_old_snapshot_total_uzs_column_is_ignored_in_favour_of_lines(self, client):
        exact_line = {
            "label": "Elektr kabel", "formula": "...", "qty": 19, "unit": "m",
            "unit_price_uzs": 10_000, "subtotal_uzs": 190_000,
            "category": "elektr", "material_id": None, "store_name": None,
            "is_approximate": False, "warning": None,
        }
        approx_line = {
            "label": "Jihoz: Noma'lum", "formula": "...", "qty": 1, "unit": "dona",
            "unit_price_uzs": 2_000_000, "subtotal_uzs": 2_000_000,
            "category": "jihoz", "material_id": None, "store_name": None,
            "is_approximate": True, "warning": "Narx taxminiy",
        }
        estimate = Estimate(
            id=uuid.uuid4(),
            room_id=uuid.uuid4(),
            lines=[exact_line, approx_line],
            # Deliberately the OLD (pre-Fix-5, exact-only) total — a real
            # snapshot written before this fix would have this stored value.
            total_uzs=190_000,
            currency="UZS",
            status="final",
            created_at=datetime.now(timezone.utc),
        )
        db = _db(_Result(one=estimate))
        _as(_user(), db)

        response = client.get(f"/api/v1/estimates/{estimate.id}")

        assert response.status_code == 200
        body = response.json()
        assert body["total_exact_uzs"] == 190_000
        assert body["total_approx_uzs"] == 2_000_000
        assert body["total_uzs"] == 2_190_000, (
            "must recompute from the stored lines, not echo the stale "
            "understated total_uzs column"
        )


class TestElectricalConfirmedFlag:
    """Fix 6: has_electrical and electrical_confirmed must not contradict
    each other over HTTP the way has_electrical alone used to."""

    def test_preview_response_carries_both_flags(self, client):
        paint_mat = _material(price_uzs=25_000)
        room = _room(surfaces={"ALL": str(paint_mat.id)})
        room_state = RoomState(room_id=room.id, current_state="shpaklovka")
        db = _db(
            _Result(one=room),
            _Result(many=[paint_mat]),
            _Result(many=[_norm()]),
            _Result(one=room_state),
        )
        _as(_user(), db)

        response = client.post(f"/api/v1/rooms/{room.id}/estimate/preview")

        assert response.status_code == 200
        body = response.json()
        # No electricals/lights placed in this fixture room → fallback guess
        assert body["has_electrical"] is True
        assert body["electrical_confirmed"] is False
