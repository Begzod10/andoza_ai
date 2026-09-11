"""Split the wallpaper library by what the image is for

An image uploaded under Suvoq is a wall *surface* — concrete, plaster — and one
uploaded under Bo'yoq/Oboi is a *pattern*. They were landing in one undivided
list, so the Suvoq panel could only offer the whole library or nothing. `kind`
is what lets each phase show back the images uploaded for it.

Existing rows predate the split and are all oboy uploads, which is what the
server default records.

Revision ID: wp_kind
Revises: 1785000016
Create Date: 2026-08-23 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'wp_kind'
down_revision = '1785000016'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'wallpapers',
        sa.Column('kind', sa.String(length=16), server_default='oboy', nullable=False),
    )
    op.create_index('ix_wallpapers_kind', 'wallpapers', ['kind'])


def downgrade():
    op.drop_index('ix_wallpapers_kind', 'wallpapers')
    op.drop_column('wallpapers', 'kind')
