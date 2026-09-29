"""One-off: provision a fresh database through the Alembic migration chain.

This used to bypass Alembic entirely and build the schema straight from the
SQLAlchemy models (`Base.metadata.create_all`), because the original
"initial" migration (7edc8d1c1fda) only ALTERed tables it assumed already
existed, so `alembic upgrade head` failed on a genuinely empty database.
That gap was closed by 0000_base_schema.py, which now creates the full
schema from nothing and is the true root of the migration chain, so
`alembic upgrade head` alone correctly provisions a fresh database.

Running that same command here — instead of create_all — means there is only
ever one way a database ends up schema-provisioned: the Alembic chain. A
database bootstrapped by this script is therefore indistinguishable from one
provisioned by `docker compose up` (dev) or the production deploy, both of
which also just run `alembic upgrade head`.
"""
from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config


def main() -> None:
    backend_dir = Path(__file__).resolve().parent
    cfg = Config(str(backend_dir / "alembic.ini"))
    # alembic.ini's `script_location = alembic` is resolved relative to the
    # process's CWD, not the ini file's own directory. Pin it explicitly so
    # this script works no matter where it's invoked from.
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    command.upgrade(cfg, "head")
    print("DATABASE PROVISIONED: alembic upgrade head")


if __name__ == "__main__":
    main()
