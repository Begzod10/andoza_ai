"""Add placement to furniture

Where a 3D model sits inside a room: pol (floor-standing), devor
(wall-mounted), or shift (ceiling-hung) — e.g. a lampa could be any of the
three, most other categories default to pol. Purely descriptive metadata for
now; not yet wired into the room-placement logic.

Revision ID: 1785000010
Revises: 1785000009
Create Date: 2026-08-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1785000010'
down_revision = '1785000009'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'furniture',
        sa.Column('placement', sa.String(length=10), nullable=False, server_default='pol'),
    )


def downgrade():
    op.drop_column('furniture', 'placement')
