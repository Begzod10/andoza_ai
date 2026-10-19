# Mebel uslubi va smeta narxlari — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ikki o'zgarish. Birinchisi: tayyor uslub o'z uslubidagi mebelni tanlaydi, uslubni sotuvchi va admin belgilaydi. Ikkinchisi: smeta tanlanmagan pol, oboy va bo'yoqni mediana narxdan hisoblaydi, galtelni esa bozor narxidan.

**Architecture:** Backend'da `furniture.styles` (Postgres `ARRAY(String(20))`, bo'sh = hamma uslubga mos) qo'shiladi. U sotuvchi, admin va katalog API orqali o'tadi. Frontend'da sotuvchi va admin formalariga chiplar qo'shiladi, `presetPlan` ning `pick` funksiyasi esa uslub va xona ballari bo'yicha tanlaydi. Smeta qismi `estimate_catalog.py` va `smeta.py` dagi kichik o'zgarishlardan iborat.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, pytest (`docker exec andoza_ai-api-1 pytest`), React 18, vitest (`cd frontend && PATH=/Users/mac/.local/node/bin:$PATH npx vitest run`).

**Spec:** [docs/superpowers/specs/2026-10-19-mebel-uslubi-va-smeta-design.md](../specs/2026-10-19-mebel-uslubi-va-smeta-design.md)

## Branch'lar
- Task 2–3 (B + C): `master` dan yangi `feat/smeta-median` branchi, PR #1.
- Task 4–7 (A): spec va shu plan turgan `feat/furniture-styles` branchi. Avval `master` bilan yangilanadi, PR #2.

## Global Constraints
- Uslublar: `neoklassika, klassik, zamonaviy, hitech, minimalist, skandinav, loft, milliy`. Tartib shu: saqlashda takrorlar olib tashlanadi va shu tartibga keltiriladi.
- O'zbekcha nomlar: Neoklassika, Klassik, Zamonaviy, Hi-Tech, Minimalist, Skandinav, Loft, Milliy.
- `styles` bo'sh ro'yxat bo'lsa, mebel hamma uslubga mos.
- Noto'g'ri uslub 422 qaytaradi, xabari: `styles {ro'yxat} dan bo'lishi kerak`.
- Galtel: `GALTEL_PIECE_PRICE_UZS = 11_000` (2 m polosa).
- Izoh matni: "Mahsulot tanlanmagan — do'kondagi o'rtacha narx olindi. Aniq narx uchun o'zingiz mahsulot tanlang."
- Merge = production deploy va migratsiya. Faqat foydalanuvchi aytganda, CI yashil bo'lgach merge qilinadi.
- Commit oxirida: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. Sotuvchi multipart formada `styles=""` (bo'sh) yuborsa, natija 422 emas, `[]` bo'lishi kerak. Test Task 4 da.
2. Katalogda uslubli mebel yo'q (hammasi `[]`). Tayyor uslub hozirgidek ishlashi kerak: xona turi bo'yicha tanlash saqlanadi. Test Task 7 da.
3. `PATCH` da `styles` umuman yuborilmasa, mavjud uslublar o'chmasligi kerak. Test Task 4 da.
4. Katalog javobida `styles` yo'q bo'lsa (deploy oldidan qolgan eski kesh), frontend yiqilmasligi kerak. Test Task 7 da (`styles` maydonisiz mebel).
5. Mediana birlik narx bo'yicha olinadi, sotuv narxi bo'yicha emas: pack_qty farq qilsa, natija to'g'ri bo'lishi kerak. Test Task 2 da.

---

### Task 1: Lokal test akkauntini o'chirish (kod yo'q)

- [ ] **Step 1:** Scratchpad'dagi `jar`/`pw` bilan `qa_presets` sifatida kirib, ilovaning o'z endpoint'i `POST /api/v1/auth/delete-account` ni chaqirish. Agar u parol yoki tasdiq so'rasa, body'ni `backend/app/routers/auth.py` dagi schemadan olish.
- [ ] **Step 2:** Tekshirish: `POST /api/v1/auth/login` (`qa_presets`) → 401, `GET /api/v1/rooms/48396149-8de4-40f9-a2ab-29be5e7a60f9` → 401 yoki 404.
- [ ] **Step 3:** Scratchpad'dagi `creds.txt`, `pw`, `jar` fayllarini o'chirish.

---

### Task 2: Smetada mediana narx (B)

**Files:**
- Modify: `backend/app/services/estimate_catalog.py` (`pick_cheapest_finishes` → `pick_median_finishes`, `load_estimate_catalog`)
- Modify: `backend/app/services/smeta.py` (`FINISH_STAND_IN_NOTE`)
- Modify: `frontend/src/pages/smeta/SmetaPage.tsx` (stand_in izohi)
- Test: `backend/tests/test_smeta_finish_fallback.py`, `frontend/src/pages/smeta/SmetaPage.test.tsx`

**Interfaces:**
- Produces: `pick_median_finishes(materials: Iterable[Material]) -> dict[str, Material]`, kalitlari `finish:<category>`, `FINISH_UNITS` o'zgarmaydi.

- [ ] **Step 1: Failing testlar** (`test_smeta_finish_fallback.py` dagi loader testi o'rniga):

```python
@pytest.mark.parametrize(("prices", "chosen"), [
    ([95_000], 95_000),
    ([80_000, 95_000], 80_000),             # juftda pastki o'rtadagisi
    ([120_000, 80_000, 95_000], 95_000),
    ([60_000, 80_000, 95_000, 210_000], 80_000),
])
def test_the_median_product_of_a_finish_is_kept(prices, chosen):
    picked = ec.pick_median_finishes([product("laminat", p, "m2") for p in prices])
    assert picked["finish:laminat"].price_uzs == chosen

def test_inactive_and_wrong_unit_products_do_not_count_towards_the_median():
    picked = ec.pick_median_finishes([
        product("laminat", 10_000, "m2", active=False), product("laminat", 31_000, "dona"),
        product("laminat", 80_000, "m2"), product("laminat", 95_000, "m2"), product("laminat", 120_000, "m2"),
    ])
    assert picked["finish:laminat"].price_uzs == 95_000

def test_the_median_is_by_unit_cost():
    small = product("boyoq", 60_000, "litr"); small.pack_qty = 1      # 60 000 / l
    big = product("boyoq", 200_000, "litr"); big.pack_qty = 5         # 40 000 / l
    mid = product("boyoq", 50_000, "litr"); mid.pack_qty = 1          # 50 000 / l
    assert ec.pick_median_finishes([small, big, mid])["finish:boyoq"] is mid
```

Mavjud `test_the_cheapest_active_product_of_each_finish_is_kept_by_its_selling_unit` olib tashlanadi. `tanlanmagan` tekshiruvlari qoladi, izohga qo'shimcha ravishda `"o'rtacha" in ln.warning` tekshiriladi.

- [ ] **Step 2:** `docker exec andoza_ai-api-1 pytest tests/test_smeta_finish_fallback.py -q`. Kutilgan natija: FAIL, `pick_median_finishes` yo'q.
- [ ] **Step 3: Implementatsiya.** Har bir kalit bo'yicha mos mahsulotlarni yig'ish, `unit_cost` bo'yicha saralash, `(n - 1) // 2` indeksidagisini olish. `load_estimate_catalog` endi `pick_median_finishes` ni chaqiradi. `FINISH_STAND_IN_NOTE` Global Constraints'dagi matnga almashtiriladi. Modul docstring'idagi "cheapest floor, wallpaper and paint" iborasi "median" ga almashtiriladi.
- [ ] **Step 4: Frontend.** `SmetaPage.test.tsx` dagi stand_in testida `toContain("eng arzon")` ni `toContain("o'rtacha")` ga almashtirish va testning yiqilishini ko'rish. Keyin `SmetaPage.tsx` matnini "Pol uchun mahsulot tanlanmagan, narx do'kondagi o'rtacha poldan olindi (taxminiy)." ga o'zgartirish.
- [ ] **Step 5:** Backend to'liq suite va frontend `SmetaPage.test.tsx`. Kutilgan natija: PASS.
- [ ] **Step 6:** Commit: "Smeta prices an unchosen finish from the median shop product".

---

### Task 3: Galtel bozor narxi (C)

**Files:** Modify: `backend/app/services/smeta.py` (`GALTEL_PIECE_PRICE_UZS`). Test: `backend/tests/test_smeta_galtel.py`.

- [ ] **Step 1: Failing test:** `def test_the_standard_strip_is_priced_at_the_market_median(): assert GALTEL_PIECE_PRICE_UZS == 11_000`.
- [ ] **Step 2:** Testni ishga tushirish. Kutilgan natija: FAIL, 40000 != 11000.
- [ ] **Step 3: Implementatsiya.** Konstanta 11 000 ga o'zgaradi. Ustidagi izohda manbalar yoziladi (2026-10-19 holatiga):
  - wert.uz TERMOTECH PENOPLAST LUX: 5 460–17 160 so'm, 80×80 modeli 2 m va 7 800 so'm;
  - prom.uz Де-Багет (ТЕПЛОДОМ): 7 500–24 000 so'm, 50×50 modeli 2 m va 7 500 so'm;
  - stroyka.uz: 8 000–13 500 so'm.

  Izohda bu narxlarning medianasi olinganini yozish. Warning matnidagi "standart 2 m polosa narxi" iborasi "bozordagi o'rtacha 2 m polosa narxi" ga almashtiriladi.
- [ ] **Step 4:** Backend to'liq suite. Kutilgan natija: PASS.
- [ ] **Step 5:** Commit: "Galtel's stand-in price is the market median (11 000 so'm per 2 m)". Push, PR #1 (B + C) ochish va PR'ni bog'lash. Merge faqat foydalanuvchi aytganda.

---

### Task 4: `furniture.styles`: migratsiya, model, tekshirish va sotuvchi API

**Files:**
- Create: `backend/alembic/versions/1786000038_furniture_styles.py` (`down_revision = "1786000037"`)
- Modify: `backend/app/models/furniture.py` (`room_type` ostiga)
- Modify: `backend/app/schemas/admin_catalog.py` (`FURNITURE_STYLES`, `normalize_styles`)
- Modify: `backend/app/schemas/seller.py`, `backend/app/routers/seller.py`
- Test: `backend/tests/test_seller.py`, yangi `backend/tests/test_furniture_styles.py`

**Interfaces:**
- Produces: `FURNITURE_STYLES: tuple[str, ...]` (Global Constraints tartibida).
- Produces: `normalize_styles(values: Iterable[str] | None) -> list[str]`. Bo'sh qatorlar tashlanadi, bo'sh joylar kesiladi, kichik harfga o'tkaziladi, takrorlar olib tashlanadi, `FURNITURE_STYLES` tartibida qaytariladi. Noma'lum qiymatga `ValueError` ko'taradi.
- Produces: `parse_styles_form(raw: str | None) -> list[str]`, ya'ni `normalize_styles(raw.split(","))`. Router'lar `ValueError` ni 422 ga aylantiradi.

- [ ] **Step 1: Failing testlar** (`test_furniture_styles.py`):

```python
def test_styles_are_cleaned_deduplicated_and_ordered():
    assert normalize_styles([" Milliy", "zamonaviy", "milliy", ""]) == ["zamonaviy", "milliy"]

def test_no_styles_means_every_style():
    assert normalize_styles(None) == [] and parse_styles_form("") == [] and parse_styles_form(None) == []

def test_an_unknown_style_is_refused():
    with pytest.raises(ValueError):
        normalize_styles(["barokko"])
```

`test_seller.py` da `test_seller.py:79` dagi fixture yordamchisiga `styles=[]` qo'shiladi va quyidagi testlar yoziladi:
  - yuklash `styles="hitech,zamonaviy"` bilan bo'lsa, javobda `["zamonaviy","hitech"]`;
  - `styles=""` → `[]`;
  - `styles="barokko"` → 422;
  - `PATCH {"styles": ["milliy"]}` → `["milliy"]`;
  - `PATCH {"styles": []}` → `[]`;
  - `PATCH {"name_uz": "x"}` uslublarni o'zgartirmaydi.

  `room_type` testlari qanday yozilgan bo'lsa, shu tarzda (`test_seller.py:290` parametrlari).
- [ ] **Step 2:** Testlarni ishga tushirish. Kutilgan natija: FAIL (import yoki atribut yo'q).
- [ ] **Step 3: Implementatsiya.**
  - Model: `styles: Mapped[list[str]] = mapped_column(ARRAY(String(20)), nullable=False, default=list, server_default="{}", comment=...)`.
  - Migratsiya: `op.add_column("furniture", sa.Column("styles", postgresql.ARRAY(sa.String(20)), nullable=False, server_default="{}"))`. `downgrade` ustunni o'chiradi.
  - `SellerFurnitureUpdate.styles: list[str] | None = None`, `SellerFurnitureOut.styles: list[str] = []`.
  - Router: `upload_furniture` ga `styles: str | None = Form(default=None)`, `update_furniture` da `"styles" in changes and changes["styles"] is not None` bo'lsa normalize qilinadi. `_out` yordamchisiga `styles=f.styles or []` qo'shiladi.
- [ ] **Step 4:** `docker exec andoza_ai-api-1 alembic upgrade head`, keyin `alembic downgrade -1 && alembic upgrade head`. Kutilgan natija: xatosiz. Keyin `pytest tests/test_furniture_styles.py tests/test_seller.py -q`. Kutilgan natija: PASS.
- [ ] **Step 5:** Commit: "Furniture carries the styles it suits; sellers set them".

---

### Task 5: Admin API va katalog javobi

**Files:**
- Modify: `backend/app/schemas/admin_catalog.py` (`FurnitureUpdate`, `FurnitureAdminOut`)
- Modify: `backend/app/routers/admin_catalog.py` (`POST /furniture` ~230, `PATCH` ~405, `_out` ~89)
- Modify: `backend/app/schemas/catalog.py` (`FurnitureOut`), `backend/app/routers/catalog.py` (~139)
- Test: `backend/tests/test_admin_catalog.py`, `backend/tests/test_catalog_materials.py` (yoki katalog furniture testi turgan fayl)

**Interfaces:** Consumes: Task 4 dagi `normalize_styles`, `parse_styles_form`.

- [ ] **Step 1: Failing testlar** (`test_admin_catalog.py:304` va `:368` uslubida):
  - admin yuklash `styles="klassik,neoklassika"` → `["neoklassika","klassik"]`;
  - `styles="x"` → 422;
  - `PATCH {"styles": ["loft"]}` → `["loft"]`;
  - katalog ro'yxati javobidagi har bir elementda `styles` bor (uslubsiz mebelda `[]`).
- [ ] **Step 2:** Testlarni ishga tushirish. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya,** Task 4 dagi kabi: `FurnitureUpdate.styles: list[str] | None = None`, ikkala Out modeliga `styles: list[str] = []`, `_out` larda `styles=f.styles or []`.
- [ ] **Step 4:** Backend to'liq suite. Kutilgan natija: PASS.
- [ ] **Step 5:** Commit: "Admins set furniture styles; the catalog returns them".

---

### Task 6: Frontend: uslublar ro'yxati, API tiplari va formalar

**Files:**
- Create: `frontend/src/lib/furnitureStyles.ts`
- Create: `frontend/src/components/dokon/StyleChips.tsx`
- Modify: `frontend/src/lib/api/catalog.ts` (`CatalogFurniture.styles?: string[]`), `frontend/src/lib/api/seller.ts` (~26, ~83, ~99), `frontend/src/lib/api/admin.ts` (~77, ~95, ~123, ~138)
- Modify: `frontend/src/pages/seller/SellerModelFormDialog.tsx`, `frontend/src/pages/dokon/admin/ModelFormDialog.tsx`, `frontend/src/pages/dokon/admin/ModelEditDialog.tsx`
- Test: `frontend/src/components/dokon/StyleChips.test.tsx`, `frontend/src/pages/dokon/admin/ModelFormDialog.test.tsx`, `frontend/src/pages/seller/SellerPage.test.tsx`

**Interfaces:**
- Produces: `export type FurnitureStyle = 'neoklassika' | 'klassik' | 'zamonaviy' | 'hitech' | 'minimalist' | 'skandinav' | 'loft' | 'milliy'` va `export const FURNITURE_STYLES: { id: FurnitureStyle; label: string }[]` (Global Constraints tartibida va nomlari bilan).
- Produces: `<StyleChips value={FurnitureStyle[]} onChange={(next: FurnitureStyle[]) => void} />`. Har bir chip `aria-pressed` li `button`. Hech biri tanlanmasa, ostida "Hamma uslubga mos" yozuvi chiqadi.
- API: yuklashda `styles` bo'sh bo'lmasa `form.append("styles", styles.join(","))`. Tahrirlashda JSON body'da `styles` massivi.

- [ ] **Step 1: Failing testlar:**
  - `StyleChips.test.tsx`: chip bosilsa `onChange(['hitech'])`; tanlangan chip yana bosilsa `onChange([])`; bo'sh qiymatda "Hamma uslubga mos" yozuvi bor.
  - `ModelFormDialog.test.tsx`: "Hi-Tech" va "Zamonaviy" bosilib saqlansa, yuklash funksiyasi `styles: ['hitech','zamonaviy']` bilan chaqiriladi (mock'ni fayldagi mavjud usulda tekshirish).
  - `SellerPage.test.tsx`: sotuvchi formasida ham xuddi shunday.
  - `lib/api` testi (agar `seller.ts`/`admin.ts` uchun FormData testlari bo'lsa): `styles` `"hitech,zamonaviy"` bo'lib qo'shiladi.
- [ ] **Step 2:** vitest. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya.** Chiplar formalarda "Xona" `Select` ostida turadi. `ModelEditDialog` mavjud qiymatni `model.styles ?? []` dan oladi.
- [ ] **Step 4:** vitest to'liq va `npx tsc --noEmit -p .`. Kutilgan natija: PASS va 0.
- [ ] **Step 5:** Commit: "Sellers and admins pick a model's styles".

---

### Task 7: Tayyor uslub o'z uslubidagi mebelni tanlaydi

**Files:** Modify: `frontend/src/lib/aiDesignPresets.ts` (`Preset`, `pick` ~125, `presetPlan`). Test: `frontend/src/lib/__tests__/aiDesignPresets.test.ts`.

**Interfaces:** Consumes: `FurnitureStyle`, `FURNITURE_STYLES` (Task 6). Produces: `Preset.furnitureStyle: FurnitureStyle`.

- [ ] **Step 1: Failing testlar:**

```ts
it('every style names a furniture style the catalog knows', () => {
  const known: readonly string[] = FURNITURE_STYLES.map((s) => s.id)
  for (const p of DESIGN_PRESETS) expect(known, p.id).toContain(p.furnitureStyle)
  expect(DESIGN_PRESETS.find((p) => p.id === 'dark')!.furnitureStyle).toBe('zamonaviy')
})

it('a style takes a sofa of its own style over one made for the room', () => {
  const cat = [
    { ...item('room', 'Divan', 'divan', 'mehmonxona'), styles: ['klassik'] },
    { ...item('mine', 'Divan', 'divan'), styles: ['hitech'] },
  ]
  expect(presetPlan('hitech', cat, 'mehmonxona')!.furniture[0].id).toBe('mine')
})

it('an unstyled piece comes before one of another style', () => {
  const cat = [{ ...item('other', 'Divan', 'divan'), styles: ['milliy'] }, { ...item('any', 'Divan', 'divan'), styles: [] }]
  expect(presetPlan('hitech', cat)!.furniture[0].id).toBe('any')
})

it('with nothing of its style, a piece of another style still fills the room', () => {
  const cat = [{ ...item('other', 'Divan', 'divan'), styles: ['milliy'] }]
  expect(presetPlan('hitech', cat)!.furniture[0].id).toBe('other')
})

it('a catalog with no styles at all (or an old cached one without the field) picks by room as before', () => {
  const cat = [item('any', 'Divan', 'divan'), item('room', 'Divan', 'divan', 'mehmonxona')]
  expect(presetPlan('hitech', cat, 'mehmonxona')!.furniture[0].id).toBe('room')
})
```

`item` — fayldagi mavjud yordamchi. Uning natijasida `styles` yo'q, bu Review Focus 4 ni ham qoplaydi. `furniture[0]` divanmi, buni testdagi preset'ning birinchi mebeli (`divan`) asosida tekshirish kerak. Agar tartib boshqacha bo'lsa, `.find((f) => f.name === 'Divan')` ishlatiladi.
- [ ] **Step 2:** vitest. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya.** Har bir preset'ga spec'dagi `furnitureStyle` qiymati qo'shiladi. `pick(kind, catalog, roomType, used, style)`: mos mebellardan `[styleScore, roomScore]` bo'yicha eng kattasi olinadi, teng bo'lsa birinchisi.
  - `styleScore`: `(c.styles ?? []).includes(style)` → 2, bo'sh → 1, aks holda 0.
  - `roomScore`: `room_type === roomType` → 2, `null` → 1, aks holda 0.
- [ ] **Step 4:** vitest to'liq va tsc. Kutilgan natija: PASS va 0.
- [ ] **Step 5:** Commit: "A ready-made style picks furniture of its own style first". Push, PR #2 (A) ochish va bog'lash. Brauzerda lokal tekshiruv:
  - admin sifatida bitta modelga uslub qo'yish (lokal katalog bo'sh bo'lsa, buni ochiq aytish);
  - preset qo'llash.

  Merge faqat foydalanuvchi aytganda.

---

## Yakuniy ko'rib chiqish
Barcha task'lardan keyin butun branch eng kuchli modelda bitta yangi reviewer bilan ko'rib chiqiladi (Review Focus ro'yxati bilan). Critical va Important topilmalar TDD bilan bitta pass'da tuzatiladi. Minor topilmalar yakuniy xabarda sanab o'tiladi.
