"""Find the front of the furniture models uploaded before model_yaw existed (one-off backfill).

    docker compose exec -T converter python scripts/model_yaw_backfill.py --dry-run
    docker compose exec -T converter python scripts/model_yaw_backfill.py [--only <furniture id>] [--limit N]

Only rows still at model_yaw 0, with a model stored here (not an http link) and a role with a tall
back (bed, sofa, armchair, chairs) are read. Each model goes through scripts/model_yaw_detect.mjs,
the same algorithm the upload form runs; when it finds the back, the yaw is set and a quarter turn
swaps footprint_w/d (app.services.model_yaw.apply_model_yaw). A dry run prints the same lines and
writes nothing. A turned row is no longer at 0, so a second run leaves it alone.

Each line ends with placements=N: how many rooms already have this model. They will show it turned
by its yaw from now on (spec 2026-10-26-model-yonalishi §6), with no compensation.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

from app.config import settings
from app.services.ai_designer import infer_role
from app.services.model_yaw import apply_model_yaw

DETECTOR = Path(__file__).with_name("model_yaw_detect.mjs")
DETECT_TIMEOUT_S = 60
# The roles the upload form detects for (frontend/src/lib/modelYaw.ts BACKED_ROLES).
BACKED_ROLES = frozenset({"bed", "sofa", "armchair", "dining_chair", "desk_chair"})


class DetectError(Exception):
    """The detector could not read the model."""


def pick_candidates(rows: list, only: str | None) -> list:
    """Rows still unturned, with a model stored here, whose role has a back to find."""
    return [
        r for r in rows
        if (not only or str(r.id) == only)
        and (r.model_yaw or 0) == 0
        and r.glb_key and not r.glb_key.startswith("http")
        and infer_role(r.category, r.name_uz) in BACKED_ROLES
    ]


def detect(path: Path) -> dict:
    """``{yaw, detected, size}`` for one GLB, from the Node detector."""
    cmd = [shutil.which("node") or "node", str(DETECTOR), str(path)]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=DETECT_TIMEOUT_S)
    except subprocess.TimeoutExpired as exc:
        raise DetectError(f"timed out after {DETECT_TIMEOUT_S} s") from exc
    lines = proc.stdout.strip().splitlines()
    try:
        result = json.loads(lines[-1]) if lines else {}
    except json.JSONDecodeError:
        result = {}
    if proc.returncode != 0 or "error" in result or "yaw" not in result:
        raise DetectError(result.get("error") or proc.stderr.strip() or f"exit {proc.returncode}")
    return result


async def load_rows() -> list:
    from sqlalchemy import select

    from app.database import engine
    from app.models.furniture import Furniture

    cols = (Furniture.id, Furniture.name_uz, Furniture.category, Furniture.glb_key,
            Furniture.model_yaw, Furniture.footprint_w, Furniture.footprint_d)
    async with engine.connect() as c:
        rows = (await c.execute(select(*cols).where(Furniture.model_yaw == 0).order_by(Furniture.created_at))).all()
    return [SimpleNamespace(**r._mapping) for r in rows]


async def count_placements(furniture_id) -> int:
    """Rooms that have this model placed: in the studio state, the AI layout or the placements table."""
    from sqlalchemy import text

    from app.database import engine

    probe = json.dumps([{"furniture_id": str(furniture_id)}])
    sql = text("""
        SELECT count(*) FROM rooms r
        WHERE r.state -> 'furniture' @> CAST(:probe AS jsonb)
           OR r.furniture_layout @> CAST(:probe AS jsonb)
           OR EXISTS (SELECT 1 FROM room_furniture_placements p
                      WHERE p.room_id = r.id AND p.furniture_id = :fid)
    """)
    async with engine.connect() as c:
        return (await c.execute(sql, {"probe": probe, "fid": furniture_id})).scalar_one()


async def save(furniture_id, yaw: int, w, d) -> None:
    from sqlalchemy import update

    from app.database import engine
    from app.models.furniture import Furniture

    async with engine.begin() as c:  # the model_yaw = 0 guard: a row turned meanwhile is left as it is
        await c.execute(update(Furniture).where(Furniture.id == furniture_id, Furniture.model_yaw == 0)
                        .values(model_yaw=yaw, footprint_w=w, footprint_d=d))


def _cm(v) -> str:
    return "?" if v is None else f"{float(v):g}"


async def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", metavar="FURNITURE_ID")
    ap.add_argument("--limit", type=int)
    args = ap.parse_args(argv)

    todo = pick_candidates(await load_rows(), args.only)
    if args.limit is not None:
        todo = todo[: args.limit]
    print(f"{len(todo)} ta model tekshiriladi" + (" (dry run: hech narsa yozilmaydi)" if args.dry_run else ""))

    changed = 0
    for row in todo:
        try:
            guess = detect(Path(settings.MEDIA_ROOT) / row.glb_key)
        except Exception as exc:  # noqa: BLE001 — one bad file must not stop the rest
            print(f"  {row.name_uz}  {row.glb_key}  xato: {exc}")
            continue
        if not guess.get("detected"):
            print(f"  {row.name_uz}  old tomon aniqlanmadi, 0 qoldi")
            continue

        turned = SimpleNamespace(model_yaw=row.model_yaw or 0, footprint_w=row.footprint_w, footprint_d=row.footprint_d)
        apply_model_yaw(turned, int(guess["yaw"]), footprint_sent=False)
        placements = await count_placements(row.id)
        print(f"  {row.name_uz}, {row.model_yaw or 0}→{turned.model_yaw} yaw, "
              f"footprint {_cm(row.footprint_w)}×{_cm(row.footprint_d)}→"
              f"{_cm(turned.footprint_w)}×{_cm(turned.footprint_d)}, placements={placements}")
        if turned.model_yaw == (row.model_yaw or 0):
            continue
        changed += 1
        if not args.dry_run:
            await save(row.id, turned.model_yaw, turned.footprint_w, turned.footprint_d)
    print(f"jami {'buriladi' if args.dry_run else 'burildi'}: {changed}")


if __name__ == "__main__":
    asyncio.run(main())
