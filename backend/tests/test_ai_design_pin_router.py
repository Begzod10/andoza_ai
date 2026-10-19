"""
POST /rooms/{room_id}/ai-design/pin: a room design from a Pinterest pin link.

The pin's image goes through the same pipeline as an uploaded one (step 1)
and the answer adds pin_image_url, the picture actually used. Checked in
order so that nothing failing on Pinterest's side costs the user a try:
AI on → the caller's room → the link → the pin's image → the image check →
the shared "image_design" limit → the model.

The Pinterest calls, the room lookup, the designer and the budget are
patched; the image check is real.
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
from app.services.ai_designer import DesignPlan
from app.services.design_image import ImageTooLarge, PreparedImage
from app.services.llm import BudgetExceededError
from app.services.pinterest_pin import NotAPinUrl, PinImage, PinNotFound, PinterestUnavailable

ROOM_ID = uuid.uuid4()
PIN_URL = "https://www.pinterest.com/pin/516647388484185204/"
IMAGE_URL = "https://i.pinimg.com/736x/x.jpg"
PLAN = DesignPlan(title="Skandinav", summary="Oq devor.", walls={"main": {"type": "paint", "color": "#ffffff"}})


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
    m = SimpleNamespace(
        user=user,
        owned=AsyncMock(return_value=room),
        resolve=AsyncMock(return_value="516647388484185204"),
        fetch=AsyncMock(return_value=PinImage(data=_jpeg(), content_type="image/jpeg", url=IMAGE_URL)),
        design=AsyncMock(return_value=PLAN),
        budget=AsyncMock(),
        summary=MagicMock(return_value={"walls": [], "width": 4, "depth": 3, "area": 12}),
    )
    with patch("app.routers.ai._get_owned_room", new=m.owned), \
         patch("app.routers.ai.resolve_pin_id", new=m.resolve), \
         patch("app.routers.ai.fetch_pin_image", new=m.fetch), \
         patch("app.routers.ai.design_room", new=m.design), \
         patch("app.routers.ai.check_and_increment_budget_for", new=m.budget), \
         patch("app.routers.ai._room_summary", new=m.summary):
        yield TestClient(app, raise_server_exceptions=False), m
    app.dependency_overrides.clear()


def _post(client, **body):
    return client.post(f"/api/v1/rooms/{ROOM_ID}/ai-design/pin", json={"url": PIN_URL, **body})


def _costs_nothing(m):
    m.budget.assert_not_awaited()
    m.design.assert_not_awaited()


def test_a_pin_gives_the_plan_and_the_image_it_came_from(env):
    client, m = env
    response = _post(client)
    assert response.status_code == 200
    body = response.json()
    assert body["pin_image_url"] == IMAGE_URL
    assert set(body) >= {"title", "summary", "walls", "floor", "lights", "furniture", "image_notes"}
    assert isinstance(m.design.await_args.kwargs["image"], PreparedImage)
    assert m.design.await_args.args[0] == ""


def test_prompt_and_room_type_are_passed_on(env):
    client, m = env
    _post(client, prompt="  faqat ranglarini ol ", room_type="mehmonxona")
    assert m.design.await_args.args[0] == "faqat ranglarini ol"
    assert m.summary.call_args.args[1] == "mehmonxona"


def test_not_a_pin_link_is_422_and_nothing_is_fetched_or_counted(env):
    client, m = env
    m.resolve.side_effect = NotAPinUrl("x")
    response = _post(client, url="https://example.com/x")
    assert response.status_code == 422
    assert response.json()["detail"] == "Bu Pinterest pin havolasi emas"
    m.fetch.assert_not_awaited()
    _costs_nothing(m)


def test_an_unknown_pin_is_404_and_costs_nothing(env):
    client, m = env
    m.fetch.side_effect = PinNotFound("1")
    response = _post(client)
    assert response.status_code == 404
    assert response.json()["detail"] == "Pin topilmadi yoki u yopiq"
    _costs_nothing(m)


def test_pinterest_down_is_502_and_costs_nothing(env):
    client, m = env
    m.fetch.side_effect = PinterestUnavailable("timeout")
    response = _post(client)
    assert response.status_code == 502
    assert response.json()["detail"] == "Pinterest hozir javob bermadi. Birozdan keyin urinib ko'ring"
    _costs_nothing(m)


def test_a_pin_image_over_10_mb_is_413_and_costs_nothing(env):
    client, m = env
    m.fetch.side_effect = ImageTooLarge(11)
    response = _post(client)
    assert response.status_code == 413
    assert response.json()["detail"] == "Rasm hajmi 10 MB dan oshmasligi kerak"
    _costs_nothing(m)


def test_a_pin_image_that_is_not_readable_is_415_and_costs_nothing(env):
    client, m = env
    m.fetch.return_value = PinImage(data=b"<html/>", content_type="image/jpeg", url=IMAGE_URL)
    response = _post(client)
    assert response.status_code == 415
    _costs_nothing(m)


def test_the_limit_is_the_shared_image_pool(env):
    client, m = env
    _post(client)
    m.budget.assert_awaited_once_with(str(m.user.id), "image_design", 10)


def test_the_daily_limit_is_429(env):
    client, m = env
    m.budget.side_effect = BudgetExceededError()
    response = _post(client)
    assert response.status_code == 429
    assert response.json()["detail"] == "Bugungi rasmdan dizayn limiti tugadi"
    m.design.assert_not_awaited()


def test_ai_switched_off_is_503_before_anything_is_fetched(env, monkeypatch):
    client, m = env
    monkeypatch.setattr(settings, "AI_FEATURES_ENABLED", False)
    assert _post(client).status_code == 503
    m.resolve.assert_not_awaited()
    m.fetch.assert_not_awaited()


def test_someone_elses_room_is_404_before_anything_is_fetched(env):
    client, m = env
    m.owned.side_effect = HTTPException(status_code=404, detail="Room not found")
    assert _post(client).status_code == 404
    m.resolve.assert_not_awaited()
    m.fetch.assert_not_awaited()



def test_a_user_already_over_the_limit_makes_no_pinterest_request(env):
    # Final review: the limit was only taken after Pinterest had been fetched, so a
    # user over it could keep the server fetching pins (and get our IP throttled).
    client, m = env
    with patch("app.routers.ai.budget_exhausted", new=AsyncMock(return_value=True)):
        response = _post(client)
    assert response.status_code == 429
    assert response.json()["detail"] == "Bugungi rasmdan dizayn limiti tugadi"
    m.resolve.assert_not_awaited()
    m.fetch.assert_not_awaited()
