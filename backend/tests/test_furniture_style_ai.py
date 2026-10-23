"""The AI reads a furniture model's styles: what it is asked, and how a messy answer is read."""
from __future__ import annotations

import pytest

from app.services.design_image import PreparedImage
from app.services.furniture_style_ai import classify_furniture_styles, parse_styles_answer
from app.services.llm import LLMMessage, TextBlock


class FakeLLM:
    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.answer = '{"styles": ["zamonaviy"]}'

    async def __call__(self, **kwargs):
        self.calls.append(kwargs)
        return LLMMessage(content=[TextBlock(text=self.answer)])


@pytest.fixture
def fake_llm(monkeypatch):
    fake = FakeLLM()
    monkeypatch.setattr("app.services.furniture_style_ai.call_llm", fake)
    return fake


@pytest.mark.parametrize(("text", "styles"), [
    ('{"styles": ["hitech", "zamonaviy"]}', ["zamonaviy", "hitech"]),
    ('```json\n{"styles": ["loft"]}\n```', ["loft"]),
    ('{"styles": ["barokko", "milliy", "milliy"]}', ["milliy"]),
    ('{"styles": ["klassik","neoklassika","loft","milliy"]}', ["neoklassika", "klassik", "loft"]),  # first 3, then catalog order
    ('{"styles": "hitech"}', []),
    ("bilmayman", []),
])
def test_the_answer_is_read_safely(text, styles):
    assert parse_styles_answer(text) == styles


async def test_with_a_picture_the_model_sees_it(fake_llm):
    result = await classify_furniture_styles(
        "Divan", "divan", PreparedImage(media_type="image/jpeg", data_b64="eA==", width=10, height=10),
    )
    assert result == ["zamonaviy"]
    content = fake_llm.calls[0]["messages"][0]["content"]
    assert any(b.get("type") == "image" for b in content)
    assert fake_llm.calls[0]["user_id"] is None


async def test_without_a_picture_only_the_name_goes(fake_llm):
    await classify_furniture_styles("Hi-Tech stol", "stol", None)
    content = fake_llm.calls[0]["messages"][0]["content"]
    assert not any(isinstance(b, dict) and b.get("type") == "image" for b in content)
    assert "Hi-Tech stol" in content[0]["text"]


async def test_the_call_is_cheap_and_deterministic(fake_llm, monkeypatch):
    monkeypatch.setattr("app.services.furniture_style_ai.settings.AI_MODEL_BUILDER", "vision-model")
    await classify_furniture_styles("Divan", "divan", None)
    call = fake_llm.calls[0]
    assert (call["model"], call["max_tokens"], call["temperature"]) == ("vision-model", 200, 0)


async def test_a_provider_error_reaches_the_caller(monkeypatch):
    async def boom(**kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr("app.services.furniture_style_ai.call_llm", boom)
    with pytest.raises(RuntimeError):
        await classify_furniture_styles("Divan", "divan", None)
