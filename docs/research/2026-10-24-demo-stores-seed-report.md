# Demo stores seed: what was collected and how to remove it (2026-10-24)

For the investor/customer presentation, production shows real Tashkent stores with
their real products before any contract. Every seeded store has
`moderation_note = "DEMO: shartnomasiz namuna ma'lumot"` and can be removed with one
command (see the end).

- Fetcher: `backend/scripts/demo_catalog/fetch.py`. It runs on a dev machine and needs
  `requests beautifulsoup4 lxml pillow`, which are not in the backend image.
- Data: `backend/app/seed_data/demo_stores/catalog.json` plus `images/<store>/<n>.webp`
  (longest side 800 px or less, WebP quality 75).
- Seed: `backend/app/seed_demo_stores.py`. `deploy/remote-deploy.sh` runs it after
  `seed_estimate_catalog`.

## How the data was collected

The fetcher read only public listing and product pages: no login and no forms. It made
one request at a time with a 1 s pause and sent a normal Chrome User-Agent. It checked
every URL against that host's robots.txt first, images included, and its matcher
handles `*` and `$`. Downloaded pages and images were only parsed or re-encoded, never
executed. Product names are kept as each store shows them (Uzbek on Dafna, Russian
elsewhere) and trimmed to 200 characters. When one store uses the same name twice, the
second gets a suffix such as "Кровать (2)", because `(name_uz, store)` is the seed key.

## Per store

| Store | Kind | Items | Price | Photos | Notes |
|---|---|---|---|---|---|
| Dafna (dafna.uz) | divan 7, shkaf 4, stul 3, stol 5, karavot 1, lampa 3 | 23 | UZS, all items | 23, 264 KB | Product URLs from the Uzbek sitemap. Many sitemap entries are discontinued and their pages return HTTP 500; those were skipped. Sizes come from the product's Width/Depth/Height specs. |
| ARCA Mebel (arcamebel.uz) | shkaf 8, stol 4, karavot 7 | 19 | UZS, all | 19, 740 KB | From the living-room and bedroom category pages (JSON-LD). Many items are sets ("Гостиная …", "С/с … 8+1" table sets, "Спальня …"). They are filed under the main piece. Sizes come from JSON-LD where given. Fewer than 25 because of per-category caps. |
| Ergo (ergo.uz) | divan 8, stul 6, stol 5, shkaf 3 | 22 | UZS, all | 22, 340 KB | Office-focused site. Taken from office sofas, dining chairs, coffee tables and bookcases. No sizes on the pages. |
| Comfort Mebel (comfort-mebel.uz) | divan 9, karavot 5, shkaf 7, stol 4 | 25 | none (`price_uzs` null; the shop shows "narxini so'rang") | 25, 920 KB | Older photos point to `new.comfort-mebel.uz`, which no longer resolves. The same files are served from `comfort-mebel.uz`, so the fetcher uses that host. "Размер W × D" is used as a footprint only for sofas, tables and beds. |
| Keng Makon (kengmakon.uz) | none | 0 | | | **Skipped.** Its image CDN `cdn.kengmakon.uz` has `robots.txt: Disallow: /`, so no photos could be taken. The listing pages are rendered client-side; product pages were read from the sitemap. |
| Lumen LUX (lumenlux.uz) | lampa: 12 chandeliers (shift), 6 sconces (devor), 5 floor lamps (pol) | 23 | UZS, all | 23, 348 KB | From the category pages' JSON-LD. The sconce and floor-lamp categories had fewer items than the quota. |
| Aura Lighting (auralighting.uz) | lampa: 14 chandeliers, 6 sconces, 5 table/floor lamps | 25 | UZS, all | 25, 568 KB | Size comes from each product's own size block. The page also has a search sidebar listing other products' sizes, which is ignored. |
| Bestart (bestart.uz) | lampa: 15 chandeliers | 15 | none (null; the site shows no price on these) | 15, 240 KB | The only indoor category. The rest of the site is street lighting. Sizes come from "Габариты D…*H…". |
| Sanat Hali (prom.uz seller page) | boshqa (carpets) 14 | 14 | null, on purpose | 14, 1.1 MB | Every rug is listed "от 380 000 сум", a from-price rather than the rug's price, so it is not seeded as one. Photos are served from `devel.prom.uz/upload/…`, whose robots.txt allows all. `www.prom.uz` disallows `/upload/` on its own host. No contact data: the research file has a directory listing only. |
| MAFF (maff.uz) | materials: laminat 10, parket 6 (m2), eshik 9 (dona) | 25 | UZS, all | 25, 652 KB | Floors are taken only when the page says "Цена за м²". Doors are priced per leaf. Parquet is all Coswick (the only parquet category with listings). In-stock items come first. |
| Imzo (imzo.uz) | none | 0 | | | **Skipped.** Windows and doors are sold through a calculator and no product page has a price. `Material.price_uzs` is NOT NULL. |

Total: 9 stores, 166 furniture, 25 materials, 191 photos, 5.1 MB. The fetch took
about 700 requests across the runs.

Store contacts come from `2026-10-24-uz-stores-catalogs.md`: phone and Telegram where
the stores publish them. The district is left empty.

## What the seed does

- A store is looked up by `name`, an item by `(name_uz, store_id)`. The seed only
  inserts, so existing rows and admin edits are kept. A photo is uploaded, with
  `app.core.storage.upload_file`, only for a row being inserted. Keys are
  `furniture/demo/<uuid>_thumb.webp` and `materials/demo/<uuid>.webp`.
- Stores: `status=approved`, `is_active=true`, `partner_tier=standard`, plus the DEMO note.
- Furniture: `glb_key` null, `status=approved`, `is_active=true`, and `thumbnail_key`
  set. Placement: chandeliers `shift`, sconces `devor`, floor and table lamps `pol`,
  everything else `pol`. Footprint and height are set when the source lists them.
- Materials: `image_url` holds the stored URL, the same as other materials;
  `smeta_key` is null (picked by hand like other floors).
- A store whose name matches a demo store but is *not* marked DEMO is never touched.
  This covers a real partner added later under the same name.
- After a seed or a removal it drops the `materials:`, `furniture:` and `stores:` caches.

## Furniture without a 3-D model

Checked how the app treats GLB-less furniture:

- Shop (`pages/dokon`, `components/dokon`): uses only `thumbnail_url` and `price_uzs`.
  A null price shows "ask price". Correct as it was.
- Studio "3D Modellar" picker: a shop item without a model already shows a "no model"
  badge with the place button disabled.
- **Fixed:** the studio loaded `GET /furniture?per_page=100` with no ORDER BY. 166
  photo-only demo pieces could have pushed real models out of those 100. Those models
  would then disappear from the picker and stop rendering in rooms that already have
  them. The endpoint now takes `has_model=true` (filter `glb_key IS NOT NULL`, part of
  the cache key), and `ThreeDPage` uses it.
- **Fixed:** the AI designer (`/ai-design`, `_run_design`) and the room-builder agent
  (`_load_all_furniture`) were offered every active piece. Both now get only pieces
  with a `glb_key`.
- **Fixed:** design presets (`presetPlan`) skip catalog items without a `glb_url`.
- Tests: `backend/tests/test_ai_design_catalog_filter.py` and a new case in
  `frontend/src/lib/__tests__/aiDesignPresets.test.ts`.

## Verification

- `backend/tests/test_seed_demo_stores.py` (17 tests) checks:
  - every category, unit, placement and room type is valid, and every photo exists and
    is WebP;
  - names are unique per store and fit;
  - furniture prices are positive or null, and materials always have a price;
  - seeding twice inserts once and uploads once;
  - a real store with a demo name is left alone;
  - `--remove` removes only DEMO stores and their rows, and returns exactly the demo
    photo keys.
- Full backend suite, run in the `andoza_ai-api` image with this worktree mounted: 1379
  passed, 1 skipped. `tests/test_push.py` was excluded because the local image has no
  `firebase_admin` installed, which has nothing to do with this change.
- Frontend: `tsc --noEmit` is clean. The vitest runs for lib, studio and shop pass
  (1530 tests). One file failed to load only because the container had no `backend/`
  mount.
- End to end on a throwaway Postgres database (`demo_seed_check`, migrated to head, then
  dropped):
  1. Seed: 9 stores, 166 furniture and 25 materials inserted.
  2. Seed again: 0 inserted, 191 already there.
  3. `--remove`: 9 stores, 166 furniture, 25 materials and 191 images deleted.
  4. Afterwards the partner stores from `seed_partners` were untouched and no orphaned
     furniture rows (`store_id IS NULL`) were left.

## How to remove

```
docker compose -f docker-compose.prod.yml exec -T api python -m app.seed_demo_stores --remove
```

This deletes every store whose `moderation_note` starts with `DEMO:`, then its furniture
and materials, then their photos under `furniture/demo/` and `materials/demo/`. Furniture
rows are deleted explicitly because `furniture.store_id` is `ON DELETE SET NULL`: if the
store were simply deleted, they would turn into visible "admin catalog" items.

To stop the demo coming back on the next deploy, also delete the
`run_seed app.seed_demo_stores …` line in `deploy/remote-deploy.sh` (or delete
`app/seed_data/demo_stores/`).

Side effects of removing:

- `room_furniture_placements` rows for these pieces cascade away. None should exist,
  because the pieces cannot be placed.
- `shop_inquiries` to the demo stores cascade away.
- `room_finishes.material_id` and `orders.store_id` become NULL.
- Order lines keep their soft `furniture_id`/`material_id`, name and price.
- Room JSON that names a furniture id stays as it is.

## Needs attention

- Rights: no contract and no content licence. The research note says every site is "all
  rights reserved". The data is marked DEMO for that reason. Remove it, or get written
  permission, before the presentation build is used beyond the demo.
- The demo stores have no owner. A shopper's inquiry or order to them goes to an
  admin-managed shop that nobody at the store sees.
- The demo materials (MAFF laminate, parquet and doors) can be picked in the estimate
  and by the room-builder agent like any other material.
