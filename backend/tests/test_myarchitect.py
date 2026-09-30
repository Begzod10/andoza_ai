"""MyArchitectAI client: the rules that keep a shared, billed key from misbehaving.

The transport is stubbed — these cover how the client reads the API's
responses, not the API.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services import myarchitect
from app.services.myarchitect import MyArchitectClient, MyArchitectError, to_data_uri


@pytest.fixture(autouse=True)
def _key(monkeypatch):
    monkeypatch.setattr(myarchitect.settings, "MYARCHITECT_API_KEY", "test-key")
    monkeypatch.setattr(myarchitect.settings, "MYARCHITECT_API_URL", "https://api.example.test/v1")


def _client(handler) -> MyArchitectClient:
    return MyArchitectClient(transport=httpx.MockTransport(handler))


async def test_render_sends_key_and_payload_and_returns_output_url():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["key"] = request.headers["x-api-key"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"output": "https://cdn.test/r.jpg", "cost": 1, "balance": 9, "requestId": "r1"})

    url = await _client(handler).render_interior("data:image/jpeg;base64,AAA", prompt="warm oak", output_format="jpg")

    assert url == "https://cdn.test/r.jpg"
    assert seen["url"] == "https://api.example.test/v1/render/interior"
    assert seen["key"] == "test-key"
    assert seen["body"] == {"image": "data:image/jpeg;base64,AAA", "outputFormat": "jpg", "prompt": "warm oak"}


async def test_a_200_without_output_is_a_failed_generation():
    body = {"error": "generation failed", "cost": 0, "balance": 10, "requestId": "abc"}
    with pytest.raises(MyArchitectError) as exc:
        await _client(lambda r: httpx.Response(200, json=body)).render_interior("x")
    assert "generation failed" in str(exc.value)
    assert exc.value.request_id == "abc"


async def test_429_is_retried_with_backoff_then_succeeds():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(429, json={"error": "Too Many Requests"})
        return httpx.Response(200, json={"output": "https://cdn.test/ok.jpg"})

    with patch.object(myarchitect.asyncio, "sleep", new=AsyncMock()) as sleep:
        url = await _client(handler).render_interior("x")

    assert url == "https://cdn.test/ok.jpg"
    assert calls["n"] == 3
    assert sleep.await_count == 2


async def test_429_gives_up_after_the_last_attempt():
    with patch.object(myarchitect.asyncio, "sleep", new=AsyncMock()):
        with pytest.raises(MyArchitectError) as exc:
            await _client(lambda r: httpx.Response(429, json={"error": "Too Many Requests"})).render_interior("x")
    assert exc.value.status == 429


async def test_other_http_errors_are_not_retried():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(402, json={"error": "Insufficient funds"})

    with pytest.raises(MyArchitectError) as exc:
        await _client(handler).render_interior("x")
    assert calls["n"] == 1
    assert "Insufficient funds" in str(exc.value)


async def test_plain_text_413_does_not_crash_the_json_read():
    with pytest.raises(MyArchitectError) as exc:
        await _client(lambda r: httpx.Response(413, text="HTTP content length exceeded")).render_interior("x")
    assert exc.value.status == 413


async def test_missing_key_fails_before_any_request(monkeypatch):
    monkeypatch.setattr(myarchitect.settings, "MYARCHITECT_API_KEY", "")
    hit = {"n": 0}

    def handler(request):
        hit["n"] += 1
        return httpx.Response(200, json={"output": "u"})

    with pytest.raises(MyArchitectError):
        await _client(handler).render_interior("x")
    assert hit["n"] == 0


async def test_balance_reads_balance_without_needing_output():
    assert await _client(lambda r: httpx.Response(200, json={"balance": 12.5})).balance() == 12.5


async def test_upscale_rejects_png_at_8k_and_animate_sends_frames():
    client = _client(lambda r: httpx.Response(200, json={"output": "u"}))
    with pytest.raises(ValueError):
        await client.upscale("x", resolution="8k", output_format="png")

    seen = {}

    def handler(request):
        seen.update(json.loads(request.content))
        return httpx.Response(200, json={"output": "https://cdn.test/v.mp4"})

    assert await _client(handler).animate("a", "slow pan", end_frame="b") == "https://cdn.test/v.mp4"
    assert seen == {"startFrameUrl": "a", "prompt": "slow pan", "endFrameUrl": "b"}


async def test_render_rejects_an_unknown_output_format():
    with pytest.raises(ValueError):
        await _client(lambda r: httpx.Response(200, json={"output": "u"})).render_interior("x", output_format="bmp")


def test_data_uri_round_trips():
    assert to_data_uri(b"hi", "image/png") == "data:image/png;base64,aGk="
