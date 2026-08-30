"""Add store_id to wallpapers

Same shape as Furniture.store_id: nullable, so the library stays global by
default, but an oboy can optionally belong to the shop selling it.

Revision ID: 1785000013
Revises: 1785000012
Create Date: 2026-08-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '1785000013'
down_revision = '1785000012'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'wallpapers',
        sa.Column('store_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(op.f('ix_wallpapers_store_id'), 'wallpapers', ['store_id'], unique=False)
    op.create_foreign_key(
        'fk_wallpapers_store_id_stores',
        'wallpapers', 'stores',
        ['store_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade():
    op.drop_constraint('fk_wallpapers_store_id_stores', 'wallpapers', type_='foreignkey')
    op.drop_index(op.f('ix_wallpapers_store_id'), table_name='wallpapers')
    op.drop_column('wallpapers', 'store_id')
