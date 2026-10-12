"""
A value Postgres refuses is the client's mistake, not a server fault.

Across the API, input that slipped past the schemas (an unknown enum value,
a NUL byte, a number too big for its column, a string too long, a NULL into a
NOT NULL column, an id that points at nothing) reached Postgres and came back
as a 500. Those are now answered with 422; every other database error stays
a 500.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import DBAPIError

from app.database import get_db
from app.main import app


class _PgError(Exception):
    def __init__(self, pgcode: str):
        super().__init__(f"pg error {pgcode}")
        self.pgcode = pgcode


def _failing_db(pgcode: str):
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=DBAPIError("SELECT 1", {}, _PgError(pgcode)))
    app.dependency_overrides[get_db] = lambda: db
    return db


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "pgcode",
    [
        "22P02",  # invalid_text_representation: unknown enum value, bad uuid
        "22021",  # character_not_in_repertoire: NUL byte
        "22003",  # numeric_value_out_of_range
        "22001",  # string_data_right_truncation
        "23502",  # not_null_violation
        "23503",  # foreign_key_violation
    ],
)
def test_a_value_postgres_refuses_is_a_422(pgcode):
    _failing_db(pgcode)
    response = TestClient(app).get("/api/v1/ustalar")
    assert response.status_code == 422
    assert response.json()["detail"]


def test_any_other_database_error_is_still_a_500():
    _failing_db("40001")  # serialization_failure
    response = TestClient(app, raise_server_exceptions=False).get("/api/v1/ustalar")
    assert response.status_code == 500
