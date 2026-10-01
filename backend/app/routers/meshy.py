"""API endpoints for Meshy image-to-3D conversion integration."""

from __future__ import annotations

import uuid as uuid_module
from typing import Annotated

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.v1.deps import DbSession, get_current_user
from app.core.cache import get_redis
from app.core.storage import absolute_media_url, upload_file
from app.models import User
from app.models.media_job import MediaJob
from app.services.meshy import MeshyError, get_meshy_client

logger = structlog.get_logger(__name__)

# Mounted twice in main.py: /api/v1/meshy (what the web app calls, like every
# other router) and /api/meshy (the path this router originally lived at).
router = APIRouter(prefix="/meshy", tags=["meshy"])

# Meshy deletes generated assets after 3 days and its download links are signed
# and expire sooner, so a model the studio is going to keep is copied to our own
# storage the first time we see the task succeed.
_MAX_GLB_BYTES = 100 * 1024 * 1024
_STORED_TTL_SECONDS = 30 * 24 * 3600


async def _require_owner(db, task_id: str, user: User) -> None:
    """Meshy tasks belong to one shared API key, so without this any signed-in
    user could read another's task by id. Missing and foreign both answer 404,
    like GET /jobs/{id}."""
    row = (await db.execute(select(MediaJob).where(MediaJob.id == task_id))).scalar_one_or_none()
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")


async def _own_glb(request: Request, user: User, task_id: str, model_urls: dict[str, str]) -> dict[str, str]:
    """Swap Meshy's expiring GLB link for a copy in our storage (idempotent per task)."""
    glb = model_urls.get("glb")
    if not glb:
        return model_urls

    redis = get_redis()
    cache_key = f"meshy:stored:{task_id}"
    ref = await redis.get(cache_key)
    if isinstance(ref, bytes):
        ref = ref.decode()
    if not ref:
        try:
            async with httpx.AsyncClient(timeout=120.0) as http:
                fetched = await http.get(glb)
                fetched.raise_for_status()
            data = fetched.content
            if not data or len(data) > _MAX_GLB_BYTES:
                raise ValueError(f"unexpected GLB size: {len(data)} bytes")
            key = f"meshy-models/{user.id}/{task_id}.glb"
            stored = await upload_file(data, key, content_type="model/gltf-binary")
        except Exception as exc:  # best effort: keep Meshy's link rather than fail a finished task
            logger.warning("meshy_glb_copy_failed", task_id=task_id, error=str(exc))
            return model_urls
        ref = stored if stored.startswith("http") else key
        await redis.set(cache_key, ref, ex=_STORED_TTL_SECONDS)

    return {**model_urls, "glb": absolute_media_url(request, ref) or glb}


class ConvertImageTo3DRequest(BaseModel):
    """Request to convert room image to 3D model."""

    image_url: str = Field(..., description="Public URL to room/object image")
    enable_pbr: bool = Field(
        True, description="Enable physically-based rendering textures"
    )
    wait_for_completion: bool = Field(
        False,
        description="If true, wait for completion (async). If false, return task_id immediately.",
    )


class ConvertImageTo3DResponse(BaseModel):
    """Response with 3D conversion task info."""

    task_id: str
    status: str  # 'RUNNING' | 'SUCCEEDED' | 'FAILED'
    model_urls: dict[str, str] = Field(default_factory=dict)
    message: str = ""


class TaskStatusResponse(BaseModel):
    """Response with task polling info."""

    task_id: str
    status: str
    model_urls: dict[str, str] = Field(default_factory=dict)
    error: str = ""
    progress: int = 0


def _failure_text(task: dict) -> str:
    err = task.get("task_error")
    return (err.get("message") if isinstance(err, dict) else None) or "Unknown error"


@router.post("/convert", response_model=ConvertImageTo3DResponse)
async def convert_image_to_3d(
    req: ConvertImageTo3DRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: DbSession,
) -> ConvertImageTo3DResponse:
    """Convert room image to 3D model using Meshy AI.

    Takes a public URL to a room/furniture image and initiates 3D model generation.
    Returns task info for polling status.

    Args:
        req: Image URL and options
        user: Authenticated user

    Returns:
        Task ID and initial status for polling

    Raises:
        HTTPException: If image URL is invalid or Meshy API fails
    """
    if not req.image_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="image_url is required",
        )

    try:
        meshy = get_meshy_client()
        result = await meshy.convert_image_to_3d(
            image_url=req.image_url,
            wait=req.wait_for_completion,
            enable_pbr=req.enable_pbr,
        )

        if result.get("task_id"):
            db.add(MediaJob(id=result["task_id"], user_id=user.id))

        return ConvertImageTo3DResponse(
            task_id=result.get("task_id", ""),
            status=result.get("status", "RUNNING"),
            model_urls=result.get("model_urls", {}),
            message="Conversion initiated" if result.get("status") == "RUNNING"
            else "Conversion completed",
        )

    except MeshyError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Meshy API error: {str(e)}",
        ) from e


@router.get("/task/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(
    task_id: str,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    db: DbSession,
) -> TaskStatusResponse:
    """Poll task status.

    Args:
        task_id: Meshy task ID from convert endpoint
        user: Authenticated user

    Returns:
        Current task status and model URLs if ready

    Raises:
        HTTPException: If task not found or API error
    """
    await _require_owner(db, task_id, user)
    try:
        meshy = get_meshy_client()
        task = await meshy.get_task(task_id)
        task_status = task.get("status", "UNKNOWN")
        model_urls = task.get("model_urls", {})
        if task_status == "SUCCEEDED":
            model_urls = await _own_glb(request, user, task_id, model_urls)

        return TaskStatusResponse(
            task_id=task_id,
            status=task_status,
            model_urls=model_urls,
            error=_failure_text(task) if task_status in ("FAILED", "CANCELED") else "",
            progress=int(task.get("progress") or 0),
        )

    except MeshyError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Meshy API error: {str(e)}",
        ) from e


@router.post("/wait/{task_id}", response_model=ConvertImageTo3DResponse)
async def wait_for_task(
    task_id: str,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    db: DbSession,
) -> ConvertImageTo3DResponse:
    """Wait for task completion (blocking, capped well under common
    reverse-proxy/load-balancer idle-timeout defaults — see module docstring
    note below on why this is a partial mitigation, not a full fix).

    Args:
        task_id: Meshy task ID
        user: Authenticated user

    Returns:
        Completed task info with model download URLs

    Raises:
        HTTPException: If timeout or task failed
    """
    await _require_owner(db, task_id, user)
    try:
        meshy = get_meshy_client()
        # Was max_polls=60 x poll_interval=5.0 = 300s (5 min) — long enough
        # that a browser or reverse proxy could kill the connection out from
        # under this request. The frontend (Image3DConverter.tsx via
        # waitForMeshyTask in lib/api.ts) awaits this endpoint once and has
        # no re-poll/retry logic of its own for a "still processing"
        # response, so we cannot safely return early with partial state —
        # that would surface to the user as a hard error. Until the frontend
        # gains its own re-poll loop against GET /api/meshy/task/{task_id}
        # (which already exists and is client-poll-friendly), the safest
        # change available at this call site is shrinking the blocking
        # window to comfortably clear common proxy/LB idle-timeout defaults
        # (60s) while keeping today's blocking-until-done semantics.
        task = await meshy.wait_for_completion(task_id, max_polls=11, poll_interval=5.0)

        model_urls = await _own_glb(request, user, task_id, task.get("model_urls", {}))
        return ConvertImageTo3DResponse(
            task_id=task_id,
            status=task.get("status", "UNKNOWN"),
            model_urls=model_urls,
            message="3D model ready for download",
        )

    except TimeoutError as e:
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail=f"Task did not complete in time: {str(e)}",
        ) from e
    except MeshyError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Meshy API error: {str(e)}",
        ) from e
