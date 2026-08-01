"""Shared wallpaper library + admin flag on users

Wallpapers uploaded in the studio are global and permanent: any user can pick
one, and only an admin can remove it.

Revision ID: wallpapers
Revises: 1785000002
Create Date: 2026-07-31 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'wallpapers'
down_revision = '1785000002'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'users',
        sa.Column('is_admin', sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_table(
        'wallpapers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('storage_key', sa.String(length=255), nullable=False),
        sa.Column('content_type', sa.String(length=60), nullable=False),
        sa.Column('size_bytes', sa.BigInteger(), nullable=False),
        sa.Column('sha256', sa.String(length=64), nullable=False),
        sa.Column(
            'uploaded_by',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index('ix_wallpapers_id', 'wallpapers', ['id'])
    op.create_index('ix_wallpapers_sha256', 'wallpapers', ['sha256'], unique=True)
    op.create_index('ix_wallpapers_uploaded_by', 'wallpapers', ['uploaded_by'])


def downgrade():
    op.drop_index('ix_wallpapers_uploaded_by', 'wallpapers')
    op.drop_index('ix_wallpapers_sha256', 'wallpapers')
    op.drop_index('ix_wallpapers_id', 'wallpapers')
    op.drop_table('wallpapers')
    op.drop_column('users', 'is_admin')
