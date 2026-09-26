from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MediaJob(Base):
    """Ownership record for a background media-processing Celery task.

    ``id`` is the Celery task id (a UUID4 string) returned from
    ``process_photo.delay(...)`` in ``app.routers.media``. Celery's
    ``AsyncResult`` alone has no notion of who owns a task — any
    authenticated user who learns/guesses a job id could otherwise poll
    another user's processing status and result payload (IDOR). This row is
    written at enqueue time so ``GET /jobs/{job_id}`` can verify the caller
    actually owns the job before returning anything about it.

    ``id`` is stored as a plain string (not a Postgres UUID column) so an
    arbitrary/malformed ``job_id`` from the path fails a normal "no such
    row" lookup instead of raising a DB-level invalid-UUID error.
    """

    __tablename__ = "media_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<MediaJob id={self.id} user_id={self.user_id}>"
