"""POST /api/v1/auth/apple — "Sign in with Apple".

The endpoint tests replace the Apple verifier (no network): it returns the
claims a real, signature-checked identity token would carry, or raises
ValueError for a bad one. The verifier itself is tested at the bottom with a
locally generated RSA key standing in for Apple's.
"""
import time
import uuid
from datetime import datetime, timezone

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from jose import jwk as jose_jwk
from jose import jwt as jose_jwt

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.user import User
from app.routers import auth as auth_router

BUNDLE_ID = "uz.andozaai.app"


class _Result:
    def __init__(self, scalar=None):
        self._scalar = scalar

    def scalar_one_or_none(self):
        return self._scalar


class _FakeUserDb:
    """In-memory users table. The endpoint only ever looks a user up by
    apple_sub, so the dict is keyed by it."""

    def __init__(self):
        self.users: dict[str, User] = {}
        self.added: list[User] = []
        self.queries: list[str] = []

    async def execute(self, stmt):
        self.queries.append(str(stmt))
        params = stmt.compile().params
        sub = next(iter(params.values()), None)
        return _Result(scalar=self.users.get(sub))

    def add(self, obj):
        self.added.append(obj)
        self.users[obj.apple_sub] = obj

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
    monkeypatch.setattr(settings, "APPLE_CLIENT_IDS", BUNDLE_ID)


def _claims(**overrides):
    claims = {
        "iss": "https://appleid.apple.com",
        "aud": BUNDLE_ID,
        "sub": "001234.abcdef0123456789.0123",
        "email": "x7k2@privaterelay.appleid.com",
        "email_verified": "true",
        "is_private_email": "true",
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

    monkeypatch.setattr(auth_router, "_verify_apple_identity_token", _fake)
    return state


def test_first_sign_in_creates_user(client, db, verifier):
    res = client.post(
        "/api/v1/auth/apple",
        json={"identity_token": "tok", "name": "  Ali Valiyev  ", "language": "ru"},
    )

    assert res.status_code == 200, res.text
    assert verifier["calls"] == [("tok", [BUNDLE_ID])]
    assert "apple_sub" in db.queries[0]
    assert len(db.added) == 1
    user = db.added[0]
    assert user.apple_sub == "001234.abcdef0123456789.0123"
    assert user.google_sub is None
    assert user.email == "x7k2@privaterelay.appleid.com"
    assert user.name == "Ali Valiyev"
    assert user.language == "ru"
    assert user.username is None
    assert user.password_hash is None
    body = res.json()
    assert body["user"]["id"] == str(user.id)
    assert body["user"]["name"] == "Ali Valiyev"
    assert set(body["user"]) == {"id", "phone", "username", "name", "is_admin", "language", "created_at"}


def test_returning_user_found_by_sub(client, db, verifier):
    first = client.post("/api/v1/auth/apple", json={"identity_token": "tok"})
    second = client.post("/api/v1/auth/apple", json={"identity_token": "tok2"})

    assert first.status_code == 200 and second.status_code == 200
    assert len(db.added) == 1  # no duplicate account
    assert second.json()["user"]["id"] == first.json()["user"]["id"]


def test_name_and_language_are_used_only_on_create(client, db, verifier):
    """Apple sends the name only on the first authorization; a later request
    (with or without one) never overwrites what the account has."""
    client.post("/api/v1/auth/apple", json={"identity_token": "tok", "name": "Ali", "language": "ru"})
    second = client.post(
        "/api/v1/auth/apple", json={"identity_token": "tok", "name": "Someone Else", "language": "en"}
    )

    assert second.status_code == 200
    assert db.added[0].name == "Ali"
    assert db.added[0].language == "ru"
    assert second.json()["user"]["name"] == "Ali"


def test_no_name_leaves_it_empty(client, db, verifier):
    res = client.post("/api/v1/auth/apple", json={"identity_token": "tok", "name": "   "})

    assert res.status_code == 200
    assert db.added[0].name is None


def test_native_client_gets_tokens_in_body(client, verifier):
    res = client.post(
        "/api/v1/auth/apple", json={"identity_token": "tok"}, headers={"X-Client-Type": "mobile"}
    )

    assert res.status_code == 200
    assert res.json()["access_token"]
    assert res.json()["refresh_token"]


def test_browser_gets_cookies_only(client, verifier):
    res = client.post("/api/v1/auth/apple", json={"identity_token": "tok"})

    assert "token" in res.cookies and "refresh_token" in res.cookies
    assert res.json()["access_token"] is None


def test_deactivated_user_is_401(client, db, verifier):
    client.post("/api/v1/auth/apple", json={"identity_token": "tok"})
    db.added[0].is_active = False

    res = client.post("/api/v1/auth/apple", json={"identity_token": "tok"})

    assert res.status_code == 401


def test_invalid_token_is_401(client, db, verifier):
    verifier["error"] = ValueError("Signature has expired.")

    res = client.post("/api/v1/auth/apple", json={"identity_token": "bad"})

    assert res.status_code == 401
    assert res.json()["detail"] == "Apple orqali kirib bo'lmadi. Qayta urinib ko'ring."
    assert db.added == []


def test_wrong_audience_is_401(client, db, verifier):
    verifier["claims"] = _claims(aud="com.someone.else")

    res = client.post("/api/v1/auth/apple", json={"identity_token": "tok"})

    assert res.status_code == 401
    assert db.added == []


def test_wrong_issuer_is_401(client, db, verifier):
    verifier["claims"] = _claims(iss="https://evil.example.com")

    res = client.post("/api/v1/auth/apple", json={"identity_token": "tok"})

    assert res.status_code == 401
    assert db.added == []


def test_missing_sub_is_401(client, db, verifier):
    verifier["claims"] = _claims(sub=None)

    res = client.post("/api/v1/auth/apple", json={"identity_token": "tok"})

    assert res.status_code == 401
    assert db.added == []


def test_apple_unreachable_is_503(client, db, verifier):
    verifier["error"] = auth_router._AppleUnavailable("keys fetch failed")

    res = client.post("/api/v1/auth/apple", json={"identity_token": "tok"})

    assert res.status_code == 503
    assert db.added == []


def test_no_client_ids_configured_is_503(client, db, verifier, monkeypatch):
    monkeypatch.setattr(settings, "APPLE_CLIENT_IDS", " ")

    res = client.post("/api/v1/auth/apple", json={"identity_token": "tok"})

    assert res.status_code == 503
    assert res.json()["detail"] == "Apple orqali kirish hozircha mavjud emas."
    assert verifier["calls"] == []


def test_empty_token_is_422(client, verifier):
    assert client.post("/api/v1/auth/apple", json={"identity_token": ""}).status_code == 422


def test_too_long_name_is_422(client, verifier):
    res = client.post("/api/v1/auth/apple", json={"identity_token": "tok", "name": "x" * 101})

    assert res.status_code == 422


def test_error_is_translated(client, verifier):
    verifier["error"] = ValueError("bad")

    res = client.post("/api/v1/auth/apple", json={"identity_token": "x"}, headers={"Accept-Language": "en"})

    assert res.json()["detail"] == "Could not sign in with Apple. Please try again."


# --- the verifier itself -----------------------------------------------------


@pytest.fixture
def apple_keys(monkeypatch):
    """An RSA key pair standing in for Apple's: httpx.get serves its public
    JWK, and `state["sign"]` makes tokens with the private key."""
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    public_pem = private.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    public_jwk = {**jose_jwk.construct(public_pem, "RS256").to_dict(), "kid": "K1", "use": "sig", "alg": "RS256"}
    state = {"fetches": 0, "fail": False}

    def _get(url, timeout):
        assert url == "https://appleid.apple.com/auth/keys"
        state["fetches"] += 1
        if state["fail"]:
            raise httpx.ConnectError("offline")
        return httpx.Response(200, json={"keys": [public_jwk]}, request=httpx.Request("GET", url))

    def _sign(kid="K1", key=private_pem, **overrides):
        now = int(time.time())
        claims = {**_claims(), "iat": now, "exp": now + 600, **overrides}
        claims = {k: v for k, v in claims.items() if v is not None}
        return jose_jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid})

    monkeypatch.setattr(auth_router.httpx, "get", _get)
    monkeypatch.setattr(auth_router, "_apple_keys", {})
    monkeypatch.setattr(auth_router, "_apple_keys_fetched_at", 0.0)
    state["sign"] = _sign
    return state


def test_verifier_accepts_a_valid_token(apple_keys):
    claims = auth_router._verify_apple_identity_token(apple_keys["sign"](), [BUNDLE_ID])

    assert claims["sub"] == "001234.abcdef0123456789.0123"
    assert apple_keys["fetches"] == 1


def test_verifier_caches_the_keys(apple_keys):
    for _ in range(3):
        auth_router._verify_apple_identity_token(apple_keys["sign"](), [BUNDLE_ID])

    assert apple_keys["fetches"] == 1


@pytest.mark.parametrize("overrides", [
    {"aud": "com.someone.else"},
    {"iss": "https://evil.example.com"},
    {"exp": int(time.time()) - 3600, "iat": int(time.time()) - 7200},
    {"exp": None},
])
def test_verifier_rejects_bad_claims(apple_keys, overrides):
    with pytest.raises(ValueError):
        auth_router._verify_apple_identity_token(apple_keys["sign"](**overrides), [BUNDLE_ID])


def test_verifier_rejects_a_token_signed_by_another_key(apple_keys):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048).private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )

    with pytest.raises(ValueError):
        auth_router._verify_apple_identity_token(apple_keys["sign"](key=other), [BUNDLE_ID])


def test_verifier_rejects_garbage(apple_keys):
    with pytest.raises(ValueError):
        auth_router._verify_apple_identity_token("not-a-jwt", [BUNDLE_ID])


def test_unknown_kid_refetches_once_then_rejects(apple_keys):
    auth_router._verify_apple_identity_token(apple_keys["sign"](), [BUNDLE_ID])
    # Pretend the cache is a few minutes old: an unknown kid may refetch.
    auth_router._apple_keys_fetched_at -= 300

    with pytest.raises(ValueError):
        auth_router._verify_apple_identity_token(apple_keys["sign"](kid="K2"), [BUNDLE_ID])
    assert apple_keys["fetches"] == 2
    # Right after a fetch, another unknown kid does not fetch again.
    with pytest.raises(ValueError):
        auth_router._verify_apple_identity_token(apple_keys["sign"](kid="K3"), [BUNDLE_ID])
    assert apple_keys["fetches"] == 2


def test_keys_unreachable_raises_unavailable(apple_keys):
    apple_keys["fail"] = True

    with pytest.raises(auth_router._AppleUnavailable):
        auth_router._verify_apple_identity_token(apple_keys["sign"](), [BUNDLE_ID])
