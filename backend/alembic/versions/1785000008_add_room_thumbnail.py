"""Add thumbnail_key to rooms

Stores the storage key (S3 object key, or path under MEDIA_ROOT for local
storage) for a snapshot of the room's 3D viewport, captured client-side and
uploaded via POST /rooms/{room_id}/thumbnail. Used as the project card image
on the dashboard/project list instead of a static placeholder icon.

Revision ID: 1785000008
Revises: 1785000007
Create Date: 2026-08-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1785000008'
down_revision = '1785000007'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'rooms',
        sa.Column('thumbnail_key', sa.String(length=255), nullable=True),
    )


def downgrade():
    op.drop_column('rooms', 'thumbnail_key')
