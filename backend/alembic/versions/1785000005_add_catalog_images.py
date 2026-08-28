"""Add catalog image URLs

The mobile Do'kon products and Ustalar masters show real pictures, so materials
need an image URL and ustalar need an avatar URL. Both columns are nullable so
existing rows stay valid.

Revision ID: 1785000005
Revises: 1785000004
Create Date: 2026-08-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1785000005'
down_revision = '1785000004'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'materials',
        sa.Column('image_url', sa.String(length=500), nullable=True),
    )
    op.add_column(
        'ustalar',
        sa.Column('avatar_url', sa.String(length=500), nullable=True),
    )


def downgrade():
    op.drop_column('ustalar', 'avatar_url')
    op.drop_column('materials', 'image_url')
