from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SeedMarker(Base):
    """A one-word fact a seed leaves behind for the next deploy.

    ``demo_stores_removed``: someone ran ``python -m app.seed_demo_stores --remove``,
    so the deploy must not seed the demo stores again (``--force`` clears it). Kept in
    the database, next to the rows it guards, so it survives redeploys and goes with
    the data in a backup/restore.
    """

    __tablename__ = "seed_markers"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
