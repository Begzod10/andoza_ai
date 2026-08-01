"""Add room_electrical, electrical_devices, room_decorations tables

Revision ID: add_electrical_decoration
Revises: add_deleted
Create Date: 2026-07-28 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_electrical_decoration'
down_revision = 'add_deleted'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    DO $$ BEGIN
        CREATE TYPE electrical_device_type AS ENUM ('socket', 'switch', 'light', 'panel', 'box');
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END $$;
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS room_electrical (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
        wiring_meters NUMERIC(8, 2),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
    """)
    op.create_index(
        "ix_room_electrical_room_id", "room_electrical", ["room_id"], if_not_exists=True
    )

    op.execute("""
    CREATE TABLE IF NOT EXISTS electrical_devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        type electrical_device_type NOT NULL,
        variant VARCHAR(50),
        wall_index INTEGER NOT NULL,
        x NUMERIC(8, 4) NOT NULL,
        y NUMERIC(8, 4) NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_electrical_device_wall_index CHECK (wall_index >= 0 AND wall_index <= 3),
        CONSTRAINT ck_electrical_device_count_positive CHECK (count >= 1)
    );
    """)
    op.create_index(
        "ix_electrical_devices_room_id", "electrical_devices", ["room_id"], if_not_exists=True
    )

    op.execute("""
    CREATE TABLE IF NOT EXISTS room_decorations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
        walls JSONB NOT NULL DEFAULT '{}'::jsonb,
        floor JSONB NOT NULL DEFAULT '{}'::jsonb,
        ceiling JSONB NOT NULL DEFAULT '{}'::jsonb,
        furniture JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
    """)
    op.create_index(
        "ix_room_decorations_room_id", "room_decorations", ["room_id"], if_not_exists=True
    )


def downgrade() -> None:
    op.drop_index("ix_room_decorations_room_id", "room_decorations", if_not_exists=True)
    op.execute("DROP TABLE IF EXISTS room_decorations;")

    op.drop_index("ix_electrical_devices_room_id", "electrical_devices", if_not_exists=True)
    op.execute("DROP TABLE IF EXISTS electrical_devices;")

    op.drop_index("ix_room_electrical_room_id", "room_electrical", if_not_exists=True)
    op.execute("DROP TABLE IF EXISTS room_electrical;")

    op.execute("DROP TYPE IF EXISTS electrical_device_type;")
