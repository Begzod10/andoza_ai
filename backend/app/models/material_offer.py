from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MaterialOffer(Base):
    """A single store's offer (price/stock/delivery) for a material.

    The same material can be offered by several stores at different prices,
    which powers the mobile Do'kon dealer-comparison view.
    """

    __tablename__ = "material_offers"
    __table_args__ = (
        UniqueConstraint("material_id", "store_id", name="uq_material_offer"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("materials.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stores.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    price_uzs: Mapped[int] = mapped_column(BigInteger, nullable=False)
    in_stock: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    delivery_days: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships (one-directional; no edits needed on Material/Store)
    material: Mapped["Material"] = relationship(  # noqa: F821
        "Material",
        lazy="select",
    )
    store: Mapped["Store"] = relationship(  # noqa: F821
        "Store",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<MaterialOffer id={self.id} material_id={self.material_id} "
            f"store_id={self.store_id} price_uzs={self.price_uzs}>"
        )
