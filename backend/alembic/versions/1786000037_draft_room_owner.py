"""draft_rooms.user_id: a wizard draft belongs to the user who started it

Revision ID: 1786000037
Revises: 1786000036
Create Date: 2026-10-12 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "1786000037"
down_revision: Union[str, None] = "1786000036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "draft_rooms",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_draft_rooms_user_id", "draft_rooms", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_draft_rooms_user_id", table_name="draft_rooms")
    op.drop_column("draft_rooms", "user_id")
