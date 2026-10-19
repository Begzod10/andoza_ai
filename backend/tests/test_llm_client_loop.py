"""The shared AsyncOpenAI client must not outlive the event loop it was made under.

The Celery style task runs each job in its own ``asyncio.run``; a client (and its
kept-alive connections) from the previous, closed loop fails with
"Event loop is closed" on the next job.
"""
import asyncio

from app.services import llm


async def _get():
    return llm.get_client()


async def _get_twice():
    return llm.get_client(), llm.get_client()


def test_new_event_loop_gets_a_new_client(monkeypatch):
    monkeypatch.setattr(llm, "_client", None)
    first = asyncio.run(_get())
    second = asyncio.run(_get())
    assert first is not second


def test_same_event_loop_reuses_the_client(monkeypatch):
    monkeypatch.setattr(llm, "_client", None)
    a, b = asyncio.run(_get_twice())
    assert a is b
