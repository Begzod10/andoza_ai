# Admin panelda materiallar bo'limi

Sana: 2026-10-23. Holat: tasdiqlash uchun.

## Maqsad
Hozir smeta va studiyadagi materiallar (bo'yoq, oboy, pol, gips, plintus, kabel va boshqalar) faqat seed fayldan keladi. Narxni o'zgartirish yoki yangi mahsulot qo'shish uchun kod va deploy kerak. Admin buni paneldan o'zi qila olishi kerak.

**Muvaffaqiyat mezoni:**
- admin paneldan material qo'shadi, tahrirlaydi va yashiradi;
- smeta mahsulotlarini (`smeta_key`) qo'sha oladi, masalan haqiqiy galtel. Smeta darhol shu narxni oladi;
- noto'g'ri ma'lumot (smeta uchun yaroqsiz qadoq birligi, oboy bo'lmagan mahsulotda rulon o'lchami va hokazo) saqlanmaydi, aniq o'zbekcha xato chiqadi;
- eski smeta va xonalar buzilmaydi: material o'chirilmaydi, faqat yashiriladi.

## Doira
**Kiradi:** admin API (ro'yxat, qo'shish, tahrirlash); ruxsat etilgan smeta kalitlarining yagona ro'yxati; admin paneldagi "Materiallar" bo'limi (ro'yxat, filtrlar, dialog, yashirish).

**Kirmaydi:**
- sotuvchi paneli;
- rang (`color_hex`), tekstura (`texture_key`) va rasm (`image_url`) tahriri;
- haqiqiy o'chirish;
- `MaterialOffer` (bir materialni bir nechta do'kon taklif qilishi);
- narxlar tarixi va ko'p materialni birdaniga tahrirlash;
- migratsiya: model o'zgarmaydi.

---

## 1. Smeta kalitlarining yagona ro'yxati
Yangi modul: `backend/app/services/smeta_keys.py`.
- `KEY_PACK_UNIT: dict[str, str | None]`. Kalitlar `seed_estimate_catalog.py` dan ko'chiriladi, qiymatlari o'zgarmaydi:
  - `suvoq`, `grunt`, `shpatlyovka`: `kg`;
  - `plintus`, `profil`, `led_lenta`: `m`;
  - `gipsokarton`: `m2`;
  - `kabel`: `None`.

  Yangi kalit: **`galtel`: `m`**. Smeta galtelni metrlab sotilgan (`unit == "m"`) yoki `m` polosalab sotilgan mahsulotdan narxlaydi (`_galtel_line`).
- `LIGHT_KEYS = {f"light:{t}" for t in LIGHT_CATALOG_PRICES_UZS}`.
- `def smeta_key_problem(key: str | None, unit: str, pack_qty: float | None, pack_unit: str | None) -> str | None`. Muammo bo'lmasa `None`, bo'lsa o'zbekcha xabar qaytaradi:
  - kalit ro'yxatda yo'q: `"Bunday smeta kaliti yo'q"`;
  - `KEY_PACK_UNIT[key]` `None` bo'lmasa, mahsulot yo metrlab yoki kvadrat metrlab, ya'ni birligi shu qadoq birligi bilan bir xil sotiladi (`unit == pack_unit_kerak`, masalan `plintus` uchun `unit == "m"`), yo qadoqlab sotiladi (`pack_qty` bor va `pack_unit == KEY_PACK_UNIT[key]`). Aks holda: `"<kalit> uchun qadoq birligi <birlik> bo'lishi kerak"`;
  - `kabel`: `unit` `m` bo'lishi kerak;
  - `light:*`: `unit` `dona` bo'lishi kerak.
- `seed_estimate_catalog.py` `KEY_PACK_UNIT` ni shu moduldan import qiladi. Seed testlari o'zgarmasdan o'tishi kerak. Yangi `galtel` kaliti seed'da mahsulotsiz: seed'dagi "har bir kalitga kamida bitta mahsulot" testi faqat seed'ning o'z kalitlarini tekshiradigan qilib moslanadi (`galtel` istisno).

## 2. Admin API
Router: `backend/app/routers/admin_materials.py` (prefix `/admin/materials`, `AdminUser`), `main.py` ga ulanadi. Schemalar: `backend/app/schemas/admin_materials.py`.

| Endpoint | Ish |
|---|---|
| `GET /admin/materials` | Barcha materiallar, yashirinlari ham. Query: `category`, `store_id`, `smeta` (`true` = faqat `smeta_key` borlari), `q` (nom bo'yicha qidiruv, katta-kichik harf farqsiz), `page`, `per_page` (≤100). Tartib: kategoriya, keyin nom. Javob: `{items, total, page, per_page}`, har bir elementda `store_name` va `is_active`. |
| `POST /admin/materials` | JSON `MaterialCreate`. 201 va `AdminMaterialOut`. |
| `PATCH /admin/materials/{id}` | JSON `MaterialUpdate`, hamma maydon ixtiyoriy. 404 va `AdminMaterialOut`. |

**`MaterialCreate`:**

| Maydon | Turi va qoidasi |
|---|---|
| `store_id` | majburiy |
| `category` | `MaterialCategory` qiymatlaridan biri |
| `name_uz` | 1–200 belgi |
| `unit` | `MaterialUnit` qiymatlaridan biri |
| `price_uzs` | int > 0 |
| `pack_qty` | float > 0 yoki null |
| `pack_unit` | `kg|litr|m|m2|dona` yoki null |
| `smeta_key` | ≤ 40 belgi yoki null |
| `roll_width_cm`, `roll_length_m` | > 0 yoki null |
| `is_active` | standart `True` |

**Tekshiruvlar** (422, `detail` o'zbekcha). PATCH'da yangi qiymat bilan mavjud qiymatlar birlashtirilib, natija tekshiriladi:
- `pack_qty` va `pack_unit` birga beriladi yoki ikkalasi ham bo'sh: `"Qadoq hajmi va birligi birga kiritiladi"`;
- rulon o'lchami faqat `category == "oboy"` da: `"Rulon o'lchami faqat oboy uchun"`;
- `smeta_key_problem(...)` qaytargan xabar;
- `store_id` bazada yo'q bo'lsa: `"Do'kon topilmadi"`.

**`AdminMaterialOut`:** `MaterialOut` maydonlari, ustiga `is_active: bool` va `store_name`.

**Kesh.** Commit'dan keyin `cache_delete_prefix("materials:")`, `admin_catalog.py` dagi `_invalidate_after_commit` naqshida. Smeta (`load_estimate_catalog`) har safar bazadan o'qiydi, unga kesh kerak emas.

## 3. Frontend: "Materiallar" bo'limi
- **API** (`frontend/src/lib/api/adminMaterials.ts`, `lib/api.ts` orqali eksport): `listAdminMaterials(params)`, `createAdminMaterial(input)`, `updateAdminMaterial(id, patch)`. Konstantalar:
  - `MATERIAL_CATEGORIES` (backend ro'yxati va o'zbekcha nomlari: Bo'yoq, Oboy, Dekorativ, Laminat, Parket, Plitka, Eshik, Deraza, Gips, Sement, Santexnika, Elektr);
  - `MATERIAL_UNITS` (litr, rulon, m², qop, dona, m, komplekt);
  - `SMETA_KEYS` (kalit, o'zbekcha nom, kerakli qadoq birligi). Nomlar: Suvoq, Grunt, Shpatlyovka, Plintus, Gipsokarton, Profil, LED lenta, Kabel, Galtel, va chiroq turlari uchun "Chiroq: <tur nomi>".
- **Joylashuv.** `frontend/src/pages/dokon/admin/AdminMaterials.tsx`. `AdminCatalogPanel.tsx` da do'kon tanlanmaganda `AdminOrders` dan keyin ko'rsatiladi.
- **Ro'yxat.**
  - Har qatorda: nom, do'kon, kategoriya, `narx so'm / birlik`, qadoq (`30 kg`), `Smeta: <nom>` belgisi, yashirin bo'lsa "Yashirin" belgisi.
  - Har qatorda "Tahrirlash" va "Yashirish" (yoki "Ko'rsatish") tugmalari.
  - Sahifalash.
- **Filtrlar:** kategoriya, do'kon, "Faqat smeta mahsulotlari" katagi, qidiruv maydoni.
- **Dialog** (`MaterialFormDialog.tsx`, qo'shish va tahrirlash uchun bitta):
  - Smeta kaliti tanlansa va kalitning qadoq birligi bo'lsa, `pack_unit` o'zi shu qiymatga o'rnatiladi.
  - Rulon o'lchami maydonlari faqat Oboy kategoriyasida ko'rinadi.
  - Backend'dan kelgan 422 matni dialog ichida ko'rsatiladi.
  - Saqlangandan keyin ro'yxat yangilanadi.
- **Matnlar:** bo'lim sarlavhasi "Materiallar", "Material qo'shish", "Saqlash", "Yashirish", "Ko'rsatish", "Faqat smeta mahsulotlari".

## 4. Testlar
- **`smeta_keys`:**
  - har bir kalitning to'g'ri va noto'g'ri qadoq holati;
  - `kabel` faqat `m`, `light:*` faqat `dona`;
  - noma'lum kalit;
  - `galtel` metrlab ham, 2 m polosa bilan ham o'tadi.
- **Admin API:**
  - yaratish (201, maydonlar saqlanadi);
  - har bir tekshiruv uchun 422 va xabar;
  - PATCH birlashtirib tekshirish (masalan, oboy bo'lmagan mahsulotga rulon o'lchami qo'shib bo'lmaydi);
  - yashirish (`is_active=false`) ro'yxatda qoladi;
  - filtrlar (`smeta=true`, `category`, `q`);
  - admin bo'lmagan foydalanuvchiga 403;
  - 404;
  - `materials:` keshi tozalanadi.
- **Seed:** mavjud testlar o'zgarmasdan o'tadi (`galtel` istisnosidan tashqari).
- **Frontend:**
  - ro'yxat elementlari va belgilar;
  - filtr o'zgarganda so'rov parametrlari;
  - dialogda smeta kaliti tanlanganda qadoq birligi to'ladi;
  - rulon maydonlari faqat oboyda;
  - saqlash `createAdminMaterial` yoki `updateAdminMaterial` ni to'g'ri payload bilan chaqiradi;
  - 422 xabari ko'rinadi;
  - Yashirish tugmasi `is_active:false` yuboradi.
