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
| Deraza bozori — o'rtacha narx (not a store) | 6 materials: 5 windows (deraza), 1 balcony door (eshik) | UZS, median market price | 6 drawn illustrations, 20 KB | Added in catalog version 2. See "Windows: average market prices" below. |

**Total:**
- Catalog version 1, already seeded in production: 9 stores, 134 furniture pieces, 25 materials, 28 wallpapers, 187 photos (5.5 MB).
- Catalog version 2 adds the window store: 1 store and 6 materials.

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

## Windows: average market prices (catalog version 2)

No window maker publishes a price list. Imzo shows no prices and Akfa has no catalog. The owner therefore decided to add windows at the **average Tashkent market price**, clearly labelled as such.

**How they appear:**
- They sit in a separate demo store, **"Deraza bozori — o'rtacha narx"**. It has no website, phone or Telegram.
- Its `moderation_note` reads "DEMO: Toshkent bozoridagi o'rtacha narx (2026-yil oktabr), do'kon taklifi emas" ("average Tashkent market price, October 2026, not a store's offer").
- No brand is named as the seller. Akfa, Ekopen, Engelberg and Termo appear only as the profile inside a product name.
- In catalog.json each item carries `price_basis` (`market_median`, or `market_median_x_area` for the per-piece window), `sample_size` and `sources`, which lists every listing URL used.
- The pictures are plain window drawings made by `backend/scripts/demo_catalog/draw_windows.py` (Pillow). No photo was copied.

| Item | Category | Unit | Price (UZS) | n | How it was derived |
|---|---|---|---|---|---|
| Plastik deraza (Akfa/Ekopen profili), 2 kamerali oyna paketi | deraza | m2 | **700 000** | 24 | Median of all points |
| Energiya tejamkor plastik deraza (Engelberg/Termo profili) | deraza | m2 | **775 000** | 14 | Median of all points |
| Alyumin deraza, sovuq profil | deraza | m2 | **632 500** | 10 | Median of all points |
| Issiq alyumin deraza (termo profil) | deraza | m2 | **1 300 000** | 5 | Median of all points. Few data points. |
| Plastik balkon eshigi | eshik | m2 | **850 000** | 8 | Median of all per-m² points |
| Tayyor plastik deraza 1,2×1,4 m (Akfa profili) | deraza | dona | **1 176 000** | 24 | Standard median 700 000 × 1.68 m² |

### Method

**When and how the prices were read:**
- Collected on 24.10.2026 from public pages only: olx.uz, prom.uz `/ads/` pages, glotr.uz, stroyka.uz, flagma.uz, tovar.uz, goldplast.uz and asabiyya.uz. No log-ins, no forms, no prom.uz `/upload/` files.
- Prices quoted in USD or "у.е." are converted at 1 USD = 12 100 UZS. The prom.uz sellers' own сум figures imply the same rate.
- Window prices in Tashkent are quoted per m² of the finished, made-to-order window. Measuring, delivery and installation are usually included.

**Which data points count:**
- A point counts when the page states the price per m² ("за м²", "кв.м", "kv.m").
- A made-to-order window listing with no unit also counts, by that market convention. These points are marked *unit not stated* below. They sit at the cheaper end, since they are often "from" teaser prices.
- Explicit-only medians are given next to each table for comparison.

**What was left out:**
- Repairs, sills, mosquito nets, shutters, storefront glazing (vitraj), used (б/у) items and placeholder prices such as "от 1 / кв. метр".
- Listings last updated before 2024.
- Some sellers appear more than once, on different sites or in different listings, and are noted. "от" prices are floor prices.

**The per-piece window:**
- Only one seller (Window Line) sells ready-made windows with a stated size: 700 000 and about 508 000 UZS/m².
- The 1.2 × 1.4 m piece is therefore the standard median × area, not an observed price.

### Standard PVC (Akfa / Ekopen / Imzo / economy), per m²

| # | Source | Seller | Quoted | Unit on page | UZS/m² | Updated |
|---|---|---|---|---|---|---|
| 1 | https://flagma.uz/ru/plastikovye-okna-v-tashkente-akfa-ekopen-o1826623.html | ARMAMETALL | 700 000 сум | м² | 700 000 | 24.10.2026 |
| 2 | https://tovar.uz/uz/service/583 | ARMAMETALL (same seller as #1) | 550 000 UZS | kv.m | 550 000 | 22.02.2026 |
| 3 | https://prom.uz/ads/plastikovye-i-alyuminievye-okna-1/ | Vector Oyna Group | 855 000 сум | "за 1 квадратный метр" | 855 000 | 19.06.2026 |
| 4 | https://prom.uz/ads/akfa-rom-akciya-toskent-kv-m/ | Deraza House | 75 $ | kv m | 907 500 | 06.07.2026 |
| 5 | https://prom.uz/ads/akfa-rom-chilonzor-65-kvm-akciya/ | Oyna House | 65 $ | кв.м | 786 500 | 04.06.2026 |
| 6 | https://prom.uz/ads/oq-akfa-plast-toshkent-shaxri-va-viloyatlariga/ | Oyna House (same seller as #5) | 70 $ | kv metri | 847 000 | 19.06.2026 |
| 7 | https://prom.uz/ads/akfa-plast-oq-70-kvm-toshkent-shaxri-va-viloyatlariga-xizmat/ | Mega Deraza Ta'minot | 70 $ | kv. m | 847 000 | 04.06.2026 |
| 8 | https://www.olx.uz/d/obyavlenie/plastikovye-okna-akfa-masterplast-ekopen-ID2k4eo.html | private | 440 000 сум | "за 1кв.м" | 440 000 | 14.10.2026 |
| 9 | https://www.olx.uz/d/obyavlenie/plastikovye-okna-akfa-ekopen-ID1UUIO.html | private | 750 000 сум | "Цена за 1м2" | 750 000 | 23.10.2026 |
| 10 | https://glotr.uz/pvx-okna-i-dveri-p-914785/ | Eurogar | 947 114 сум | кв.м | 947 114 | none shown |
| 11 | https://glotr.uz/plastikovie-okna-p-1077621/ | Imzo Rohat | от 1 400 000 сум | кв.м | 1 400 000 | none shown |
| 12 | https://www.olx.uz/d/obyavlenie/akfa-akfa-okna-plastikovye-ekopen-ID3vOoH.html | private | 550 000 сум | unit not stated | 550 000 | 23.10.2026 |
| 13 | https://www.olx.uz/d/obyavlenie/akfa-ramy-plastikovye-okna-i-dveri-ID42DJQ.html | private | 700 000 сум | unit not stated | 700 000 | 21.10.2026 |
| 14 | https://www.olx.uz/d/obyavlenie/plastikovye-okna-akfa-romlar-plastikovye-okna-i-razdvizhnye-sistemy-ID4tTIA.html | private | 730 000 сум | unit not stated | 730 000 | 14.10.2026 |
| 15 | https://www.olx.uz/d/obyavlenie/akfa-okna-i-dveri-plastikovye-okna-termo-engelberg-montazh-ID4u22d.html | Omad Metal | 750 000 сум | unit not stated | 750 000 | 24.10.2026 |
| 16 | https://www.olx.uz/d/obyavlenie/tsehdan-akfa-plast-eshik-akfa-rom-romlar-deraza-plastikovye-okna-dveri-ID3scEv.html | private | 650 000 сум | unit not stated | 650 000 | 11.10.2026 |
| 17 | https://www.olx.uz/d/obyavlenie/akfa-okno-dvery-na-zakaz-ID4ibCr.html | private | 550 000 сум | unit not stated | 550 000 | 16.10.2026 |
| 18 | https://www.olx.uz/d/obyavlenie/ekopen-okna-i-dveri-ID3t2Ym.html | private | 40 у.е. | unit not stated | 484 000 | 12.10.2026 |
| 19 | https://prom.uz/ads/ekopen-akfa-enjelberg/ | Metalplast | 500 000 сум | unit not stated | 500 000 | 05.10.2026 |
| 20 | https://prom.uz/ads/okna-akfa-ekopen-termo/ | Eshik Plast Door | 544 607 сум | unit not stated | 544 607 | 19.06.2026 |
| 21 | https://prom.uz/ads/akfa-plastik-derazalar/ | Door Style | 650 000 сум | unit not stated | 650 000 | 06.07.2026 |
| 22 | https://prom.uz/ads/akfa-lider-plast-nemat/ | Jaluzi Design Craft | 450 000 сум | unit not stated | 450 000 | 19.06.2026 |
| 23 | https://prom.uz/ads/akfa-okna-plastikovye-novye-i-gotovye-v-taskente-1000x1200/ | Window Line | 840 000 сум, 1000×1200 mm | per piece | 700 000 | 06.07.2026 |
| 24 | https://prom.uz/ads/akfadan-tayyor-yangi-rom-1500x1700/ | Window Line | 1 210 000 сум, 1400×1700 mm | per piece | 508 403 | 06.07.2026 |

**Median 700 000** (n = 24). Explicit per-m² points only (#1–11): 847 000.

### Energy-saving / warm PVC (Engelberg, Termo), per m²

| # | Source | Seller | Quoted | Unit on page | UZS/m² | Updated |
|---|---|---|---|---|---|---|
| 1 | https://glotr.uz/engelberg-7000-engelberg-8000-5-kamernie-goryachie-profili-rami-povishennoy-vidimosti-p-1078855/ | Imzo Rohat | от 1 700 000 сум | кв.м | 1 700 000 | none shown |
| 2 | https://glotr.uz/engelberg-7000visokaya-teploizolyatsiyaprochnost-i-dolgovechnost-p-1085524/ | Imzo Rohat (same seller as #1) | от 1 500 000 сум | кв.м | 1 500 000 | none shown |
| 3 | https://stroyka.uz/offer/plastikovye-okna-engelberg-7000 | BRAND WORLD DREAM | 800 000 сум | кв. метр | 800 000 | 04.10.2024 |
| 4 | https://stroyka.uz/offer/plastikovye-okna-engelberg-80 | BRAND WORLD DREAM (same seller as #3) | 1 000 000 сум | кв. метр | 1 000 000 | 04.10.2024 |
| 5 | https://tovar.uz/service/583 | ARMA METALL (Termo, energy-saving glass units) | 550 000 UZS | кв.м | 550 000 | 22.02.2026 |
| 6 | https://flagma.uz/ru/engelberg-akfa-thermo-okna-dveri-i-vitrazhi-o2004994.html | City trust buildings | 750 000 сум | м² | 750 000 | 02.03.2025 |
| 7 | https://goldplast.uz/products/plastikovie-okna-i-dveri/ | Gold Business Plast (AKFA 7000) | от 60 $ | м² | 726 000 | 2026 |
| 8 | https://glotr.uz/plastikovie-okna-akfa-ekopen-enjelberg-p-89029/ | Metalplast | 550 000 сум | кв.м | 550 000 | none shown |
| 9 | https://prom.uz/ads/okna-premium-klassa-engelberg-7000-akfa-imzo/ | Deraza Plast Atlas | 1 936 382 сум ($160) | unit not stated | 1 936 382 | 19.06.2026 |
| 10 | https://prom.uz/ads/plastikovye-okna-i-dveri-termo-akfa-engelberg/ | Window Style | 847 167 сум ($70) | unit not stated | 847 167 | 07.07.2026 |
| 11 | https://prom.uz/ads/okna-i-dveri-akfa-termo-engelberg/ | Vitraj Line UZ | 665 631 сум ($55) | unit not stated | 665 631 | 19.06.2026 |
| 12 | https://www.olx.uz/d/obyavlenie/akfa-engelberg-thermo-okna-zakaz-v-tashkente-akfa-kachestvo-garantiya-ID3D0v0.html | private | 840 000 сум | unit not stated | 840 000 | 18.10.2026 |
| 13 | https://www.olx.uz/d/obyavlenie/okna-i-dveri-akfa-engelberg-termo-ekopen-ID4faXJ.html | private | 60 у.е. | unit not stated | 726 000 | 23.10.2026 |
| 14 | https://www.olx.uz/d/obyavlenie/akfa-okna-i-dveri-plastikovye-okna-termo-engelberg-montazh-ID4u22d.html | Omad Metal | 750 000 сум | unit not stated | 750 000 | 24.10.2026 |

**Median 775 000** (n = 14). Explicit per-m² points only (#1–8): 775 000.

### Aluminium windows, per m²

| # | Source | Seller | Quoted | Unit on page | UZS/m² | Updated |
|---|---|---|---|---|---|---|
| 1 | https://prom.uz/ads/akfa-rom-akciya-toskent-kv-m/ | Deraza House (Akfa alumin) | 50 $ | kv m | 605 000 | 06.07.2026 |
| 2 | https://glotr.uz/allyumininvie-okna-p-89170/ | Metalplast | 550 000 сум | кв.м | 550 000 | none shown |
| 3 | https://glotr.uz/alyuminievie-okna-po-nizkim-tsenam-p-191639/ | Eurookna.uz | 400 000 сум | кв.м | 400 000 | none shown |
| 4 | https://glotr.uz/okna-akfa-alyuminiy-pvx-p-552787/ | Ulug'bek Fazliddin Nilufar | от 400 000 сум | кв.м | 400 000 | none shown |
| 5 | https://stroyka.uz/offer/alyuminievye-okna-shampion | BRAND WORLD DREAM (cold glazing) | 750 000 сум | кв. метр | 750 000 | 04.10.2024 |
| 6 | https://stroyka.uz/offer/alyuminievye-okna-6-88182 | Winplast System | от 900 000 | кв. метр | 900 000 | 06.02.2024 |
| 7 | https://flagma.uz/ru/alyuminievye-okna-o1884739.html | TEXNOINVEST-ST | 700 000 сум | м² | 700 000 | 21.02.2024 |
| 8 | https://flagma.uz/ru/alyuminievye-okna-ot-akfa-o1787313.html | Eurookna | 500 000 сум | м² | 500 000 | 11.09.2020 (old) |
| 9 | https://flagma.uz/ru/okna-dveri-i-vitrazhi-iz-alyuminievogo-profilyapvh-profiltermo-profil-o2036945.html | Infinity Systems | 70 $ | м² | 847 000 | 28.09.2026 |
| 10 | https://prom.uz/ads/alyuminievye-okna-procnost/ | Stroy Expo | от 660 000 сум | unit not stated | 660 000 | 01.04.2024 |

**Cold aluminium, median 632 500** (n = 10). Explicit per-m² points only (#1–9): 605 000. Point #8 is from 2020. I kept it because cold aluminium is a flat-priced commodity, and dropping it moves the median to 660 000.

| # | Source | Seller | Quoted | Unit on page | UZS/m² | Updated |
|---|---|---|---|---|---|---|
| 11 | https://stroyka.uz/offer/thermo-78-engelberg | BRAND WORLD DREAM (Engelberg Thermo 78) | 1 300 000 сум | кв. метр | 1 300 000 | 04.10.2024 |
| 12 | https://asabiyya.uz/alyuminievye-okna-tashkent/ | Asabiyya.uz (AKFA Termo 57) | от 1 200 000 – 2 500 000 сум | м² | 1 200 000 | 2026 |
| 13 | https://glotr.uz/alyuminievie-okna-termo-65-art-01-p-914767/ | Eurogar (Termo 65) | 828 724 сум | кв.м | 828 724 | none shown |
| 14 | https://glotr.uz/alyuminievie-okna-p-1071408/ | Imzo Rohat | от 1 400 000 сум | кв.м | 1 400 000 | none shown |
| 15 | https://glotr.uz/visokokachestvennie-energosberegayushie-dveri-i-okna-termo-p-1084938/ | Imzo Rohat (same seller as #14) | 2 604 562 сум | кв.м | 2 604 562 | none shown |

**Warm (thermal-break) aluminium, median 1 300 000** (n = 5, all explicit per m²). This is a thin sample.

### Plastic balcony door, per m²

No listing is titled as a balcony door with a per-m² price. The rows below are PVC doors; Eurookna's listings say balcony doors are among them.

| # | Source | Seller | Quoted | Unit on page | UZS/m² | Updated |
|---|---|---|---|---|---|---|
| 1 | https://flagma.uz/ru/plastikovaya-dver-akfa-o1784828.html | Eurookna (balcony mentioned) | 1 362 500 сум | м² | 1 362 500 | 10.03.2022 |
| 2 | https://flagma.uz/ru/plastikovye-dveri-o1788718.html | Eurookna | 800 000 сум | м² | 800 000 | 11.09.2020 |
| 3 | https://flagma.uz/ru/kupit-plastikovye-dveri-o1791739.html | WinPlast System | 900 000 сум | м² | 900 000 | 03.06.2022 |
| 4 | https://flagma.uz/ru/plastikovye-i-alyuminievye-dveri-v-eurookna-o1787873.html | Eurookna | 1 299 000 сум | м² | 1 299 000 | 10.03.2022 |
| 5 | https://prom.uz/ads/plastikovye-dveri-1/ | Winplast System | от 900 000 сум | unit not stated | 900 000 | 22.11.2022 |
| 6 | https://prom.uz/ads/plastikovye-dveri-akfa/ | Akfa Romlari (its windows: "от 40 доллар / кв. метр") | от 484 095 сум | unit not stated | 484 095 | 16.01.2026 |
| 7 | https://prom.uz/ads/oknadveri-vitraji/ | Olmaliq Zafar Plast | от 700 000 сум | unit not stated | 700 000 | 31.03.2025 |
| 8 | https://prom.uz/ads/metalloplastikovye-ramy-i-plastikovye-dveri/ | Door Design | 423 583 сум ($35) | unit not stated | 423 583 | 04.06.2026 |

**Median 850 000** (n = 8). Explicit points only (#1–4): 1 099 500. Those four date from 2020–2022.

These are the weakest data. Two private OLX sales of ready balcony units were left out as one-off sales: 135 × 247 cm for 100 у.е. (https://www.olx.uz/d/obyavlenie/prodaetsya-kachestvennyy-balkonnyy-blok-iz-pvh-profilya-ID4t9Yn.html) and an Engelberg Termo unit, 129.5 × 225.5 cm, for 300 у.е. (https://www.olx.uz/d/obyavlenie/srochno-tayyor-7000engelberg-termo-129-5x225-5-razmerda-ID40Saz.html).

### In the shop, studio and estimate

- **Shop:** the windows show in the shop's materials tab under "Deraza" ("Window", "Окно"), and the balcony door under "Eshik". The admin materials list shows all six.
- **Estimate (smeta):** it does not price windows or doors. Openings are only subtracted from wall areas, and door widths from the skirting. So these materials are not used there, and no change was needed.
- **Studio:** a "deraza" opening in the studio is geometry only and is not linked to a material.

## When the seed runs

- **The flag:** it runs only when `DEMO_STORES` is on. The backend setting defaults to off. `docker-compose.prod.yml` sets `DEMO_STORES: ${DEMO_STORES:-1}` for the api service, so production seeds the demo for the presentation. `--force` runs it even with the flag off.
- **Each row only once, by catalog version:**
  - catalog.json has a top-level `version` (now 2). Each store and item has a `since` version. It defaults to 1, and an item inherits its store's.
  - A `seed_markers` row `demo_stores_v<N>` records the highest version applied. A deploy inserts only the rows whose `since` is greater, then replaces the marker.
  - A database seeded before versions existed has demo stores but no version marker, and counts as version 1 applied. On the next production deploy, exactly the window store and its 6 items are added, and the marker `demo_stores_v2` is written. Later deploys do nothing.
  - A row or store an admin deleted or renamed is never put back. A store with no new item is not even looked at.
  - **To add products later:** give them (or their new store) `"since": N+1` and bump `version` to N+1.
  - `scripts/demo_catalog/fetch.py` keeps `version`, store `since` values and the hand-made window store when it refetches.
- **The removal marker:** after `--remove`, a `seed_markers` row with key `demo_stores_removed` stops later deploys from seeding again. This includes new catalog versions. `--force` clears that marker, seeds every version again (rows still present by name are kept) and sets the version marker.
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

**Windows and catalog versions (version 2):**
- `test_seed_demo_stores.py` now has 33 tests. The new ones check:
  - versions are consistent, and version 1 is exactly production's 9 stores and 187 rows;
  - the window store is labelled as average prices (name, note, no brand as the seller, `sample_size` = number of `sources`);
  - a fresh database seeds everything and writes `demo_stores_v2`;
  - a database seeded like production (version 1, no marker) gets exactly the window store and its 6 items;
  - a second run adds nothing;
  - `--remove` also blocks new versions;
  - an admin-deleted version-1 material, furniture piece or whole store is not restored;
  - a later version-3 item reaches a database at `demo_stores_v2`.
- Full backend suite: 1424 passed, 1 skipped (`tests/test_push.py` excluded as before).
- No frontend code changed.
- The upgrade path was tested with the in-memory session, not on a throwaway Postgres database.

**Original seed (version 1):**
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
- **Window prices:** they are medians of public listings, not anyone's offer. Several things make them loose:
  - many listings give no unit, and "от" prices are floor prices;
  - the balcony-door figure rests on 8 PVC-door points, 5 of them from 2020–2022;
  - warm aluminium has only 5 points;
  - the 1.2 × 1.4 m piece is computed from the median, not observed.
  
  The window store accepts inquiries and orders like every demo store, but no one fulfils them. Consider hiding its order button, or relabelling the prices, before real users see it.
