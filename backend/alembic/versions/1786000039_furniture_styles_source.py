"""furniture.styles_source: who set the styles (manual / ai / null = never set)

Revision ID: 1786000039
Revises: 1786000038
Create Date: 2026-10-19 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "1786000039"
down_revision: Union[str, None] = "1786000038"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("furniture", sa.Column("styles_source", sa.String(10), nullable=True))
    # Styles that already exist were set by a person.
    op.execute("UPDATE furniture SET styles_source = 'manual' WHERE styles <> '{}'")


def downgrade() -> None:
    op.drop_column("furniture", "styles_source")
