"""Add room_states table; add currency/status columns to estimates

Revision ID: 9b3f2a7c1e4d
Revises: add_electrical_decoration
Create Date: 2026-07-28 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '9b3f2a7c1e4d'
down_revision = 'add_electrical_decoration'
branch_labels = None
depends_on = None


ROOM_STATE_VALUES = ("xom", "suvoq", "tayyor")
ESTIMATE_STATUS_VALUES = ("draft", "final", "sent", "accepted")


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Ensure estimates table exists (fallback for incomplete schema)
    # ------------------------------------------------------------------
    op.execute("""
    CREATE TABLE IF NOT EXISTS estimates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        lines JSONB NOT NULL DEFAULT '[]'::jsonb,
        total_uzs BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """)
    op.execute("""
    CREATE INDEX IF NOT EXISTS ix_estimates_room_id ON estimates(room_id)
    """)

    # ------------------------------------------------------------------
    # room_states — one row per room, construction-progress tracking
    # ------------------------------------------------------------------
    op.create_table(
        "room_states",
        sa.Column("room_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("current_state", sa.String(length=10), nullable=False),
        sa.Column("floor_state", sa.String(length=10), nullable=True),
        sa.Column("ceiling_state", sa.String(length=10), nullable=True),
        sa.Column("walls_state", sa.String(length=10), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("room_id"),
        sa.CheckConstraint(
            "current_state IN ({})".format(
                ",".join(f"'{v}'" for v in ROOM_STATE_VALUES)
            ),
            name="ck_room_states_current_state",
        ),
        sa.CheckConstraint(
            "floor_state IS NULL OR floor_state IN ({})".format(
                ",".join(f"'{v}'" for v in ROOM_STATE_VALUES)
            ),
            name="ck_room_states_floor_state",
        ),
        sa.CheckConstraint(
            "ceiling_state IS NULL OR ceiling_state IN ({})".format(
                ",".join(f"'{v}'" for v in ROOM_STATE_VALUES)
            ),
            name="ck_room_states_ceiling_state",
        ),
        sa.CheckConstraint(
            "walls_state IS NULL OR walls_state IN ({})".format(
                ",".join(f"'{v}'" for v in ROOM_STATE_VALUES)
            ),
            name="ck_room_states_walls_state",
        ),
    )

    # ------------------------------------------------------------------
    # estimates — currency / status columns + history pagination index
    # ------------------------------------------------------------------
    op.add_column(
        "estimates",
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="UZS"),
    )
    op.add_column(
        "estimates",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="final"),
    )
    op.create_check_constraint(
        "ck_estimates_status",
        "estimates",
        "status IN ({})".format(",".join(f"'{v}'" for v in ESTIMATE_STATUS_VALUES)),
    )
    op.create_index(
        "ix_estimates_room_id_created_at",
        "estimates",
        ["room_id", "created_at"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_estimates_room_id_created_at", table_name="estimates", if_exists=True)
    op.drop_constraint("ck_estimates_status", "estimates", type_="check")
    op.drop_column("estimates", "status")
    op.drop_column("estimates", "currency")
    op.drop_table("room_states")
