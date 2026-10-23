# Admin materiallar bo'limi — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin paneldan materiallarni (smeta mahsulotlari bilan birga) qo'shish, tahrirlash va yashirish.

**Architecture:**
- **Backend:** smeta kalitlari va ularning qoidasi `app/services/smeta_keys.py` da, seed va admin API umumiy foydalanadi. Admin API alohida router `admin_materials.py` da.
- **Frontend:** `lib/api/adminMaterials.ts`, `AdminMaterials.tsx` bo'limi va `MaterialFormDialog.tsx`.

**Tech Stack:** FastAPI, SQLAlchemy async, pytest (`docker exec andoza_ai-api-1 pytest`), React, TanStack Query, vitest (`cd frontend && PATH=/Users/mac/.local/node/bin:$PATH npx vitest run`).

**Spec:** [docs/superpowers/specs/2026-10-23-admin-materiallar-design.md](../specs/2026-10-23-admin-materiallar-design.md)

## Global Constraints
- **Smeta kalitlari va qadoq birliklari:**
  - `suvoq`, `grunt`, `shpatlyovka`: `kg`;
  - `plintus`, `profil`, `led_lenta`, `galtel`: `m`;
  - `gipsokarton`: `m2`;
  - `kabel`: `None` (faqat `unit == "m"`);
  - `light:<tur>`: `LIGHT_CATALOG_PRICES_UZS` dagi har bir tur uchun, faqat `unit == "dona"`.
- **Xato matnlari (422 `detail`):**
  - "Bunday smeta kaliti yo'q";
  - "<kalit> uchun qadoq birligi <birlik> bo'lishi kerak";
  - "Qadoq hajmi va birligi birga kiritiladi";
  - "Rulon o'lchami faqat oboy uchun";
  - "Do'kon topilmadi".

  `kabel` va `light:*` uchun matnlar: "kabel metrlab (m) sotilishi kerak", "chiroq dona bilan sotilishi kerak".
- **O'chirish yo'q,** faqat `is_active=false`. Migratsiya yo'q.
- **Kesh:** saqlangandan keyin `cache_delete_prefix("materials:")`, commit'dan keyin.
- **Frontend matnlari:** "Materiallar", "Material qo'shish", "Saqlash", "Yashirish", "Ko'rsatish", "Faqat smeta mahsulotlari", "Yashirin", "Smeta: <nom>".
- **Commit oxirida:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Merge** = production deploy. Faqat foydalanuvchi aytganda, CI yashil bo'lgach.

## Review Focus
1. PATCH faqat `category` ni oboy'dan boshqasiga o'zgartirsa va material'da rulon o'lchami turgan bo'lsa, 422 qaytishi kerak (birlashtirilgan holat tekshiriladi). Test Task 2 da.
2. PATCH `smeta_key: null` yuborsa (kalitni olib tashlash), qadoq tekshiruvi talab qilinmasligi va saqlanishi kerak. Test Task 2 da.
3. `q` qidiruvi katta-kichik harf va o'zbekcha apostrofli nomlarda (`O'simlik`) ishlashi kerak; SQL `ilike` parametri xavfsiz. Test Task 2 da.
4. Dialogda smeta kaliti tanlanib, keyin "yo'q"ga qaytarilsa, avtomatik qo'yilgan `pack_unit` foydalanuvchi kiritgan qiymatni bosib ketmasligi kerak (faqat bo'sh bo'lsa to'ldiriladi). Test Task 5 da.
5. Narx maydoniga bo'sh yoki manfiy qiymat kiritilsa, so'rov yuborilmasligi (tugma bloklangan) yoki backend 422 ko'rsatilishi kerak. Test Task 5 da.

---

### Task 1: Smeta kalitlarining yagona ro'yxati

**Files:**
- Create: `backend/app/services/smeta_keys.py`
- Modify: `backend/app/seed_estimate_catalog.py` (~38-42, `KEY_PACK_UNIT` import qilinadi)
- Modify: `backend/tests/test_estimate_catalog.py` (~207-210)
- Test: `backend/tests/test_smeta_keys.py`

**Interfaces:**
- Produces:
  - `KEY_PACK_UNIT: dict[str, str | None]`;
  - `LIGHT_KEYS: frozenset[str]`;
  - `ALL_SMETA_KEYS: frozenset[str]`;
  - `smeta_key_problem(key: str | None, unit: str, pack_qty: float | None, pack_unit: str | None) -> str | None`.

- [ ] **Step 1: Failing testlar** (`test_smeta_keys.py`):

```python
@pytest.mark.parametrize(("key", "unit", "pack_qty", "pack_unit"), [
    (None, "qop", None, None),
    ("suvoq", "qop", 30, "kg"),
    ("plintus", "m", None, None),          # sold by the metre
    ("plintus", "dona", 2.5, "m"),
    ("galtel", "m", None, None),
    ("galtel", "dona", 2, "m"),
    ("gipsokarton", "dona", 3, "m2"),
    ("kabel", "m", None, None),
    ("light:chandelier", "dona", None, None),
])
def test_valid_combinations(key, unit, pack_qty, pack_unit):
    assert smeta_key_problem(key, unit, pack_qty, pack_unit) is None

@pytest.mark.parametrize(("key", "unit", "pack_qty", "pack_unit", "message"), [
    ("barokko", "dona", None, None, "Bunday smeta kaliti yo'q"),
    ("suvoq", "qop", None, None, "suvoq uchun qadoq birligi kg bo'lishi kerak"),
    ("suvoq", "qop", 30, "litr", "suvoq uchun qadoq birligi kg bo'lishi kerak"),
    ("galtel", "dona", None, None, "galtel uchun qadoq birligi m bo'lishi kerak"),
    ("kabel", "dona", None, None, "kabel metrlab (m) sotilishi kerak"),
    ("light:chandelier", "m", None, None, "chiroq dona bilan sotilishi kerak"),
])
def test_invalid_combinations(key, unit, pack_qty, pack_unit, message):
    assert smeta_key_problem(key, unit, pack_qty, pack_unit) == message

def test_every_light_type_has_a_key():
    assert {f"light:{t}" for t in LIGHT_CATALOG_PRICES_UZS} == LIGHT_KEYS
```

  `test_estimate_catalog.py:209` dagi `set(seed.KEY_PACK_UNIT) <= keys` `set(seed.KEY_PACK_UNIT) - {"galtel"} <= keys` ga almashtiriladi va izohda "galtel'ning seed mahsuloti yo'q, uni admin qo'shadi" deb yoziladi.
- [ ] **Step 2:** Testlarni ishga tushirish. Kutilgan natija: FAIL (modul yo'q).
- [ ] **Step 3: Implementatsiya.** `seed_estimate_catalog.py` `from app.services.smeta_keys import KEY_PACK_UNIT` qiladi va o'zining nusxasini o'chiradi. `LIGHT_KEYS` `app.services.smeta.LIGHT_CATALOG_PRICES_UZS` dan quriladi.
- [ ] **Step 4:** To'liq backend suite. Kutilgan natija: PASS.
- [ ] **Step 5:** Commit: "One list of estimate product keys, with the pack each needs".

---

### Task 2: Admin materials API

**Files:**
- Create: `backend/app/schemas/admin_materials.py`, `backend/app/routers/admin_materials.py`
- Modify: `backend/app/main.py` (import qatori ~20, `include_router` ~109 yonida)
- Test: `backend/tests/test_admin_materials.py`

**Interfaces:**
- Consumes: Task 1 `smeta_key_problem`; `MaterialCategory.enums`, `MaterialUnit.enums` (`app/models/material.py`).
- Produces:
  - `GET /api/v1/admin/materials` → `{items: AdminMaterialOut[], total, page, per_page}`;
  - `POST /api/v1/admin/materials` → 201 `AdminMaterialOut`;
  - `PATCH /api/v1/admin/materials/{id}` → `AdminMaterialOut`.
- `AdminMaterialOut`: `id, store_id, store_name, category, name_uz, unit, price_uzs, pack_qty, pack_unit, smeta_key, roll_width_cm, roll_length_m, color_hex, image_url, is_active`.

- [ ] **Step 1: Failing testlar.** Mock sessiya, `test_admin_catalog.py` dagi admin va mock naqshida:
  - POST to'g'ri ma'lumot bilan → 201, `db.add` chaqirilgan obyekt maydonlari;
  - har bir 422 holati xabari bilan:
    - noma'lum kategoriya yoki birlik;
    - `price_uzs: 0`;
    - faqat `pack_qty`;
    - oboy bo'lmagan mahsulotda `roll_width_cm`;
    - `smeta_key: "suvoq"` qadoqsiz;
    - do'kon topilmadi;
  - PATCH `{"category": "boyoq"}`, rulon o'lchami bor oboy materialga → 422 "Rulon o'lchami faqat oboy uchun" (Review Focus 1);
  - PATCH `{"smeta_key": null}` → 200, `smeta_key is None` (Review Focus 2);
  - PATCH `{"is_active": false}` → 200, `is_active False`;
  - PATCH topilmagan id → 404;
  - GET `?smeta=true&category=gips&q=O'sim` → compile qilingan so'rovda `smeta_key IS NOT NULL`, `category` filtri va `ilike` bor (Review Focus 3, parametr sifatida bog'langan);
  - admin bo'lmagan foydalanuvchi → 403;
  - POST va PATCH'dan keyin `materials:` kesh tozalash hook'i qo'shiladi (`run_after_commit` yoki `_invalidate_after_commit` mock).
- [ ] **Step 2:** Testlarni ishga tushirish. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya.**
  - PATCH: `changes = body.model_dump(exclude_unset=True)`, keyin birlashtirilgan qiymatlar (`{**mavjud, **changes}`) bitta `_problem(merged, db)` funksiyasi bilan tekshiriladi. U birinchi topilgan xabarni qaytaradi va POST bilan umumiy.
  - Ro'yxat `selectinload(Material.store)` bilan, tartib `category, name_uz`.
  - Kesh `admin_catalog.py` dagi `_invalidate_after_commit` naqshida tozalanadi (import yoki shu naqshda yangi yordamchi).
- [ ] **Step 4:** To'liq suite. Kutilgan natija: PASS.
- [ ] **Step 5:** Commit: "Admins add, edit and hide materials".

---

### Task 3: Frontend API va konstantalar

**Files:**
- Create: `frontend/src/lib/api/adminMaterials.ts`, `frontend/src/lib/api/__tests__/adminMaterials.test.ts`
- Modify: `frontend/src/lib/api.ts` (`export * from "./api/adminMaterials"`)

**Interfaces:**
- Consumes: Task 2 endpoints.
- Produces:
  - `type AdminMaterial` (Task 2 `AdminMaterialOut` ga mos);
  - `type MaterialInput` (create maydonlari);
  - `listAdminMaterials(params: { category?: string; store_id?: string; smeta?: boolean; q?: string; page?: number }): Promise<{ items: AdminMaterial[]; total: number; page: number; per_page: number }>`;
  - `createAdminMaterial(input: MaterialInput): Promise<AdminMaterial>`;
  - `updateAdminMaterial(id: string, patch: Partial<MaterialInput> & { is_active?: boolean }): Promise<AdminMaterial>`;
  - `MATERIAL_CATEGORIES: { id: string; label: string }[]`, spec 3-bo'limdagi o'zbekcha nomlar bilan;
  - `MATERIAL_UNITS: { id: string; label: string }[]`;
  - `SMETA_KEYS: { id: string; label: string; packUnit: string | null; unit?: string }[]`. Chiroq kalitlari `LIGHT_TYPES` (`frontend/src/lib/lightCatalog.ts`) dan "Chiroq: <nom>" bilan quriladi.

- [ ] **Step 1: Failing testlar:**
  - `listAdminMaterials({ smeta: true, q: "gips" })` `apiClient` ni `/admin/materials?smeta=true&q=gips` bilan chaqiradi (bo'sh parametrlar tushirib qoldiriladi);
  - create va update to'g'ri method va body bilan;
  - `SMETA_KEYS` da `galtel` ning `packUnit` qiymati `"m"`, `suvoq` ning `"kg"`, `kabel` ning `null`;
  - har bir `light:` kaliti `LIGHT_TYPES` dagi turga mos.

  `apiClient` mock qilinadi, mavjud `lib/api/__tests__` testlaridagi usulda.
- [ ] **Step 2:** vitest. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya.**
- [ ] **Step 4:** vitest va tsc. Kutilgan natija: PASS va 0.
- [ ] **Step 5:** Commit: "Frontend client for admin materials".

---

### Task 4: "Materiallar" bo'limi (ro'yxat, filtrlar, yashirish)

**Files:**
- Create: `frontend/src/pages/dokon/admin/AdminMaterials.tsx`, `AdminMaterials.test.tsx`
- Modify: `frontend/src/pages/dokon/AdminCatalogPanel.tsx` (`AdminOrders` dan keyin, `!selectedStore` sharti bilan)

**Interfaces:**
- Consumes: Task 3 API va konstantalar; `listAdminStores` (`lib/api/admin.ts`) do'kon filtri uchun.
- Produces: `<AdminMaterials onError={(msg: string | null) => void} />`. Task 5 dialogi shu yerdan ochiladi; dialog Task 5 da yoziladi. Bu task'da "Material qo'shish" va "Tahrirlash" tugmalari dialog holatini o'zgartiradi, dialog esa `MaterialFormDialog` importi bilan Task 5 da ulanadi.

- [ ] **Step 1: Failing testlar** (`@/lib/api` mock, ModelEditDialog testidagi naqsh):
  - ro'yxat qatorida nom, do'kon, `price so'm / birlik`, `30 kg`, `Smeta: Suvoq`, yashirinda "Yashirin" ko'rinadi;
  - "Faqat smeta mahsulotlari" katagi bosilsa, `listAdminMaterials` `smeta: true` bilan qayta chaqiriladi; kategoriya tanlansa `category`; qidiruv yozilsa `q`;
  - "Yashirish" bosilsa, `updateAdminMaterial(id, { is_active: false })`; yashirin qatorda "Ko'rsatish" → `{ is_active: true }`;
  - `AdminCatalogPanel` do'kon tanlanmaganda "Materiallar" sarlavhasini ko'rsatadi.
- [ ] **Step 2:** vitest. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya.**
  - `useQuery(['admin','materials', filters])`, mutatsiyalardan keyin invalidate.
  - Qidiruv 300 ms debounce bilan, yoki mavjud admin filtrlaridagi usul bilan.
  - Uslub mavjud admin bo'limlari (`AdminOrders`, `CatalogOverview`) kabi, tema tokenlari bilan.
- [ ] **Step 4:** vitest to'liq va tsc. Kutilgan natija: PASS va 0.
- [ ] **Step 5:** Commit: "Admin panel lists materials with filters and hiding".

---

### Task 5: Material qo'shish va tahrirlash dialogi

**Files:**
- Create: `frontend/src/pages/dokon/admin/MaterialFormDialog.tsx`, `MaterialFormDialog.test.tsx`
- Modify: `frontend/src/pages/dokon/admin/AdminMaterials.tsx` (dialogni ulash)

**Interfaces:**
- Consumes: Task 3 (`createAdminMaterial`, `updateAdminMaterial`, konstantalar), Task 4 sahifasi.
- Produces: `<MaterialFormDialog open onOpenChange material?: AdminMaterial | null stores: AdminStore[] onSaved?: () => void />`.

- [ ] **Step 1: Failing testlar:**
  - yangi material: maydonlar to'ldirilib "Saqlash" bosilsa, `createAdminMaterial` to'g'ri payload bilan chaqiriladi (raqamlar `number`, bo'sh ixtiyoriy maydonlar `null`);
  - tahrirlash: `material` bilan ochilsa maydonlar to'lgan bo'ladi, saqlansa `updateAdminMaterial(id, …)`;
  - smeta kaliti `suvoq` tanlansa va qadoq birligi bo'sh bo'lsa, `pack_unit` `kg` bo'ladi. Foydalanuvchi qadoq birligini oldin kiritgan bo'lsa, u o'zgarmaydi (Review Focus 4);
  - rulon o'lchami maydonlari faqat kategoriya Oboy bo'lganda bor;
  - narx bo'sh yoki ≤ 0 bo'lsa, "Saqlash" `disabled` (Review Focus 5);
  - backend 422 `detail` matni dialog ichida ko'rinadi.
- [ ] **Step 2:** vitest. Kutilgan natija: FAIL.
- [ ] **Step 3: Implementatsiya.** Mavjud `ModelFormDialog`/`ModelEditDialog` dagi `Dialog`, `Input`, `Select`, `Button` komponentlari va `errorMessage` ishlatiladi.
- [ ] **Step 4:** vitest to'liq va tsc. Kutilgan natija: PASS va 0.
- [ ] **Step 5:** Commit: "Admins add and edit materials in a dialog". Push, PR ochish va bog'lash. Merge faqat foydalanuvchi aytganda.

---

## Yakuniy ko'rib chiqish
Barcha task'lardan keyin butun branch eng kuchli modeldagi bitta yangi reviewer bilan, Review Focus ro'yxati asosida ko'rib chiqiladi. Critical va Important topilmalar bitta fix pass'da tuzatiladi.
