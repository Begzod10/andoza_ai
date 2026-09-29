"""Constrain stores.partner_tier to the tiers the app can render

``partner_tier`` has been a bare ``String(20)`` whose allowed values lived in
a column comment (``standard | gold | platinum``). Nothing enforced it, and
``app/seeds.py`` drifted: two of its three stores named tiers outside that
set. The mobile shop screen treats anything that is not gold/platinum as a
plain, non-official dealer, so a bad tier never errors anywhere — it quietly
downgrades the store's badge, which is exactly the kind of bug that lives for
months.

WHY A CHECK AND NOT AN ENUM. A Postgres enum would be marginally stricter,
but adding a future tier then costs an ``ALTER TYPE ... ADD VALUE`` migration
that cannot be undone (see 1786000005, where ``usta_category`` needed the
whole type rebuilt to drop a value). This project has already been bitten
twice by an enum that was too narrow — ``usta_category`` and
``electrical_devices.wall_index`` — so a CHECK, which widens with a plain
``DROP``/``ADD CONSTRAINT``, is the right strength here. It still catches
every writer: both seeders, the admin API, and any one-off script or psql
session.

EXISTING ROWS. Verified against production before writing this: all seven
``stores`` rows are standard/gold/platinum, so the constraint validates
without a backfill. The upgrade still re-checks rather than assuming — it
raises with the offending tiers listed instead of letting Postgres fail with
a bare constraint-violation, so an operator knows what to fix.

Revision ID: 1786000007
Revises: 1786000006
Create Date: 2026-09-24 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1786000007"
down_revision: Union[str, None] = "1786000006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT_NAME = "ck_stores_partner_tier"

# Kept in sync with app.models.store.PARTNER_TIERS.
TIERS = ("standard", "gold", "platinum")


def _tier_list() -> str:
    return ", ".join(f"'{tier}'" for tier in TIERS)


def _constraint_exists(bind) -> bool:
    return bool(
        bind.execute(
            sa.text(
                "SELECT 1 FROM pg_constraint "
                "WHERE conname = :name AND conrelid = 'stores'::regclass"
            ),
            {"name": CONSTRAINT_NAME},
        ).scalar()
    )


def upgrade() -> None:
    bind = op.get_bind()
    if _constraint_exists(bind):
        return

    offenders = bind.execute(
        sa.text(
            f"SELECT DISTINCT partner_tier FROM stores "
            f"WHERE partner_tier NOT IN ({_tier_list()})"
        )
    ).scalars().all()
    if offenders:
        raise RuntimeError(
            f"stores.partner_tier holds values outside {TIERS}: "
            f"{sorted(offenders)}. Re-tier or remove those rows, then re-run."
        )

    op.create_check_constraint(
        CONSTRAINT_NAME,
        "stores",
        f"partner_tier IN ({_tier_list()})",
    )


def downgrade() -> None:
    bind = op.get_bind()
    if _constraint_exists(bind):
        op.drop_constraint(CONSTRAINT_NAME, "stores", type_="check")
