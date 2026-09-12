"""Add user_models — server-side storage for imported 3D models.

An imported model's bytes used to live only in the browser's IndexedDB, with
the entry metadata in localStorage. Clearing site data, or opening the project
from another device, silently lost every import. This table (plus a file under
models/<user_id>/ in media storage) is the durable copy the studio restores
from.

Revision ID: user_models
Revises: wp_kind
Create Date: 2026-09-12 01:10:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'user_models'
down_revision = 'wp_kind'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_models',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('category', sa.String(length=32), nullable=True),
        sa.Column('placement', sa.String(length=16), nullable=True),
        sa.Column('price_uzs', sa.BigInteger(), nullable=True),
        sa.Column('scale', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('size_w_m', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('size_d_m', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('size_h_m', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('has_textures', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('storage_key', sa.String(length=255), nullable=False),
        sa.Column('thumb_key', sa.String(length=255), nullable=True),
        sa.Column('content_type', sa.String(length=60), nullable=False),
        sa.Column('size_bytes', sa.BigInteger(), nullable=False),
        sa.Column('sha256', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_user_models_id'), 'user_models', ['id'], unique=False)
    op.create_index(op.f('ix_user_models_user_id'), 'user_models', ['user_id'], unique=False)
    op.create_index(op.f('ix_user_models_sha256'), 'user_models', ['sha256'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_user_models_sha256'), table_name='user_models')
    op.drop_index(op.f('ix_user_models_user_id'), table_name='user_models')
    op.drop_index(op.f('ix_user_models_id'), table_name='user_models')
    op.drop_table('user_models')
