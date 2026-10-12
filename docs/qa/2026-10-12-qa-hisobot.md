# QA hisoboti — web ilova, barcha rollar (2026-10-12)

**Muhit:** local (docker-compose + seed), frontend `localhost:5173`, API `localhost:8000`.
**Rollar:** user (`qa_user`), shop_owner (`qa_shop`), admin (`qa_admin`); usta faqat API orqali (`qa_api_usta`) — web'da usta qismi yo'q.
**Usul:** UI brauzerda qo'lda bosib chiqildi + API har bir rol bilan alohida tekshirildi (401/403, IDOR, 500, validatsiya).
Test akkauntlari va ularning ma'lumotlari test tugagach local bazadan o'chirildi.

**Tuzatishlar:** jiddiy (#1–#7) — PR #18, o'rta (#8–#21) — PR #19, past (#22–#33) — PR #20. #21 ilova xatosi emas ekan (test paytida brauzer paneli yashirin bo'lgan); uning o'rnida navbatning ikki marta yuklanishi tuzatildi.

**Yaxshi tomoni:** barcha endpointlar anonimga 401, oddiy userga admin/* 403 qaytaradi. Boshqa userning xonasi/buyurtmasi/lead'iga kirish (IDOR) — topilmadi.
Asosiy oqimlar ishlaydi: ro'yxatdan o'tish/kirish, loyiha → wizard → 3D studiya → smeta, do'kon → savat → buyurtma → bekor qilish,
do'kon arizasi → admin tasdig'i → model yuklash → model tasdig'i → xaridor buyurtmasi → seller bosqichlari (yig'ish → yo'lda → yetkazildi).

---

## Xulosa jadvali

| # | Jiddiylik | Qayerda | Muammo |
|---|---|---|---|
| 1 | 🔴 Kritik | Wizard | A devordan keyingi o'lchamlar va eshik/derazalar saqlanmaydi |
| 2 | 🔴 Yuqori | API apartments | Kvartirani ochish o'chirilgan xonalarni bazadan butunlay o'chiradi |
| 3 | 🔴 Yuqori | API media | Rasm yuklashda `.html` → stored XSS |
| 4 | 🔴 Yuqori | Ustalar / lead | Mijoz telefoni lead'ga saqlanmaydi — usta bog'lana olmaydi |
| 5 | 🔴 Yuqori | Login | Noto'g'ri parolda xato chiqmaydi, sahifa qayta yuklanadi |
| 6 | 🔴 Yuqori | Buyurtma | Manfiy/nol miqdor → manfiy summa (−500 000 so'm) |
| 7 | 🔴 Yuqori | Katalog | Rad etilgan do'kon mebeli katalogda qoladi va buyurtma qilinadi |
| 8–21 | 🟠 O'rta | turli | pastda |
| 22–33 | 🟡 Past | turli | pastda |

---

## 🔴 Kritik / Yuqori

### 1. Wizard: A devordan keyingi o'zgarishlar serverga yetmaydi (KRITIK)
- **Rol:** user
- **Qadamlar:** Yangi loyiha → shift balandligi → A devorda 1.5 soniya kuting → B/C/D uzunligini o'zgartiring, C devorga eshik qo'shing → yakun.
- **Kutilgan:** xona barcha o'lcham va eshik bilan saqlanadi.
- **Haqiqiy:** natija ekrani "1 eshik, 36 m²" ko'rsatadi, lekin serverda `elements: []`, `openings_count: 0`, `net_wall_area: 37.8`. 3D'da eshik yo'q, smeta noto'g'ri maydon bilan hisoblaydi.
- **Sabab:** [WizardPage.tsx:714-734](../../frontend/src/pages/wizard/WizardPage.tsx) — auto-save 1.5 s dan keyin xonani **yaratadi** (`createRoom`), keyingi `handleSave()` esa `if (roomId) return` bilan hech narsa yubormaydi. Yaratilgandan keyin `updateRoom` chaqirilmaydi. Draft ham o'chiriladi, ya'ni qayta tiklab ham bo'lmaydi.

### 2. Kvartirani ochish soft-delete qilingan xonalarni butunlay o'chiradi
- **Rol:** user
- **Qadamlar:** `DELETE /rooms/{R}` (soft) → `GET /apartments/{A}` → bazada R qatori yo'q (estimate, finish, electrical, state ham cascade bilan ketadi).
- **Sabab:** `backend/app/routers/apartments.py:55, :99, :124` — `apt.rooms = [filtrlangan ro'yxat]` ORM relationship'ga yoziladi; `Apartment.rooms` da `cascade="all, delete-orphan"` (`models/apartment.py:52`), commit "yetim"larni o'chiradi. GET ro'yxat, GET bitta va PATCH — uchalasida.

### 3. Stored XSS: `/media/photos` ga HTML yuklash
- **Rol:** har qanday user
- **Qadamlar:** `curl -F "file=@x.html;type=image/jpeg;filename=a.html" /api/v1/media/photos` → `/media/photos/<uid>/<uuid>.html` qaytadi, API domenidan `text/html` sifatida beriladi va skript ishlaydi.
- **Sabab:** `backend/app/routers/media.py:56` — kengaytma fayl nomidan olinadi. Local'da StaticFiles (`main.py:108`) orqali beriladi. (S3'da ContentType image/* bo'lgani uchun ta'siri kamroq, lekin baribir tuzatish kerak.)
- **Taklif:** kengaytmani tekshirilgan content-type'dan oling (wallpaper/thumbnail kabi) + magic-byte tekshiruvi.

### 4. Lead: mijoz telefoni tashlab yuboriladi
- **Rol:** user
- **Qadamlar:** Ustalar → "Usta chaqirish" → telefon + izoh → Yuborish → "muvaffaqiyatli".
- **Haqiqiy:** `leads` jadvalida telefon ustuni yo'q; usta mijoz bilan bog'lanish imkoniga ega emas (username bilan kirgan userda telefon umuman bo'lmaydi).
- **Sabab:** frontend `contact_phone` yuboradi ([UstalarPage.tsx:85](../../frontend/src/pages/ustalar/UstalarPage.tsx)), backend `LeadCreate` da bu maydon yo'q (`backend/app/schemas/usta.py:28`) — pydantic jimgina tashlaydi.

### 5. Noto'g'ri parol: xato xabari yo'q, forma tozalanadi
- **Rol:** anon
- **Qadamlar:** login → to'g'ri username + noto'g'ri parol → Kirish.
- **Haqiqiy:** sahifa qayta yuklanadi, maydonlar bo'shaydi, hech qanday "parol noto'g'ri" xabari chiqmaydi.
- **Sabab:** [client.ts:10](../../frontend/src/lib/api/client.ts) — `NO_SESSION_RETRY_PATHS` da faqat `/auth/google`. `/auth/login` dagi 401 "sessiya tugadi" deb qabul qilinib, refresh → `window.location.href = "/login"`. `/auth/login` (va `/auth/register`) ni ro'yxatga qo'shish kerak.

### 6. Buyurtmada manfiy / nol miqdor
- **Rol:** user
- **Qadamlar:** `POST /orders {"lines":[{"furniture_id":F,"quantity":-5,"unit_price_uzs":100000,...}]}` → 201, `total_uzs: -500000`. Seller va admin panelida ko'rinadi va bosqichlarga o'tkaziladi.
- **Sabab:** `backend/app/schemas/order.py:16` — `quantity: float` da `gt=0` yo'q. Juda katta miqdor (1e12) → 500 (Numeric overflow). `product_name` ham mijozdan olinadi (katalog qatorida erkin matn).

### 7. Rad etilgan / nofaol do'kon mebeli sotuvda qoladi
- **Rol:** anon/user
- **Qadamlar:** admin do'konni rad etadi → `GET /furniture` hali ham o'sha do'kon modelini ko'rsatadi → `POST /orders` 201. Seller esa `GET /seller/orders` da 403 oladi — buyurtmani hech kim bajara olmaydi.
- **Sabab:** `catalog.py:180/182`, `orders.py:59` faqat `Furniture.is_active/status` ni tekshiradi, do'kon holatini emas.

---

## 🟠 O'rta

8. **Smeta polni ogohlantirishsiz tashlab yuboradi.** Studiyada Pol → Parket → Herringbone tanlanib saqlangan, lekin do'kondan aniq mahsulot tanlanmagan (`surfaces.floor = ""`). Smetada pol qatori umuman yo'q, foydalanuvchiga "pol materiali tanlanmagan" degan xabar ham yo'q — jami summa ancha kam ko'rinadi.
9. **Telefon validatsiyasi yo'q (3 joyda).** Lead (`123`), buyurtma (`12`), do'kon arizasi (`abc`) — hammasi qabul qilinadi va saqlanadi. Seller "12" raqamiga qo'ng'iroq qila olmaydi.
10. **Eskirgan foydalanuvchi holati (is_admin).** Foydalanuvchi `localStorage` (`uy-tamir-auth`) dan olinadi, `/auth/me` faqat Profil sahifasida chaqiriladi. Cookie boshqa akkauntga o'tsa (masalan boshqa tabda kirish), sahifa to'liq yangilangandan keyin ham oldingi user (admin UI) ko'rinadi. Admin huquqi olib tashlansa ham UI admin bo'lib qoladi. Ilova ochilganda `/auth/me` bilan tekshirish kerak.
11. **Race → 500: xonani birinchi ochishda.** 5 ta parallel GET: `/rooms/{id}/state` 1/5, `/decoration` 4/5, `/electrical` 4/5 → 500 (UniqueViolation). Sabab: select-then-insert, ON CONFLICT yo'q — `decoration.py:30`, `electrical.py:41`, `room_state.py:43`. Studiya bir nechta so'rovni parallel yuborgani uchun haqiqiy foydalanuvchida ham chiqishi mumkin.
12. **Wall/opening endpointlari to'g'ri inputda 500.** `POST /rooms/{id}/walls`, `PATCH .../walls/w1`, `POST .../walls/w1/openings` → `TypeError: float * Decimal` (`rooms.py:483, 543, 617, 683` — Decimal `ceiling_h`). Noto'g'ri body ham 422 o'rniga 500. (Frontend hozir bu endpointlarni chaqirmaydi.)
13. **Katalog filtrlari noma'lum qiymatda 500.** `GET /ustalar?category=bogus`, `GET /materials?category=bogus`, `GET /admin/ustalar?category=bogus`; filtrlarda NUL bayt (`%00`) — 500. `catalog.py:63, 270`, `admin_catalog.py:552`.
14. **Draft-rooms: autentifikatsiyasiz va cheklovsiz.** `POST /draft-rooms` login'siz 10 MB JSON'ni qabul qildi (Postgres'ga yozildi). ID'ni bilgan har kim o'qiy/o'zgartira/o'chira oladi. `draft_rooms.py`, `schemas/draft_room.py` (`state: dict` hajm cheklovisiz).
15. **Ro'yxatdan o'tish validatsiyasi.** Bo'sh parol (`""`) qabul qilinadi va u bilan kirish mumkin; bunday akkaunt o'zini o'chira olmaydi (`delete-account` `not body.password` → doim 403). 50 belgidan uzun username → 500. `schemas/auth.py:69-71`.
16. **Ko'p joyda 500 (FK / overflow / null):** `POST /rooms/{id}/furniture` mavjud bo'lmagan furniture_id yoki katta x/z_index; `POST /rooms/{id}/finishes` mavjud bo'lmagan material_id; electrical katta x / wiring_meters; `PATCH /seller/store {"name":null}`, `PATCH /seller/furniture/{id} {"name_uz":null}`, juda katta `price_uzs`; usta `price_max` 1e19; user-models `name:null` / uzun category; admin store/usta/furniture PATCH null yoki overflow; buyurtmada 200+ belgili `dealer_name`. Hammasi 422 bo'lishi kerak. Batafsil fayl:qatorlar API agent hisobotida (pastda).
17. **`GET /orders/abc` → 500** (`orders.py:176` da `order_id: str`, boshqa route'larda `uuid.UUID`).
18. **Material buyurtmasida do'kon nomi yo'qoladi.** `/materials` javobida `store_name` yo'q → savat, buyurtma va seller'da "Do'kon" ko'rinadi, buyurtmaga `dealer_name: "Do'kon"` doimiy yoziladi ([DokonPage.tsx:201](../../frontend/src/pages/dokon/DokonPage.tsx)). Mebelda to'g'ri ishlaydi.
19. **Smetadagi "Usta chaqirish" xona/smetani biriktirmaydi.** Bu oddiy `<Link to="/ustalar">` ([SmetaPage.tsx:457](../../frontend/src/pages/smeta/SmetaPage.tsx)), lead'da `room_id = null`, `smeta_snapshot = null`.
20. **Buzilgan GLB qabul qilinadi.** Faqat `glTF` sarlavhasidan iborat 12 baytlik fayl model sifatida yuklanib, tasdiqlanib, katalogda ko'rinmoqda (`backend/media/furniture/6b29fe19-….glb`). Seller formasidagi preview "fayl buzilgan" deydi, lekin server baribir qabul qiladi.
21. **Admin do'konni tasdiqlagach "NOFAOL" belgisi qoladi** — sahifa yangilanmaguncha. Frontend `["admin"]` keshni to'g'ri yangilaydi, demak backend javobi Redis kesh tozalanishi/commit'dan oldin qaytayotgan bo'lishi mumkin (`admin_moderation.py:84-89`).

---

## 🟡 Past

22. Smeta sarlavhasi "Xona · m²" — raqam yo'q: frontend `room.area` ishlatadi ([SmetaPage.tsx:240](../../frontend/src/pages/smeta/SmetaPage.tsx), [rooms.ts:76](../../frontend/src/lib/api/rooms.ts)), API `floor_area` qaytaradi.
23. Wizard: shift balandligiga 99 yozilsa, xabarsiz 2.70 ga qaytadi (min 2 / max 4) — foydalanuvchiga sabab ko'rsatilmaydi.
24. Smeta USD rejimi: "74 m × $1" deb ko'rsatadi, natija $59 (birlik narxi $0.80 → $1 ga yaxlitlangan).
25. Mahsulot sahifasida o'lcham "241 × 63 **m**" — santimetr bo'lishi kerak.
26. Matn xatosi: "Narxi: arzondan qimmat**a**" → "qimmatga".
27. Do'kon: mahsulot rasmlari (`image_url`) ko'rsatilmaydi, hammasi placeholder; kategoriya xom kalit bilan ("parket", "divan").
28. Do'kon: savatga qo'shgandan keyin Materiallar tabi va qidiruv tozalanib, Mebel tabiga qaytadi.
29. 3D studiya 5+ soniya qora ekran bilan yuklanadi, yuklanish indikatori yo'q.
30. Mavzu nomuvofiqligi: "Yangi loyiha" dialogi va studiya panellari oq, ilovaning qolgan qismi qorong'i.
31. Faqat bo'sh joydan iborat nom/izoh (`"   "`) bo'sh satr sifatida saqlanadi (seller store, admin reject note).
32. Admin `PATCH /admin/stores/{id} {"is_active":true}` rad etilgan do'konni ommaviy ro'yxatga chiqaradi, status esa "rejected" qoladi.
33. Wizard ochilganda `POST /draft-rooms` ikki marta yuboriladi (bittasi yetim qoladi) — ehtimol dev StrictMode, prod'da tekshirish kerak.

---

## Funksional bo'shliqlar (xato emas, lekin e'tibor uchun)
- **Usta roli uchun web UI yo'q.** `/usta/profile`, `/usta/leads`, `/usta/portfolio` ni chaqiradigan sahifa yo'q; ariza va inbox faqat native ilovada bo'lsa kerak. Admin esa web'da usta arizalarini tasdiqlay oladi.
- **Seller faqat 3D mebel sota oladi** — materiallar (bo'yoq, parket va h.k.) uchun seller UI yo'q, ular faqat admin/seed orqali.

## Tekshirilmagan
- AI funksiyalari (smeta yordamchisi, AI dizayn, render, rasmdan model) — pul sarflaydi; faqat anonimga 401 berishi tekshirildi.
- OTP/SMS, Google login, push qurilmalar — haqiqiy tashqi xizmatlar.
- LiDAR / 360 skan, USDZ konvertatsiya — haqiqiy qurilma/fayl kerak.
- Mobil o'lchamdagi layout, iOS'ga xos narsalar (foydalanuvchi web'ni tanladi).
- PDF faqat API orqali tekshirildi (ishlaydi), brauzerda yuklab olinmadi.

## Test ma'lumotlari
Test tugagach local bazadan tozalandi: 32 ta `qa_*` akkaunt va ularga bog'liq hamma narsa (26 ta do'kon, 1 ta usta profili, mebel modellari, kvartira/xona, buyurtma, lead, draft'lar), `backend/media` dagi 9 ta test fayli (XSS `.html` fayli ham), Redis katalog keshi.
