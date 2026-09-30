"""MyArchitectAI integration — photorealistic renders from a studio screenshot.

API: https://portal.myarchitectai.com/docs (OpenAPI at /openapi.json).

Two things about this API shape the client:

* **A 200 is not a success.** Generation runs behind a streamed response, so
  the status is committed before the job finishes. A job that fails midway
  still answers 200, with an ``error`` key where ``output`` should be (and the
  charge already refunded). Only a body holding ``output`` is a result.
* **5 requests/second per key, bursts of 20**, over which it answers 429 (never
  charged). One key serves every user, so a 429 is retried with backoff and
  jitter rather than surfaced.
"""

from __future__ import annotations

import asyncio
import base64
import random
from typing import Any

import httpx
import structlog

from app.config import settings

log = structlog.get_logger(__name__)

# Renders take ~13 s and animations 60–90 s, but the connection is held open the
# whole time, so the read timeout has to outlast the slowest of them.
_TIMEOUT = httpx.Timeout(180.0, connect=10.0)
_MAX_ATTEMPTS = 4
_BASE_DELAY = 1.0

OUTPUT_FORMATS = ("webp", "jpg", "png", "avif")


class MyArchitectError(Exception):
    """A call to MyArchitectAI failed. ``request_id`` is what support asks for."""

    def __init__(self, message: str, *, request_id: str | None = None, status: int | None = None) -> None:
        super().__init__(message)
        self.request_id = request_id
        self.status = status


def to_data_uri(image: bytes, content_type: str = "image/jpeg") -> str:
    """Inline an image the way the API accepts it. Base64 inflates by a third;
    the API's cap is 10 MB per request, so callers keep sources well under 7."""
    return f"data:{content_type};base64,{base64.b64encode(image).decode('ascii')}"


class MyArchitectClient:
    def __init__(self, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.api_key = settings.MYARCHITECT_API_KEY
        self.base_url = settings.MYARCHITECT_API_URL.rstrip("/")
        self._transport = transport

    async def _post(self, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        if not self.api_key:
            raise MyArchitectError("MYARCHITECT_API_KEY not configured")

        headers = {"x-api-key": self.api_key, "Content-Type": "application/json"}
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                async with httpx.AsyncClient(timeout=_TIMEOUT, transport=self._transport) as client:
                    response = await client.post(f"{self.base_url}{path}", json=payload or {}, headers=headers)
            except httpx.HTTPError as exc:
                log.error("myarchitect_transport_error", path=path, error=str(exc))
                raise MyArchitectError(f"MyArchitectAI unreachable: {exc}") from exc

            if response.status_code == 429 and attempt < _MAX_ATTEMPTS:
                delay = _BASE_DELAY * 2 ** (attempt - 1) + random.uniform(0, 0.5)
                log.warning("myarchitect_rate_limited", path=path, attempt=attempt, retry_in=round(delay, 2))
                await asyncio.sleep(delay)
                continue
            break

        body = self._json(response)
        request_id = body.get("requestId") if isinstance(body, dict) else None

        if response.status_code != 200:
            detail = (body.get("error") or body.get("message")) if isinstance(body, dict) else None
            log.error("myarchitect_http_error", path=path, status=response.status_code, request_id=request_id)
            raise MyArchitectError(
                detail or f"MyArchitectAI returned HTTP {response.status_code}",
                request_id=request_id,
                status=response.status_code,
            )
        # 200 with no `output` is a failed generation (already refunded).
        if not isinstance(body, dict) or "output" not in body:
            error = body.get("error") if isinstance(body, dict) else None
            log.error("myarchitect_generation_failed", path=path, request_id=request_id, error=error)
            raise MyArchitectError(str(error or "Generation failed"), request_id=request_id, status=200)

        log.info("myarchitect_ok", path=path, request_id=request_id, cost=body.get("cost"), balance=body.get("balance"))
        return body

    @staticmethod
    def _json(response: httpx.Response) -> Any:
        try:
            return response.json()
        except ValueError:
            # e.g. the plain-text 413 the API sends before its JSON error shape applies
            return {"error": response.text[:200]}

    async def render_interior(self, image: str, *, prompt: str | None = None, output_format: str = "jpg") -> str:
        """Render a 3D view as a photorealistic interior. ``image`` is a public
        HTTPS URL or a data URI. Returns the URL of the rendered image."""
        self._check_format(output_format)
        payload: dict[str, Any] = {"image": image, "outputFormat": output_format}
        if prompt:
            payload["prompt"] = prompt
        return self._output(await self._post("/render/interior", payload))

    async def upscale(self, image: str, *, resolution: str = "4k", output_format: str = "jpg") -> str:
        """Upscale to 4K or 8K. PNG is not available at 8K (the file would exceed
        the API's storage limit)."""
        if resolution not in ("4k", "8k"):
            raise ValueError("resolution must be '4k' or '8k'")
        if resolution == "8k" and output_format == "png":
            raise ValueError("png is not available at 8k; use webp or jpg")
        payload = {"image": image, "targetResolution": resolution, "outputFormat": output_format}
        return self._output(await self._post("/upscale", payload))

    async def animate(self, start_frame: str, prompt: str, *, end_frame: str | None = None) -> str:
        """Short video from one image (or a transition between two). Returns a video URL."""
        payload: dict[str, Any] = {"startFrameUrl": start_frame, "prompt": prompt}
        if end_frame:
            payload["endFrameUrl"] = end_frame
        return self._output(await self._post("/animate", payload))

    async def balance(self) -> float:
        """Remaining balance on the key — free, so safe for a health check."""
        body = await self._post_balance()
        return body["balance"]

    async def _post_balance(self) -> dict[str, Any]:
        # /balance answers {balance} with no `output`, so it skips _post's result check.
        if not self.api_key:
            raise MyArchitectError("MYARCHITECT_API_KEY not configured")
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT, transport=self._transport) as client:
                response = await client.post(
                    f"{self.base_url}/balance", headers={"x-api-key": self.api_key},
                )
        except httpx.HTTPError as exc:
            raise MyArchitectError(f"MyArchitectAI unreachable: {exc}") from exc
        body = self._json(response)
        if response.status_code != 200 or "balance" not in body:
            raise MyArchitectError(f"Balance check failed (HTTP {response.status_code})", status=response.status_code)
        return body

    @staticmethod
    def _check_format(output_format: str) -> None:
        if output_format not in OUTPUT_FORMATS:
            raise ValueError(f"output_format must be one of {OUTPUT_FORMATS}")

    @staticmethod
    def _output(body: dict[str, Any]) -> str:
        output = body["output"]
        # `output` is a URL for every image/video endpoint; tolerate a one-item list.
        if isinstance(output, list) and output:
            output = output[0]
        if not isinstance(output, str) or not output:
            raise MyArchitectError("MyArchitectAI returned an empty output", request_id=body.get("requestId"))
        return output


def get_myarchitect_client() -> MyArchitectClient:
    return MyArchitectClient()
