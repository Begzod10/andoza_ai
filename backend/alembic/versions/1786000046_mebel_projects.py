"""mebel: furniture workshop projects, price books, sheet-goods material categories

Revision ID: 1786000046
Revises: 1786000045
Create Date: 2026-10-29 00:00:00.000000

``material_category`` is a real Postgres enum, so the five sheet-goods
categories go in with ``ALTER TYPE ... ADD VALUE`` (see 1786000005 for why this
is safe inside Alembic's transaction on PostgreSQL 12+, and the autocommit
fallback for older servers). Downgrade drops the two tables but leaves the
enum values: PostgreSQL cannot remove an enum value, and rebuilding the type
would have to decide what to do with materials already filed under them.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "1786000046"
down_revision: Union[str, None] = "1786000045"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_CATEGORIES = ("ldsp", "mdf", "hdf", "kromka", "furnitura")


def upgrade() -> None:
    op.create_table(
        "furniture_projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("data", postgresql.JSONB(), nullable=False),
        sa.Column("schema_version", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_furniture_projects_user_id", "furniture_projects", ["user_id"])
    op.create_table(
        "price_books",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("data", postgresql.JSONB(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    bind = op.get_bind()
    statements = [sa.text(f"ALTER TYPE material_category ADD VALUE IF NOT EXISTS '{v}'") for v in NEW_CATEGORIES]
    if bind.dialect.server_version_info >= (12,):
        for stmt in statements:
            bind.execute(stmt)
    else:
        with bind.engine.connect() as conn:
            conn = conn.execution_options(isolation_level="AUTOCOMMIT")
            for stmt in statements:
                conn.execute(stmt)


def downgrade() -> None:
    op.drop_table("price_books")
    op.drop_index("ix_furniture_projects_user_id", table_name="furniture_projects")
    op.drop_table("furniture_projects")
