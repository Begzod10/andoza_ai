from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserModel(Base):
    """A 3D model (GLB) a user imported into the studio.

    Unlike the wallpaper library this is personal, not global: the "Mening"
    shelf shows only your own uploads. Before this table existed the model
    bytes lived solely in the browser's IndexedDB, so clearing site data (or
    opening the project on another device) silently lost every import — the
    server copy is what makes an upload durable and reusable.
    """

    __tablename__ = "user_models"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Catalog chip the model is filed under ('divan', 'stol', …); free-form so
    # the frontend can grow categories without a migration. NULL = 'boshqa'.
    category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 'pol' | 'devor' | 'ship' — where a placed instance sits.
    placement: Mapped[str | None] = mapped_column(String(16), nullable=True)
    price_uzs: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # Import-time normalisation the viewer needs to rebuild the entry exactly:
    # the scale factor applied to the raw file and the resulting footprint.
    scale: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    size_w_m: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    size_d_m: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    size_h_m: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    has_textures: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Storage key of the GLB (S3 object key, or path under MEDIA_ROOT)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False)
    # Optional JPEG preview rendered at import time
    thumb_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_type: Mapped[str] = mapped_column(String(60), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Content hash — re-importing the same file updates the existing entry
    # instead of storing the bytes twice. Per-user, unlike wallpapers: two
    # users importing the same chair each keep their own copy and metadata.
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
