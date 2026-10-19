"""
POST /rooms/{room_id}/ai-design/image: a room design from an inspiration image.

Same plan as the text designer (POST /ai-design), from a picture plus an
optional prompt. Checked in a fixed order so nothing that is refused costs
the user a try: AI on → the caller's room → the image → the daily limit
(its own "image_design" pool) → the model.

The room lookup, the designer and the budget are patched; the image check
is real.
"""
from __future__ import annotations

import io
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from app.api.v1.deps import get_current_active_user
from app.config import settings
from app.database import get_db
from app.main import app
from app.services.ai_designer import DesignError, DesignPlan
from app.services.design_image import PreparedImage
from app.services.llm import BudgetExceededError

ROOM_ID = uuid.uuid4()
PLAN = DesignPlan(
    title="Skandinav", summary="Rasmdan: oq devor, och parket.",
    walls={"main": {"type": "paint", "color": "#ffffff"}}, floor={"type": "parquet"},
    lights=[], furniture=[],
)


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (60, 40), (200, 200, 200)).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(settings, "AI_FEATURES_ENABLED", True)
    user = MagicMock(id=uuid.uuid4(), is_active=True, is_admin=False)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalars=lambda: MagicMock(all=lambda: [])))
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_active_user] = lambda: user
    room = SimpleNamespace(id=ROOM_ID, name="Xona", ceiling_h=2.7, geometry=None, state=None)
    mocks = SimpleNamespace(
        user=user,
        owned=AsyncMock(return_value=room),
        design=AsyncMock(return_value=PLAN),
        budget=AsyncMock(),
        summary=MagicMock(return_value={"walls": [], "width": 4, "depth": 3, "area": 12}),
    )
    with patch("app.routers.ai._get_owned_room", new=mocks.owned), \
         patch("app.routers.ai.design_room", new=mocks.design), \
         patch("app.routers.ai.check_and_increment_budget_for", new=mocks.budget), \
         patch("app.routers.ai._room_summary", new=mocks.summary):
        yield TestClient(app, raise_server_exceptions=False), mocks
    app.dependency_overrides.clear()


def _post(client, data=None, image=None, ctype="image/jpeg"):
    files = {"image": ("pin.jpg", image if image is not None else _jpeg(), ctype)}
    return client.post(f"/api/v1/rooms/{ROOM_ID}/ai-design/image", files=files, data=data or {})


def test_an_image_gives_the_same_plan_shape_as_the_text_designer(env):
    client, m = env
    response = _post(client)
    assert response.status_code == 200
    assert set(response.json()) >= {"title", "summary", "walls", "floor", "lights", "furniture"}
    kwargs = m.design.await_args.kwargs
    assert isinstance(kwargs["image"], PreparedImage)
    assert m.design.await_args.args[0] == ""  # no prompt sent


def test_prompt_and_room_type_are_passed_on(env):
    client, m = env
    _post(client, data={"prompt": "  faqat ranglarini ol ", "room_type": "mehmonxona"})
    assert m.design.await_args.args[0] == "faqat ranglarini ol"
    assert m.summary.call_args.args[1] == "mehmonxona"


def test_someone_elses_room_is_404_and_costs_nothing(env):
    client, m = env
    m.owned.side_effect = HTTPException(status_code=404, detail="Room not found")
    assert _post(client).status_code == 404
    m.budget.assert_not_awaited()


def test_not_an_image_is_415_and_costs_nothing(env):
    client, m = env
    response = _post(client, image=b"<html>salom</html>", ctype="image/jpeg")
    assert response.status_code == 415
    assert response.json()["detail"] == "Faqat JPEG, PNG yoki WebP rasm yuklang"
    m.budget.assert_not_awaited()


def test_too_large_is_413_and_costs_nothing(env):
    client, m = env
    response = _post(client, image=b"\xff\xd8\xff" + b"0" * (10 * 1024 * 1024))
    assert response.status_code == 413
    assert response.json()["detail"] == "Rasm hajmi 10 MB dan oshmasligi kerak"
    m.budget.assert_not_awaited()


def test_the_daily_limit_is_429(env):
    client, m = env
    m.budget.side_effect = BudgetExceededError()
    response = _post(client)
    assert response.status_code == 429
    assert response.json()["detail"] == "Bugungi rasmdan dizayn limiti tugadi"
    m.design.assert_not_awaited()


def test_the_limit_is_the_image_pool_with_its_own_cap(env):
    client, m = env
    _post(client)
    m.budget.assert_awaited_once_with(str(m.user.id), "image_design", 10)


def test_a_provider_failure_is_502(env):
    client, m = env
    m.design.side_effect = RuntimeError("provider down")
    assert _post(client).status_code == 502


def test_an_unusable_plan_is_422(env):
    client, m = env
    m.design.side_effect = DesignError("bo'sh reja")
    assert _post(client).status_code == 422


def test_ai_switched_off_is_503(env, monkeypatch):
    client, m = env
    monkeypatch.setattr(settings, "AI_FEATURES_ENABLED", False)
    assert _post(client).status_code == 503
    m.budget.assert_not_awaited()


def test_the_text_endpoint_still_works_through_the_shared_helper(env):
    client, m = env
    response = client.post(f"/api/v1/rooms/{ROOM_ID}/ai-design", json={"prompt": "qorong'i xona"})
    assert response.status_code == 200
    assert m.design.await_args.args[0] == "qorong'i xona"
    assert m.design.await_args.kwargs.get("image") is None
    m.budget.assert_not_awaited()  # the text designer counts in call_llm, as before
