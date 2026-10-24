"""Server messages come back in the caller's language (Accept-Language)."""
import ast
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.i18n.messages import MESSAGES, localized, request_language, translate, translate_detail
from app.main import app
from tests.test_admin_catalog import _as, _db, _user  # noqa: F401
from tests.test_admin_materials import URL, _admin_db, _body, _store

UZ_PRICE = "Narx musbat bo'lishi kerak"


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _request(header):
    raw = [(b"accept-language", header.encode())] if header is not None else []
    return Request({"type": "http", "headers": raw})


@pytest.mark.parametrize(("header", "lang"), [
    (None, "uz"), ("ru", "ru"), ("ru-RU,ru;q=0.9,en;q=0.8", "ru"),
    ("en-US,en;q=0.9", "en"), ("de", "uz"), ("de,en;q=0.5", "en"), ("uz", "uz"),
    ("en;q=0.4,ru;q=0.9", "ru"), ("*", "uz"), ("ru;q=0", "uz"), ("", "uz"),
])
def test_request_language(header, lang):
    assert request_language(_request(header)) == lang


def test_a_known_message_is_translated(client):
    _admin_db(store=_store())
    r = client.post(URL, json=_body(price_uzs=0), headers={"Accept-Language": "ru"})
    assert r.status_code == 422
    assert r.json()["detail"] == MESSAGES[UZ_PRICE]["ru"]


def test_english_is_served_too(client):
    _admin_db(store=_store())
    r = client.post(URL, json=_body(price_uzs=0), headers={"Accept-Language": "en-US,en;q=0.9"})
    assert r.json()["detail"] == MESSAGES[UZ_PRICE]["en"]


def test_without_a_header_the_message_stays_uzbek(client):
    _admin_db(store=_store())
    r = client.post(URL, json=_body(price_uzs=0))
    assert r.json()["detail"] == UZ_PRICE


def test_an_unknown_message_stays_uzbek():
    assert translate("Noma'lum xabar", "ru") == "Noma'lum xabar"


def test_an_english_source_message_gets_an_uzbek_version():
    assert translate("Room not found", "uz") == MESSAGES["Room not found"]["uz"] != "Room not found"
    assert translate("Room not found", "ru") == MESSAGES["Room not found"]["ru"]


def test_a_message_with_values_keeps_them():
    d = translate_detail("styles {allowed} dan bo'lishi kerak", allowed="neoklassika, klassik")
    assert str(d) == "styles neoklassika, klassik dan bo'lishi kerak"
    for lang in ("ru", "en", "uz"):
        assert "neoklassika, klassik" in translate(d, lang)
    assert translate(d, "ru") != str(d)


def test_a_value_with_braces_is_not_reformatted():
    d = translate_detail("{field_name} musbat son bo'lishi kerak", field_name="{x}")
    assert "{x}" in translate(d, "ru")


def test_a_detail_with_values_is_translated_through_the_handler(client):
    _as(_user(is_admin=True), _db())
    r = client.post(
        "/api/v1/admin/furniture",
        data={"name_uz": "x", "category": "nope", "store_id": "00000000-0000-0000-0000-000000000000"},
        files={"file": ("a.glb", b"glTF" + b"0" * 64)},
        headers={"Accept-Language": "en"},
    )
    assert r.status_code == 422, r.text
    assert "dan biri" not in r.json()["detail"]
    assert "one of" in r.json()["detail"]


def test_pydantic_list_details_are_untouched(client):
    _admin_db(store=_store())
    r = client.post(URL, json={"price_uzs": "abc"}, headers={"Accept-Language": "ru"})
    assert r.status_code == 422
    body = r.json()["detail"]
    assert isinstance(body, list) and body[0]["msg"].isascii()


def test_the_global_404_is_still_not_found(client):
    r = client.get("/api/v1/nothing-here", headers={"Accept-Language": "ru"})
    assert r.status_code == 404 and r.json() == {"detail": "Not found"}


def test_localized_translates_a_plain_response_text():
    assert localized_for("ru", "Pin topilmadi yoki u yopiq") == MESSAGES["Pin topilmadi yoki u yopiq"]["ru"]


def localized_for(header, text):
    return localized(_request(header), text)


# ---------------------------------------------------------------------------
# Completeness: every user-facing message the backend can raise is translated.
# ---------------------------------------------------------------------------
APP = Path(__file__).resolve().parent.parent / "app"
_DETAIL_FUNCS = {"translate_detail", "_reject", "DesignError", "localized"}


def _str_const(node):
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def _collect():
    found: dict[str, str] = {}
    fstrings: list[str] = []
    for path in sorted(APP.rglob("*.py")):
        if "i18n" in path.parts:
            continue
        tree = ast.parse(path.read_text())
        rel = f"{path.relative_to(APP)}"
        for node in ast.walk(tree):
            if isinstance(node, ast.keyword) and node.arg == "detail":
                if isinstance(node.value, ast.JoinedStr):
                    fstrings.append(f"{rel}:{node.value.lineno}")
                s = _str_const(node.value)
                if s:
                    found[s] = rel
            elif isinstance(node, ast.Call):
                fn = node.func
                name = fn.id if isinstance(fn, ast.Name) else getattr(fn, "attr", "")
                if name in _DETAIL_FUNCS and node.args:
                    s = _str_const(node.args[1] if name == "localized" else node.args[0])
                    if s:
                        found[s] = rel
                elif name == "HTTPException" and len(node.args) >= 2:
                    s = _str_const(node.args[1])
                    if s:
                        found[s] = rel
                elif name == "_enforce_rate_limit" and len(node.args) >= 5:
                    s = _str_const(node.args[4])
                    if s:
                        found[s] = rel
            elif isinstance(node, ast.Assign):
                for t in node.targets:
                    if isinstance(t, ast.Name) and t.id in {"_OVER_LIMIT_UZ", "_GOOGLE_INVALID_DETAIL"}:
                        s = _str_const(node.value) or (
                            "".join(_str_const(p) or "" for p in node.value.values)
                            if isinstance(node.value, ast.JoinedStr) else None
                        )
                        if s:
                            found[s] = rel
        if path.name in {"admin_materials.py", "smeta_keys.py"}:
            for fn in ast.walk(tree):
                if isinstance(fn, ast.FunctionDef) and fn.name in {"_problem", "smeta_key_problem"}:
                    for r in ast.walk(fn):
                        if isinstance(r, ast.Return) and r.value is not None:
                            s = _str_const(r.value)
                            if s:
                                found[s] = rel
    return found, fstrings


def test_no_router_message_is_an_untranslatable_fstring():
    _, fstrings = _collect()
    assert fstrings == [], f"use translate_detail(): {fstrings}"


def test_every_router_message_has_ru_and_en():
    found, _ = _collect()
    assert len(found) > 100
    missing = [f"{w}: {t}" for t, w in found.items() if not MESSAGES.get(t, {}).keys() >= {"ru", "en"}]
    assert missing == []


def test_english_source_messages_also_have_uzbek():
    found, _ = _collect()
    for text, where in found.items():
        if MESSAGES.get(text, {}).get("en") == text:  # English is the source language
            assert "uz" in MESSAGES[text], f"{where}: {text}"


def test_translations_are_not_empty_and_keep_placeholders():
    import re
    for text, tr in MESSAGES.items():
        fields = set(re.findall(r"{(\w+)}", text))
        for lang, value in tr.items():
            assert lang in {"uz", "ru", "en"} and value.strip(), text
            assert set(re.findall(r"{(\w+)}", value)) == fields, f"{lang}: {text}"
