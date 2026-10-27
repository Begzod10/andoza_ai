"""The request parameters each OpenAI model family accepts."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services import llm


def _client(sent: dict):
    async def create(**kwargs):
        sent.update(kwargs)
        msg = SimpleNamespace(content="ok", tool_calls=None)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=msg, finish_reason="stop")],
            usage=SimpleNamespace(prompt_tokens=1, completion_tokens=1, total_tokens=2),
        )
    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))


async def _send(model: str) -> dict:
    sent: dict = {}
    # CI runs with AI switched off; the parameters are what is under test here.
    with patch.object(llm.settings, "AI_FEATURES_ENABLED", True), \
         patch.object(llm, "get_client", return_value=_client(sent)):
        await llm.call_llm(model=model, system="s", messages=[{"role": "user", "content": "hi"}],
                           max_tokens=900, temperature=0.7)
    return sent


@pytest.mark.asyncio
async def test_gpt_4_1_takes_max_tokens_and_temperature():
    sent = await _send("gpt-4.1-mini")
    assert sent["max_tokens"] == 900 and sent["temperature"] == 0.7
    assert "max_completion_tokens" not in sent


@pytest.mark.asyncio
@pytest.mark.parametrize("model", ["gpt-5.4-mini", "gpt-5", "gpt-6-sol", "o4-mini"])
async def test_newer_models_take_max_completion_tokens_and_their_own_temperature(model):
    sent = await _send(model)
    assert sent["max_completion_tokens"] == 900
    assert "max_tokens" not in sent and "temperature" not in sent
