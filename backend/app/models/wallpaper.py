from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Wallpaper(Base):
    """An uploaded wall image, shared by everyone.

    The library is deliberately global by default: one person uploads an
    oboy and every user can pick it from then on. An oboy can optionally
    belong to a shop (the one selling it) — same shape as Furniture.store_id
    — but store_id=None entries stay usable by everyone regardless. Entries
    live until an admin deletes them, so a room saved with a wallpaper keeps
    rendering after a reload.
    """

    __tablename__ = "wallpapers"

    # The same image bytes may legitimately live in more than one design-panel
    # library (e.g. a user uploads the same photo as both a `pol` floor and an
    # `oboy` wall texture), so the sha256 dedup is scoped per `kind` rather than
    # global: uniqueness is on (sha256, kind), not sha256 alone.
    __table_args__ = (
        UniqueConstraint("sha256", "kind", name="uq_wallpapers_sha256_kind"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    store_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stores.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Nullable — global library entries have no associated store",
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # What the image is for: 'oboy' (a pattern), 'suvoq' (a bare wall surface)
    # or 'shpaklovka' (a filled one). They are picked from different panels and
    # should not be offered to each other, so the library is filtered on this
    # rather than merged.
    kind: Mapped[str] = mapped_column(
        String(16), server_default="oboy", default="oboy", index=True, nullable=False
    )
    price_uzs: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
        comment="Retail price in UZS for this wallpaper roll/sqm; admin-entered, optional",
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Free-form admin notes (material, coverage, etc.)",
    )
    width_cm: Mapped[float | None] = mapped_column(
        Numeric(6, 1),
        nullable=True,
        comment="Roll/panel width in cm",
    )
    height_cm: Mapped[float | None] = mapped_column(
        Numeric(6, 1),
        nullable=True,
        comment="Fixed panel height in cm — mural-style oboy sold as one "
                "piece rather than a roll (e.g. a photo wallpaper panel)",
    )
    total_length_m: Mapped[float | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
        comment="Total roll length in metres in stock — repeating-pattern "
                "oboy sold by the metre rather than as a fixed panel",
    )
    # Storage key (S3 object key, or path under MEDIA_ROOT for local storage)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(60), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Which design-panel library this image belongs to (scope bucket):
    # "oboy" (Bo'yoq/Oboy walls), "suvoq", "shpaklovka", or "pol" (floor).
    # Nullable so the column stays backwards-compatible; existing rows are
    # backfilled to "oboy" by the migration. A panel only ever shows entries
    # matching its own kind, so a floor image never leaks into a wall panel.
    kind: Mapped[str | None] = mapped_column(
        String(40),
        nullable=True,
        index=True,
        comment="Design-panel scope bucket: oboy|suvoq|shpaklovka|pol",
    )
    # Content hash — re-uploading the same image into the same `kind` returns
    # the existing entry instead of filling that library with duplicates.
    # Uniqueness is the (sha256, kind) pair (see __table_args__), so the same
    # image can still be added to a different panel's library.
    sha256: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
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

    # Relationships
    store: Mapped["Store | None"] = relationship(  # noqa: F821
        "Store",
        back_populates="wallpapers",
        lazy="select",
    )
