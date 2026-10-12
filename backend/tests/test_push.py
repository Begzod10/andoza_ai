from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from celery.exceptions import Retry
from firebase_admin import exceptions, messaging

from app.services.push import notify
from app.services.push_messages import build_message
from app.tasks import push as push_task
from app.tasks.push import send_push

UID = "11111111-1111-1111-1111-111111111111"


def _resp(exc=None):
    return SimpleNamespace(success=exc is None, exception=exc)


def test_messages_follow_locale():
    assert build_message("order_status", {"status": "on_the_way"}, "ru") == (
        "Статус заказа", "Ваш заказ: в пути", "/profile/e6",
    )
    assert build_message("render_ready", {"room_id": "r1"}, "en")[2] == "/studio/r1"
    assert build_message("render_ready", {}, "uz")[2] == "/"
    assert build_message("lead_status", {"status": "viewed"}, "uz") == (
        "Ustalar", "Usta so'rovingizni ko'rdi", "/masters/u3",
    )
    assert build_message("render_ready", {"room_id": "r1"}, "en")[2] == "/studio/r1"


def test_notify_only_enqueues():
    with patch("app.tasks.push.send_push.delay") as delay:
        notify(__import__("uuid").UUID(UID), "render_ready", None)
    delay.assert_called_once_with(UID, "render_ready", {})


@pytest.fixture
def enabled():
    with patch.object(push_task, "_ensure_firebase", return_value=True):
        yield


def test_send_push_sends_one_message_per_token(enabled):
    with patch.object(push_task, "_load_tokens", AsyncMock(return_value=[("t1", "uz"), ("t2", "en")])), \
         patch("firebase_admin.messaging.send_each",
               return_value=SimpleNamespace(responses=[_resp(), _resp()])) as send:
        result = send_push.run(UID, "render_ready", {"room_id": "r1"})
    msgs = send.call_args.args[0]
    assert [m.token for m in msgs] == ["t1", "t2"]
    assert [m.notification.title for m in msgs] == ["Dizayningiz tayyor", "Your design is ready"]
    assert all(m.data == {"kind": "render_ready", "route": "/studio/r1"} for m in msgs)
    assert msgs[0].android.notification.channel_id == "andoza_updates"
    assert result == {"sent": 2, "removed": 0}


def test_dead_tokens_are_deleted(enabled):
    dead = messaging.UnregisteredError("gone", None, None)
    delete = AsyncMock()
    with patch.object(push_task, "_load_tokens", AsyncMock(return_value=[("t1", "uz"), ("t2", "uz")])), \
         patch.object(push_task, "_delete_tokens", delete), \
         patch("firebase_admin.messaging.send_each",
               return_value=SimpleNamespace(responses=[_resp(), _resp(dead)])):
        result = send_push.run(UID, "render_ready", {})
    delete.assert_awaited_once_with(["t2"])
    assert result == {"sent": 1, "removed": 1}


def test_transient_error_retries(enabled):
    err = exceptions.UnavailableError("down")
    with patch.object(push_task, "_load_tokens", AsyncMock(return_value=[("t1", "uz")])), \
         patch("firebase_admin.messaging.send_each", side_effect=err), \
         patch.object(send_push, "retry", side_effect=Retry()) as retry:
        with pytest.raises(Retry):
            send_push.run(UID, "render_ready", {})
    retry.assert_called_once()
    assert retry.call_args.kwargs["exc"] is err


def test_mixed_batch_deletes_dead_and_retries_only_transient(enabled):
    batch = SimpleNamespace(responses=[
        _resp(),
        _resp(messaging.UnregisteredError("gone", None, None)),
        _resp(exceptions.UnavailableError("busy")),
    ])
    delete = AsyncMock()
    devices = [("ok", "uz"), ("dead", "uz"), ("busy", "uz")]
    with patch.object(push_task, "_load_tokens", AsyncMock(return_value=devices)), \
         patch.object(push_task, "_delete_tokens", delete), \
         patch("firebase_admin.messaging.send_each", return_value=batch), \
         patch.object(send_push, "retry", side_effect=Retry()) as retry:
        with pytest.raises(Retry):
            send_push.run(UID, "render_ready", {})
    delete.assert_awaited_once_with(["dead"])
    assert retry.call_args.kwargs["kwargs"] == {
        "user_id": UID, "kind": "render_ready", "params": {}, "only_tokens": ["busy"],
    }


def test_only_tokens_limits_the_send(enabled):
    devices = [("a", "uz"), ("b", "uz")]
    with patch.object(push_task, "_load_tokens", AsyncMock(return_value=devices)), \
         patch("firebase_admin.messaging.send_each", return_value=SimpleNamespace(responses=[_resp()])) as send:
        result = send_push.run(UID, "render_ready", {}, only_tokens=["b"])
    assert [m.token for m in send.call_args.args[0]] == ["b"]
    assert result == {"sent": 1, "removed": 0}


def test_disabled_without_credentials(monkeypatch):
    monkeypatch.setattr(push_task, "_firebase_ready", False)
    monkeypatch.setattr("app.config.settings.FIREBASE_CREDENTIALS_FILE", "")
    with patch("firebase_admin.messaging.send_each") as send:
        assert send_push.run(UID, "render_ready", {}) == {"status": "disabled"}
    send.assert_not_called()
