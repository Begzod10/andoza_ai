"""Meshy API integration for image-to-3D model conversion.

Handles task creation, polling, and model retrieval from Meshy AI.
Documentation: https://docs.meshy.ai/
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import structlog

from app.config import settings

log = structlog.get_logger(__name__)


# Meshy's REST API lives under /openapi/v1. The app shipped with
# https://api.meshy.ai/v2 (in config.py and .env.example), which has never been a
# valid path — every call to it is a 404 — so any deployment still carrying that
# value is pointed at the real one rather than left broken.
DEFAULT_BASE_URL = "https://api.meshy.ai/openapi/v1"
_LEGACY_BASE_URLS = {"https://api.meshy.ai/v2", "https://api.meshy.ai/v1", "https://api.meshy.ai"}

# Terminal task states. CANCELED is one too: a task cancelled on Meshy's side
# never becomes SUCCEEDED, so treating it as "still running" polls until timeout.
_FAILED_STATES = {"FAILED", "CANCELED"}


def normalize_base_url(url: str | None) -> str:
    url = (url or "").strip().rstrip("/")
    if not url or url in _LEGACY_BASE_URLS:
        return DEFAULT_BASE_URL
    return url


class MeshyError(Exception):
    """Raised when Meshy API call fails."""

    pass


def _error_from_response(response: httpx.Response) -> str:
    """A readable reason from a non-2xx Meshy response."""
    try:
        body = response.json()
        detail = body.get("message") if isinstance(body, dict) else None
    except ValueError:
        detail = None
    if response.status_code == 402:
        return "Meshy hisobida mablag' yetarli emas"
    if response.status_code == 429:
        return "Meshy so'rovlar limiti oshdi, birozdan keyin urinib ko'ring"
    return detail or f"Meshy HTTP {response.status_code}"


def _task_error(task: dict[str, Any]) -> str:
    err = task.get("task_error")
    message = err.get("message") if isinstance(err, dict) else None
    return message or task.get("error") or "Unknown error"


class MeshyClient:
    """Client for Meshy image-to-3D conversion API."""

    def __init__(self) -> None:
        self.api_key = settings.MESHY_API_KEY
        self.base_url = normalize_base_url(settings.MESHY_API_URL)
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def image_to_3d(
        self,
        image_url: str,
        enable_pbr: bool = True,
        style: str = "realistic",
    ) -> dict[str, Any]:
        """Create image-to-3D task.

        Args:
            image_url: Public URL to the image
            enable_pbr: Enable physically-based rendering
            style: Output style ('realistic' or 'stylized')

        Returns:
            Task info with task_id, status, etc.

        Raises:
            MeshyError: If API call fails
        """
        if not self.api_key:
            raise MeshyError("MESHY_API_KEY not configured")

        payload = {
            "image_url": image_url,
            "enable_pbr": enable_pbr,
            "style": style,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    f"{self.base_url}/image-to-3d",
                    json=payload,
                    headers=self.headers,
                )
            except httpx.HTTPError as e:
                log.error("meshy_api_error", error=str(e))
                raise MeshyError(f"Failed to create Meshy task: {e}") from e

        if response.status_code >= 400:
            log.error("meshy_api_error", status=response.status_code)
            raise MeshyError(_error_from_response(response))
        task = response.json()
        # The create call answers {"result": "<task id>"}, not a task object.
        task_id = task.get("result") or task.get("id")
        if not task_id:
            raise MeshyError("Meshy did not return a task id")
        log.info("meshy_task_created", task_id=task_id)
        return {**task, "id": task_id}

    async def get_task(self, task_id: str) -> dict[str, Any]:
        """Poll task status.

        Args:
            task_id: Meshy task ID

        Returns:
            Task info including status, model URLs, etc.

        Raises:
            MeshyError: If API call fails
        """
        if not self.api_key:
            raise MeshyError("MESHY_API_KEY not configured")

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/image-to-3d/{task_id}",
                    headers=self.headers,
                )
            except httpx.HTTPError as e:
                log.error("meshy_poll_error", task_id=task_id, error=str(e))
                raise MeshyError(f"Failed to poll Meshy task {task_id}: {e}") from e

        if response.status_code >= 400:
            log.error("meshy_poll_error", task_id=task_id, status=response.status_code)
            raise MeshyError(_error_from_response(response))
        return response.json()

    async def wait_for_completion(
        self,
        task_id: str,
        max_polls: int = 60,
        poll_interval: float = 5.0,
    ) -> dict[str, Any]:
        """Poll until task completes or times out.

        Args:
            task_id: Meshy task ID
            max_polls: Maximum number of polls
            poll_interval: Seconds between polls

        Returns:
            Completed task info with model URLs

        Raises:
            MeshyError: If timeout or API error
            TimeoutError: If max_polls exceeded
        """
        for poll_num in range(max_polls):
            try:
                task = await self.get_task(task_id)
                status = task.get("status")

                log.info(
                    "meshy_poll",
                    task_id=task_id,
                    poll=poll_num + 1,
                    status=status,
                )

                if status == "SUCCEEDED":
                    log.info("meshy_completed", task_id=task_id)
                    return task

                if status in _FAILED_STATES:
                    error = _task_error(task)
                    log.error("meshy_failed", task_id=task_id, status=status, error=error)
                    raise MeshyError(f"Meshy task {status.lower()}: {error}")

                if poll_num < max_polls - 1:
                    await asyncio.sleep(poll_interval)

            except (MeshyError, asyncio.CancelledError):
                raise

        raise TimeoutError(f"Meshy task {task_id} did not complete within {max_polls * poll_interval}s")

    async def convert_image_to_3d(
        self,
        image_url: str,
        wait: bool = True,
        enable_pbr: bool = True,
    ) -> dict[str, Any]:
        """Full pipeline: create task and optionally wait for completion.

        Args:
            image_url: Public URL to room/object image
            wait: Whether to wait for completion (blocking)
            enable_pbr: Enable PBR texturing

        Returns:
            {
                'task_id': str,
                'status': 'SUCCEEDED' | 'RUNNING' | 'FAILED',
                'model_urls': {
                    'glb': str,  # downloadable .glb file
                    'obj': str,  # downloadable .obj file
                    ...
                }
            }

        Raises:
            MeshyError: If conversion fails
        """
        # Create task
        task = await self.image_to_3d(image_url, enable_pbr=enable_pbr)
        task_id = task.get("id")

        if not wait:
            return {"task_id": task_id, "status": "RUNNING"}

        # Wait for completion
        completed = await self.wait_for_completion(task_id)
        return {
            "task_id": task_id,
            "status": completed.get("status"),
            "model_urls": completed.get("model_urls", {}),
        }


# Singleton instance
_meshy_client: MeshyClient | None = None


def get_meshy_client() -> MeshyClient:
    """Get or create Meshy client singleton."""
    global _meshy_client
    if _meshy_client is None:
        _meshy_client = MeshyClient()
    return _meshy_client
