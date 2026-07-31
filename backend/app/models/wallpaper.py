from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Wallpaper(Base):
    """An uploaded wall image, shared by everyone.

    The library is deliberately global: one person uploads an oboy and every
    user can pick it from then on. Entries live until an admin deletes them,
    so a room saved with a wallpaper keeps rendering after a reload.
    """

    __tablename__ = "wallpapers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Storage key (S3 object key, or path under MEDIA_ROOT for local storage)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(60), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Content hash — re-uploading the same image returns the existing entry
    # instead of filling the library with duplicates.
    sha256: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
