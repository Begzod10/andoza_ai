"""POST /api/v1/reports and the admin queue at /api/v1/admin/reports."""
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.content_report import ContentReport
from app.models.user import User


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None

    def scalar_one(self):
        assert len(self._rows) == 1
        return self._rows[0]

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


class _FakeReportDb:
    """In-memory content_reports table. Filters on whatever columns the
    statement's WHERE binds (reporter/target, status or id); orders newest
    first and applies the LIMIT, as the queries ask."""

    def __init__(self):
        self.rows: list[ContentReport] = []
        self.flushes = 0

    async def execute(self, stmt):
        params = stmt.compile().params
        rows = list(self.rows)
        for key, value in params.items():
            column = key.rsplit("_", 1)[0]
            if column in {"reporter_id", "target_type", "target_id", "status", "id"}:
                rows = [r for r in rows if getattr(r, column) == value]
        rows.sort(key=lambda r: r.created_at, reverse=True)
        limit = params.get("param_1")
        if isinstance(limit, int):
            rows = rows[:limit]
        return _Result(rows)

    def add(self, obj):
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)
        self.rows.append(obj)

    async def flush(self):
        self.flushes += 1

    @asynccontextmanager
    async def begin_nested(self):
        yield


def _user(admin=False):
    return User(id=uuid.uuid4(), is_active=True, is_admin=admin)


@pytest.fixture
def db():
    fake = _FakeReportDb()
    app.dependency_overrides[get_db] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


@pytest.fixture
def client(db):
    return TestClient(app)


def _as(user):
    app.dependency_overrides[get_current_active_user] = lambda: user


def _report(**overrides):
    body = {"target_type": "usta", "target_id": str(uuid.uuid4()), "reason": "spam"}
    body.update(overrides)
    return body


def test_create_report(client, db):
    user = _user()
    _as(user)
    body = _report(target_type="product", target_id="42", reason="fraud", details="  Soxta mahsulot  ")

    res = client.post("/api/v1/reports", json=body)

    assert res.status_code == 201, res.text
    assert len(db.rows) == 1
    row = db.rows[0]
    assert res.json() == {"id": str(row.id), "status": "open"}
    assert row.reporter_id == user.id
    assert (row.target_type, row.target_id, row.reason) == ("product", "42", "fraud")
    assert row.details == "Soxta mahsulot"
    assert row.status == "open"


def test_repeat_report_returns_the_same_one(client, db):
    _as(_user())
    body = _report()

    first = client.post("/api/v1/reports", json=body)
    second = client.post("/api/v1/reports", json={**body, "reason": "other"})

    assert first.status_code == 201 and second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert len(db.rows) == 1
    assert db.rows[0].reason == "spam"  # left unchanged


def test_same_target_by_another_user_is_a_new_report(client, db):
    body = _report()
    _as(_user())
    first = client.post("/api/v1/reports", json=body)
    _as(_user())
    second = client.post("/api/v1/reports", json=body)

    assert second.json()["id"] != first.json()["id"]
    assert len(db.rows) == 2


def test_unauthenticated_is_401(client, db):
    res = client.post("/api/v1/reports", json=_report())

    assert res.status_code == 401
    assert db.rows == []


@pytest.mark.parametrize("bad", [
    {"target_type": "apartment"},
    {"reason": "boring"},
    {"target_id": ""},
    {"target_id": "x" * 65},
    {"details": "x" * 1001},
])
def test_invalid_body_is_422(client, db, bad):
    _as(_user())

    res = client.post("/api/v1/reports", json=_report(**bad))

    assert res.status_code == 422
    assert db.rows == []


def test_reports_are_rate_limited_per_user(client, db):
    _as(_user())
    for _ in range(20):
        assert client.post("/api/v1/reports", json=_report()).status_code == 201

    res = client.post("/api/v1/reports", json=_report())

    assert res.status_code == 429
    assert len(db.rows) == 20


def _seed(db, n=3):
    now = datetime.now(timezone.utc)
    reporter = uuid.uuid4()
    for i in range(n):
        db.rows.append(ContentReport(
            id=uuid.uuid4(), reporter_id=reporter, target_type="portfolio_item",
            target_id=f"t{i}", reason="inappropriate", details=f"d{i}", status="open",
            created_at=now - timedelta(minutes=10 - i),
        ))
    return reporter


def test_admin_lists_open_reports_newest_first(client, db):
    reporter = _seed(db)
    db.rows[0].status = "resolved"
    _as(_user(admin=True))

    res = client.get("/api/v1/admin/reports", params={"status": "open"})

    assert res.status_code == 200, res.text
    items = res.json()
    assert [i["target_id"] for i in items] == ["t2", "t1"]
    assert items[0]["reporter_id"] == str(reporter)
    assert items[0]["target_type"] == "portfolio_item"
    assert items[0]["reason"] == "inappropriate"
    assert items[0]["details"] == "d2"
    assert items[0]["status"] == "open"
    assert items[0]["created_at"]
    assert items[0]["resolved_at"] is None


def test_admin_list_without_status_returns_all(client, db):
    _seed(db)
    db.rows[0].status = "dismissed"
    _as(_user(admin=True))

    res = client.get("/api/v1/admin/reports")

    assert [i["target_id"] for i in res.json()] == ["t2", "t1", "t0"]


def test_admin_list_rejects_unknown_status(client, db):
    _as(_user(admin=True))

    assert client.get("/api/v1/admin/reports", params={"status": "closed"}).status_code == 422


@pytest.mark.parametrize("decision", ["resolved", "dismissed"])
def test_admin_decides_a_report(client, db, decision):
    _seed(db, n=1)
    _as(_user(admin=True))
    report = db.rows[0]

    res = client.patch(f"/api/v1/admin/reports/{report.id}", json={"status": decision})

    assert res.status_code == 200, res.text
    assert res.json()["status"] == decision
    assert res.json()["resolved_at"]
    assert report.status == decision
    assert report.resolved_at is not None


def test_admin_cannot_reopen(client, db):
    _seed(db, n=1)
    _as(_user(admin=True))

    res = client.patch(f"/api/v1/admin/reports/{db.rows[0].id}", json={"status": "open"})

    assert res.status_code == 422


def test_admin_patch_unknown_report_is_404(client, db):
    _as(_user(admin=True))

    res = client.patch(f"/api/v1/admin/reports/{uuid.uuid4()}", json={"status": "resolved"})

    assert res.status_code == 404


def test_non_admin_is_403(client, db):
    _seed(db, n=1)
    _as(_user())

    assert client.get("/api/v1/admin/reports").status_code == 403
    res = client.patch(f"/api/v1/admin/reports/{db.rows[0].id}", json={"status": "resolved"})
    assert res.status_code == 403
    assert db.rows[0].status == "open"
