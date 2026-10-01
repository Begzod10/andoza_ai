"""Media processing Celery tasks – Phase 3 stubs.

These tasks are intentionally left as stubs so the task signatures and queue
routing are established before the full AI pipeline is implemented in Phase 3.
"""
from __future__ import annotations

import logging

from celery_app import app

logger = logging.getLogger(__name__)


@app.task(
    name="app.tasks.media.process_photo",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    queue="media",
)
def process_photo(self, photo_key: str, room_id: str) -> dict:
    """Placeholder task for Phase 3 photo processing pipeline.

    Will eventually:
    - Download the photo from S3
    - Run segmentation / style-transfer via the AI GPU queue
    - Upload processed variants back to S3
    - Update the room record in the database

    Args:
        photo_key: S3 object key of the original uploaded photo.
        room_id:   UUID string of the Room this photo belongs to.

    Returns:
        A status dict that will be stored as the Celery task result.
    """
    logger.info(
        "process_photo invoked (stub) – phase 3 not yet implemented",
        extra={"photo_key": photo_key, "room_id": room_id},
    )
    return {"status": "pending", "photo_key": photo_key, "room_id": room_id}


@app.task(
    name="app.tasks.media.convert_room_scan_to_glb",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="converter",
)
def convert_room_scan_to_glb(self, room_id: str, usdz_key: str) -> dict:
    """Build a room's studio reference-overlay GLB and record glb_path on it.

    The GLB is generated from the room's *parametric* scan data (floor polygon,
    ceiling height, detected-object boxes) — the uploaded ``.usdz`` is archived
    but never parsed, because no USD reader can run on the production CPU (see
    `app.core.room_scan_glb`). ``usdz_key`` is still taken: it names the stored
    capture and the GLB is stored beside it, so the public signature, the queue
    routing and the storage keys are all unchanged.

    Best-effort: any failure just leaves glb_path null and the studio still
    renders from the parametric data. Runs on the dedicated ``converter`` queue.
    """
    import asyncio

    return asyncio.run(_convert_room_scan_to_glb(room_id, usdz_key))


@app.task(
    name="app.tasks.media.convert_room_scan_object_to_glb",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="converter",
)
def convert_room_scan_object_to_glb(self, room_id: str, object_index: int, usdz_key: str) -> dict:
    """Phase 6: build a detected object's placeholder GLB and attach it to
    ``room_scan.objects[object_index].glb_path``. Same story as the room task —
    the Object-Capture ``.usdz`` is archived, not parsed; the box comes from the
    object's stored dimensions. Best-effort."""
    import asyncio

    return asyncio.run(_convert_room_scan_object_to_glb(room_id, object_index, usdz_key))


async def _load_room_scan(room_id: str) -> tuple[dict, dict, float] | None:
    """Return ``(room_scan, geometry, ceiling_h)`` for *room_id*, or None if the
    room is gone. This is the whole input to the GLB build — see
    `app.core.room_scan_glb` for why the archived ``.usdz`` is not read."""
    async def _read(db, room):
        return (
            dict(room.room_scan or {}),
            dict(room.geometry or {}),
            float(room.ceiling_h or 0.0),
        )

    return await _with_room(room_id, _read)


async def _store_glb(glb: bytes, usdz_key: str) -> str:
    """Upload *glb* next to the archived capture and return its storage key."""
    from app.core.storage import upload_file

    glb_key = usdz_key.rsplit(".", 1)[0] + ".glb"
    await upload_file(glb, glb_key, content_type="model/gltf-binary")
    return glb_key


async def _with_room(room_id: str, fn):
    """Load the room in its own engine/session, hand it to ``fn(db, room)`` and
    commit. Returns ``fn``'s result, or None if the room no longer exists.

    The task runs in a Celery process with its own event loop, so it cannot
    share the API's engine.
    """
    import uuid as _uuid

    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.config import settings
    from app.models.room import Room

    engine = create_async_engine(settings.DATABASE_URL)  # own process/loop
    try:
        Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with Session() as db:
            room = (
                await db.execute(select(Room).where(Room.id == _uuid.UUID(room_id)))
            ).scalar_one_or_none()
            if room is None:
                return None
            out = await fn(db, room)
            await db.commit()
            return out
    finally:
        await engine.dispose()


async def _update_room_scan(room_id: str, mutate) -> bool:
    """Apply ``mutate(scan_dict)`` to a copy of room_scan, reassign (JSONB change
    detection) and commit. Returns False if the room is gone."""
    async def _apply(db, room):
        scan = dict(room.room_scan or {})
        mutate(scan)
        room.room_scan = scan
        return True

    return bool(await _with_room(room_id, _apply))


async def _convert_room_scan_to_glb(room_id: str, usdz_key: str) -> dict:
    import asyncio

    from app.core.room_scan_glb import build_room_scan_glb

    loaded = await _load_room_scan(room_id)
    if loaded is None:
        return {"status": "room_gone", "room_id": room_id}
    scan, geometry, ceiling_h = loaded

    # Pure numpy/trimesh arithmetic — safe to run inline now that no native USD
    # code is involved; still off the event loop since it is CPU-bound.
    glb = await asyncio.to_thread(
        build_room_scan_glb, geometry, ceiling_h, scan.get("objects")
    )
    if not glb:
        logger.warning("convert_room_scan_to_glb: build failed room=%s", room_id)
        return {"status": "failed", "room_id": room_id}

    glb_key = await _store_glb(glb, usdz_key)

    def _set(scan: dict) -> None:
        scan["glb_path"] = glb_key

    if not await _update_room_scan(room_id, _set):
        return {"status": "room_gone", "room_id": room_id}
    logger.info("convert_room_scan_to_glb: ok room=%s glb=%s", room_id, glb_key)
    return {"status": "ok", "room_id": room_id, "glb_path": glb_key}


async def _convert_room_scan_object_to_glb(room_id: str, object_index: int, usdz_key: str) -> dict:
    import asyncio

    from app.core.room_scan_glb import build_object_glb

    loaded = await _load_room_scan(room_id)
    if loaded is None:
        return {"status": "room_gone", "room_id": room_id}
    objects = list((loaded[0].get("objects") or []))
    if not 0 <= object_index < len(objects):
        logger.warning(
            "convert_room_scan_object_to_glb: bad index room=%s idx=%s", room_id, object_index
        )
        return {"status": "failed", "room_id": room_id}

    glb = await asyncio.to_thread(build_object_glb, objects[object_index])
    if not glb:
        logger.warning(
            "convert_room_scan_object_to_glb: build failed room=%s idx=%s",
            room_id, object_index,
        )
        return {"status": "failed", "room_id": room_id}

    glb_key = await _store_glb(glb, usdz_key)

    def _set(scan: dict) -> None:
        objs = list(scan.get("objects") or [])
        if 0 <= object_index < len(objs):
            objs[object_index] = {**objs[object_index], "glb_path": glb_key}
            scan["objects"] = objs

    if not await _update_room_scan(room_id, _set):
        return {"status": "room_gone", "room_id": room_id}
    logger.info(
        "convert_room_scan_object_to_glb: ok room=%s idx=%s glb=%s",
        room_id, object_index, glb_key,
    )
    return {"status": "ok", "room_id": room_id, "object_index": object_index, "glb_path": glb_key}


@app.task(
    name="app.tasks.media.render_room_image",
    bind=True,
    queue="media",
)
def render_room_image(self, user_id: str, source_key: str, content_type: str, prompt: str | None) -> dict:
    """Render a studio screenshot with MyArchitectAI and keep the result.

    Not retried: the API refunds a failed generation, but a retry would be a
    second charge for what the user asked for once. A failure comes back as
    ``{"status": "failed", ...}`` so ``GET /jobs/{id}`` can show it — a raised
    exception is not JSON-serialisable in that response.
    """
    import asyncio

    return asyncio.run(_render_room_image(user_id, source_key, content_type, prompt))


async def _keep_remote_image(user_id: str, url: str) -> tuple[str, str]:
    """Copy a provider-hosted image into our storage. The provider's link is not
    ours to keep alive. Returns (storage key, public url)."""
    import uuid

    import httpx

    from app.core.storage import upload_file

    async with httpx.AsyncClient(timeout=60.0) as http:
        fetched = await http.get(url)
        fetched.raise_for_status()
    key = f"renders/{user_id}/{uuid.uuid4()}.jpg"
    return key, await upload_file(fetched.content, key, content_type="image/jpeg")


async def _render_room_image(user_id: str, source_key: str, content_type: str, prompt: str | None) -> dict:
    from app.core.storage import delete_file, download_file
    from app.services.myarchitect import MyArchitectError, get_myarchitect_client, to_data_uri

    try:
        source = await download_file(source_key)
        client = get_myarchitect_client()
        image = to_data_uri(source, content_type)

        # No prompt from the user: have the API describe the scene (one cent).
        # Best-effort — a failed description must not cost the user the render.
        used_prompt = prompt
        if not used_prompt:
            try:
                used_prompt = await client.auto_prompt(image)
            except MyArchitectError as exc:
                logger.warning("render_room_image auto_prompt skipped user=%s: %s", user_id, exc)
                used_prompt = None

        result_url = await client.render_interior(image, prompt=used_prompt, output_format="jpg")
        key, url = await _keep_remote_image(user_id, result_url)
        return {"status": "ok", "key": key, "url": url, "prompt": used_prompt}
    except MyArchitectError as exc:
        logger.error("render_room_image failed user=%s request_id=%s: %s", user_id, exc.request_id, exc)
        return {"status": "failed", "error": str(exc), "request_id": exc.request_id}
    except Exception as exc:  # storage / download failures
        logger.exception("render_room_image error user=%s", user_id)
        return {"status": "failed", "error": str(exc)}
    finally:
        try:
            await delete_file(source_key)
        except Exception:
            logger.warning("render_room_image: source cleanup failed key=%s", source_key)


@app.task(
    name="app.tasks.media.relight_render",
    bind=True,
    queue="media",
)
def relight_render(self, user_id: str, render_key: str, lighting: str) -> dict:
    """Relight a finished render (a stored ``renders/{user}/...`` image) with one
    of the interior lighting moods. Not retried, for the same reason as
    ``render_room_image``. The original is kept, so the user can step back."""
    import asyncio

    return asyncio.run(_relight_render(user_id, render_key, lighting))


async def _relight_render(user_id: str, render_key: str, lighting: str) -> dict:
    from app.core.storage import download_file
    from app.services.myarchitect import MyArchitectError, get_myarchitect_client, to_data_uri

    try:
        source = await download_file(render_key)
        result_url = await get_myarchitect_client().set_atmosphere(to_data_uri(source, "image/jpeg"), lighting)
        key, url = await _keep_remote_image(user_id, result_url)
        return {"status": "ok", "key": key, "url": url, "lighting": lighting}
    except MyArchitectError as exc:
        logger.error("relight_render failed user=%s request_id=%s: %s", user_id, exc.request_id, exc)
        return {"status": "failed", "error": str(exc), "request_id": exc.request_id}
    except Exception as exc:
        logger.exception("relight_render error user=%s", user_id)
        return {"status": "failed", "error": str(exc)}


@app.task(
    name="app.tasks.media.generate_model_from_photo",
    bind=True,
    queue="media",
)
def generate_model_from_photo(self, user_id: str, source_key: str, content_type: str) -> dict:
    """Build a 3D model (GLB) from a furniture photo with Tripo and keep it.

    Takes 1–2 minutes. Not retried: Tripo returns the credits of a failed task, but
    a retry would be a second charge for what the user asked for once. Failure
    comes back as ``{"status": "failed", ...}`` for ``GET /jobs/{id}``.
    """
    import asyncio

    return asyncio.run(_generate_model_from_photo(user_id, source_key, content_type))


async def _generate_model_from_photo(user_id: str, source_key: str, content_type: str) -> dict:
    import uuid

    import httpx

    from app.core.storage import delete_file, download_file, upload_file
    from app.services.tripo import TripoError, get_tripo_client

    try:
        photo = await download_file(source_key)
        client = get_tripo_client()
        ext = "png" if content_type == "image/png" else "webp" if content_type == "image/webp" else "jpg"
        token = await client.upload_image(photo, f"photo.{ext}", content_type)
        task_id = await client.create_model_from_image(token)
        task = await client.wait_for_model(task_id)

        # Tripo's CDN link expires — copy the GLB into our storage.
        async with httpx.AsyncClient(timeout=120.0) as http:
            fetched = await http.get(task["output"]["model_url"])
            fetched.raise_for_status()
        key = f"photo-models/{user_id}/{uuid.uuid4()}.glb"
        url = await upload_file(fetched.content, key, content_type="model/gltf-binary")
        return {"status": "ok", "key": key, "url": url, "credits": task.get("credits_consumed")}
    except TripoError as exc:
        logger.error("generate_model_from_photo failed user=%s code=%s request_id=%s: %s", user_id, exc.code, exc.request_id, exc)
        return {"status": "failed", "error": str(exc), "request_id": exc.request_id}
    except Exception as exc:  # storage / download failures
        logger.exception("generate_model_from_photo error user=%s", user_id)
        return {"status": "failed", "error": str(exc)}
    finally:
        try:
            await delete_file(source_key)
        except Exception:
            logger.warning("generate_model_from_photo: source cleanup failed key=%s", source_key)
