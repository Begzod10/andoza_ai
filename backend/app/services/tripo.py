"""Tripo integration — a 3D model (GLB) from a single photo.

API: https://developers.tripo3d.ai/en/docs (v3). The shape that matters here:

* Every answer is ``{"code": 0, "data": {...}}``; a non-zero ``code`` is the
  failure, with ``message`` and ``suggestion``. HTTP status alone is not enough.
* Generation is a task: POST ``/generation/image-to-model`` returns a
  ``task_id``, then ``GET /tasks/{id}`` is polled (every 1–2 s) until it is
  ``success`` and ``output.model_url`` is a GLB.
* A photo is sent either as a public URL or as a ``file_token`` from
  ``POST /files`` — ours are private storage, so they go through ``/files``.
* Credits are frozen at creation and returned if the task fails or is
  cancelled, so a failed model costs nothing.
* 429 means rate limit (code 1007) or the per-category concurrency cap (2000);
  ``Retry-After`` says how long to wait.
* ``model`` is required, and the docs' own default name (``tripo-v3.1``) is
  rejected — the API wants e.g. ``v3.1-20260211``.
"""

from __future__ import annotations

import asyncio
import random
from typing import Any

import httpx
import structlog

from app.config import settings

log = structlog.get_logger(__name__)

_TIMEOUT = httpx.Timeout(60.0, connect=10.0)
_MAX_ATTEMPTS = 4
_POLL_SECONDS = 2.0
_POLL_TIMEOUT_SECONDS = 300.0  # the docs suggest ~5 minutes

# Task states that end a task without a model.
_DEAD_STATES = {
    "failed": "Model yaratilmadi",
    "cancelled": "Model yaratish bekor qilindi",
    "banned": "Rasm kontent siyosatiga mos kelmaydi",
    "expired": "Natija muddati tugadi",
}


class TripoError(Exception):
    """A Tripo call failed. ``code`` is Tripo's own error code, ``request_id`` what support asks for."""

    def __init__(
        self,
        message: str,
        *,
        code: int | None = None,
        status: int | None = None,
        request_id: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status = status
        self.request_id = request_id


def _readable(code: int | None, message: str | None) -> str:
    if code == 2010:
        return "Tripo hisobida kredit yetarli emas"
    if code == 2008:
        return "Rasm kontent siyosatiga mos kelmaydi"
    if code in (2003, 2004):
        return "Rasm noto'g'ri yoki bo'sh (PNG, JPEG yoki WebP kerak)"
    return message or "Tripo xatosi"


class TripoClient:
    def __init__(self, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.api_key = settings.TRIPO_API_KEY
        self.base_url = settings.TRIPO_API_URL.rstrip("/")
        self._transport = transport

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        if not self.api_key:
            raise TripoError("TRIPO_API_KEY not configured")
        headers = {"Authorization": f"Bearer {self.api_key}"}

        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                async with httpx.AsyncClient(timeout=_TIMEOUT, transport=self._transport) as client:
                    response = await client.request(method, f"{self.base_url}{path}", headers=headers, **kwargs)
            except httpx.HTTPError as exc:
                log.error("tripo_transport_error", path=path, error=str(exc))
                raise TripoError(f"Tripo unreachable: {exc}") from exc

            if response.status_code == 429 and attempt < _MAX_ATTEMPTS:
                delay = self._retry_delay(response, attempt)
                log.warning("tripo_rate_limited", path=path, attempt=attempt, retry_in=round(delay, 2))
                await asyncio.sleep(delay)
                continue
            break

        try:
            body = response.json()
        except ValueError:
            body = {}
        code = body.get("code") if isinstance(body, dict) else None
        if response.status_code != 200 or code != 0:
            request_id = body.get("request_id") if isinstance(body, dict) else None
            message = body.get("message") if isinstance(body, dict) else None
            log.error("tripo_error", path=path, status=response.status_code, code=code, request_id=request_id)
            raise TripoError(
                _readable(code, message or f"Tripo HTTP {response.status_code}"),
                code=code,
                status=response.status_code,
                request_id=request_id,
            )
        return body.get("data") or {}

    @staticmethod
    def _retry_delay(response: httpx.Response, attempt: int) -> float:
        retry_after = response.headers.get("Retry-After")
        if retry_after and retry_after.isdigit():
            return min(float(retry_after), 30.0)
        return min(2.0 ** (attempt - 1), 30.0) + random.uniform(0, 0.5)

    async def upload_image(self, data: bytes, filename: str, content_type: str) -> str:
        """Upload a photo (PNG/JPEG, up to 20 MB) and get the ``file_token`` to build from."""
        out = await self._request("POST", "/files", files={"file": (filename, data, content_type)})
        token = out.get("file_token")
        if not token:
            raise TripoError("Tripo did not return a file token")
        return token

    async def create_model_from_image(
        self,
        file_token: str,
        *,
        texture: bool = True,
        pbr: bool = True,
        auto_size: bool = True,
    ) -> str:
        """Start the build; returns the task id.

        ``auto_size`` scales the model to real-world metres, which is what a piece
        of furniture placed in a room needs. ``delight`` (on by default) strips
        the photo's baked-in shadows before texturing.
        """
        payload = {
            "input": file_token,
            "model": settings.TRIPO_MODEL,
            "texture": texture,
            "pbr": pbr,
            "auto_size": auto_size,
        }
        out = await self._request("POST", "/generation/image-to-model", json=payload)
        task_id = out.get("task_id")
        if not task_id:
            raise TripoError("Tripo did not return a task id")
        log.info("tripo_task_created", task_id=task_id)
        return task_id

    async def get_task(self, task_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/tasks/{task_id}")

    async def wait_for_model(
        self,
        task_id: str,
        *,
        poll_seconds: float = _POLL_SECONDS,
        timeout_seconds: float = _POLL_TIMEOUT_SECONDS,
    ) -> dict[str, Any]:
        """Poll to the end. Returns the task (``output.model_url`` is the GLB) or raises."""
        waited = 0.0
        while waited <= timeout_seconds:
            task = await self.get_task(task_id)
            status = task.get("status")
            if status == "success":
                if not (task.get("output") or {}).get("model_url"):
                    raise TripoError("Tripo finished without a model file")
                log.info("tripo_task_done", task_id=task_id, credits=task.get("credits_consumed"))
                return task
            if status in _DEAD_STATES:
                code = task.get("error_code")
                log.error("tripo_task_failed", task_id=task_id, status=status, error_code=code)
                raise TripoError(_readable(code, task.get("error_message") or _DEAD_STATES[status]), code=code)
            await asyncio.sleep(poll_seconds)
            waited += poll_seconds
        raise TripoError("Model juda uzoq yaratildi. Keyinroq qayta urinib ko'ring.")

    async def balance(self) -> float:
        """Credits available — free, so safe for a health check."""
        return float((await self._request("GET", "/account/balance")).get("balance", 0))


def get_tripo_client() -> TripoClient:
    return TripoClient()
