# Mobil ilova uchun handoff: web QA tuzatishlari (2026-10-12)

> **Kim uchun:** Flutter mobil ilovada ishlaydigan dasturchi yoki agent.
> **Qachon o'qiladi:** mobil ilovada o'zgarish boshlashdan **oldin**.
> **Maqsad:** web'da va backend'da nima o'zgarganini bilish, mobil ilovani yangi backend qoidalariga moslash va web'da topilgan xatolarning mobil'dagi nusxalarini tuzatish.

Batafsil QA hisoboti (har bir xato, qadamlar, sabab): [docs/qa/2026-10-12-qa-hisobot.md](qa/2026-10-12-qa-hisobot.md).
Tuzatishlar uchta PR'da, hammasi `master`ga merge qilingan va production'ga deploy bo'lgan:

| PR | Nima | Merge commit |
|---|---|---|
| [#18](https://github.com/Begzod10/andoza_ai/pull/18) | 7 ta jiddiy xato | `3191f1d9` |
| [#19](https://github.com/Begzod10/andoza_ai/pull/19) | 13 ta o'rta xato | `5d167888` |
| [#20](https://github.com/Begzod10/andoza_ai/pull/20) | 12 ta past xato | `180461d9` |

---

## 0. Muhim kontekst

- QA **faqat web versiyada** (`frontend/`, React) va backend API'da o'tkazildi. Flutter ilova **umuman sinalmagan**.
- Backend umumiy: undagi har bir o'zgarish mobil ilovaga **darhol** ta'sir qiladi. Bir qismi mobil xatolarni ham tuzatadi, bir qismi esa avval ishlagan so'rovlarni endi rad etadi (pastda **⚠️ BREAKING** bilan belgilangan).
- Flutter WebView ichida `?app=1` bilan ochiladigan veb sahifalar (Studio, Smeta) production saytdan yuklansa, ulardagi web tuzatishlar mobilga o'zi o'tadi. Native Flutter ekranlarga **o'tmaydi**.
- Web'da usta roli uchun UI yo'q. Usta ekranlari (ariza, inbox, portfolio) faqat mobil'da bo'lsa kerak, ular **umuman sinalmagan**.

---

## 1. Backend API o'zgarishlari (mobil client'ga ta'sir qiladi)

### 1.1 ⚠️ BREAKING — mobil ilovada albatta tekshiring

| Endpoint | Avval | Endi | Mobil'da nima qilish kerak |
|---|---|---|---|
| `POST/GET/PATCH/DELETE /api/v1/draft-rooms[/{id}]` | Login shart emas edi, istalgan hajm | **Login shart (401)**. Draft yaratgan userga tegishli, boshqaniki **404**. `state` ≤ **256 KB**, aks holda **422**. Migration'dan oldingi egasiz draft'lar endi 404 | Har so'rovda auth token yuboring. 404 kelsa, yangi draft yarating (web wizard shunday qiladi) |
| `POST /api/v1/orders` | `quantity` istalgan son, `phone` istalgan matn | `quantity` > 0 va ≤ 100 000, aks holda **422**. `phone` O'zbekiston raqami bo'lishi kerak (1.3 ga qarang), aks holda **422**. Saqlanganda `+998XXXXXXXXX` ko'rinishiga keltiriladi | Formada raqamni oldindan tekshiring. Javobdagi `phone` endi normalizatsiya qilingan |
| `POST /api/v1/orders` | Yopiq do'kon mahsulotini buyurtma qilish mumkin edi | Do'koni pending, rejected yoki nofaol mebel/material → **400** `"Noto'g'ri mebel ID."` / `"Noto'g'ri material ID."` | Savatda eskirgan mahsulot qolsa, xatoni foydalanuvchiga tushunarli ko'rsating |
| `POST /api/v1/leads` | `contact_phone` jimgina tashlab yuborilardi | `contact_phone` (ixtiyoriy) **saqlanadi**. Noto'g'ri raqam → **422** | Raqamni oldindan tekshiring (1.3) |
| `POST /api/v1/auth/register` | Bo'sh parol va 50+ belgili username qabul qilinardi (bu 500 berardi) | username 3–50 belgi (bo'sh joylar olib tashlanadi), parol kamida 6 belgi, aks holda **422** | Ro'yxatdan o'tish formasida shu cheklovlar bo'lsin. `/auth/login` o'zgarmadi, eski akkauntlar avvalgidek kiradi |
| `POST /api/v1/seller/store`, `PATCH /api/v1/seller/store` | `phone` istalgan matn, `name: "   "` bo'sh satr bo'lib saqlanardi | `phone` tekshiriladi va normalizatsiya qilinadi. Faqat bo'sh joydan iborat `name` → **422** | Do'kon arizasi va tahrirlash formalarida tekshiring |
| `POST /api/v1/seller/furniture` (GLB yuklash) | Faqat dastlabki 4 bayt (`glTF`) tekshirilardi | glTF 2.0 bo'lishi, sarlavhadagi uzunlik fayl hajmiga teng bo'lishi, JSON chunk va kamida 1 ta mesh bo'lishi shart, aks holda **415** `"Fayl haqiqiy .glb emas"` | Mobil'dan model yuklansa, 415 xabarini ko'rsating |
| `POST /api/v1/admin/moderation/{stores\|ustalar}/{id}/reject` | `note: "   "` bo'sh satr bo'lib saqlanardi | **422** | Admin ekrani mobil'da bo'lsa, bo'sh sababni yubormang |
| `PATCH /api/v1/admin/stores/{id}` | Rad etilgan do'konga `is_active: true` qo'yish mumkin edi | pending/rejected do'konga `is_active: true` → **409** `"Avval do'kon arizasini tasdiqlang"` | Faollashtirish faqat moderatsiya (approve) orqali |

### 1.2 Yangi yoki o'zgargan javob maydonlari

| Endpoint | O'zgarish |
|---|---|
| `GET /api/v1/materials` | Har bir material'da yangi **`store_name`** maydoni bor. Buyurtmada `dealer_name` sifatida umumiy "Do'kon" o'rniga shuni yuboring. `image_url` ham bor, uni ko'rsating |
| `GET /api/v1/usta/leads` (usta inbox) | `client_phone` endi avval lead'dagi **`contact_phone`**, u bo'lmasa userning profilidagi raqam. Username bilan kirgan mijozning raqami endi ko'rinadi |
| `POST /api/v1/leads` + `room_id` | `room_id` yuborilsa, backend shu xonaning **oxirgi saqlangan** smetasini (`Estimate`) `smeta_snapshot` sifatida biriktiradi. Smetadan "Usta chaqirish" bosilganda `room_id`ni yuboring |
| `GET /api/v1/rooms/{id}` | Maydon `floor_area` deb ataladi, `area` emas. Web smeta sarlavhasi shu sababli bo'sh chiqardi |
| Furniture `footprint_w`, `footprint_d`, `height_cm` | Birlik **santimetr** (metr emas). Ko'rsatishda "sm" yozing |

### 1.3 Telefon qoidasi (backend'da hamma joyda bir xil)

```
Bo'sh joy, "-", "(", ")" olib tashlanadi  →  ^\+?998\d{9}$  →  +998XXXXXXXXX ko'rinishida saqlanadi
"+998 90 123-45-67" ✓   "998901234567" ✓   "12" ✗   "abc" ✗   "+7 999 123 45 67" ✗
```
Bo'sh qiymat "kiritilmagan" deb hisoblanadi. Buyurtmada telefonni majburiy qilish UI tomonda, backend uni ixtiyoriy deb qabul qiladi.
Web'dagi xato matni: `Telefon raqami noto'g'ri. Masalan: +998 90 123 45 67`.

### 1.4 Xato javoblari: 500 o'rniga 422 — formatga e'tibor bering

Avval 500 bergan ko'p holatlar endi **422** qaytaradi: noma'lum filtr qiymati (`?category=bogus`), NUL bayt, ustun sig'imidan katta son yoki matn, NOT NULL maydonga `null`, mavjud bo'lmagan ID'ga havola, noto'g'ri UUID (`GET /orders/abc`).

**`detail` maydoni ikki xil ko'rinishda keladi:**
```jsonc
// Schema validatsiyasi (pydantic): ro'yxat
{"detail": [{"loc": ["body", "phone"], "msg": "...", "type": "value_error"}]}
// Baza rad etgan qiymat (yangi handler) va HTTPException: oddiy satr
{"detail": "Noto'g'ri qiymat yuborildi."}
```
Mobil client `detail`ni ham ro'yxat, ham satr sifatida o'qiy olishi kerak.

### 1.5 Contract o'zgarmagan, lekin endi to'g'ri ishlaydigan joylar

- `GET/PATCH /api/v1/apartments[/{id}]` — kvartira ochilganda soft-delete qilingan xonalar endi **bazadan butunlay o'chib ketmaydi**.
- `GET /rooms/{id}/state`, `/decoration`, `/electrical` — xona birinchi marta ochilganda parallel so'rovlar endi 500 bermaydi (avval race tufayli UniqueViolation chiqardi).
- `POST/PATCH /rooms/{id}/walls…`, `POST …/openings` — to'g'ri inputda ham 500 berardi (Decimal xatosi), endi ishlaydi. Body endi qat'iy tekshiriladi va noto'g'ri bo'lsa 422 qaytaradi.
- `POST /media/photos` — fayl kengaytmasi fayl nomidan emas, rasm turidan olinadi (XSS yopildi).
- Yopiq do'konlar mahsulotlari `GET /furniture` va `GET /materials`da endi ko'rinmaydi.

### 1.6 Migration'lar
Production'da allaqachon bajarilgan: `1786000036` (`leads.contact_phone`), `1786000037` (`draft_rooms.user_id`).

---

## 2. Web'da tuzatilgan frontend xatolari — mobil'da ham tekshiring

Bu xatolar web frontend kodida edi. Flutter'da bu ekranlar native yozilgan bo'lsa, xuddi shu xato u yerda ham bo'lishi mumkin. Har birini mobil'da qaytadan sinab ko'ring. **Qanday sinash** ustunida web'da xatoni ochib bergan qadamlar yozilgan.

| # | Ekran | Web'dagi xato | Qanday sinash | Web'dagi tuzatish (mantiq) |
|---|---|---|---|---|
| 1 | **Wizard (o'lchamlar)** | Auto-save xonani A devor qadamida yaratib qo'yardi, keyingi o'zgarishlar (B/C/D uzunliklari, eshik/deraza) serverga yuborilmasdi | A devorda 2 soniya kuting → C devorga eshik qo'shing → yakunlang → `GET /rooms/{id}`da `openings_count` 1 bo'lishi kerak | Xona yaratilgandan keyin har saqlash `PATCH /rooms/{id}` ga `geometry` va `ceiling_h`ni yuboradi. Saqlashlar navbat bilan bajariladi, har biri eng so'nggi holatni yuboradi |
| 2 | **Login** | Noto'g'ri parolda xato chiqmasdi, sahifa qayta yuklanardi | Noto'g'ri parol bilan kiring | `/auth/login`dan 401 kelsa, bu "parol noto'g'ri" degani, token refresh qilinmaydi. Mobil HTTP client'da ham 401 + refresh mantig'ini login va register endpoint'lariga qo'llamang |
| 3 | **Usta chaqirish (lead)** | Kiritilgan telefon yo'qolardi, "123" ham qabul qilinardi | Lead yuboring → usta inbox'ida raqam ko'rinsinmi? | `contact_phone`ni yuboring va 1.3 qoidasi bilan oldindan tekshiring |
| 4 | **Smeta → Usta chaqirish** | Xona va smeta lead'ga biriktirilmasdi | Smetadan usta chaqiring → lead'da `room_id` va `smeta_snapshot` bormi? | `room_id`ni yuboring. Snapshot faqat smeta **saqlangan** bo'lsa biriktiriladi |
| 5 | **Checkout** | Telefon "12" qabul qilinardi | "12" bilan buyurtma bering | 1.3 qoidasi bilan tekshiring |
| 6 | **Do'kon arizasi / tahrirlash** | Telefon "abc" qabul qilinardi | "abc" bilan ariza yuboring | 1.3 qoidasi. Faqat bo'sh joydan iborat nomni ham rad eting |
| 7 | **Ro'yxatdan o'tish** | Backend bo'sh parolni qabul qilardi | Bo'sh yoki 5 belgili parol | username 3–50, parol kamida 6 |
| 8 | **Sessiya / rol** | Login qilingan user lokal saqlanar, `/auth/me` faqat profil sahifasida chaqirilardi. Boshqa akkauntga o'tilganda yoki admin huquqi olib tashlanganda eski holat (admin ekranlari) qolib ketardi | Admin bilan kiring, server tomonda `is_admin`ni o'chiring, ilovani qayta oching | Ilova ochilganda `/auth/me`ni chaqiring: javob kelsa userni yangilang. 401 bo'lsa refresh, u ham o'xshamasa lokal sessiyani tozalang. Tarmoq xatosida mavjud holatni saqlang |
| 9 | **Do'kon: material nomi** | Savat, buyurtma va seller'da "Do'kon" yozuvi chiqardi | Material buyurtma qiling | `store_name`ni ko'rsating va `dealer_name` sifatida yuboring (1.2) |
| 10 | **Do'kon: rasm va kategoriya** | Material rasmlari ko'rinmasdi, kategoriya xom kalit bilan chiqardi ("parket") | Materiallar ro'yxati va mahsulot sahifasi | Material uchun `image_url`, mebel uchun `thumbnail_url`. Kategoriya nomlari: `boyoq` → "Bo'yoq", `gips` → "Gips va suvoq", `elektr_mat` → "Elektr", `divan` → "Divan" va h.k. |
| 11 | **Do'kon: o'lcham** | "241 × 63 m" | Mebel sahifasi | `footprint_w × footprint_d × height_cm` **sm** |
| 12 | **Do'kon: savatdan keyin** | Tab va qidiruv tozalanib, Mebel tabiga qaytardi | Materiallar → qidiruv → mahsulot → savatga qo'shish | Ekranlar almashganda brauzerlash holati (tab, kategoriya, qidiruv) saqlansin |
| 13 | **Smeta: pol** | Pol turi tanlangan, lekin mahsulot tanlanmagan bo'lsa, pol smetaga jimgina kirmasdi | Pol → Parket, mahsulotsiz → smeta | `room.state.designState.floorConfigured && floorType && !room.surfaces.floor` bo'lsa ogohlantirish va Pol bosqichiga havola ko'rsating |
| 14 | **Smeta: sarlavha** | "Xona · m²" (maydon bo'sh) | Smeta sarlavhasi | `floor_area`ni ishlating |
| 15 | **Smeta: USD** | "74 m × $1" deb yozilardi, jami esa $59 | USD rejimi | $100 dan kichik summalarni sentlar bilan ko'rsating (`$0.80`), kattalarini butun dollar bilan |
| 16 | **Wizard: shift balandligi** | 99 kiritilsa, xabarsiz eski qiymat qolardi | 99 kiriting → Keyingi | 2–4 m oralig'idan tashqarida bo'lsa, xabar chiqarib "Keyingi"ni o'chirib qo'ying |
| 17 | **Wizard: draft** | Bitta tashrifda ikkita draft yaratilardi | Wizard'ni oching | Draft faqat bir marta yaratilsin. Endi token ham shart (1.1) |
| 18 | **Studio yuklanishi** | 5+ soniya qora ekran, yuklanish belgisi yo'q | Studio'ni oching | Yuklanish indikatori ko'rsating (WebView bo'lsa, web tuzatishi o'zi o'tadi) |
| 19 | **Admin moderatsiya** | Tasdiqlagandan keyin "nofaol" belgisi qolib ketardi | — | Web'da bu test muhitining artefakti bo'lib chiqdi, mobil'da qaror qabul qilingach ro'yxatni yangilang |

---

## 3. Mobil'da faqat o'zi sinashi kerak bo'lgan joylar (web'da yo'q)

- **Usta ekranlari:** ariza (`POST /usta/profile`), inbox (`GET /usta/leads`, endi `contact_phone` bilan), portfolio. `price_max` uchun haddan katta son endi 422 qaytaradi.
- **Push bildirishnomalar:** buyurtma va usta holatlari o'zgarganda push ketadi (bu QA'da sinalmagan).
- **LiDAR / 360 skan, kamera, native Google login** — QA'da sinalmagan.

---

## 4. Tavsiya etilgan ish tartibi (mobil)

1. Mobil repo'da 1.1 jadvalidagi endpoint'larni chaqiradigan joylarni toping. Avval **draft-rooms auth**, **telefon formati** va **422 `detail` formati**ni tuzating, chunki ular hozir ham production'da xato berishi mumkin.
2. 2-bo'limdagi har bir qatorni mobil'da sinab chiqing. Xato takrorlansa, "Web'dagi tuzatish (mantiq)" ustunidagidek tuzating va har biriga test yozing.
3. Usta ekranlarini (3-bo'lim) alohida sinab chiqing.
4. Natijani shu formatda yozing: ekran, xato, qadamlar, tuzatish. Shunda web va mobil hisobotlari bir-biriga mos bo'ladi.

Telefon tekshiruvi uchun web'dagi namuna: `frontend/src/lib/phone.ts`. Backend'dagisi: `backend/app/schemas/auth.py` (`normalize_contact_phone`).
