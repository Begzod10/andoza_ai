"""Demo-store catalog seed for the presentation, safe to run on a live database.

Run inside the backend container (deploy/remote-deploy.sh calls the first one)::

    python -m app.seed_demo_stores            # seed once, if DEMO_STORES is on
    python -m app.seed_demo_stores --remove   # delete every demo store; never seed again
    python -m app.seed_demo_stores --force    # seed even after --remove or with the flag off

What this seeds
---------------
Real Tashkent stores (Dafna, ARCA Mebel, Ergo, Comfort Mebel, Lumen LUX, Aura Lighting,
Bestart, MAFF, the wallpaper shop Модные Стены, Divan.uz for carpets, added in catalog
version 3, Loftbek's loft office furniture, its whole range, added in version 4, and in
version 5 Home Interior, Jaquar, Foondament, Quramiz, KS Lux and Europol; version 6 adds no
rows but gives their plaster, putty, plasterboard and cable an estimate ``smeta_key``) with products (furniture, floor and door materials, wallpapers sold by the roll,
carpets as "boshqa" furniture named "Gilam ...") and photos taken from their public websites by
``scripts/demo_catalog/fetch.py`` into ``app/seed_data/demo_stores/``. There is no
contract with these stores yet, so every store row has ``is_demo = true`` (and a
``moderation_note`` saying so, for humans); ``--remove`` deletes exactly those.

Furniture is seeded without a 3-D model (``glb_key`` null): it shows in the shop with
its photo, but the studio and the AI designer only place pieces that have a model.

It also seeds one store that is not a real shop: "Deraza bozori — o'rtacha narx",
windows and a balcony door priced at the *median* Tashkent market price collected from
public listings (no window maker publishes a price list). Its ``moderation_note`` says
so, and every item carries its ``price_basis`` and ``sources`` in catalog.json; see
``docs/research/2026-10-24-demo-stores-seed-report.md``.

When it runs
------------
Only with ``settings.DEMO_STORES`` on (docker-compose.prod.yml sets it) or ``--force``,
and each catalog row only once:

* catalog.json has a ``version``; every store and item has a ``since`` version (default
  1; an item inherits its store's). A ``seed_markers`` row ``demo_stores_v<N>`` records
  the highest version applied. A deploy inserts only rows whose ``since`` is greater
  than that, then bumps the marker. Rows added to the catalog later therefore still
  reach a database seeded earlier, while a row an admin deleted or renamed is never
  put back;
* a database seeded before versions existed (demo stores present, no version marker)
  counts as version 1 applied;
* after ``--remove`` it leaves a ``seed_markers`` row (``demo_stores_removed``) and
  does nothing on later deploys; ``--force`` clears that marker and seeds every version
  again (rows still present by name are left as they are).

A store with a demo name that is *not* ``is_demo`` (a real partner added later under
the same name) is never touched. Photos are uploaded inside the seed; if the seed
fails, the photos it already uploaded are deleted again.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import uuid
from pathlib import Path
from typing import Awaitable, Callable

from sqlalchemy import select

from app.config import settings
from app.core.cache import cache_delete_prefix, get_redis
from app.core.storage import delete_file, storage_key_from, upload_file
from app.database import AsyncSessionLocal
from app.models.furniture import Furniture
from app.models.material import Material
from app.models.seed_marker import SeedMarker
from app.models.store import Store
from app.models.wallpaper import Wallpaper

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

DEMO_NOTE = "DEMO: shartnomasiz namuna ma'lumot"
REMOVED_MARKER = "demo_stores_removed"
VERSION_PREFIX = "demo_stores_v"  # + the highest catalog version applied, e.g. demo_stores_v2
DATA_DIR = Path(__file__).resolve().parent / "seed_data" / "demo_stores"

# Storage keys of demo photos all sit under a demo/ folder, so --remove can delete
# exactly the files this seed uploaded and nothing else.
FURNITURE_KEY = "furniture/demo/{id}_thumb.webp"
MATERIAL_KEY = "materials/demo/{id}.webp"
WALLPAPER_KEY = "wallpapers/demo/{id}.webp"

LOGO_COLORS = ["#B45309", "#0F766E", "#1D4ED8", "#9D174D", "#4D7C0F",
               "#7C3AED", "#C2410C", "#0E7490", "#A16207", "#334155"]

# Defaults when the catalog row does not say: floor-standing, ceiling-hung for lamps.
DEFAULT_PLACEMENT = {"lampa": "shift"}

CACHE_PREFIXES = ("materials:", "furniture:", "stores:")

Uploader = Callable[..., Awaitable[str]]


def load_catalog(data_dir: Path = DATA_DIR) -> dict:
    return json.loads((data_dir / "catalog.json").read_text(encoding="utf-8"))


def catalog_version(catalog: dict) -> int:
    return int(catalog.get("version", 1))


def item_since(store: dict, item: dict) -> int:
    """The catalog version that introduced *item* (it inherits its store's, default 1)."""
    return int(item.get("since", store.get("since", 1)))


async def _version_markers(session) -> list[SeedMarker]:
    rows = (await session.execute(select(SeedMarker))).scalars().all()
    return [m for m in rows if m.key.startswith(VERSION_PREFIX) and m.key[len(VERSION_PREFIX):].isdigit()]


async def _applied_version(session) -> int:
    """The highest catalog version already applied to this database (0 = never seeded).

    A database seeded before catalog versions existed has demo stores but no marker:
    that was version 1."""
    markers = await _version_markers(session)
    if markers:
        return max(int(m.key[len(VERSION_PREFIX):]) for m in markers)
    if await session.scalar(select(Store).where(Store.is_demo.is_(True)).limit(1)) is not None:
        return 1
    return 0


async def _set_applied_version(session, version: int) -> None:
    for m in await _version_markers(session):
        await session.delete(m)
    session.add(SeedMarker(key=f"{VERSION_PREFIX}{version}"))
    await session.flush()


async def _apply(session, catalog: dict, data_dir: Path = DATA_DIR,
                 upload: Uploader | None = None, uploaded: list[str] | None = None,
                 after_version: int = 0) -> dict[str, int]:
    """Insert the missing demo rows newer than *after_version* through *session*;
    return what happened. A store with no newer item is not looked at at all, so a
    store an admin deleted is not re-created by a later catalog version.

    Every storage key uploaded is appended to *uploaded*, so the caller can delete
    them if the transaction does not commit."""
    upload = upload or upload_file
    uploaded = uploaded if uploaded is not None else []
    counts = {"stores": 0, "furniture": 0, "materials": 0, "wallpapers": 0, "existing": 0,
              "skipped_real_store": 0}
    for idx, data in enumerate(catalog["stores"]):
        items = [i for i in data["items"] if item_since(data, i) > after_version]
        if not items:
            continue
        store = await session.scalar(select(Store).where(Store.name == data["name"]))
        if store is None:
            store = Store(
                name=data["name"],
                district=data.get("district"),
                phone=data.get("phone"),
                telegram=data.get("telegram"),
                logo_color=LOGO_COLORS[idx % len(LOGO_COLORS)],
                partner_tier="standard",
                is_active=True,
                status="approved",
                is_demo=True,
                moderation_note=data.get("moderation_note", DEMO_NOTE),
            )
            session.add(store)
            await session.flush()
            counts["stores"] += 1
            log.info("Demo store created: %s", store.name)
        elif not store.is_demo:
            counts["skipped_real_store"] += 1
            log.warning("Store %r exists and is not a DEMO store; its demo items are skipped", store.name)
            continue

        for item in items:
            if item["kind"] == "wallpaper":
                if await _add_wallpaper(session, store, item, data_dir, upload, uploaded):
                    counts["wallpapers"] += 1
                else:
                    counts["existing"] += 1
                continue
            model = Furniture if item["kind"] == "furniture" else Material
            existing = await session.scalar(
                select(model).where(model.store_id == store.id, model.name_uz == item["name_uz"])
            )
            if existing is not None:
                counts["existing"] += 1
                continue
            image = (data_dir / item["image"]).read_bytes()
            if model is Furniture:
                key = FURNITURE_KEY.format(id=uuid.uuid4())
                stored = await upload(image, key, content_type="image/webp")
                uploaded.append(key)
                session.add(Furniture(
                    store_id=store.id,
                    category=item["category"],
                    name_uz=item["name_uz"],
                    price_uzs=item.get("price_uzs"),
                    glb_key=None,
                    thumbnail_key=stored if stored.startswith("http") else key,
                    room_type=item.get("room_type"),
                    styles=[],
                    placement=item.get("placement") or DEFAULT_PLACEMENT.get(item["category"], "pol"),
                    footprint_w=item.get("footprint_w"),
                    footprint_d=item.get("footprint_d"),
                    height_cm=item.get("height_cm"),
                    is_active=True,
                    status="approved",
                ))
                counts["furniture"] += 1
            else:
                key = MATERIAL_KEY.format(id=uuid.uuid4())
                stored = await upload(image, key, content_type="image/webp")
                uploaded.append(key)
                session.add(Material(
                    store_id=store.id,
                    category=item["category"],
                    name_uz=item["name_uz"],
                    unit=item["unit"],
                    price_uzs=item["price_uzs"],
                    smeta_key=item.get("smeta_key"),
                    pack_qty=item.get("pack_qty"),
                    pack_unit=item.get("pack_unit"),
                    image_url=stored,  # a URL, like every other material's image_url
                    pbr_roughness=0.5,
                    is_active=True,
                ))
                counts["materials"] += 1
        await session.flush()
    return counts


async def _add_wallpaper(session, store: Store, item: dict, data_dir: Path,
                         upload: Uploader, uploaded: list[str]) -> bool:
    """Insert one demo wallpaper (an oboy of *store*, sold by the roll) unless a row with
    its name in that store, or its very image in the oboy library, is already there."""
    if await session.scalar(
        select(Wallpaper).where(Wallpaper.store_id == store.id, Wallpaper.name == item["name_uz"])
    ) is not None:
        return False
    image = (data_dir / item["image"]).read_bytes()
    digest = hashlib.sha256(image).hexdigest()
    # (sha256, kind) is unique: the same picture already in the library is not added twice.
    if await session.scalar(
        select(Wallpaper).where(Wallpaper.sha256 == digest, Wallpaper.kind == "oboy")
    ) is not None:
        return False
    key = WALLPAPER_KEY.format(id=uuid.uuid4())
    stored = await upload(image, key, content_type="image/webp")
    uploaded.append(key)
    session.add(Wallpaper(
        store_id=store.id,
        name=item["name_uz"][:120],
        kind="oboy",
        price_uzs=item["price_uzs"],
        width_cm=item["roll_width_cm"],
        total_length_m=item["roll_length_m"],
        description=f"Rulon {item['roll_width_cm']:g} sm × {item['roll_length_m']:g} m",
        storage_key=stored if stored.startswith("http") else key,
        content_type="image/webp",
        size_bytes=len(image),
        sha256=digest,
    ))
    return True


def _material_image_key(url: str | None) -> str | None:
    """The storage key behind a material image_url this seed stored, else None."""
    if not url:
        return None
    local = settings.MEDIA_URL_PREFIX.rstrip("/") + "/"
    key = url[len(local):] if url.startswith(local) else storage_key_from(url)
    return key if key.startswith("materials/demo/") else None


async def _remove(session) -> tuple[dict[str, int], list[str]]:
    """Delete every is_demo store with its furniture and materials, and leave the marker
    that stops the next deploy from seeding them again; return counts and file keys."""
    counts = {"stores": 0, "furniture": 0, "materials": 0, "wallpapers": 0}
    keys: list[str] = []
    stores = (await session.execute(select(Store).where(Store.is_demo.is_(True)))).scalars().all()
    for store in stores:
        # Furniture.store_id is ON DELETE SET NULL (a null store means "admin catalog"),
        # so the rows are deleted here rather than left to orphan into the public list.
        for f in (await session.execute(select(Furniture).where(Furniture.store_id == store.id))).scalars().all():
            if f.thumbnail_key and "furniture/demo/" in f.thumbnail_key:
                keys.append(storage_key_from(f.thumbnail_key))
            await session.delete(f)
            counts["furniture"] += 1
        for m in (await session.execute(select(Material).where(Material.store_id == store.id))).scalars().all():
            key = _material_image_key(m.image_url)
            if key:
                keys.append(key)
            await session.delete(m)
            counts["materials"] += 1
        # Wallpaper.store_id is ON DELETE SET NULL too: a shop-less wallpaper would stay in
        # everyone's library, so the demo store's are deleted with it.
        for w in (await session.execute(select(Wallpaper).where(Wallpaper.store_id == store.id))).scalars().all():
            if "wallpapers/demo/" in (w.storage_key or ""):
                keys.append(storage_key_from(w.storage_key))
            await session.delete(w)
            counts["wallpapers"] += 1
        await session.flush()
        await session.delete(store)
        counts["stores"] += 1
        log.info("Demo store removed: %s", store.name)
    if await session.scalar(select(SeedMarker).where(SeedMarker.key == REMOVED_MARKER)) is None:
        session.add(SeedMarker(key=REMOVED_MARKER))
    await session.flush()
    return counts, keys


async def _drop_caches() -> None:
    for prefix in CACHE_PREFIXES:
        try:
            await cache_delete_prefix(prefix)
        except Exception as exc:  # the rows are committed; a stale cache expires in 10 min
            log.warning("Could not clear cache %r: %s", prefix, exc)
    try:  # a one-shot script: close the pool before asyncio.run() closes the loop under it
        await get_redis().aclose()
    except Exception:
        pass


async def _delete_files(keys: list[str]) -> int:
    failed = 0
    for key in keys:
        try:
            await delete_file(key)
        except Exception as exc:
            failed += 1
            log.warning("Could not delete %s: %s", key, exc)
    return len(keys) - failed


async def _fill_estimate_keys(session, catalog: dict) -> int:
    """Give demo materials already in the database the estimate key (smeta_key and pack
    size) their catalog row now carries (catalog version 6 added them to rows seeded in
    version 5). Only a product with no key yet is touched, so an admin's own key stays."""
    filled = 0
    for data in catalog["stores"]:
        keyed = [i for i in data["items"] if i["kind"] == "material" and i.get("smeta_key")]
        if not keyed:
            continue
        store = await session.scalar(select(Store).where(Store.name == data["name"]))
        if store is None or not store.is_demo:
            continue
        for item in keyed:
            material = await session.scalar(
                select(Material).where(Material.store_id == store.id, Material.name_uz == item["name_uz"])
            )
            if material is None or material.smeta_key is not None:
                continue
            material.smeta_key = item["smeta_key"]
            if material.pack_qty is None and item.get("pack_qty") is not None:
                material.pack_qty, material.pack_unit = item["pack_qty"], item["pack_unit"]
            filled += 1
    return filled


async def seed_demo_stores(force: bool = False) -> dict:
    """Seed the catalog versions this database has not had yet (see the module
    docstring); the result's "status" says what happened."""
    if not (settings.DEMO_STORES or force):
        return {"status": "disabled"}
    catalog = load_catalog()
    version = catalog_version(catalog)
    uploaded: list[str] = []
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                removed = await session.scalar(select(SeedMarker).where(SeedMarker.key == REMOVED_MARKER))
                if force:
                    if removed is not None:
                        await session.delete(removed)
                    applied = 0
                elif removed is not None:
                    return {"status": "removed"}
                else:
                    applied = await _applied_version(session)
                    if applied >= version:
                        return {"status": "already_seeded", "version": applied}
                counts = await _apply(session, catalog, upload=upload_file, uploaded=uploaded,
                                      after_version=applied)
                counts["keyed"] = await _fill_estimate_keys(session, catalog)
                await _set_applied_version(session, version)
    except BaseException:
        # Nothing was committed, so no row points at these files: take them back out.
        await _delete_files(uploaded)
        raise
    await _drop_caches()
    return {"status": "seeded", "from_version": applied, "version": version, **counts}


async def remove_demo_stores() -> dict[str, int]:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            counts, keys = await _remove(session)
    # After the commit, so no live row ever points at a missing file.
    counts["files_deleted"] = await _delete_files(keys)
    await _drop_caches()
    return counts


async def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Seed or remove the demo-store catalog.")
    ap.add_argument("--remove", action="store_true",
                    help="delete every demo store and its rows; later deploys do not seed them again")
    ap.add_argument("--force", action="store_true",
                    help="seed even with DEMO_STORES off or after --remove (clears the marker)")
    args = ap.parse_args(argv)
    if args.remove:
        c = await remove_demo_stores()
        print(
            f"Demo stores removed: {c['stores']} stores, {c['furniture']} furniture,"
            f" {c['materials']} materials, {c['wallpapers']} wallpapers, {c['files_deleted']} images deleted."
        )
        return
    c = await seed_demo_stores(force=args.force)
    if c["status"] == "disabled":
        print("Demo stores: DEMO_STORES is off, nothing seeded.")
    elif c["status"] == "already_seeded":
        print(f"Demo stores: catalog version {c['version']} already applied, nothing changed"
              " (admin edits are kept).")
    elif c["status"] == "removed":
        print("Demo stores: removed earlier with --remove, not seeded again (use --force to reseed).")
    else:
        print(
            f"Demo stores seed (catalog v{c['from_version']} -> v{c['version']}):"
            f" {c['stores']} stores, {c['furniture']} furniture,"
            f" {c['materials']} materials, {c['wallpapers']} wallpapers inserted;"
            f" {c['existing']} already there; {c.get('keyed', 0)} given an estimate key;"
            f" {c['skipped_real_store']} non-demo stores with a demo name left alone."
        )


if __name__ == "__main__":
    asyncio.run(main())
