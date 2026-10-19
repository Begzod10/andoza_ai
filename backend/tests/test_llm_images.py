"""
_to_openai_messages: Anthropic-style image blocks reach the model.

The designer sends an inspiration image as {"type": "image", "source":
{"type": "base64", ...}}. The converter used to keep only text and tool
results, so the picture was silently dropped and the model designed blind.
"""
from __future__ import annotations

from app.services.llm import _to_openai_messages

IMG = {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "QUJD"}}


def test_an_image_block_becomes_an_openai_image_url_part():
    out = _to_openai_messages([{"role": "user", "content": [IMG, {"type": "text", "text": "salom"}]}])
    assert out == [{"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,QUJD"}},
        {"type": "text", "text": "salom"},
    ]}]


def test_text_only_messages_are_unchanged():
    assert _to_openai_messages([{"role": "user", "content": "salom"}]) == [{"role": "user", "content": "salom"}]
    out = _to_openai_messages([{"role": "user", "content": [
        {"type": "text", "text": "a"},
        {"type": "tool_result", "tool_use_id": "t1", "content": "ok"},
    ]}])
    assert out == [{"role": "user", "content": "a\n[Tool result for t1]: ok"}]
