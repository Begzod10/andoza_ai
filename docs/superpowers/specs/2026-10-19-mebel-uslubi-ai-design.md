# Mebel uslubini AI bilan avtomatik qo'yish

Sana: 2026-10-19. Holat: tasdiqlash uchun.
Oldingi ish: `furniture.styles` maydoni va uslub chiplari ([#31](https://github.com/Begzod10/andoza_ai/pull/31), spec [2026-10-19-mebel-uslubi-va-smeta-design.md](2026-10-19-mebel-uslubi-va-smeta-design.md)). U production'da ishlayapti, lekin hech bir mebelda uslub yo'q.

## Maqsad
Katalogdagi mavjud va yangi yuklanadigan mebelga uslubni AI qo'yadi. Shunda tayyor uslublar o'z uslubidagi mebelni tanlay boshlaydi va sotuvchi yoki admin har birini qo'lda belgilab chiqishi shart bo'lmaydi.

**Muvaffaqiyat mezoni:**
- admin bitta tugma bilan uslubi hali hech kim qo'ymagan barcha mebelni AI'ga yuboradi;
- uslubsiz yuklangan yangi mebel fonda o'zi uslub oladi;
- sotuvchi yoki admin qo'lda qo'ygan (yoki ataylab bo'sh qoldirgan) uslubga AI hech qachon tegmaydi;
- har bir mebel AI'ga bir marta yuboriladi, ishonchli javob bo'lmasa ham qayta urinilmaydi;
- AI xatosi yuklashni ham, katalogni ham buzmaydi.

## Doira
**Kiradi:** `styles_source` maydoni va migratsiya; AI xizmati; Celery vazifasi; yuklashda navbatga qo'yish; admin endpoint va tugma; tahrirlash dialogidagi "AI qo'ygan" yozuvi.

**Kirmaydi:**
- 3D modelni render qilib aniqlash;
- AI taklifini admin tasdiqlaydigan oqim (AI to'g'ridan-to'g'ri yozadi);
- mobil ilova (maydon qo'shimcha);
- sotuvchi panelida "AI qo'ygan" yozuvi (faqat admin).

---

## 1. Ma'lumot: `furniture.styles_source`
- Turi: `String(10)`, `nullable=True`. Qiymatlari:
  - `NULL`: uslubni hali hech kim qo'ymagan;
  - `'manual'`: sotuvchi yoki admin qo'ygan;
  - `'ai'`: AI qo'ygan.
- Migratsiya `1786000039` (`down_revision = "1786000038"`): ustun qo'shiladi, keyin `UPDATE furniture SET styles_source = 'manual' WHERE styles <> '{}'`. `downgrade` ustunni o'chiradi.

**Kim nima yozadi:**

| Holat | `styles` | `styles_source` |
|---|---|---|
| Yuklashda `styles` bo'sh bo'lmasa (sotuvchi va admin) | normalize qilingan | `'manual'` |
| Yuklashda `styles` bo'sh yoki yo'q | `[]` | `NULL`, vazifa navbatga qo'yiladi |
| PATCH'da `styles` kaliti massiv bilan (`[]` ham) | normalize qilingan | `'manual'` |
| PATCH'da `styles` yo'q yoki `null` | o'zgarmaydi | o'zgarmaydi |
| AI vazifasi (faqat `NULL` bo'lsa) | AI natijasi, `[]` bo'lishi ham mumkin | `'ai'` |

Javoblarga (`SellerFurnitureOut`, `FurnitureAdminOut`) `styles_source: str | None` qo'shiladi. Katalog javobiga (`FurnitureOut`) qo'shilmaydi: studiyaga kerak emas.

## 2. AI xizmati: `app/services/furniture_style_ai.py`
```
async def classify_furniture_styles(
    name_uz: str, category: str, image: PreparedImage | None,
) -> list[str]
```
- **Model:** `settings.AI_MODEL_BUILDER`, chunki u vision qiladi, rasmdan dizayn ham shuni ishlatadi. `call_llm` ga `user_id=None` beriladi: foydalanuvchi limitiga tegmaydi.
- **Prompt (o'zbekcha):** 8 ta uslub va har birining qisqa belgilari beriladi:
  - neoklassika: och ranglar, nafis egri chiziqlar, oddiylashgan klassika;
  - klassik: o'ymakorlik, oltin detallar, og'ir matolar;
  - zamonaviy: toza chiziqlar, neytral ranglar;
  - hitech: metall, shisha, yaltiroq yuzalar, qora va oq;
  - minimalist: juda sodda shakllar, detal yo'q;
  - skandinav: och yog'och, oq, yumshoq tekstil;
  - loft: qora metall, qo'pol yog'och, sanoat ko'rinishi;
  - milliy: o'zbek naqshlari, so'zana, o'ymakor yog'och.
- **So'raladigan javob:** JSON `{"styles": [...]}`, 0–3 ta, eng moslari birinchi. "Ishonch past bo'lsa bo'sh ro'yxat qaytaring" deb aytiladi. Rasm bo'lmasa: "faqat nom uslubni aniq aytsa qaytaring".
- **Javobni o'qish:**
  - JSON bo'lmasa yoki `styles` massiv bo'lmasa, `[]`;
  - noma'lum qiymatlar tashlanadi;
  - takrorlar olib tashlanadi;
  - birinchi 3 tasi olinadi, keyin `FURNITURE_STYLES` tartibiga keltiriladi.

  Bu `normalize_styles` dan farq qiladi: noma'lum qiymatda xato ko'tarmaydi, uni tashlab yuboradi.
- **Xatolar:** LLM xatosi (`call_llm` istisnosi) chaqiruvchiga o'tadi, vazifa uni ushlaydi.

## 3. Fon vazifasi: `app/tasks/furniture_styles.py`
- **Vazifa:** `classify_furniture_styles_task(furniture_id: str)`, Celery, `celery_app.app`.
- **Tartib:**
  1. `AI_FEATURES_ENABLED` o'chiq bo'lsa, hech narsa qilmaydi.
  2. Mebelni yuklaydi. Yo'q bo'lsa yoki `styles_source` `NULL` emas bo'lsa, hech narsa qilmaydi (`'skipped'`). Shu orada sotuvchi qo'lda qo'ygan bo'lishi mumkin.
  3. `thumbnail_key` bo'lsa, `storage.download_file` → `prepare_design_image`. Rasm yuklanmasa yoki noto'g'ri bo'lsa, rasmsiz davom etadi.
  4. `classify_furniture_styles`. Istisno bo'lsa: log yoziladi, hech narsa yozilmaydi (`'failed'`), `styles_source` `NULL` qoladi va admin tugmasi uni keyin qayta yuboradi. Celery'ning o'zi qayta urinmaydi.
  5. Yozishdan oldin `styles_source IS NULL` qayta tekshiriladi (`UPDATE … WHERE id = :id AND styles_source IS NULL`). `styles = natija`, `styles_source = 'ai'`.
  6. `furniture:` katalog keshi tozalanadi (`cache_delete_prefix`).
- **Qaytaradi:** `{"status": "classified" | "skipped" | "failed", "styles": [...]}`.

## 4. Navbatga qo'yish
- `app/services/furniture_style_queue.py`: `enqueue_style_after_commit(db, furniture_id)`, `model_optimize_queue.py` dagi naqsh bilan. Broker ishlamasa, log yoziladi va yuklash buzilmaydi.
- Sotuvchi va admin yuklash endpoint'lari: natijada `styles` bo'sh bo'lsa navbatga qo'yiladi, bo'sh bo'lmasa `'manual'` yoziladi.

## 5. Admin endpoint va UI
- **Endpoint:** `POST /api/v1/admin/furniture/classify-styles` (faqat admin).
  - `AI_FEATURES_ENABLED` o'chiq bo'lsa: 503 `"AI hozir o'chirilgan"`.
  - `styles_source IS NULL` bo'lgan barcha mebel (holatidan qat'iy nazar) navbatga qo'yiladi.
  - Javob: `{"queued": N}`.
- **Admin katalog paneli** (`AdminCatalogPanel.tsx` yoki modellar ro'yxati sarlavhasi): "AI bilan uslub qo'yish" tugmasi.
  - Bosilganda endpoint chaqiriladi, keyin xabar chiqadi: "N ta model navbatga qo'yildi. Bir necha daqiqada uslublar paydo bo'ladi." `N = 0` bo'lsa: "Uslubi qo'yilmagan model yo'q."
  - Xato bo'lsa, odatdagi `errorMessage` ko'rsatiladi.
  - So'rov davomida tugma bloklanadi.
- **Admin tahrirlash dialogi:** `styles_source === 'ai'` bo'lsa, chiplar ostida "AI qo'ygan — tekshirib, kerak bo'lsa tuzating" yozuvi chiqadi. Saqlanganda backend uni `'manual'` qiladi.

## 6. Xatolar va chekka holatlar
- **Rasm muammosi.** Rasm juda katta, noto'g'ri turda yoki S3 da yo'q bo'lsa, AI rasmsiz ishlaydi.
- **Poyga holati.** Bir mebel bir necha marta navbatga tushsa (tugma ikki marta bosilsa), shartli `UPDATE` va qayta tekshiruv tufayli faqat birinchisi yozadi.
- **O'chirilgan mebel.** Vazifa ishlaguncha o'chirilgan mebel o'tkazib yuboriladi (`'skipped'`).
- **Yangi ma'lumot.** Moderatsiyadagi (pending) mebel ham AI'dan o'tadi, chunki uslub ma'lumot xolos.

## 7. Testlar
- **AI xizmati** (`call_llm` mock):
  - JSON'dan uslublar o'qiladi;
  - noma'lum qiymat tashlanadi;
  - 3 tadan ortig'i kesiladi;
  - JSON bo'lmasa `[]`;
  - rasm bo'lsa xabarda `image` bloki bor, rasm bo'lmasa yo'q.
- **Vazifa:**
  - `NULL` → yoziladi va `'ai'` bo'ladi;
  - `'manual'` → tegilmaydi;
  - LLM xatosi → hech narsa yozilmaydi;
  - rasm yuklanmasa → rasmsiz chaqiriladi;
  - `AI_FEATURES_ENABLED=False` → hech narsa qilinmaydi;
  - kesh tozalanadi.
- **Endpoint'lar:**
  - uslubsiz yuklash → navbatga qo'yiladi va `styles_source` `NULL`;
  - uslubli yuklash → navbatga qo'yilmaydi va `'manual'`;
  - PATCH'da `styles` → `'manual'`;
  - PATCH'da `styles` yo'q → `styles_source` o'zgarmaydi;
  - admin `classify-styles` → faqat `NULL` lar navbatga qo'yiladi, `{"queued": N}`, AI o'chiq bo'lsa 503, admin bo'lmasa 403.
- **Migratsiya:** upgrade, downgrade va yana upgrade; uslubi bor qator `'manual'` bo'ladi.
- **Frontend:**
  - tugma endpoint'ni chaqiradi va N ni ko'rsatadi, `N = 0` holati ham;
  - tahrirlash dialogida `'ai'` bo'lsa yozuv bor, aks holda yo'q.
