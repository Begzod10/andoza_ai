"""Getting the storage key back from what an upload route stored.

With S3 configured, upload routes store the object's public URL; reading the
object back needs its key.
"""
from app.config import settings
from app.core.storage import storage_key_from


def test_custom_endpoint_url_gives_its_key(monkeypatch):
    monkeypatch.setattr(settings, "S3_ENDPOINT_URL", "https://s3.example.uz")
    monkeypatch.setattr(settings, "S3_BUCKET", "andoza")
    assert storage_key_from("https://s3.example.uz/andoza/furniture/t.jpg") == "furniture/t.jpg"


def test_aws_url_gives_its_key(monkeypatch):
    monkeypatch.setattr(settings, "S3_ENDPOINT_URL", "")
    monkeypatch.setattr(settings, "S3_BUCKET", "andoza")
    monkeypatch.setattr(settings, "S3_REGION", "eu-central-1")
    assert (
        storage_key_from("https://andoza.s3.eu-central-1.amazonaws.com/furniture/t.jpg")
        == "furniture/t.jpg"
    )


def test_a_plain_key_is_returned_unchanged(monkeypatch):
    monkeypatch.setattr(settings, "S3_ENDPOINT_URL", "https://s3.example.uz")
    monkeypatch.setattr(settings, "S3_BUCKET", "andoza")
    assert storage_key_from("furniture/t.jpg") == "furniture/t.jpg"


def test_an_unrelated_url_is_returned_unchanged(monkeypatch):
    monkeypatch.setattr(settings, "S3_ENDPOINT_URL", "https://s3.example.uz")
    monkeypatch.setattr(settings, "S3_BUCKET", "andoza")
    monkeypatch.setattr(settings, "S3_REGION", "eu-central-1")
    url = "https://cdn.other.com/andoza/furniture/t.jpg"
    assert storage_key_from(url) == url
