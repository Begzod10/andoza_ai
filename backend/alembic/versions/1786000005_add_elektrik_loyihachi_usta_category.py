"""Add the 'elektrik_loyihachi' usta category

The app estimates electrical work and auto-generates a wiring plan from a
LiDAR scan, then offers "Usta chaqirish". ``elektrik`` is the installer — the
person who pulls the cable. What a user needs *before* that (and what the
bathroom wet-zone question needs someone to answer) is the design engineer:
loyihachi-elektrik / инженер-проектировщик, who works from the written norms
and can stamp project documentation. Different service, different moment in
the job, so it gets its own category rather than a flag on ``elektrik``.

``usta_category`` is a real Postgres enum type (``pg_type.typtype = 'e'``,
created by ``0000_base_schema``) — unlike ``room_finishes.surface``, which was
only an ``Enum`` over a VARCHAR — so this needs an ``ALTER TYPE ... ADD VALUE``
rather than a widened CHECK.

TRANSACTIONS. ``ALTER TYPE ... ADD VALUE`` could not run inside a transaction
block before PostgreSQL 12, and Alembic wraps every migration in one. The
deployed image is ``postgres:16-alpine`` (docker-compose.prod.yml), so the
in-transaction form is fine here; the version is checked at runtime anyway and
an older server is handled by dropping to an autocommit connection, so this
migration is correct on whatever it is pointed at. The value is only *added*
here and never read back in the same transaction, which is the one thing
PostgreSQL still forbids.

REVERSIBILITY. ``ALTER TYPE ... ADD VALUE`` has no inverse, so downgrade
rebuilds the type without the value: create a new enum with the six original
labels, swap ``ustalar.category`` over to it, drop the old one and rename.
Rows still carrying ``elektrik_loyihachi`` cannot be narrowed to anything
honest — there is no "generic electrician" the record could be flattened into
without silently changing what that craftsman sells — so the downgrade refuses
rather than guessing or deleting somebody's directory entry plus their leads.
The operator re-categorises or removes those rows and runs it again.

Revision ID: 1786000005
Revises: 1786000004
Create Date: 2026-09-19 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1786000005'
down_revision = '1786000004'
branch_labels = None
depends_on = None

NEW_VALUE = "elektrik_loyihachi"

# The type as ``0000_base_schema`` created it — i.e. what downgrade restores.
LEGACY_VALUES = ("elektrik", "santexnik", "malyar", "oboy", "laminat", "brigada")


def upgrade() -> None:
    bind = op.get_bind()
    add_value = sa.text(
        f"ALTER TYPE usta_category ADD VALUE IF NOT EXISTS '{NEW_VALUE}'"
    )

    # PostgreSQL 12+ allows this inside Alembic's transaction; older servers
    # need a connection of their own with autocommit on.
    if bind.dialect.server_version_info >= (12,):
        bind.execute(add_value)
    else:
        with bind.engine.connect() as conn:
            conn.execution_options(isolation_level="AUTOCOMMIT").execute(add_value)


def downgrade() -> None:
    bind = op.get_bind()

    in_use = bind.execute(
        sa.text("SELECT count(*) FROM ustalar WHERE category = :v"),
        {"v": NEW_VALUE},
    ).scalar_one()
    if in_use:
        raise RuntimeError(
            f"{in_use} usta(s) still have category '{NEW_VALUE}', which the "
            "older enum cannot represent. Re-categorise or delete those rows, "
            "then run the downgrade again."
        )

    values = ", ".join(f"'{v}'" for v in LEGACY_VALUES)
    op.execute(f"CREATE TYPE usta_category_old AS ENUM ({values})")
    op.execute(
        "ALTER TABLE ustalar ALTER COLUMN category "
        "TYPE usta_category_old USING category::text::usta_category_old"
    )
    op.execute("DROP TYPE usta_category")
    op.execute("ALTER TYPE usta_category_old RENAME TO usta_category")
