"""
Regions (viloyat/tuman) reference-data endpoint.

Static list, no DB, no auth — just checks the contract holds.
"""
from fastapi.testclient import TestClient

from app.main import app


def test_list_regions_returns_all_viloyats_with_districts():
    client = TestClient(app)
    response = client.get("/api/v1/regions")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 12  # Uzbekistan's 12 viloyats (see app/core/uz_regions.py for scope)
    for region in body:
        assert region["name"]
        assert region["code"]
        assert len(region["districts"]) > 0

    names = {r["name"] for r in body}
    assert "Toshkent viloyati" in names
    assert "Andijon viloyati" in names


def test_toshkent_viloyati_includes_its_22_units():
    client = TestClient(app)
    response = client.get("/api/v1/regions")

    toshkent = next(r for r in response.json() if r["name"] == "Toshkent viloyati")
    assert len(toshkent["districts"]) == 22
    assert "Chirchiq shahri" in toshkent["districts"]
