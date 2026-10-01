from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RoomRender(Base):
    """A finished picture from the render API, kept so the user can come back to it.

    One row per picture: the first render of a room, each relit copy and each 4K
    copy. ``parent_key`` ties a relit/4K copy to the picture it came from.
    ``room_id`` is a plain column rather than a foreign key: a render is the
    user's picture and outlives edits to the room, and rooms live in more than
    one table (saved rooms and drafts).
    """

    __tablename__ = "room_renders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    room_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    key: Mapped[str] = mapped_column(String(300), nullable=False, unique=True)
    url: Mapped[str] = mapped_column(String(600), nullable=False)
    # "render" | "relight" | "upscale"
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    lighting: Mapped[str | None] = mapped_column(String(40), nullable=True)
    prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    panorama: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    parent_key: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
