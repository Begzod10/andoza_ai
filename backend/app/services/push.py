"""Entry point for sending a push: callers only enqueue, the worker does the I/O."""
from __future__ import annotations

import uuid


def notify(user_id: uuid.UUID | str, kind: str, params: dict | None = None) -> None:
    """Queue a push for *user_id*. Does no network or DB work itself, so it is
    safe to call from a request or a ``run_after_commit`` hook."""
    from app.tasks.push import send_push

    send_push.delay(str(user_id), kind, params or {})
