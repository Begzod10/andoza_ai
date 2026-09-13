"""Add room_scan metadata to rooms

Stores LiDAR RoomPlan scan metadata for a room: source ("lidar"),
roomplan_version, scanned_at, usdz_path, glb_path (nullable until the
USDZ→GLB conversion finishes), object_count and the detected objects list.

Nullable JSONB, so this is safe to run against prod later on deploy — existing
(non-scanned) rooms simply keep room_scan = NULL.

Revision ID: 1785000018
Revises: 1785000017
Create Date: 2026-09-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '1785000018'
down_revision = '1785000017'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'rooms',
        sa.Column('room_scan', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade():
    op.drop_column('rooms', 'room_scan')
