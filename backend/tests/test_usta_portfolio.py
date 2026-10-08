"""Usta portfolio: photos of finished work. The DB session and storage are stubbed."""
from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.models.usta_portfolio import UstaPortfolioItem
from tests.test_usta_profile import _R, _as, _usta, _user, client  # noqa: F401

JPEG = b"\xff\xd8\xff\xe0" + b"x" * 32
URL = "/api/v1/usta/portfolio"


def _item(usta, **kw):
    i = UstaPortfolioItem(id=uuid.uuid4(), usta_id=usta.id, image_key="usta-portfolio/a.jpg",
                          caption="Oshxona", created_at=datetime.now(timezone.utc))
    for k, v in kw.items():
        setattr(i, k, v)
    return i


def _post(client, data=JPEG, ctype="image/jpeg", **form):
    return client.post(URL, data=form, files={"file": ("p.jpg", io.BytesIO(data), ctype)})


class TestOwnPortfolio:
    def test_lists_own_items_with_urls(self, client):
        u = _user()
        usta = _usta(u)
        item = _item(usta)
        _as(u, [_R(usta), _R(many=[item])])
        body = client.get(URL).json()
        assert len(body) == 1
        assert body[0]["caption"] == "Oshxona" and body[0]["image_url"].endswith("usta-portfolio/a.jpg")

    def test_no_profile_is_404(self, client):
        _as(_user(), [_R(None)])
        assert client.get(URL).status_code == 404

    def test_upload_stores_the_file_and_row(self, client):
        u = _user()
        usta = _usta(u)
        db = _as(u, [_R(usta), _R(0)])
        with patch("app.routers.usta_portfolio.upload_file", new=AsyncMock(return_value="usta-portfolio/x.jpg")) as up:
            res = _post(client, caption="  Hammom  ")
        assert res.status_code == 201
        assert res.json()["caption"] == "Hammom"
        row = db.add.call_args.args[0]
        assert row.usta_id == usta.id and row.image_key.startswith("usta-portfolio/")
        assert up.await_args.args[0] == JPEG

    def test_wrong_type_is_415(self, client):
        u = _user()
        usta = _usta(u)
        _as(u, [_R(usta), _R(0), _R(usta), _R(0)])
        with patch("app.routers.usta_portfolio.upload_file", new=AsyncMock()) as up:
            assert _post(client, ctype="application/pdf").status_code == 415
            assert _post(client, data=b"not an image").status_code == 415
        up.assert_not_awaited()

    def test_too_big_is_413(self, client):
        u = _user()
        usta = _usta(u)
        _as(u, [_R(usta), _R(0)])
        with patch("app.routers.usta_portfolio.upload_file", new=AsyncMock()) as up:
            assert _post(client, data=JPEG + b"x" * (5 * 1024 * 1024)).status_code == 413
        up.assert_not_awaited()

    def test_twelve_is_the_limit(self, client):
        u = _user()
        usta = _usta(u)
        _as(u, [_R(usta), _R(12)])
        with patch("app.routers.usta_portfolio.upload_file", new=AsyncMock()) as up:
            assert _post(client).status_code == 429
        up.assert_not_awaited()

    def test_delete_own(self, client):
        u = _user()
        usta = _usta(u)
        item = _item(usta)
        db = _as(u, [_R(usta), _R(item)])
        db.delete = AsyncMock()
        assert client.delete(f"{URL}/{item.id}").status_code == 204
        db.delete.assert_awaited_once_with(item)

    def test_delete_someone_elses_is_404(self, client):
        u = _user()
        usta = _usta(u)
        other = _item(_usta(_user()))
        db = _as(u, [_R(usta), _R(other)])
        db.delete = AsyncMock()
        assert client.delete(f"{URL}/{other.id}").status_code == 404
        db.delete.assert_not_awaited()


class TestPublicPortfolio:
    def test_approved_usta_gallery(self, client):
        usta = _usta(_user())
        _as(_user(), [_R(usta), _R(many=[_item(usta)])])
        res = client.get(f"/api/v1/ustalar/{usta.id}/portfolio")
        assert res.status_code == 200 and len(res.json()) == 1

    @pytest.mark.parametrize("status", ["pending", "rejected"])
    def test_hidden_until_approved(self, client, status):
        usta = _usta(_user(), status=status)
        _as(_user(), [_R(usta)])
        assert client.get(f"/api/v1/ustalar/{usta.id}/portfolio").status_code == 404

    def test_unknown_usta_is_404(self, client):
        _as(_user(), [_R(None)])
        assert client.get(f"/api/v1/ustalar/{uuid.uuid4()}/portfolio").status_code == 404
