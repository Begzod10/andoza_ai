"""Compress every 3D model that has no compressed copy yet (one-off backfill).

    docker compose exec -T api python scripts/optimize_models.py --dry-run
    docker compose exec -T api python scripts/optimize_models.py [--only furniture|user_models] [--limit N]

A dry run lists the models it would compress and their sizes, and writes nothing.
A real run compresses them one after another (not through the queue: one heavy
model at a time keeps the server's memory in check) with the same code the
upload path uses, prints before -> after for each, and the totals. Models that
already have a copy are skipped, so it is safe to run again after a partial run.
Originals are never touched. See docs/superpowers/specs/2026-10-10-glb-optimization-design.md.
"""
from __future__ import annotations

import argparse
import asyncio

Row = tuple[str, str | None, str | None]  # (id, original key, opt key)


def pick_candidates(furniture: list[Row], user_models: list[Row], only: str | None) -> list[tuple[str, str, str]]:
    """``(kind, id, original_key)`` for models stored here that have no copy yet; furniture first."""
    out: list[tuple[str, str, str]] = []
    for kind, rows, name in (("furniture", furniture, "furniture"), ("user_model", user_models, "user_models")):
        if only and only != name:
            continue
        out += [(kind, mid, key) for mid, key, opt in rows if key and not key.startswith("http") and not opt]
    return out


async def load_rows() -> tuple[list[Row], list[Row]]:
    from sqlalchemy import select

    from app.database import engine
    from app.models.furniture import Furniture
    from app.models.user_model import UserModel

    async with engine.connect() as c:
        furniture = (await c.execute(select(Furniture.id, Furniture.glb_key, Furniture.glb_opt_key))).all()
        users = (await c.execute(select(UserModel.id, UserModel.storage_key, UserModel.opt_key))).all()
    return ([(str(i), k, o) for i, k, o in furniture], [(str(i), k, o) for i, k, o in users])


def _kb(n: int) -> str:
    return f"{n // 1024} KB"


async def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", choices=("furniture", "user_models"))
    ap.add_argument("--limit", type=int)
    args = ap.parse_args(argv)

    from app.core import storage
    from app.tasks import media

    furniture, users = await load_rows()
    todo = pick_candidates(furniture, users, args.only)
    if args.limit is not None:
        todo = todo[: args.limit]
    print(f"{len(todo)} ta model siqilmagan")

    if args.dry_run:
        total = 0
        for kind, mid, key in todo:
            try:
                size = len(await storage.download_file(key))
                total += size
                print(f"  {kind:10} {mid}  {key}  {_kb(size)}")
            except Exception as exc:  # noqa: BLE001 — a missing file is reported, not fatal
                print(f"  {kind:10} {mid}  {key}  ? ({exc})")
        print(f"jami: {_kb(total)}")
        return

    before = after = 0
    for kind, mid, key in todo:
        try:
            result = await media._optimize_model(kind, mid)
        except Exception as exc:  # noqa: BLE001 — one bad file must not stop the rest
            result = {"status": f"error: {exc}"}
        if result.get("status") == "ok":
            before += result["before"]
            after += result["after"]
            print(f"  {kind:10} {mid}  {_kb(result['before'])} -> {_kb(result['after'])}  ok")
        else:
            print(f"  {kind:10} {mid}  {key}  {result.get('status')}")
    print(f"jami siqilganlar: {_kb(before)} -> {_kb(after)}")


if __name__ == "__main__":
    asyncio.run(main())
