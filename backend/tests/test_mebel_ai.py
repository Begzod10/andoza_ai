"""
Mebel AI: text → a proposal of cabinets. The model only fills the
`propose_cabinets` tool; the server checks every value against the same
limits as the engine and drops what does not fit. call_llm is stubbed.
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.v1.deps import get_current_active_user
from app.config import settings
from app.main import app
from app.services.llm import BudgetExceededError, LLMMessage, TextBlock, ToolUseBlock


def _user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.is_active = True
    user.is_admin = False
    return user


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "AI_FEATURES_ENABLED", True)
    app.dependency_overrides[get_current_active_user] = _user
    yield TestClient(app)
    app.dependency_overrides.clear()


def _reply(tool_input=None, text=None):
    blocks = []
    if text:
        blocks.append(TextBlock(text=text))
    if tool_input is not None:
        blocks.append(ToolUseBlock(name="propose_cabinets", input=tool_input))
    msg = MagicMock(spec=LLMMessage)
    msg.content = blocks
    return msg


def _post(client, text="2400 mm oshxona"):
    return client.post("/api/v1/mebel/ai/suggest", json={"text": text})


@pytest.fixture
def budget():
    with patch("app.services.mebel_ai.check_and_increment_budget_for", new=AsyncMock()) as b:
        yield b


def test_turns_the_tool_call_into_cabinets_with_type_defaults(client, budget):
    tool = {"cabinets": [
        {"type": "base", "width": 600, "count": 2},
        {"type": "base", "width": 800, "drawers": 3},
        {"type": "wall", "width": 600, "count": 3},
        {"type": "tall", "width": 600},
    ], "facade": "ldsp", "questions": ["Devor shkaflari balandligi 720 mi?"]}
    with patch("app.services.mebel_ai.call_llm", new=AsyncMock(return_value=_reply(tool))):
        r = _post(client)
    assert r.status_code == 200, r.text
    body = r.json()
    cabs = body["cabinets"]
    assert [c["type"] for c in cabs] == ["base", "base", "base", "wall", "wall", "wall", "tall"]
    assert cabs[0] == {"type": "base", "width": 600, "height": 720, "depth": 560, "shelves": 1, "doors": None, "drawers": 0}
    assert cabs[2]["drawers"] == 3
    assert cabs[3]["depth"] == 300 and cabs[6]["height"] == 2100 and cabs[6]["shelves"] == 4
    assert body["facade"] == "ldsp"
    assert body["questions"] == ["Devor shkaflari balandligi 720 mi?"]
    assert body["dropped"] == []
    budget.assert_awaited_once()


def test_drops_values_outside_the_type_limits(client, budget):
    tool = {"cabinets": [
        {"type": "wall", "width": 600, "depth": 450},
        {"type": "wall", "width": 600, "drawers": 2},
        {"type": "corner", "width": 900},
        {"type": "base", "width": 600},
    ], "questions": []}
    with patch("app.services.mebel_ai.call_llm", new=AsyncMock(return_value=_reply(tool))):
        body = _post(client).json()
    assert [c["type"] for c in body["cabinets"]] == ["base"]
    assert len(body["dropped"]) == 3
    assert any("450" in d for d in body["dropped"])


def test_caps_the_total_at_30(client, budget):
    tool = {"cabinets": [{"type": "base", "width": 600, "count": 50}], "questions": []}
    with patch("app.services.mebel_ai.call_llm", new=AsyncMock(return_value=_reply(tool))):
        body = _post(client).json()
    assert len(body["cabinets"]) == 30
    assert body["dropped"]


def test_no_tool_call_comes_back_as_a_question(client, budget):
    with patch("app.services.mebel_ai.call_llm", new=AsyncMock(return_value=_reply(text="Oshxona eni qancha?"))):
        body = _post(client).json()
    assert body["cabinets"] == [] and body["questions"] == ["Oshxona eni qancha?"]


def test_disabled_is_503(client, monkeypatch):
    monkeypatch.setattr(settings, "AI_FEATURES_ENABLED", False)
    assert _post(client).status_code == 503


def test_daily_limit_is_429(client):
    with patch("app.services.mebel_ai.check_and_increment_budget_for", new=AsyncMock(side_effect=BudgetExceededError())):
        assert _post(client).status_code == 429


def test_llm_failure_is_502(client, budget):
    with patch("app.services.mebel_ai.call_llm", new=AsyncMock(side_effect=RuntimeError("timeout"))):
        assert _post(client).status_code == 502


def test_text_is_required_and_bounded(client, budget):
    assert _post(client, "").status_code == 422
    assert _post(client, "x" * 1001).status_code == 422


def test_the_prompt_knows_both_languages():
    from app.services.mebel_ai import SYSTEM_PROMPT
    for word in ("pastki", "devor", "penal", "нижний", "навесной", "пенал", "tortma", "ящик"):
        assert word in SYSTEM_PROMPT


def _run(client, cabinets, facade=None):
    tool = {"cabinets": cabinets, "questions": []}
    if facade:
        tool["facade"] = facade
    with patch("app.services.mebel_ai.call_llm", new=AsyncMock(return_value=_reply(tool))):
        return _post(client).json()


def test_numbers_as_whole_floats_or_strings_are_read(client, budget):
    body = _run(client, [{"type": "base", "width": 600.0, "height": "900", "doors": 1.0}])
    assert body["cabinets"] == [{"type": "base", "width": 600, "height": 900, "depth": 560, "shelves": 1, "doors": 1, "drawers": 0}]


def test_an_unreadable_size_is_dropped_not_defaulted(client, budget):
    body = _run(client, [{"type": "base", "width": 600, "height": "baland"}, {"type": "base", "width": 600.5}])
    assert body["cabinets"] == []
    assert any("balandligi" in d for d in body["dropped"]) and any("eni" in d for d in body["dropped"])


def test_drawer_cabinets_the_engine_would_refuse_are_dropped(client, budget):
    body = _run(client, [{"type": "base", "width": 600, "depth": 250, "drawers": 3},
                         {"type": "base", "width": 600, "height": 300, "drawers": 4},
                         {"type": "base", "width": 600, "drawers": 3, "doors": 2}])
    assert len(body["cabinets"]) == 1 and len(body["dropped"]) == 2
    # a drawer cabinet has no door
    assert body["cabinets"][0]["doors"] is None


def test_cabinets_after_the_cap_are_counted_in_dropped(client, budget):
    body = _run(client, [{"type": "base", "width": 600, "count": 30}, {"type": "tall", "width": 600}])
    assert len(body["cabinets"]) == 30
    assert any("penal" in d for d in body["dropped"])


def test_dropped_reasons_are_in_uzbek(client, budget):
    body = _run(client, [{"type": "wall", "width": 2400},
                         {"type": "base", "width": 450, "depth": 250, "drawers": 2},
                         {"type": "shelf", "width": 600}])
    wall, drawers, kind = body["dropped"]
    assert wall == "devor shkafi: eni 2400 mm, 150–1200 bo'lishi kerak"
    assert drawers == "pastki shkaf, 2 tortma: chuqurligi 250 mm, kamida 264 kerak"
    assert "pastki, devor yoki penal" in kind


def test_the_prompt_splits_long_runs_and_answers_in_the_users_language():
    from app.services.mebel_ai import SYSTEM_PROMPT
    assert "1200" in SYSTEM_PROMPT
    assert "penal ham kiradi" in SYSTEM_PROMPT
    assert "ruscha yozsa, savollar ham ruscha" in SYSTEM_PROMPT
