"""POST /api/v1/auth/google — "Sign in with Google".

The Google verifier is replaced in every test (no network): it returns the
claims a real, signature-checked ID token would carry, or raises ValueError
the way google-auth does for a bad token.
"""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.user import User
from app.routers import auth as auth_router

WEB_CLIENT_ID = "632412937266-ruq48osgghaa4jn0fk8vjd7mr270ccb0.apps.googleusercontent.com"


class _Result:
    def __init__(self, scalar=None):
        self._scalar = scalar

    def scalar_one_or_none(self):
        return self._scalar


class _FakeUserDb:
    """In-memory users table. The endpoint only ever looks a user up by
    google_sub, so the dict is keyed by it."""

    def __init__(self):
        self.users: dict[str, User] = {}
        self.added: list[User] = []

    async def execute(self, stmt):
        params = stmt.compile().params
        sub = next(iter(params.values()), None)
        return _Result(scalar=self.users.get(sub))

    def add(self, obj):
        self.added.append(obj)
        self.users[obj.google_sub] = obj

    async def flush(self):
        pass

    async def refresh(self, obj):
        # Stand in for the server-side defaults Postgres would fill in.
        if getattr(obj, "id", None) is None:
            obj.id = uuid.uuid4()
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime.now(timezone.utc)
        if getattr(obj, "is_admin", None) is None:
            obj.is_admin = False
        if getattr(obj, "language", None) is None:
            obj.language = "uz"
        if getattr(obj, "is_active", None) is None:
            obj.is_active = True


@pytest.fixture
def db():
    fake = _FakeUserDb()
    app.dependency_overrides[get_db] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


@pytest.fixture
def client(db):
    return TestClient(app)


@pytest.fixture(autouse=True)
def _client_ids(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_IDS", WEB_CLIENT_ID)


def _claims(**overrides):
    claims = {
        "iss": "https://accounts.google.com",
        "aud": WEB_CLIENT_ID,
        "sub": "1234567890",
        "email": "ali@example.com",
        "email_verified": True,
        "name": "Ali Valiyev",
    }
    claims.update(overrides)
    return claims


@pytest.fixture
def verifier(monkeypatch):
    """Make the verifier return the claims in `state["claims"]` (or raise
    `state["error"]`), and record the arguments it was called with."""
    state: dict = {"claims": _claims(), "error": None, "calls": []}

    def _fake(token, client_ids):
        state["calls"].append((token, list(client_ids)))
        if state["error"] is not None:
            raise state["error"]
        return state["claims"]

    monkeypatch.setattr(auth_router, "_verify_google_id_token", _fake)
    return state


def test_first_sign_in_creates_user(client, db, verifier):
    res = client.post("/api/v1/auth/google", json={"id_token": "tok"})

    assert res.status_code == 200, res.text
    assert verifier["calls"] == [("tok", [WEB_CLIENT_ID])]
    assert len(db.added) == 1
    user = db.added[0]
    assert user.google_sub == "1234567890"
    assert user.email == "ali@example.com"
    assert user.name == "Ali Valiyev"
    assert user.username is None
    assert user.password_hash is None
    body = res.json()
    assert body["user"]["id"] == str(user.id)
    assert body["user"]["name"] == "Ali Valiyev"


def test_returning_user_found_by_sub(client, db, verifier):
    first = client.post("/api/v1/auth/google", json={"id_token": "tok"})
    second = client.post("/api/v1/auth/google", json={"id_token": "tok2"})

    assert first.status_code == 200 and second.status_code == 200
    assert len(db.added) == 1  # no duplicate account
    assert second.json()["user"]["id"] == first.json()["user"]["id"]


def test_deactivated_user_is_401(client, db, verifier):
    client.post("/api/v1/auth/google", json={"id_token": "tok"})
    db.added[0].is_active = False

    res = client.post("/api/v1/auth/google", json={"id_token": "tok"})

    assert res.status_code == 401


def test_response_matches_password_login_shape(client, verifier):
    res = client.post("/api/v1/auth/google", json={"id_token": "tok"})

    assert res.status_code == 200
    # Browser request: tokens only in HttpOnly cookies, never in the body.
    assert "token" in res.cookies
    assert "refresh_token" in res.cookies
    body = res.json()
    assert set(body) == {"user", "access_token", "refresh_token", "token_type"}
    assert body["access_token"] is None and body["refresh_token"] is None
    assert body["token_type"] == "bearer"
    assert set(body["user"]) == {"id", "phone", "username", "name", "is_admin", "language", "created_at"}


def test_native_client_gets_tokens_in_body(client, verifier):
    res = client.post(
        "/api/v1/auth/google",
        json={"id_token": "tok"},
        headers={"X-Client-Type": "mobile"},
    )

    assert res.status_code == 200
    assert res.json()["access_token"]
    assert res.json()["refresh_token"]


def test_invalid_token_is_401(client, db, verifier):
    verifier["error"] = ValueError("Token expired")

    res = client.post("/api/v1/auth/google", json={"id_token": "bad"})

    assert res.status_code == 401
    assert res.json()["detail"] == "Google orqali kirib bo'lmadi. Qayta urinib ko'ring."
    assert db.added == []


def test_google_unreachable_is_503(client, db, verifier):
    verifier["error"] = auth_router._GoogleUnavailable("certs fetch failed")

    res = client.post("/api/v1/auth/google", json={"id_token": "tok"})

    assert res.status_code == 503
    assert db.added == []


def test_wrong_audience_is_401(client, db, verifier):
    verifier["claims"] = _claims(aud="someone-elses-client.apps.googleusercontent.com")

    res = client.post("/api/v1/auth/google", json={"id_token": "tok"})

    assert res.status_code == 401
    assert db.added == []


def test_wrong_issuer_is_401(client, db, verifier):
    verifier["claims"] = _claims(iss="https://evil.example.com")

    res = client.post("/api/v1/auth/google", json={"id_token": "tok"})

    assert res.status_code == 401
    assert db.added == []


def test_unverified_email_is_401(client, db, verifier):
    verifier["claims"] = _claims(email_verified=False)

    res = client.post("/api/v1/auth/google", json={"id_token": "tok"})

    assert res.status_code == 401
    assert res.json()["detail"] == "Google hisobingizdagi email tasdiqlanmagan."
    assert db.added == []


def test_no_client_ids_configured_is_503(client, db, verifier, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_IDS", " ")

    res = client.post("/api/v1/auth/google", json={"id_token": "tok"})

    assert res.status_code == 503
    assert verifier["calls"] == []
    assert db.added == []


def test_empty_token_is_422(client, verifier):
    res = client.post("/api/v1/auth/google", json={"id_token": ""})

    assert res.status_code == 422


def test_multiple_client_ids_are_all_accepted(client, verifier, monkeypatch):
    ios_id = "632412937266-ios.apps.googleusercontent.com"
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_IDS", f"{WEB_CLIENT_ID}, {ios_id}")
    verifier["claims"] = _claims(aud=ios_id)

    res = client.post("/api/v1/auth/google", json={"id_token": "tok"})

    assert res.status_code == 200
    assert verifier["calls"][0][1] == [WEB_CLIENT_ID, ios_id]


def test_first_sign_in_keeps_the_chosen_language(client, db, verifier):
    res = client.post("/api/v1/auth/google", json={"id_token": "tok", "language": "en"})

    assert res.status_code == 200, res.text
    assert db.added[0].language == "en"


def test_returning_user_language_is_not_overwritten(client, db, verifier):
    """The language in the request only seeds a new account; an existing
    account keeps what it chose."""
    client.post("/api/v1/auth/google", json={"id_token": "tok", "language": "ru"})
    second = client.post("/api/v1/auth/google", json={"id_token": "tok", "language": "en"})

    assert second.status_code == 200
    assert db.added[0].language == "ru"
