"""Add room_renders: every finished render, relight and 4K copy, kept per user

Revision ID: 1786000009
Revises: 1786000008
Create Date: 2026-10-02 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "1786000009"
down_revision: Union[str, None] = "1786000008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "room_renders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("room_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("key", sa.String(300), nullable=False),
        sa.Column("url", sa.String(600), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("lighting", sa.String(40), nullable=True),
        sa.Column("prompt", sa.Text, nullable=True),
        sa.Column("panorama", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("parent_key", sa.String(300), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("key", name="uq_room_renders_key"),
    )
    op.create_index("ix_room_renders_user_id", "room_renders", ["user_id"])
    op.create_index("ix_room_renders_room_id", "room_renders", ["room_id"])


def downgrade() -> None:
    op.drop_index("ix_room_renders_room_id", table_name="room_renders")
    op.drop_index("ix_room_renders_user_id", table_name="room_renders")
    op.drop_table("room_renders")
