"""The interactive API docs can be switched off for a public deployment.

They list every endpoint and schema, admin ones included; useful on a dev box,
needless to hand to anyone who opens /docs on the live site.
"""
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app


def _status(path: str) -> int:
    return TestClient(create_app()).get(path).status_code


def test_docs_are_on_by_default(monkeypatch):
    monkeypatch.setattr(settings, "API_DOCS_ENABLED", True)
    assert _status("/docs") == 200
    assert _status("/openapi.json") == 200


def test_docs_can_be_switched_off(monkeypatch):
    monkeypatch.setattr(settings, "API_DOCS_ENABLED", False)
    assert _status("/docs") == 404
    assert _status("/redoc") == 404
    assert _status("/openapi.json") == 404
