"""users.language: GET/PATCH /auth/me and the login payload. The DB session is
stubbed, as in test_account_deletion.py."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import bcrypt
import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.database import get_db
from app.main import app
from app.models.user import User


def _user(language="uz", password=None):
    return User(
        id=uuid.uuid4(),
        phone=None,
        username="lang_user",
        name=None,
        is_active=True,
        is_admin=False,
        language=language,
        created_at=datetime.now(timezone.utc),
        password_hash=(
            bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
            if password
            else None
        ),
    )


class _Result:
    def __init__(self, scalar):
        self._scalar = scalar

    def scalar_one_or_none(self):
        return self._scalar


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _as(user):
    db = AsyncMock()
    db.info = {}
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    return db


URL = "/api/v1/auth/me"


def test_get_me_reports_language(client):
    _as(_user())
    res = client.get(URL)
    assert res.status_code == 200 and res.json()["language"] == "uz"


def test_patch_me_sets_language(client):
    user = _user()
    _as(user)
    res = client.patch(URL, json={"language": "ru"})
    assert res.status_code == 200
    assert res.json()["language"] == "ru"
    assert user.language == "ru"


def test_patch_me_rejects_unknown_language(client):
    user = _user()
    _as(user)
    res = client.patch(URL, json={"language": "de"})
    assert res.status_code == 422
    assert user.language == "uz"


def test_patch_me_requires_login(client):
    res = client.patch(URL, json={"language": "ru"})
    assert res.status_code == 401


def test_login_payload_has_language(client):
    user = _user(language="en", password="secret123")
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_Result(user))
    app.dependency_overrides[get_db] = lambda: db
    res = client.post(
        "/api/v1/auth/login", json={"username": "lang_user", "password": "secret123"}
    )
    assert res.status_code == 200
    assert res.json()["user"]["language"] == "en"


def test_user_out_only_accepts_known_languages():
    from datetime import datetime, timezone
    from uuid import uuid4

    from pydantic import ValidationError

    from app.schemas.auth import UserOut

    base = dict(id=uuid4(), phone=None, username="ali", name=None, created_at=datetime.now(timezone.utc))
    assert UserOut(**base).language == "uz"
    assert UserOut(**base, language="en").language == "en"
    with pytest.raises(ValidationError):
        UserOut(**base, language="de")
