# Demo stores seed: what was collected and how to remove it (2026-10-24)

For the investor and customer presentation, production shows real Tashkent stores with their real products before any contract is signed. Every seeded store row has `stores.is_demo = true`. It also carries `moderation_note = "DEMO: shartnomasiz namuna ma'lumot"` so a human reading the admin can see it. The whole demo can be removed with one command (see "How to remove").

- **Fetcher:** `backend/scripts/demo_catalog/fetch.py`. It runs on a dev machine and needs `requests beautifulsoup4 lxml pillow`, which are not in the backend image.
- **Data:** `backend/app/seed_data/demo_stores/catalog.json` plus `images/<store>/<n>.webp`.
  - Product photos: longest side 800 px or less, WebP quality 75.
  - Wallpaper pattern photos: longest side 1024 px or less.
- **Seed:** `backend/app/seed_demo_stores.py`. `deploy/remote-deploy.sh` runs it after `seed_estimate_catalog`.

## How the data was collected

The fetcher reads only public listing and product pages. It never logs in and never submits a form.

- It makes one request at a time, at least 1 s apart, or longer when a host's robots.txt sets a `Crawl-delay`. It sends a normal Chrome User-Agent.
- Every URL, including every image, is checked against that host's robots.txt first. The matcher understands `*` and `$`.
- Downloaded pages and images are only parsed or re-encoded, never executed.

Names follow what each store shows (Uzbek on Dafna, Russian elsewhere) and are cleaned up for the presentation:

- There are no made-up "(2)" suffixes. When a store uses the same name twice, the second one gets an attribute from its own page that tells it apart: colour, brand or size (for example "Кровать, Серый"). A true duplicate, with nothing to tell it apart, is left out.
- Plural category labels become natural names: "Люстры [9781-18 GYB]" becomes "Люстра 9781-18 GYB".
- A word that mixes Latin and Cyrillic letters is fixed to one script, such as a Latin C typed inside "Cтильный" or a Cyrillic С inside "BC-KB-6040-12С".
- A bare collection name gets its kind in front: "Casa" becomes "Шкаф Casa".
- Multi-piece bundles are dropped from furniture: ARCA "composite" sets, bedroom, living-room and table-with-chairs sets, "Зеркало и навесные тумбы".

## Per store (after cleanup)

| Store | Items | Price | Photos | Notes |
|---|---|---|---|---|
| Dafna (dafna.uz) | 22: divan 7, shkaf 4, stol 4, stul 3, karavot 1, lampa 3 | UZS, all | 22, 252 KB | Product URLs come from the Uzbek sitemap. Many sitemap entries are discontinued and their pages return HTTP 500; they were skipped. The "RONDO" coffee-table set was dropped as a bundle. Sizes come from the product specs. |
| ARCA Mebel (arcamebel.uz) | 10: karavot 7, shkaf 3 | UZS, all | 10, 436 KB | Single products only. The composite and set pages, which are most of ARCA's catalog, were dropped as bundles. Same-named beds are told apart by colour. |
| Ergo (ergo.uz) | 22: divan 8, stul 6, stol 5, shkaf 3 | UZS, all | 22, 340 KB | Office-focused. No sizes on the pages. |
| Comfort Mebel (comfort-mebel.uz) | 17: divan 8, shkaf 5, karavot 2, stol 2 | none (null; the shop shows "ask price") | 17, 600 KB | Sets dropped. Same-named items with no distinguishing attribute were dropped (three "Двухспальные кровати", one "Большой п образный диван"). Old photo links on the dead `new.` subdomain are fetched from the main host instead. |
| Lumen LUX (lumenlux.uz) | 23 lamps: 12 chandeliers (shift), 6 sconces (devor), 5 floor lamps (pol) | UZS, all | 23, 348 KB | |
| Aura Lighting (auralighting.uz) | 25 lamps: 14 chandeliers, 6 sconces, 5 lamps | UZS, all | 25, 568 KB | Sizes come from each product's own size block. |
| Bestart (bestart.uz) | 15 chandeliers | none (null) | 15, 240 KB | |
| MAFF (maff.uz) | 25 materials: laminate 10, parquet 6 (per m²), doors 9 (per piece) | UZS, all | 25, 652 KB | Floors are taken only when the page says "Цена за м²". |
| Модные Стены (modnie-steni.uz) | 28 wallpapers (oboy) | UZS per roll, all | 28, 2.1 MB | See "Wallpapers" below. |
| Keng Makon (kengmakon.uz) | 0 | | | **Skipped.** Its image CDN's robots.txt is `Disallow: /`. |
| Sanat Hali (prom.uz, carpets) | 0 | | | **Dropped.** The photos are prom.uz `/upload/` files, and www.prom.uz's robots.txt disallows `/upload/`. No other carpet source was found, so there are no carpets. |
| Imzo (imzo.uz) | 0 | | | **Skipped.** No product page shows a price. |

**Total:** 9 stores, 134 furniture pieces, 25 materials, 28 wallpapers, 187 photos (5.5 MB).

Store contacts (phone and Telegram where published) come from `2026-10-24-uz-stores-catalogs.md` or the store's own site.

## Wallpapers

**Source:** Модные Стены, a wallpaper shop at ул. Осиё 9 in Tashkent, phone +998 71 235 07 08 (modnie-steni.uz, built on InSales).

- Product pages carry JSON-LD with the price per roll in UZS.
- The roll size ("Размер 1,06*10м") is in the description or in the product's short summary.
- Photos are served from `cdn.insales-shop.ru`, which has no robots.txt.

Of the products checked across ten collections (AS Creation, Ostima, Ateliero, Московская Обойная Фабрика, Аспект Делюкс and others), 28 were kept. One colourway per article was taken.

- Most rolls are 106 cm × 10 m, and a few are 106 cm × 25 m.
- Prices run from 80 000 to 460 000 UZS per roll.
- Products that give only the width, and not the length, were skipped. This applies to the whole Decori & Decori collection.
- Names are built as brand + collection + article, for example "AS Creation DAMASK 38850-1".

**Sources checked and not used:**

| Source | Why it was not used |
|---|---|
| glotr.uz | Wallpapers listed as "Цена по запросу" (no price). |
| prom.uz | Photos are under `/upload/`, which its robots.txt disallows. |
| Uzum Market | The pages are a JavaScript shell with no product data, and `/api` is disallowed. |
| OLX | Mostly private ads, 3D stickers and leftovers, with negotiable prices and rarely a roll size. |
| oboi.uz | Does not resolve. |

I found no public sites with catalogs for Alta Classe, Fran Style, Nebo, Vostok or Elite Design. Elite Design appears on prom.uz only, with "Цена договорная".

**How the wallpapers are seeded:**

- They become `Wallpaper` rows with `kind=oboy`, `store_id` set to the demo store, `price_uzs`, `width_cm` (roll width) and `total_length_m` (roll length).
- The image is uploaded with the same storage helper the wallpaper upload route uses, under `wallpapers/demo/`, along with `sha256`, `size_bytes` and `content_type`.
- If the same picture is already in the oboy library, it is not added twice, because `(sha256, kind)` is unique.

**In the studio:** the oboy library (`GET /wallpapers?kind=oboy`, newest first) lists the demo wallpapers. Picking one puts it on the wall as a "texture" covering with its image URL.

**In the estimate:** before this change, a library wallpaper was always priced as an AI-estimated m² photo print. Now a library wallpaper that has a roll width, roll length and price is matched by its URL (local media URL or S3 URL) and counted in rolls of its own size, strip by strip, like a catalog oboy. For example, for a 4 m wall with a 2.7 m ceiling: 4 × 1.10 ÷ 1.06 = 5 strips, and a 10 m roll gives 3 strips, so 2 rolls at 315 000 UZS. A user's own photo keeps the AI placeholder.

## When the seed runs

- **The flag:** it runs only when `DEMO_STORES` is on. The backend setting defaults to off. `docker-compose.prod.yml` sets `DEMO_STORES: ${DEMO_STORES:-1}` for the api service, so production seeds the demo for the presentation. `--force` runs it even with the flag off.
- **Only once:** if any `is_demo` store already exists, the seed does nothing. A later deploy therefore never re-adds a piece an admin deleted or renamed.
- **The removal marker:** after `--remove`, a `seed_markers` row with key `demo_stores_removed` stops later deploys from seeding again. `--force` clears that marker and reseeds.
  - The marker is a database row rather than a file because it lives next to the rows it guards. It survives redeploys, and it travels with the data in a backup or restore. A file in the media volume could disagree with a restored database.
- **Migration `1786000041`** (after `1786000040`, the head on origin/master) adds `stores.is_demo BOOLEAN NOT NULL DEFAULT false` and the `seed_markers` table. Approving or rejecting a store in moderation clears `moderation_note` but never touches `is_demo`, and a test covers this.
- **Failed seeds:** if a seed fails, the photos it had already uploaded are deleted again, so nothing leaks into storage.
- **Real stores:** a store whose name matches a demo store but is not `is_demo` is never touched.
- **Admin:** the admin store card shows a "Namuna" / "Демо" / "Demo" badge for `is_demo` stores.
- **Orders and inquiries** to demo stores stay enabled, as the owner decided.

## Shop, studio and AI

- **Shop home:** it now asks the server for the chosen category and the search text. It loads furniture in pages of 60 with a "Yana ko'rsatish" (show more) button, so every product, demo or partner, can be reached. The category chips list every furniture category, and lamps now have a label.
  - `GET /furniture` and `GET /materials` now have a stable `ORDER BY created_at DESC, id`. Before, pages had no order and could overlap or skip rows.
  - `/furniture` also takes `q` for name search.
- **Studio:** it loads `GET /furniture?has_model=true`, so photo-only listings cannot push real 3-D models out of its 100-item page.
- **AI:** the AI designer and the room-builder agent are offered only furniture that has a 3-D model. The ready-made design presets skip listings without one.
- **Flutter app:** it lives in a separate repo and reads `/furniture` without `has_model`. It will list the photo-only demo furniture, which has `glb_url = null`. Check that the mobile 3-D placement ignores entries without a `glb_url`, or add `has_model=true` there.

## Verification

- `backend/tests/test_seed_demo_stores.py` (26 tests) checks the catalog:
  - categories, units and placements are valid;
  - every photo exists, and no photo on disk is left unreferenced;
  - names are clean and unique per store;
  - there are no bundles and no prom.uz carpets;
  - wallpapers have a price, a roll size and a photo of 1024 px or less.

  It also checks the seed behaviour:
  - with the flag off nothing happens, and once seeded a second run is a no-op;
  - after `--remove` the marker stops reseeding, and `--force` reseeds;
  - a failed seed deletes its uploads;
  - `--remove` deletes only `is_demo` stores with their furniture, materials and wallpapers.
- Other new tests:
  - `tests/test_store_is_demo.py`: the column, moderation keeping `is_demo`, the admin schema, and the migration chain.
  - `tests/test_ai_design_catalog_filter.py`: the 3-D-model filters, `has_model`, the stable order and `q`.
  - `tests/test_estimate_shop_wallpaper.py`: roll pricing for local and S3 URLs, the photo placeholder, and loading the estimate catalog.
- **Full backend suite** (in the api image with this worktree mounted): 1399 passed, 1 skipped. `tests/test_push.py` was excluded because the local image is missing `firebase_admin`, which is unrelated to this work.
- **Frontend:** `tsc --noEmit` is clean and the full vitest run passes (1812 tests). The backend-sync test was run with `backend/` mounted.
- **End to end** on a throwaway Postgres database, migrated (also down to 1786000040 and back up) and then dropped:
  1. With the flag off, nothing was seeded.
  2. Seed: 9 stores, 134 furniture, 25 materials and 28 wallpapers, with 187 files stored.
  3. Seed again: "already seeded", nothing changed.
  4. The studio oboy library listed the demo wallpapers, and the estimate counted rolls from the picked wallpaper's roll size.
  5. `--remove` deleted everything listed above, plus 187 files, and left the marker.
  6. The next seed was a no-op ("removed earlier").
  7. `--force` reseeded.
  8. Partner stores and admin-catalog furniture were untouched throughout.

## How to remove

```
docker compose -f docker-compose.prod.yml exec -T api python -m app.seed_demo_stores --remove
```

This deletes every `is_demo` store, its furniture, materials and wallpapers, and their photos under `furniture/demo/`, `materials/demo/` and `wallpapers/demo/`. Furniture and wallpapers are deleted explicitly because their `store_id` is `ON DELETE SET NULL`: if they were orphaned instead, they would show up as admin-catalog furniture or shared library wallpapers. The marker row then keeps every later deploy from seeding the demo again.

**To remove permanently:** run `--remove` once. The marker is enough on its own. To be extra sure, also set `DEMO_STORES=0` in the deploy environment, or delete the `run_seed app.seed_demo_stores` line in `deploy/remote-deploy.sh`. To bring the demo back, run `python -m app.seed_demo_stores --force`.

**Side effects of removing:**

- `room_furniture_placements` rows for demo pieces cascade away. None should exist, because the pieces cannot be placed.
- `shop_inquiries` sent to demo stores cascade away.
- `room_finishes.material_id` and `orders.store_id` become NULL.
- Order lines keep their soft ids, names and prices.
- Rooms that used a demo wallpaper keep its URL in their JSON, but the image is gone. The wall falls back to the AI-priced photo line.

## Needs attention

- **Rights:** there is no contract and no content licence. Every site says "all rights reserved". Remove the demo, or get written permission, before the build is used beyond the presentation.
- **Shop owners:** the demo stores have no owner. Inquiries and orders to them reach an admin-managed shop, not the store itself.
- **Flutter app:** see the `has_model` note above.
- **Studio wallpaper library:** the frontend pages through the whole oboy bucket, newest first. The 28 demo wallpapers are the newest, so they appear first.
