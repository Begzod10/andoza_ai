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
Production'da allaqachon bajarilgan: `1786000036` (`leads.contact_phone`), `1786000037` (`draft_rooms.user_id`), `1786000038` (`furniture.styles`, 7-bo'lim), `1786000039` (`furniture.styles_source`, 7.4).

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
5. Keyin yangi funksiyalar (5–8-bo'limlar). Ularning ichida eng muhimi **7.1 va 7.4 dagi ⚠️ bandlar**: xona holatini saqlaganda noma'lum maydonlarni yo'qotmaslik va mebel tahririda `styles` ni faqat o'zgarganda yuborish. Ikkalasi ham jim buziladi, xato chiqmaydi.

Telefon tekshiruvi uchun web'dagi namuna: `frontend/src/lib/phone.ts`. Backend'dagisi: `backend/app/schemas/auth.py` (`normalize_contact_phone`).

---

## 5. Yangi funksiya: rasmdan AI dizayn (2026-10-19)

Foydalanuvchi ilhom rasmini yuboradi (Pinterest skrinshoti, Instagram yoki o'zi olgan surat), AI undagi uslubni o'qib, xonaga katalogdan dizayn rejasini tuzadi. Bu Pinterest integratsiyasining 1-bosqichi. Spec: [docs/superpowers/specs/2026-10-19-ai-design-from-image-design.md](superpowers/specs/2026-10-19-ai-design-from-image-design.md).

### API
`POST /api/v1/rooms/{room_id}/ai-design/image`, `multipart/form-data`:

| Maydon | Majburiy | Cheklov |
|---|---|---|
| `image` | ha | JPEG, PNG yoki WebP, 10 MB gacha. Tur birinchi baytlardan ham tekshiriladi |
| `prompt` | yo'q | 500 belgigacha, masalan "faqat ranglarini ol". Matn rasmdan ustun turadi |
| `room_type` | yo'q | 20 belgigacha, `/ai-design` dagi bilan bir xil |

**Javob:** `POST /ai-design` bilan **aynan bir xil** reja (`title`, `summary`, `walls`, `floor`, `lights`, `furniture`, `warnings`), shuning uchun mavjud "qo'llash" kodini qayta ishlating.

| Kod | Holat | `detail` |
|---|---|---|
| 413 | 10 MB dan katta | `"Rasm hajmi 10 MB dan oshmasligi kerak"` |
| 415 | rasm emas yoki turi qo'llanmaydi (HEIC ham) | `"Faqat JPEG, PNG yoki WebP rasm yuklang"` |
| 429 | kunlik limit tugagan | `"Bugungi rasmdan dizayn limiti tugadi"` |
| 422 / 502 / 503 | AI reja bermadi / provayder xatosi / AI o'chiq | `/ai-design` dagi bilan bir xil |

**Limit:** har bir urinish pullik vision chaqiruvi. Bitta user uchun kuniga 10 ta (`IMAGE_DESIGN_DAILY_LIMIT`), matnli AI dizayn limitidan alohida. Noto'g'ri fayl yoki birovning xonasi limitdan hisoblanmaydi.

**Maxfiylik:** rasm serverda saqlanmaydi. U 1024 px gacha kichraytiriladi va EXIF (joylashuv ham) olib tashlanadi. Katta yuklama so'rov davomida vaqtinchalik faylga yozilishi mumkin, so'rov tugashi bilan u o'chiriladi.

**`image_notes`:** rasm bilan yaratilgan rejada qo'shimcha matn maydoni bor: rasmdan nima olingani va katalogda nima topilmagani. Bo'sh bo'lishi mumkin. Uni `summary` ostida ko'rsating.

### Mobil'da qilinadigan ishlar
- **Studio WebView'da ochilsa:** web'dagi "Rasm qo'shish" tugmasi `<input type="file">` ishlatadi. Flutter WebView'da fayl tanlash ishlashi uchun WebView'ga fayl tanlash (file chooser) va galereya ruxsati kerak. Busiz tugma hech narsa qilmaydi.
- **iPhone HEIC:** iPhone suratlari ko'pincha HEIC formatida bo'ladi va backend ularni 415 bilan rad etadi. Native tanlashda rasmni JPEG ga o'girib yuboring.
- **Native ekran qilinsa:** yuqoridagi contract bo'yicha `multipart` yuboring. Xato matnlarini `detail` dan to'g'ridan-to'g'ri ko'rsatsa bo'ladi, ular o'zbekcha.
- **2-bosqich (keyin):** Pinterest ilovasidan "Share → andoza.ai" (Android share intent / iOS share extension). Ulashilgan rasm shu endpoint'ga yuboriladi.

---

## 6. Yangi funksiya: Pinterest havolasidan AI dizayn (2026-10-19)

Foydalanuvchi rasmni saqlab yuklash o'rniga Pinterest pin havolasini beradi. Server pin rasmini o'zi oladi (Pinterest oEmbed orqali, `i.pinimg.com` dan, 736 px gacha) va 5-bo'limdagi quvurga beradi. Spec: [docs/superpowers/specs/2026-10-19-ai-design-from-pinterest-design.md](superpowers/specs/2026-10-19-ai-design-from-pinterest-design.md).

### API
`POST /api/v1/rooms/{room_id}/ai-design/pin`, `application/json`:

| Maydon | Majburiy | Cheklov |
|---|---|---|
| `url` | ha | 500 belgigacha. `https://(www.\|mx.\|…)pinterest.<domen>/pin/<id>/`, slug'li `/pin/<slug>--<id>/` yoki `https://pin.it/<kod>` |
| `prompt` | yo'q | 500 belgigacha |
| `room_type` | yo'q | 20 belgigacha |

**Javob:** 5-bo'limdagi bilan bir xil reja (`image_notes` bilan) va **`pin_image_url`**: server olgan rasm manzili. Uni foydalanuvchiga "Shu pin asosida" deb ko'rsating.

| Kod | Holat | `detail` |
|---|---|---|
| 422 | Pinterest pin havolasi emas (boshqa sayt, `http://`, doska yoki profil havolasi va h.k.) | `"Bu Pinterest pin havolasi emas"` |
| 404 | pin topilmadi yoki yopiq | `"Pin topilmadi yoki u yopiq"` |
| 502 | Pinterest javob bermadi | `"Pinterest hozir javob bermadi. Birozdan keyin urinib ko'ring"` |
| 413 / 415 / 429 / 503 | 5-bo'lim bilan bir xil | 5-bo'lim bilan bir xil |

**Limit:** 5-bo'lim bilan **umumiy** (`image_design`, kuniga 10 ta). Havola xato bo'lsa yoki Pinterest javob bermasa, limitdan hisoblanmaydi.

> Diqqat: ilovadagi boshqa 404 javoblar matni global handler tufayli `"Not found"` bo'lib keladi. Bu endpoint'dagi pin 404'i esa haqiqiy matnni qaytaradi.

### Mobil'da qilinadigan ishlar
- **Share → andoza.ai (asosiy maqsad):** Pinterest ilovasi pinni ulashganda odatda matn beradi, masalan `"Check out this Pin! https://pin.it/AbCd12"`. Matndan birinchi `https://…` bo'lagini ajratib, `url` sifatida yuboring:
  - Android: `ACTION_SEND` intent, `text/plain`;
  - iOS: Share Extension.
  Foydalanuvchiga qaysi xonaga qo'llashni tanlatish kerak, chunki endpoint `room_id` talab qiladi.
- **Studio WebView'da:** web'dagi "Pinterest havolasi" maydoni bor, qo'shimcha ish kerak emas.
- **Sinash:** haqiqiy `pin.it` qisqa havolasi local'da sinalmagan (topilmadi). Ulashishni qilganda telefondagi Pinterest ilovasidan olingan `pin.it` bilan albatta sinab ko'ring.

---

## 7. Tayyor uslublar, smeta narxlari va mebel uslubi (2026-10-19)

PR'lar (hammasi `master`da, production'ga deploy bo'lgan): [#24](https://github.com/Begzod10/andoza_ai/pull/24), [#25](https://github.com/Begzod10/andoza_ai/pull/25), [#26](https://github.com/Begzod10/andoza_ai/pull/26), [#27](https://github.com/Begzod10/andoza_ai/pull/27), [#28](https://github.com/Begzod10/andoza_ai/pull/28), [#29](https://github.com/Begzod10/andoza_ai/pull/29), [#30](https://github.com/Begzod10/andoza_ai/pull/30), [#31](https://github.com/Begzod10/andoza_ai/pull/31), [#32](https://github.com/Begzod10/andoza_ai/pull/32). Spec: [docs/superpowers/specs/2026-10-19-mebel-uslubi-va-smeta-design.md](superpowers/specs/2026-10-19-mebel-uslubi-va-smeta-design.md).

Studio va Smeta WebView'da ochilsa, 7.1 va 7.2 dagi o'zgarishlar mobilga o'zi o'tadi. Native ekranlar uchun quyidagi contract'lar muhim.

### 7.1 Tayyor uslublar (studio, AIsiz)
- **Uslublar ro'yxati.** Ro'yxat boshiga 4 ta yangi uslub qo'shildi: **Neoklassika, Zamonaviy, Hi-Tech, Milliy**. Eski 5 tasi (Qorong'i, Skandinav, Klassik, Loft, Minimalist) ulardan keyin keladi. Manba: `frontend/src/lib/aiDesignPresets.ts` (`DESIGN_PRESETS`). Native studio ekrani bo'lsa, ro'yxat va qiymatlarni shu fayldan oling.
- **Shift va bezaklar.** Har bir uslub endi xona holatining `designState` ida quyidagilarni ham o'rnatadi:
  - `ceiling: { design, settings }`, ya'ni shift turi, rangi va LED harorati;
  - `skirting: { id }` (plintus);
  - `cornice: { id } | null` (galtel; `null` = galtelsiz).
- **AI rejalari** bu maydonlarni yubormaydi va mavjud shift yoki plintusga tegmaydi.
- **⚠️ Xona holatini saqlash.** Uslub qo'ygan chiroq va mebel elementlarida (`state.lights[]`, `state.furniture[]`) endi `fromDesign: true` belgisi bor. Keyingi uslub faqat shu belgili elementlarni almashtiradi, foydalanuvchi qo'yganlari qoladi. **Mobil ilova xona holatini o'qib qayta saqlasa, elementlardagi noma'lum maydonlarni (`fromDesign`, `name`, `unitPriceUzs` va boshqalar) saqlab qolishi shart.** Aks holda keyingi uslub eski chiroq va mebelni almashtirmay, ustiga qo'shib yuboradi.

### 7.2 Smeta (`POST /rooms/{id}/estimate/preview` va `/estimate`)
Javob formati o'zgarmagan, lekin yangi qatorlar paydo bo'ladi:
- **Pol, plintus, oboy va bo'yoq.** Foydalanuvchi faqat pol turini (`designState.floorType` + `floorConfigured: true`), oboy naqshini yoki bo'yoq rangini tanlagan, lekin do'kon mahsulotini tanlamagan bo'lsa, narx shu turdagi do'kon mahsulotlarining **o'rta (mediana)** narxidan olinadi.
  - Oldin pol va plintus qatori umuman chiqmasdi, oboy esa 0 so'm edi.
  - Bunday qatorda `is_approximate: true` va `warning: "Mahsulot tanlanmagan — do'kondagi o'rtacha narx olindi. Aniq narx uchun o'zingiz mahsulot tanlang."` bo'ladi.
  - Parket qatori `"Parket: …"` deb, laminat `"Laminat: …"` deb nomlanadi; `category` ikkalasida `"laminat"`.
- **Galtel.** `designState.cornice` da profil bo'lsa, `category: "shift"` qatori qo'shiladi: `"Galtel T 56 (2 m dona)"`. Miqdor perimetrdan hisoblanadi, standart narx 11 000 so'm (2 m polosa), qator `is_approximate: true`.
- **Pol izohi.** Web Smeta sahifasi ilgari pol turi tanlangan, lekin mahsulot tanlanmagan bo'lsa "pol smetaga kirmadi" degan ogohlantirish ko'rsatardi. Endi:
  - javobda `category` `laminat` yoki `plitka` qatori bo'lsa, "narx do'kondagi o'rtacha poldan olindi (taxminiy)" deydi;
  - bunday qator bo'lmasa, avvalgidek "kirmadi" deydi;
  - beton pol uchun hech narsa demaydi.

  Native Smeta ekranida shunday banner bo'lsa, xuddi shunday moslang. Namuna: `frontend/src/pages/smeta/SmetaPage.tsx` (`floorNote`).

### 7.3 Mebel uslubi (`furniture.styles`)
- **Maydon.** Katalog, sotuvchi va admin furniture javoblarida yangi `styles: string[]` maydoni bor.
  - Qiymatlar: `neoklassika, klassik, zamonaviy, hitech, minimalist, skandinav, loft, milliy`.
  - Bo'sh ro'yxat "hamma uslubga mos" degani.
  - Maydon qo'shimcha: eski mijoz uni e'tiborsiz qoldirsa ham ishlaydi.
- **Yuklash** (`POST /seller/furniture`, admin `POST /admin/furniture`, multipart): ixtiyoriy `styles` maydoni, vergul bilan ajratilgan (`"zamonaviy,minimalist"`). Bo'sh yoki yo'q bo'lsa `[]`.
- **Tahrirlash** (`PATCH /seller/furniture/{id}`, admin PATCH, JSON):
  - `styles: string[]` bo'lsa, shu uslublar saqlanadi;
  - `[]` bo'lsa, uslublar tozalanadi;
  - yuborilmasa yoki `null` bo'lsa, uslublar o'zgarmaydi.
- **Validatsiya.** Noma'lum uslub 422 qaytaradi: `"styles neoklassika, klassik, … dan bo'lishi kerak"`. Saqlashda takrorlar olib tashlanadi va yuqoridagi tartibga keltiriladi.
- **Studio** tayyor uslubi avval o'z uslubidagi mebelni, keyin uslubsiz mebelni, eng oxirida boshqa uslubdagi mebelni tanlaydi.

### 7.4 Uslubni AI qo'yadi (`styles_source`)
PR: [#34](https://github.com/Begzod10/andoza_ai/pull/34). Spec: [docs/superpowers/specs/2026-10-19-mebel-uslubi-ai-design.md](superpowers/specs/2026-10-19-mebel-uslubi-ai-design.md).
- **Yangi maydon.** Sotuvchi va admin furniture javoblarida `styles_source: "manual" | "ai" | null` bor. Katalog (`/catalog/furniture`) javobida bu maydon **yo'q**. Qiymatlari:
  - `null`: uslubni hali hech kim qo'ymagan;
  - `"manual"`: sotuvchi yoki admin qo'ygan;
  - `"ai"`: AI qo'ygan.
- **Server o'zi ishlaydi.** Uslubsiz yuklangan mebel fonda AI'ga yuboriladi: AI preview rasm, nom va kategoriyaga qarab 0–3 ta uslub qo'yadi. AI faqat `styles_source = null` bo'lgan mebelga yozadi. Mobil'dan hech narsa chaqirish shart emas.
- **⚠️ PATCH qoidasi.** PATCH so'rovida `styles` kaliti bo'lsa (`[]` bo'lsa ham), mebel `"manual"` bo'ladi va AI unga boshqa hech qachon tegmaydi.
  - Shuning uchun mobil tahrirlash ekrani `styles` ni **faqat foydalanuvchi uslubni o'zgartirganda** yuborishi kerak. AI qo'ygan uslubni foydalanuvchi tasdiqlab saqlaganda ham yuborilishi mumkin.
  - Faqat narx yoki nom o'zgartirilganda `styles` yuborilmasin. Aks holda mebel AI'dan butunlay chiqib qoladi.
  - Namuna: `frontend/src/lib/furnitureStyles.ts` (`stylesPatch`).
- **Admin endpoint** `POST /admin/furniture/classify-styles` → `{"queued": N}`. AI o'chiq bo'lsa 503: `"AI hozir o'chirilgan"`. U faqat admin uchun, mobil'ga kerak bo'lmasa kerak.

### Mobil'da qilinadigan ishlar
- **Tahrirlash ekranida `styles` faqat o'zgarganda yuborilsin** (7.4 dagi ⚠️). Bu AI uslublari ishlashi uchun muhim.
- **Sotuvchi model yuklash va tahrirlash ekranlari** (agar mobil'da bo'lsa): "Uslub" tanlovini qo'shing (bir nechtasini tanlash mumkin, hech biri tanlanmasa "Hamma uslubga mos"). O'zbekcha nomlar: Neoklassika, Klassik, Zamonaviy, Hi-Tech, Minimalist, Skandinav, Loft, Milliy. Namuna: `frontend/src/components/dokon/StyleChips.tsx`.
- **Xona holatini saqlash:** 7.1 dagi ⚠️ bandini tekshiring. Bu eng muhim nuqta.
- **Native Smeta ekrani:** yangi taxminiy qatorlar va `warning` matnini ko'rsating, pol bannerini 7.2 bo'yicha moslang.
- **Productionda sinash:**
  - mebel bor xonada ikki uslubni ketma-ket qo'llang: ikkinchi divan paydo bo'lmasligi kerak;
  - admin bitta mebelga uslub qo'ysin, keyin o'sha uslub qo'llansin: shu mebel tanlanishi kerak.

  Ikkalasi ham lokalda sinalmagan, chunki lokal katalogda mebel yo'q.

---

## 8. 2026-10-23 dagi o'zgarishlar: mobil'ga ta'siri

PR'lar (hammasi `master`da va production'da): [#36](https://github.com/Begzod10/andoza_ai/pull/36), [#37](https://github.com/Begzod10/andoza_ai/pull/37), [#38](https://github.com/Begzod10/andoza_ai/pull/38), [#39](https://github.com/Begzod10/andoza_ai/pull/39). Hech biri mobil ishlatadigan contract'ni buzmaydi. Mobil'da majburiy ish yo'q, quyidagilar ma'lumot uchun.

| PR | Nima | Mobil'ga ta'siri |
|---|---|---|
| #36 | Backend AI dizayner (`/ai-design`, `/ai-design/image`, `/ai-design/pin`) katalogdagi mebel uslubini (`styles`) ko'radi va so'rovda uslub nomi bo'lsa ("hi-tech", "neoklassika", "milliy"…), shu uslubdagi mebelni afzal ko'radi | Contract o'zgarmagan, faqat natija yaxshilanadi. Mobil'da uslubni so'rov matniga qo'shib berish (masalan, uslub tanlovi "Hi-Tech uslubida…" deb prompt'ga qo'shilsa) foydali bo'lishi mumkin |
| #37 | Admin panelda "Materiallar" bo'limi: `GET/POST/PATCH /api/v1/admin/materials` (faqat admin) | Faqat admin web uchun. Mobil'da admin ekrani bo'lmasa, ta'siri yo'q. Mobil studiyadagi bo'yoq, oboy va pol ro'yxatlari (`/materials`) admin o'zgartirgan narx va mahsulotlarni ko'rsatadi; yashirilgan material ro'yxatdan chiqadi |
| #38 | Admin materiallar ro'yxatiga `store_open` qo'shildi; AI uslub tugmasi (`POST /admin/furniture/classify-styles`) navbat tugamaguncha qayta bosilsa **409** (`"AI uslub qo'yish allaqachon ishlayapti, birozdan keyin qayta urinib ko'ring"`), Redis ishlamasa **503** (`"Navbat xizmati ishlamayapti"`) qaytaradi | Faqat admin. Mobil bu endpoint'larni chaqirsa, 409 va 503 `detail` matnini to'g'ridan-to'g'ri ko'rsatsin |
| #39 | AI uslub vazifalari alohida `styles` navbatda, yangi `styles-worker` konteynerida ishlaydi | Faqat server ichki tuzilishi. Push bildirishnomalar endi AI backfill ortida kutib qolmaydi |

- **Mobil AI builder** (`POST /rooms/{id}/ai-build`) ham endi mebel uslubini ko'radi: `list_furniture` har bir mebelning `styles` ini beradi va so'rovda uslub aytilsa ("Hi-Tech uslubida. …"), o'sha uslubdagi mebel ro'yxat boshida, keyin uslubsizi turadi. Mobil 1.0.0+20 uslub tanlovini so'rov boshiga shunday qo'shadi.

### Smeta natijasiga ta'siri (7.2 ga qo'shimcha)
- Admin endi smeta mahsulotlarini (galtel, plintus, suvoq, bo'yoq va boshqalar) paneldan qo'shadi. Masalan, `galtel` kalitli mahsulot qo'shilsa, smetadagi galtel qatori taxminiy 11 000 so'm o'rniga shu mahsulot narxi bilan va `is_approximate: false` bo'lib chiqadi.
- Javob formati o'zgarmagan, mobil Smeta ekrani hech narsani o'zgartirishi shart emas.


---

## 9. 2026-10-25 dagi o'zgarishlar: mobil ilova nima qilishi kerak

PR'lar (hammasi `master`da): [#43](https://github.com/Begzod10/andoza_ai/pull/43), [#44](https://github.com/Begzod10/andoza_ai/pull/44), [#47](https://github.com/Begzod10/andoza_ai/pull/47), [#49](https://github.com/Begzod10/andoza_ai/pull/49), [#51](https://github.com/Begzod10/andoza_ai/pull/51), [#52](https://github.com/Begzod10/andoza_ai/pull/52), [#53](https://github.com/Begzod10/andoza_ai/pull/53), [#55](https://github.com/Begzod10/andoza_ai/pull/55). Eng shoshilinchi **9.1** (domen): eski domen hozircha ishlaydi, lekin mobil'ni ko'chirish kerak.

| # | Mavzu | Majburiymi |
|---|---|---|
| 9.1 | Production domeni `andozaai.uz` | Ha (URL'larni almashtirish) |
| 9.2 | Til: `users.language`, `Accept-Language` | Tavsiya |
| 9.3 | AI dizayn: mebelda `role`, `zone` yo'q | Faqat native render bo'lsa |
| 9.4 | `GET /furniture?has_model=true`, `q`, tartib | Ha (3D va joylashtirish ekranlari) |
| 9.5 | Demo do'konlar (`is_demo`) | Ixtiyoriy, avval backend kerak |
| 9.6 | Oboy smetada rulon bo'yicha | Ma'lumot uchun |

### 9.1 Production domeni: `andozaai.uz`

**Nima o'zgardi.** Sayt va API endi `https://andozaai.uz` da:

| | Yangi | Eski |
|---|---|---|
| Sayt | `https://andozaai.uz` | `https://andoza.jumaniyozov.uz` (sahifalar **301** bilan yangisiga o'tadi) |
| API | `https://andozaai.uz/api/v1` | eski domendagi `/api/` hali **ishlaydi** |
| Media | `https://andozaai.uz/media/` | eski domendagi `/media/` hali **ishlaydi** |

Eski domen API va media uchun saqlab qolingan, shuning uchun store'dagi hozirgi mobil versiya ishlashda davom etadi. Lekin eski domenni keyinroq o'chirish mumkin, shuning uchun yangi reliz yangi domenga o'tishi shart. Backend `glb_url`, `thumbnail_url`, `image_url` ni so'rov kelgan domen bo'yicha to'liq URL qilib qaytaradi, ya'ni yangi domenga kirgan klient yangi domendagi media URL oladi.

**Mobil'da nima qilish kerak:**
- **Android:** `.github/workflows/release.yml` ichidagi `--dart-define` qiymatlarini (API va studio URL'lari) `https://andozaai.uz/api/v1` va `https://andozaai.uz` ga almashtiring.
- **iOS:** GitHub secrets `API_URL_PROD`, `API_BASE_URL_PROD`, `STUDIO_BASE_URL_PROD` ni yangilang (qarang: [docs/WEB_PROD_DEPLOY.md](WEB_PROD_DEPLOY.md), 5-bo'lim, 4-band; iOS build qo'llanmasi mobil repo'dagi `docs/mobile/IOS_BUILD.md`).
- **WebView studio va smeta:** `https://andozaai.uz/...?app=1` ga o'ting. Eski domen ochilsa 301 orqali yangisiga o'tadi, lekin to'g'ridan-to'g'ri yangi URL'dan boshlang va `?app=1` redirect'dan keyin ham saqlanishini tekshiring.
- Kodga qotirilgan (hardcoded) `andoza.jumaniyozov.uz` qolmaganini qidiring (`grep -rn jumaniyozov`). Lokal keshdagi eski media URL'lari ishlaydi.
- **Google Sign-In:** web client'ning ruxsat etilgan origin'lariga `andozaai.uz` qo'shildi. Native Google login'ni o'zgartirish shart emas. WebView ichidagi Google login yangi domendan ishlashi kerak.

**Qanday sinash:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://andozaai.uz/api/v1/furniture                 # 200
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://andoza.jumaniyozov.uz/login   # 301 https://andozaai.uz/login
curl -s -o /dev/null -w "%{http_code}\n" https://andoza.jumaniyozov.uz/api/v1/furniture        # 200 (eski API ishlaydi)
```
Ilovada yangi build bilan login, katalog, GLB yuklash va Studio WebView'ni oching. Tarmoq jurnalida eski domenga so'rov qolmasligi kerak.

> Eslatma: Cloudflare proksisi hozircha o'chirilgan (DNS only), chunki hosting provayderi tomonida muammo bor ([docs/ops/2026-10-25-cloudflare-525-hosting.md](ops/2026-10-25-cloudflare-525-hosting.md)). Mobil'ga ta'siri yo'q: domen to'g'ridan-to'g'ri serverga ochiladi.

### 9.2 Til tanlash (#43, #44)

**Nima o'zgardi.** Web'da O'zbekcha / Русский / English tanlovi paydo bo'ldi. Tanlov akkauntda saqlanadi, server xatolarining `detail` matni so'rovdagi tilga tarjima qilinadi. Migration `1786000040`.

**Endpoint va maydonlar:**
- `users.language`: `"uz" | "ru" | "en"`, standart `"uz"`. `GET /api/v1/auth/me` javobida (`UserOut.language`) keladi.
- `PATCH /api/v1/auth/me`, tana `{"language": "ru"}` (majburiy, uchta qiymatdan biri, aks holda 422). Javob: yangilangan `UserOut`.
- `POST /api/v1/auth/register` va `POST /api/v1/auth/google` tanasiga ixtiyoriy `language` qo'shildi. Ro'yxatdan o'tishda yangi akkaunt shu tilni oladi. Google login'da `language` **faqat yangi akkaunt** uchun ishlaydi, mavjud akkaunt o'z tilini saqlaydi.
- **`Accept-Language` sarlavhasi:** server `detail` matnini `uz`, `ru`, `en` dan (q-qiymati bo'yicha eng yaxshisiga) tarjima qiladi. Sarlavha bo'lmasa yoki boshqa til bo'lsa, **o'zbekcha** qoladi, ya'ni hozirgi xatti-harakat o'zgarmagan.
- **Tarjima qilinmaydi:** AI chiqishi, katalog ma'lumotlari (mebel, material, do'kon nomlari), push va SMS.

**Mobil'da nima qilish kerak:**
1. Har bir so'rovga ilova interfeysi tiliga mos `Accept-Language: uz|ru|en` qo'shing (Dio interceptor).
2. Foydalanuvchi ilovada tilni almashtirganda `PATCH /auth/me {"language": ...}` chaqiring va javobni lokal profilga yozing. Oflayn bo'lsa tanlovni saqlab turing va keyingi `/auth/me` tekshiruvida qayta yuboring (web shunday qiladi).
3. Ro'yxatdan o'tish va Google login so'rovida joriy ilova tilini `language` sifatida yuboring.
4. Kirgandan keyin `me.language` ilova tilidan farq qilsa, web'dagidek akkaunt tili ustun bo'lsin.
5. Ilovaning o'z matnlari bu PR'larga kirmagan: tarjimani mobil jamoa qiladi. Atamalar: [docs/i18n-glossary.md](i18n-glossary.md).

**Qanday sinash:** noto'g'ri parol bilan `POST /auth/login` ni `Accept-Language: ru` bilan yuboring: `detail` ruscha bo'lishi kerak, sarlavhasiz so'rovda o'zbekcha. Akkaunt bilan `PATCH /auth/me {"language":"en"}`, keyin `GET /auth/me` da `language: "en"`. `{"language":"de"}` → 422.

### 9.3 AI dizayn: mebelda `role`, `zone` yo'q (#47)

**Nima o'zgardi.** AI dizayn rejasidagi (`POST /rooms/{id}/ai-design`, `/ai-design/image`, `/ai-design/pin`) har bir mebel elementida endi `role` bor va `zone` **yo'q**. Joylashtirish (guruhlar: mehmonxona, ovqatlanish, uxlash, ish, saqlash) endi **klient tomonida** hisoblanadi (web: `frontend/src/lib/furnitureGroups.ts`, `furnitureLayout.ts`, `walkway.ts`). Server koordinata yoki zona bermaydi.

**Maydon:** `furniture[]` elementi `{"id", "name", "role"}`. `role` 14 qiymatdan biri: `sofa, armchair, coffee_table, tv_unit, dining_table, dining_chair, bed, nightstand, desk, desk_chair, wardrobe, shelf, decor, rug`. AI noto'g'ri yoki bo'sh `role` bersa, server uni nomi va kategoriyasidan o'zi to'ldiradi, ya'ni maydon har doim bor.

**Mobil'da nima qilish kerak:**
- AI dizayn natijasini native chizsangiz, **`zone`ga tayanmang** (u endi kelmaydi). Joylashtirishni `role` bo'yicha o'zingiz hisoblang yoki WebView Studio'dan foydalaning (u o'zi hisoblaydi).
- Noma'lum `role` qiymatiga chidamli bo'ling (kelajakda qo'shilishi mumkin): uni `decor` kabi ko'rsating.
- Studio WebView'da qo'shimcha ish kerak emas.

**Qanday sinash:** `POST /rooms/{id}/ai-design` javobida `furniture[*].role` bor va `zone` kaliti yo'qligini tekshiring. Studio'da AI dizayn qo'llang: divan devorga suyangan, stol atrofida stullar, eshikdan o'tish yo'li ochiq, joy yetmaganlar uchun "Joy yetmadi: … qo'yilmadi." xabari chiqadi.

### 9.4 Katalog: `has_model`, `q`, barqaror tartib

**Nima o'zgardi.** `GET /api/v1/furniture`:
- **`has_model=true`** (standart `false`): faqat 3D modeli (GLB) bor mebelni qaytaradi. Parametrsiz so'rov hammasini, jumladan GLB'siz demo-do'kon mahsulotlarini (faqat foto) qaytaradi.
- **`q`** (≤ 100 belgi): `name_uz` bo'yicha qism qidiruv, server tomonida. `GET /api/v1/materials` ham `q` ni qo'llaydi.
- **Barqaror tartib:** `/furniture` yangisi birinchi (`created_at DESC, id`), sahifalar bir-biriga tushmaydi va qator tashlab ketilmaydi. `/materials` ham barqaror tartibda.
- Boshqa parametrlar o'zgarmagan: `category`, `room_type`, `page`, `per_page` (≤ 100). Javob `{items, total, page, per_page}`.

**Mobil'da nima qilish kerak:**
- **3D sahna, joylashtirish va uslub tanlovi ekranlari** (studio mebel ro'yxati): har doim `?has_model=true` yuboring. Aks holda GLB'siz mahsulot ro'yxatda chiqib, joylashtirishda `glb_url == null` bilan yiqiladi.
- **Do'kon ekrani:** `has_model` yubormang, fotoli mahsulotlar ham ko'rinsin. `glb_url == null` bo'lsa "Joylashtirish" tugmasini yashiring.
- Qidiruvni serverga ulang (`q`) va `page` bo'yicha cheksiz ro'yxat qiling (`total` gacha). "Birinchi sahifani olib lokal filtrlash" endi to'liq katalogni ko'rsatmaydi.
- `FurnitureOut.glb_url` `string | null`: har doim mavjud deb hisoblamang.

**Qanday sinash:**
```bash
curl -s 'https://andozaai.uz/api/v1/furniture?has_model=true&per_page=100' | jq '[.items[]|select(.glb_url==null)]|length'   # 0
curl -s 'https://andozaai.uz/api/v1/furniture?per_page=1' | jq '.total'    # has_model=true dagidan katta (demo mahsulotlar)
curl -s 'https://andozaai.uz/api/v1/furniture?q=divan' | jq '.items[].name_uz'
```
1-sahifa va 2-sahifa `id` lari kesishmasligini tekshiring.

### 9.5 Demo do'konlar (`is_demo`) (#51, #52, #53)

**Nima o'zgardi.** Taqdimot uchun Toshkentdagi haqiqiy do'konlar mahsulotlari bazaga qo'shildi (boshida 9 do'kon, 187 rasm: mebel va lampalar, MAFF materiallari, "Модные Стены" oboylari; keyin deraza va gilamlar). Ular bilan hali **shartnoma yo'q**. Har bir shunday do'konda `stores.is_demo = true` (migration `1786000041`). Admin ro'yxatida "Namuna" belgisi bor. Demo ma'lumotlar bitta buyruq bilan o'chiriladi (`python -m app.seed_demo_stores --remove`), shuning uchun ularni doimiy deb hisoblamang.

**Muhim: `is_demo` ommaviy API'da YO'Q.** Kodda tekshirildi:
- `is_demo` faqat **admin** javobida bor: `GET /api/v1/admin/stores`, `is_demo: bool` (`backend/app/schemas/admin_catalog.py`).
- Mobil ishlatadigan ommaviy javoblarda bu maydon **yo'q**: `GET /api/v1/furniture` (`FurnitureOut`: `store_id`, `store_name`, ...), `GET /api/v1/stores` (`StoreOut`: `id, name, district, phone, telegram, logo_color, partner_tier`), `GET /api/v1/materials`.

Ya'ni oddiy foydalanuvchi ilovasi "Namuna" belgisini hozircha `is_demo`dan **ola olmaydi**. Variantlar:
1. **Backend'ga maydon qo'shish** (tavsiya, kichik ish): `StoreOut` ga `is_demo: bool = False` va `FurnitureOut` ga `store_is_demo: bool = False` (keshlar ham yangilanadi). Shu o'zgarish kirguncha mobil'da belgi ko'rsatmang.
2. Belgi shart bo'lmasa, hech narsa qilmang: demo mahsulotlar oddiy mahsulot kabi ko'rinadi.

Maydon qo'shilgach mobil'da: `is_demo == true` bo'lsa do'kon kartasi va mahsulot sahifasida kichik "Namuna" belgisini ko'rsating.

**Mobil'ga hozirgi ta'siri:**
- Katalogda GLB'siz mahsulotlar ko'p: 9.4 ga qarang.
- Rasmlar `thumbnail_url` (mebel) va `image_url` (material) da, to'liq URL.
- Demo do'konlardan buyurtma haqiqiy savdo emas: taqdimotda buyurtmani oxirigacha bajarmang.

**Qanday sinash:** `curl https://andozaai.uz/api/v1/stores | jq '.[].name'` da demo do'konlar (Dafna, ARCA Mebel, Ergo, MAFF va boshqalar) chiqishi kerak. Admin bilan `GET /admin/stores` da `is_demo: true`.

### 9.6 Oboy smetada rulon bo'yicha (#51)

**Nima o'zgardi.** `POST /rooms/{id}/estimate/preview` va `/estimate`: studio kutubxonasidan tanlangan va rulon eni, uzunligi hamda narxi ma'lum bo'lgan oboy endi **rulon bo'yicha** hisoblanadi (rulon narxi, kerakli rulon soni). Javob formati o'zgarmagan. Rulon o'lchami yoki narxi noma'lum oboy avvalgidek hisoblanadi (7.2).

**Mobil'da nima qilish kerak:** native Smeta ekrani oboy qatorida birlikni qat'iy "m²" deb yozmasin, javobdagi birlik va miqdor maydonlarini ko'rsatsin. WebView Smeta'da o'zgarish o'zi o'tadi.

**Qanday sinash:** xonaga kutubxonadan "Модные Стены" oboyini qo'ying va smetani oching: oboy qatori rulon soni va rulon narxi bilan chiqishi kerak.

### Mobil'da qilinadigan ishlar (qisqa ro'yxat)
1. **Domen:** Android/iOS prod URL'lari va WebView'ni `andozaai.uz` ga o'tkazish (9.1).
2. **Katalog:** studio ekranlarida `?has_model=true`, do'kon ekranida `glb_url == null` ga chidamlilik, `q` qidiruvi (9.4).
3. **Til:** `Accept-Language`, `PATCH /auth/me`, register va Google'da `language` (9.2).
4. **AI dizayn:** native render bo'lsa `zone`dan voz kechib, `role`dan foydalaning (9.3).
5. **Namuna belgisi:** avval backend'ga `is_demo` maydonini qo'shdiring (9.5).

---

## 10. 2026-10-28: Bundle ID va shift mahsulotlari

| # | Mavzu | Majburiymi |
|---|---|---|
| 10.1 | Bundle ID tanlash | Ha, App Store Connect'da ilova yaratishdan **oldin** |
| 10.2 | Shift mahsulotlari do'kondan (#84) | Faqat native studio bo'lsa |

### 10.1 Bundle ID

Bu repoda ikki xil eski ("uytamir") identifikator bor:

| Fayl | Qiymat |
|---|---|
| `capacitor.config.ts` | `appId: 'uz.uytamir.app'` |
| `app.json` | `bundleIdentifier: "com.uytamir.mobile"` |

Flutter loyihasidagi `PRODUCT_BUNDLE_IDENTIFIER` ni ham tekshiring. Bundle ID App Store Connect'da ilova yaratilgach **o'zgartirib bo'lmaydi**. Shuning uchun brend nomiga mos bittasini tanlang (masalan `uz.andozaai.app`), hamma joyda bir xil qiling, keyin App ID yarating.

### 10.2 Shift mahsulotlari do'kondan (#84)

**Nima o'zgardi.**
- Studio'dagi "Shift" bo'limida gipsokarton, karkas profili va LED lentani do'kondan tanlash mumkin. "Galtel" bo'limida galtelni ham.
- Tanlov `room.surfaces["smeta:<smeta_key>"] = <material_id>` ko'rinishida saqlanadi. Kalitlar: `smeta:gipsokarton`, `smeta:profil`, `smeta:led_lenta`, `smeta:galtel`.
- Bo'sh qiymat (`""`) tanlov yo'q degani.
- Smeta shu qatorni tanlangan mahsulot narxi bilan hisoblaydi va `is_approximate: false` qiladi. Miqdor bo'yicha izoh (`warning`) qoladi.
- `GET /api/v1/materials?smeta_key=gipsokarton`: yangi filtr, shu smeta qatoriga narx beradigan mahsulotlarni qaytaradi.

**Mobil'da nima qilish kerak:**
- WebView Studio va Smeta'da o'zgarish o'zi o'tadi.
- Native studio bo'lsa, `surfaces` ni PATCH qilayotganda `smeta:*` kalitlarini **o'chirib yubormang**. Butun obyektni qayta yozganda serverdagi qiymatlarni saqlang.
- `smeta:*` kalitlarini devor deb o'qimang. Ular devor bo'yog'i yoki oboy emas.

**Qanday sinash:** osma shiftli xonada Studio → Bo'yoq/Oboi → Shift → "Do'kondan tanlang" ro'yxatidan gipsokarton tanlang. Smetada "Shift: <mahsulot nomi>" qatori "taxminiy" belgisisiz chiqishi kerak.

---

## 11. 2026-10-27: Apple orqali kirish va kontentga shikoyat (App Store talablari)

App Store ko'rigi uchun ikkita backend funksiyasi: **4.8** (Google bilan kirish bor ekan, "Sign in with Apple" ham bo'lishi kerak) va **1.2** (foydalanuvchilar e'lon qilgan kontentga shikoyat qilish imkoniyati).

| # | Mavzu | Majburiymi |
|---|---|---|
| 11.1 | `POST /api/v1/auth/apple` | Ha, iOS'da (Google tugmasi yonida) |
| 11.2 | `POST /api/v1/reports`, admin navbati | Ha (usta, portfolio, mahsulot, do'kon, oboy sahifalarida) |

Migration'lar: `1786000044` (`users.apple_sub`, unique indeks) va `1786000045` (`content_reports` jadvali).

### 11.1 Apple orqali kirish

**So'rov:** `POST /api/v1/auth/apple`

```json
{"identity_token": "<Apple identityToken, JWT>", "name": "Ali Valiyev", "language": "uz"}
```

- `identity_token`: majburiy, 1..8192 belgi.
- `name`: ixtiyoriy, ≤100 belgi. Apple ismni **faqat birinchi avtorizatsiyada** beradi (tokenda ism yo'q), shuning uchun ilova `givenName` + `familyName` ni shu yerga qo'shib yuboradi. Faqat yangi akkaunt yaratilganda yoziladi, keyingi kirishlarda e'tiborsiz qoldiriladi.
- `language`: ixtiyoriy, `uz|ru|en`, faqat yangi akkaunt uchun (Google'dagi kabi).

**Javob:** `200`, `/auth/google` bilan **aynan bir xil** `LoginResponse` (`user`, `access_token`, `refresh_token`, `token_type`). Tokenlar body'da faqat `X-Client-Type: mobile` bo'lsa keladi.

**Qoidalar:**
- Token imzosi Apple kalitlari (`https://appleid.apple.com/auth/keys`, 24 soat keshlanadi) bilan RS256 bo'yicha tekshiriladi; `iss == https://appleid.apple.com`, `aud` `APPLE_CLIENT_IDS` ro'yxatida, muddati o'tmagan.
- Foydalanuvchi `sub` bo'yicha topiladi (`users.apple_sub`). Email bo'yicha boshqa akkauntga **hech qachon** bog'lanmaydi. Email (ko'pincha `@privaterelay.appleid.com`) faqat ko'rsatish uchun saqlanadi.
- Apple akkauntida parol yo'q: `POST /auth/delete-account` parol so'ramaydi (Google akkaunti kabi).

**Xatolar:** `401` "Apple orqali kirib bo'lmadi. Qayta urinib ko'ring." (token yaroqsiz, `aud`/`iss` noto'g'ri, akkaunt o'chirilgan); `503` "Apple bilan bog'lanib bo'lmadi..." (Apple kalitlari olinmadi) yoki "Apple orqali kirish hozircha mavjud emas." (`APPLE_CLIENT_IDS` bo'sh); `429` IP bo'yicha 15 daqiqada 20 urinishdan keyin; `422` noto'g'ri tana.

**Sozlama:** `APPLE_CLIENT_IDS` (vergul bilan). Standart qiymat iOS bundle id `uz.andozaai.app` (eski `com.tamiruy.tamirUyMobileFlutter` hech qachon chiqarilmagan).

### 11.2 Kontentga shikoyat

**So'rov (kirgan foydalanuvchi):** `POST /api/v1/reports`

```json
{"target_type": "usta", "target_id": "<id>", "reason": "spam", "details": "ixtiyoriy izoh"}
```

- `target_type`: `usta | product | seller | portfolio_item | wallpaper`.
- `target_id`: 1..64 belgi, ekrandagi obyekt id'si (backend uning mavjudligini tekshirmaydi).
- `reason`: `spam | inappropriate | fraud | other`.
- `details`: ixtiyoriy, ≤1000 belgi.

**Javob:** `201 {"id": "<uuid>", "status": "open"}`. Bir foydalanuvchi bitta obyektga ikkinchi marta shikoyat qilsa ham `201` va **o'sha** shikoyat (`id` va joriy `status`) qaytadi, yangisi yaratilmaydi, 409 bo'lmaydi.

**Xatolar:** `401` kirmagan; `422` noma'lum `target_type`/`reason` yoki uzunlik; `429` bir soatda 20 tadan ko'p shikoyat.

**Admin:**
- `GET /api/v1/admin/reports?status=open` (`status` ixtiyoriy: `open|resolved|dismissed`, bo'lmasa hammasi; `limit` 1..500, standart 200), yangilari birinchi. Har bir element: `id`, `reporter_id`, `target_type`, `target_id`, `reason`, `details`, `status`, `created_at`, `resolved_at`.
- `PATCH /api/v1/admin/reports/{id}` tana `{"status": "resolved" | "dismissed"}`, javob yangilangan element (`resolved_at` to'ldiriladi). Topilmasa `404`.
- Admin bo'lmagan foydalanuvchi: `403`. Kontentni yashirish hozircha qo'lda (`/admin/moderation` va boshqa admin bo'limlari orqali).

**Mobil'da nima qilish kerak:** usta profili, portfolio elementi, mahsulot, do'kon va oboy sahifalarida "Shikoyat qilish" tugmasi: sabab tanlovi va ixtiyoriy izoh, yuborilgach "Shikoyatingiz qabul qilindi" xabari. Kirmagan foydalanuvchini avval kirishga yo'naltiring.

## 12. 2026-10-28: Do'konning ochiq sahifasi va mebelni xonaga qo'yish

Xaridor do'konning o'z sahifasini (ma'lumot, kontaktlar, mahsulotlari) ko'radi va do'kon mebelini bitta tugma bilan o'z xonasiga qo'yadi. Migration yo'q.

| # | Mavzu | Majburiymi |
|---|---|---|
| 12.1 | `GET /api/v1/stores/{id}` | Ha (do'kon sahifasi) |
| 12.2 | `GET /api/v1/furniture?store={id}`, `GET /api/v1/furniture/{id}` | Ha (do'kon mebeli, mebel sahifasi) |
| 12.3 | Studio `?place=<furniture id>` | Ha ("Xonamga qo'yish") |

### 12.1 Bitta do'kon

`GET /api/v1/stores/{id}`, login shart emas. Javob `/stores` ro'yxatidagi element bilan bir xil: `id`, `name`, `district`, `phone`, `telegram`, `logo_color`, `partner_tier`. Do'kon yopiq bo'lsa (`is_active=false`, ya'ni kutilayotgan, rad etilgan yoki o'chirilgan), `404` "Do'kon topilmadi" qaytadi. Noto'g'ri UUID bo'lsa `422`.

### 12.2 Do'kon mebeli va bitta mebel

- `GET /api/v1/furniture?store={id}`: faqat shu do'konning tirik mebeli. Boshqa filtrlar (`category`, `q`, `has_model`, sahifalash) avvalgidek ishlaydi. Kesh kaliti `store` bo'yicha ham farqlanadi.
- `GET /api/v1/furniture/{id}`: bitta tirik mebel, `/furniture` ro'yxatidagi `FurnitureOut` bilan bir xil. Mebel o'chirilgan yoki do'koni yopilgan bo'lsa `404` "Mahsulot topilmadi".
- `glb_url` null bo'lsa, mahsulotning faqat rasmi bor (masalan demo do'konlar). Uni xonaga qo'yib bo'lmaydi.

### 12.3 Studio: `?place=`

`/studio/{roomId}?place=<furniture id>` ochilganda Studio shu mebelni `GET /furniture/{id}` orqali oladi va xona serverdan yuklangach uni xonaning bo'sh joyiga **bir marta** qo'yadi. Nomi va narxi smeta uchun yoziladi. Keyin parametr URL'dan olib tashlanadi, shuning uchun sahifa yangilansa mebel qayta qo'shilmaydi. Natija toast bilan bildiriladi: "… xonaga qo'yildi". Mebel sotuvda bo'lmasa yoki 3D modeli yo'q bo'lsa, xato toast chiqadi. Saqlash odatdagi avtosaqlash orqali bo'ladi.

## 13. 2026-10-30: WebView tili, `?lang=`

Har qanday veb sahifa (Studio, Smeta, wizard) `?lang=uz|ru|en` bilan ochilsa, o'sha tilda ochiladi. Bu til akkauntdagi tildan ham, telefon tilidan ham ustun turadi. Til "kutilayotgan" deb belgilanadi, shuning uchun sessiya tekshiruvi uni akkauntga saqlaydi (`PATCH /auth/me {language}`) va akkauntning eski tiliga qaytarmaydi. Boshqa qiymat bo'lsa, parametr e'tiborsiz qoladi.

Mobil ilova WebView'ni `?app=1&lang=<ilova tili>` bilan ochadi. Natijada Studio ilova bilan bir tilda bo'ladi va akkaunt tili ilovada tanlangan tilga moslashadi.

## 14. 2026-10-30: Mebel ustaxonasi (`/mebel`) WebView orqali

Web'da mebel ustaxonalari uchun yangi bo'lim ishga tushdi. Usta shkaf o'lchamlarini kiritadi, sayt esa quyidagilarni hisoblaydi:
- detallar ro'yxati va kromka;
- list bo'yicha raskroy;
- teshiklar xaritasi va yig'ish chizmasi;
- smeta;
- AI yordamchi: matndan shkaflar taklifi.

Hisob-kitob to'liq brauzerda TypeScript'da bajariladi (`frontend/src/features/mebel/engine`). **Uni Flutter'da qayta yozmang.** Ilova bu bo'limni Studio kabi WebView'da ochadi. Web'dagi har bir tuzatish shunda ilovaga o'zi o'tadi va hisob-kitob ikki joyda bir-biridan farq qilib qolmaydi.

| # | Ish | Majburiymi |
|---|---|---|
| 14.1 | Kirish nuqtasi va WebView URL | Ha |
| 14.2 | Orqaga tugmasi | Ha |
| 14.3 | PDF (`window.print()`) | Ha |
| 14.4 | CSV yuklab olish | Ha |
| 14.5 | AI va limitlar | Faqat sinash |

### 14.1 Kirish nuqtasi va URL

- **Qayerda:** Profil ekranida "Sotuvchi paneli" ostiga karta qo'ying. Web'dagi matn bilan bir xil bo'lsin: sarlavha **"Mebel ishlab chiqarish"**, izoh *"Ustaxonalar uchun: shkaf detallari, kromka va narx"*. Kalitlar: `profile.mebel` va `profile.mebel_izoh` (`frontend/src/i18n/locales/*.json`). Pastki menyuga qo'shish shart emas: web'da ham telefonda bo'lim faqat Profil orqali ochiladi.
- **URL:** `https://andozaai.uz/mebel?app=1&lang=<ilova tili>`. Login Studio WebView'dagi kabi ishlaydi: sessiya o'sha usulda uzatiladi. Kirmagan foydalanuvchi web'ning login sahifasiga tushadi.
- **`?app=1` bo'lganda web nima qiladi:** web'ning pastki menyusi va chap paneli chizilmaydi, chunki ilovaning o'z AppBar'i bor. `?app=1` belgisi WebView sessiyasi davomida eslab qolinadi (`sessionStorage`), shuning uchun ro'yxat va loyiha sahifalari orasida o'tganda menyu qaytib chiqmaydi. Loyiha sahifasidagi "← Ro'yxatga" havolasi qoladi: u WebView ichidagi o'tish.

### 14.2 Orqaga tugmasi

AppBar'dagi orqaga tugmasi va Android'ning tizim orqaga tugmasi shunday ishlasin:
- WebView'da `canGoBack()` bo'lsa, `goBack()` bajarilsin (loyiha → ro'yxat);
- bo'lmasa, ekran yopilsin.

Loyiha o'zgarishlari avtomatik saqlanadi (taxminan 1 soniyada). Shuning uchun ekranni yopishda "saqlaysizmi?" deb so'rash kerak emas.

### 14.3 PDF: `window.print()`

"PDF" tugmasi `window.print()` ni chaqiradi. Chop etish varag'ida quyidagilar bor:
- detallar ro'yxati;
- raskroy listlari;
- teshiklar xaritasi;
- yig'ish chizmasi.

Flutter WebView `window.print()` ni o'zi bajarmaydi, shuning uchun tugma hech narsa qilmaydi. Variantlar:
- **Android (`webview_flutter`):** JS kanal orqali print chaqiruvini ushlang (masalan, `window.print` ni sahifa yuklangach JS kanalga yo'naltiring). Keyin `WebView` kontentidan `PrintManager` bilan chop eting yoki `printing` paketi bilan PDF yarating.
- **iOS (`WKWebView`):** `UIPrintInteractionController` va `webView.viewPrintFormatter()`.
- **Eng oddiy yo'l:** print chaqiruvi kelganda shu URL'ni tizim brauzerida oching. U yerda chop etish va PDF saqlash ishlaydi.

### 14.4 CSV yuklab olish

"CSV" tugmasi cut list'ni `blob:` URL va `<a download="<loyiha nomi>.csv">` orqali yuklaydi (`frontend/src/features/mebel/export/csv.ts`). WebView'da buni shunday ulang:
1. Yuklab olish so'rovini ushlang: Android'da `DownloadListener` yoki `onDownloadStart`, iOS'da `WKDownloadDelegate`, iOS 14.5 dan oldingi versiyalarda JS kanal.
2. `blob:` URL'ni JS orqali o'qing (`fetch(blobUrl).then(r => r.text())`) va matnni kanal bilan Flutter'ga yuboring. Web `blob:` URL'ni 1 soniyadan keyin bekor qiladi (`revokeObjectURL`), shuning uchun uni darhol o'qing. Ishonchliroq yo'l: sahifa yuklangach `HTMLAnchorElement.prototype.click` ni ushlab, `download` atributli `blob:` havolani bosilish paytida o'qish.
3. Faylni vaqtinchalik papkaga `.csv` qilib yozing va tizimning "Ulashish" oynasini oching (`share_plus`).

Fayl UTF-8 va BOM bilan yoziladi, shuning uchun Excel o'zbek va rus harflarini to'g'ri ochadi.

### 14.5 AI va limitlar (native ish yo'q, faqat sinash)

- Loyiha sahifasidagi "AI bilan qo'shish" maydoni `POST /api/v1/mebel/ai/suggest` ni chaqiradi. Tana: `{"text": "..."}`, 1–1000 belgi.
- Javob: `cabinets`, `facade`, `questions`, `dropped`, `warnings`.
- Limit: bitta foydalanuvchiga kuniga **30** ta so'rov. Limit tugasa `429` "Bugungi AI limiti tugadi" qaytadi, web uni qizil matnda ko'rsatadi.
- Klaviatura matn maydonini to'sib qo'ymasligini tekshiring: WebView `resizeToAvoidBottomInset` yoki shunga o'xshash sozlama bilan ochilsin.

### API (ma'lumot uchun, native ekran kerak emas)

Hamma endpoint login talab qiladi. Har foydalanuvchi faqat o'z ma'lumotini ko'radi:
- `GET/POST /api/v1/mebel/projects`
- `GET/PUT/DELETE /api/v1/mebel/projects/{id}`
- `GET/PUT /api/v1/mebel/price-book`
- `POST /api/v1/mebel/ai/suggest`

### Qanday sinash

1. Profil → "Mebel ishlab chiqarish". Sahifa ilova tilida ochilishi va pastida web menyusi bo'lmasligi kerak.
2. "Yangi loyiha" → shkaf qo'shing → detallar, raskroy va teshiklar varaqlari hisoblanadi.
3. Loyihadan orqaga qayting: ro'yxatga tushadi. Yana bir marta orqaga: ekran yopiladi. Qayta ochganda o'zgarishlar saqlangan bo'ladi.
4. "PDF" tugmasi chop etish yoki PDF oynasini ochadi. "CSV" tugmasi "Ulashish" oynasini ochadi va fayl Excel yoki Google Sheets'da to'g'ri ko'rinadi.
5. AI maydoniga quyidagini yozing: *"60 lik 3 ta osma shkaf, 2 eshikli"*. Taklif chiqadi, "Qo'shish" bosilganda loyihaga 3 ta devor shkafi qo'shiladi.
6. Telefonni yotqizib qo'ying: raskroy va chizmalar kengroq ko'rinishi kerak (ekran burilishi bloklanmasin).
