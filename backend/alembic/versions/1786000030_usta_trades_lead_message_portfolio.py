"""More usta trades, a client message on leads, and the usta portfolio

Revision ID: 1786000030
Revises: 1786000023
Create Date: 2026-10-08 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "1786000030"
down_revision: Union[str, None] = "1786000023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_TRADES = (
    "plitkachi",
    "shtukatur",
    "gipsokartonchi",
    "eshik_oyna",
    "isitish_konditsioner",
    "demontaj",
)


def upgrade() -> None:
    # Postgres cannot ADD VALUE inside a transaction block.
    with op.get_context().autocommit_block():
        for trade in NEW_TRADES:
            op.execute(f"ALTER TYPE usta_category ADD VALUE IF NOT EXISTS '{trade}'")

    op.add_column("leads", sa.Column("message", sa.String(500), nullable=True))

    op.create_table(
        "usta_portfolio_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("usta_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ustalar.id", ondelete="CASCADE"), nullable=False),
        sa.Column("image_key", sa.String(500), nullable=False),
        sa.Column("caption", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_usta_portfolio_items_usta_id", "usta_portfolio_items", ["usta_id"])


def downgrade() -> None:
    op.drop_index("ix_usta_portfolio_items_usta_id", table_name="usta_portfolio_items")
    op.drop_table("usta_portfolio_items")
    op.drop_column("leads", "message")
    # Postgres cannot drop a value from an enum type; the new usta_category
    # values are left in place (harmless when unused).
