"""Add room_type and thumbnail_key to furniture

Backs the admin 3D-model catalog: an admin uploads a model tagged with which
room it belongs in (mehmonxona/oshxona/yotoqxona/hammom/balkon), so the shop
UI can filter by room, plus a preview thumbnail alongside the existing GLB.
`room_type` is nullable — null means the model is usable in every room.

Revision ID: 1785000009
Revises: 1785000008
Create Date: 2026-08-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1785000009'
down_revision = '1785000008'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'furniture',
        sa.Column('thumbnail_key', sa.String(length=200), nullable=True),
    )
    op.add_column(
        'furniture',
        sa.Column('room_type', sa.String(length=20), nullable=True),
    )
    op.create_index(
        op.f('ix_furniture_room_type'), 'furniture', ['room_type'], unique=False
    )


def downgrade():
    op.drop_index(op.f('ix_furniture_room_type'), table_name='furniture')
    op.drop_column('furniture', 'room_type')
    op.drop_column('furniture', 'thumbnail_key')
