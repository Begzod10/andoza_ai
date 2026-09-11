from __future__ import annotations

import os
from functools import partial
from pathlib import Path

import anyio.to_thread
import boto3
from botocore.client import Config
from starlette.requests import Request

from app.config import settings

_s3_client = None


# ---------------------------------------------------------------------------
# Local disk fallback
#
# Without S3 credentials every upload would 502, so files are written under
# MEDIA_ROOT and served by the app's /media mount instead. Same call sites,
# same returned URL shape — only the destination differs.
# ---------------------------------------------------------------------------


def _media_path(key: str) -> Path:
    """Resolve *key* under MEDIA_ROOT, refusing to escape it."""
    root = Path(settings.MEDIA_ROOT).resolve()
    path = (root / key).resolve()
    if not str(path).startswith(str(root) + os.sep):
        raise ValueError(f"Refusing to write outside MEDIA_ROOT: {key!r}")
    return path


def _local_upload(file_bytes: bytes, key: str) -> str:
    path = _media_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(file_bytes)
    return f"{settings.MEDIA_URL_PREFIX}/{key}"


def _local_delete(key: str) -> None:
    path = _media_path(key)
    if path.exists():
        path.unlink()


def _get_s3():
    """Return (and lazily create) the boto3 S3 client."""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
            config=Config(signature_version="s3v4"),
        )
    return _s3_client


async def upload_file(file_bytes: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    """Store *file_bytes* under *key* and return its URL.

    Goes to S3 when it is configured, to MEDIA_ROOT otherwise (the returned
    URL is then relative to the API host, e.g. ``/media/wallpapers/x.jpg``).

    The actual blocking call (a synchronous disk write or a synchronous
    boto3 network round-trip) is offloaded to a worker thread via
    ``anyio.to_thread.run_sync`` so it never blocks the event loop that
    every other request on this process shares.
    """
    if not settings.s3_configured:
        return await anyio.to_thread.run_sync(_local_upload, file_bytes, key)
    s3 = _get_s3()
    put_object = partial(
        s3.put_object,
        Bucket=settings.S3_BUCKET,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
        ACL="public-read",
    )
    await anyio.to_thread.run_sync(put_object)
    if settings.S3_ENDPOINT_URL:
        public_url = f"{settings.S3_ENDPOINT_URL}/{settings.S3_BUCKET}/{key}"
    else:
        public_url = (
            f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{key}"
        )
    return public_url


async def delete_file(key: str) -> None:
    """Remove a stored object by *key*, from wherever it was written.

    Like :func:`upload_file`, the blocking disk/network call runs in a
    worker thread so it does not stall the event loop.
    """
    if not settings.s3_configured:
        await anyio.to_thread.run_sync(_local_delete, key)
        return
    s3 = _get_s3()
    delete_object = partial(s3.delete_object, Bucket=settings.S3_BUCKET, Key=key)
    await anyio.to_thread.run_sync(delete_object)


def public_url(storage_key: str) -> str:
    """URL for a stored key — S3 objects are already absolute, local keys are
    relative to MEDIA_URL_PREFIX."""
    if storage_key.startswith("http://") or storage_key.startswith("https://"):
        return storage_key
    return f"{settings.MEDIA_URL_PREFIX}/{storage_key}"


def absolute_media_url(request: Request, storage_key: str | None) -> str | None:
    """Resolve a stored key to an absolute URL the client can fetch directly.

    Shared by every router that serves an uploaded/captured image (wallpapers,
    room thumbnails, ...) so the host-relative-vs-absolute distinction between
    local disk and S3 storage is handled in exactly one place.
    """
    if not storage_key:
        return None
    url = public_url(storage_key)
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return f"{str(request.base_url).rstrip('/')}{url}"
