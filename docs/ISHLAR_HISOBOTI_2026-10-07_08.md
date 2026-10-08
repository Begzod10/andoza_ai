# Ishlar hisoboti: 7–8 oktabr 2026

Kecha (7-oktabr) va bugun (8-oktabr) bajarilgan hamma ishlar. Har bir ish `git log`dagi commitga bog'langan. Hamma commit `master`ga push qilingan va GitHub Actions orqali serverga avtomatik deploy qilingan (barcha `Deploy to server` runlari success).

Bu hujjatga maxfiy qiymatlar (API kalitlari, parollar) yozilmagan.

## Qisqacha

| Yo'nalish | Natija |
|---|---|
| 3D studio | 4 ta bo'lim tuzatildi, 360° renderdagi vertikal chiziq yo'qotildi |
| AI dizayner | Yangi: prompt yoki tayyor uslub bilan xonaga mebel va lustra joylash |
| Platforma dizayni | Yagona tema tizimi (kun/tun) va hamma asosiy sahifa yangilandi |
| Do'kon | Tafsilot, savat, to'lov, buyurtma kuzatuvi: haqiqiy `/orders` API bilan |
| Sotuvchi | Buyurtmalarni ko'rish va holatini bosqichma-bosqich o'zgartirish |
| Xavfsizlik | Buyurtma narxi faqat serverdagi katalogdan olinadi |
| Production | 3 ta eski sinov buyurtmasi zaxiralanib o'chirildi, 3 ta migratsiya qo'llandi |

Testlar oxirgi holatda: backend **773 ta o'tdi**; frontend **1024 ta o'tdi, 1 tasi yiqiladi** (quyida "Ochiq masalalar").

---

## 7-oktabr (kecha)

### 3D studio: sinash va tuzatish (`aa0faada`)
Studioning bo'limlari baholandi va to'rtta kamchilik tuzatildi:
- **Montaj** bo'limi bo'sh edi: endi qo'yilgan elektr nuqtalari (turi, devor, balandlik) ro'yxati va o'chirish tugmasi bor.
- Standart 3D ko'rinish endi butun xonani ko'rsatuvchi burchak ko'rinishi. Xona o'lchami o'zgarganda yassi "orqa devor" ko'rinishiga sakramaydi, tor ekranda kamera orqaga tortiladi.
- Shpaklovka paneli "Suvoq" deb nomlangan edi, endi to'g'ri nomlanadi va ikkisining farqi matnda aytilgan.
- Pol hech qaysi turi tanlanmaguncha hech narsani belgilamaydi va buni aytadi.

### 360° renderdagi vertikal chiziq (`19efd6ab`)
Render xizmati panoramaning chap va o'ng chekkasi tutashishini bilmaydi, shuning uchun chekkalarda ton farqi (30–38 daraja) qolib, xona o'rtasida chiziq ko'rinardi.
- `backend/app/services/pano_seam.py`: tutashuv joyidagi farq ikki tomonga taqsimlanadi va qolgani yengil xiralanadi.
- Render, relight va 4K nusxa saqlanishidan oldin qo'llanadi. 2:1 bo'lmagan, allaqachon silliq yoki o'qib bo'lmaydigan rasmlar o'zgarishsiz qaytadi.
- **Eski, avval saqlangan renderlar qayta ishlanmagan**, tuzatish faqat yangilariga ta'sir qiladi.

### AI dizayner (`0392dec0`, `ea3ca832`, `b9451729`, `4c143675`)
Foydalanuvchi o'z xonasini dizayn qilayotganda prompt yozadi, AI esa mebel va lustralarni tanlab joylaydi.
- **Backend:** `POST /rooms/{id}/ai-design` (`routers/ai.py`), `services/ai_designer.py`. Bitta LLM chaqiruvi JSON reja qaytaradi, u qat'iy menyularga qarshi tekshiriladi (AI menyudan tashqari narsa tanlay olmaydi).
- **Frontend:** `AiBuilderSheet`, `lib/aiDesign.ts`, `aiDesignLayout.ts`, `aiDesignPresets.ts`.
- **Tayyor uslublar** AIsiz ham ishlaydi (`ea3ca832`).
- **Joylashuv xatosi tuzatildi** (`4c143675`): avval zonalar faqat A–D devor harflariga bog'langan edi, haqiqiy skanerlangan xonalarda (devorlari "0".."3", diagonal devorlar) mebel noto'g'ri joylashardi. Endi zonalar xonaning o'z devor ID'laridan olinadi, joylashtirish yo'nalgan to'rtburchaklar (SAT to'qnashuv tekshiruvi) va ichkariga qaragan burilish bilan ishlaydi.
- **LLM provayderi** (`b9451729`): bo'sh `OPENAI_BASE_URL=` muhit o'zgaruvchisi SDK'ni buzardi, endi asosiy URL aniq beriladi. Gemini faqat model nomi `gemini`dan boshlansa va faqat `GEMINI_API_KEY` bo'lsa tanlanadi.
- **Sozlama (git'dan tashqarida):** lokal va serverdagi `backend/.env`ga OpenAI kaliti qo'yildi, modellar `AI_MODEL_BUILDER=gpt-4.1-mini`, `AI_MODEL_EXPLAINER=gpt-4o-mini`. Serverdagi eski fayl `.env.bak-20261007` sifatida saqlandi, `api` konteyneri qayta yaratildi, jonli chaqiruv tekshirildi. Kalit chatda ko'rsatilgani uchun uni almashtirish tavsiya qilinadi.

### Loyihalar sahifasi: kompyuter uchun bento ko'rinish (`0392dec0`)
Katta "hero" kartasi, loyihalar ro'yxati, "Umumiy ko'rinish" kartasi, Do'kon va Ustalar havola kartalari. Telefon ko'rinishi o'zgarmagan. Yuklanmagan ro'yxat uchun "0 loyiha" deb yolg'on aytilmaydi.

### Boshqa sessiyada qilingan commitlar (shu davrda)
Bular boshqa ish sessiyasidan, shu hisobotda tafsiloti yo'q: `7e9989d0` (quyosh 1.0), `7025e988` (4 ta qo'zg'almas kamera, ko'z balandligi 1350 mm), `e3c99589` (kameralar bitta tugma ortida), `2da51d79` (o'chirish tugmasi qayta ishlaydi) va ularning merge'lari.

---

## 8-oktabr (bugun)

### 1. Yagona dizayn tizimi (`6f8005dc`)
Avval kartalar oq, fon esa to'q indigo bo'lib, tunda mos kelmasdi, tugmalar oddiy edi.
- **Tema tokenlari** (`styles/global.css`, `tailwind.config.ts`): `card`, `card-soft`, `ink`, `ink-muted`, `line`, `accent`, soyalar `panel`, `glow`, `glow-orange`. Kun va tun uchun alohida qiymat. Tun foni `#1d1a2e`.
- **`ui/Button`:** pill shakl; `primary` (ko'k gradient + nur), `accent` (to'q sariq), `soft`, `secondary`, `tertiary`, `danger`.
- **`ui/Panel`:** `Panel`, `Tile`, `IconBubble` (ikonka belgisi).
- **Chap panel** ingichka (68 px), faol bo'lim gradient bilan, yangi loyiha uchun to'q sariq "+" tugmasi.
- Studio va dialog oynalari (oq) ataylab o'zgartirilmagan.

### 2. Sahifalar (har biri alohida commit va deploy)
| Sahifa | Commit | O'zgarish |
|---|---|---|
| Ustalar, Profil, Smeta, Do'kon bosh sahifasi | `6f8005dc` | Panel/Tile/Button, Smeta tokenlarga o'tdi; Do'kon bosh sahifasi haqiqiy katalogdan (`ShopHome`) |
| Wizard | `3a82af3e` | Kompyuterda ikki ustun (xona ko'rinishi yopishqoq), gradient progress, tun rejimini o'zi qo'llaydi |
| Login / Ro'yxatdan o'tish | `53287e00` | Shisha karta, tema maydonlari, tunda fon rasmi ustida qoplama |
| Sotuvchi paneli | `74af8d23` | Panel kartalar, tema holat nishonlari, `Input`ga `themed` parametri |
| Ulashilgan xona (Share) | `feee86c6` | To'liq ekran 3D, suzuvchi shisha sarlavha va imzo |
| Skan sahifalari (LiDAR, chizish, 360) | `89bdba4e` | Tungi indigo fon, umumiy `Button`, shisha yopish tugmalari |
| Landing | — | Allaqachon yangi edi, tegilmadi |

### 3. Do'kon ekranlari (`ec6250a4`)
Avval "tez orada ishga tushadi" yozuvli bo'sh sahifalar edi. Endi: mahsulot tafsiloti, savat, to'lov, buyurtma holati, dilerlarni taqqoslash, loyiha materiallari.
`DokonPage`dagi xatolar tuzatildi: har mahsulotga uydirma tafsilot ("Hajm 10 litr, ISO 9001") chiqarardi; buyurtmadan keyin tarkib bo'sh chiqardi (savat avval tozalanardi); mebelda `unit` yo'q edi.

### 4. Haqiqiy buyurtmalar (`158d05a0`)
`/orders` API'ga ulandi. Migratsiya **`1786000021`**: `orders.delivery_address`, `phone`, `payment_method` (hammasi nullable, `payment_method` faqat `cash`/`card`).
- Savat do'konlar bo'yicha guruhlanadi, har do'kon uchun alohida buyurtma ketadi.
- Xatoda savat saqlanadi; qisman o'tsa, o'tgani savatdan chiqadi, qolgani qoladi.
- Soxta kuryer, soxta yetkazish sanasi va koddan yozilgan yetkazish narxlari olib tashlandi; narxsiz mahsulotni savatga qo'shib bo'lmaydi.
- Buyurtma holati serverdan keladi va 30 soniyada yangilanadi.

### 5. Narx xavfsizligi (`e89e24bd`, `33bb4b63`)
Avval mebel qatorlarida server mijoz yuborgan narxni qabul qilardi ("divan 1 so'm" deb buyurtma berish mumkin edi).
- Migratsiya **`1786000022`**: `order_lines.furniture_id` (nullable, FK siz, `material_id` kabi).
- Mebel narxi katalogdan olinadi; faqat faol va tasdiqlangan mebel; narxsiz mebel rad etiladi.
- Hech bir katalog elementiga bog'lanmagan (erkin matnli) qator butunlay rad etiladi (400). Natija: buyurtmadagi har bir narx serverdan keladi.

### 6. Sotuvchi buyurtmalarni boshqaradi (`33a72118`)
Migratsiya **`1786000023`**: `orders.store_id` (nullable FK, `ON DELETE SET NULL`, indeks).
- `store_id`ni server buyurtmadagi mahsulotlardan o'zi aniqlaydi; bitta buyurtmada bitta do'kon (aks holda 400).
- `GET /seller/orders`: do'konning o'z buyurtmalari (manzil, telefon, to'lov usuli bilan, xaridorning hisob ID'siz).
- `PATCH /seller/orders/{id}/status`: faqat keyingi bosqichga: Qabul qilindi → Yig'ilmoqda → Yo'lda → Yetkazildi. Sakrash va orqaga qaytish 409. Takroriy bosish zararsiz. Qator qulflanadi (`FOR UPDATE`), ikki qurilmadan bir vaqtda bosilsa ham bosqich o'tib ketmaydi. Boshqa do'konning buyurtmasi 404.
- Frontend: Seller sahifasida "Buyurtmalar" bo'limi (bosqich nishoni, qo'ng'iroq tugmasi, keyingi qadam tugmasi, 30 soniyada yangilanish). Holat nomlari `lib/orderStatus.ts`da umumiy.

### 7. Production ma'lumotlari bilan ishlar
- Serverda `alembic current` har deploydan keyin tekshirildi: `1786000021`, `1786000022`, `1786000023 (head)`. Barcha 7 konteyner ishlab turibdi.
- Productionda 3 ta buyurtma bor edi (19-avgust, test oqimidan qolgan, hammasi "Qabul qilindi", `store_id` yo'q). Ular `/root/backups/orders-old-3-20261008-143228.json`ga zaxiralanib (xaridor manzil va telefonlari bilan), aniq shart bilan o'chirildi. Hozir `orders` va `order_lines` bo'sh.
- Productionda hech bir foydalanuvchi do'kon egasi emas, ya'ni sotuvchi hisobi hali yo'q.

---

## Migratsiyalar

| Revision | Nima qiladi | Qaytarish |
|---|---|---|
| `1786000021` | `orders`: `delivery_address`, `phone`, `payment_method` + `ck_orders_payment_method` | `downgrade` bor |
| `1786000022` | `order_lines.furniture_id` | `downgrade` bor |
| `1786000023` | `orders.store_id` + indeks `ix_orders_store_id` | `downgrade` bor |

Uchalasi ham nullable ustun qo'shadi, mavjud ma'lumotga tegmaydi. Lokal bazada yuqoriga, pastga va yana yuqoriga sinab ko'rilgan. `docker-compose.prod.yml` API ishga tushganda `alembic upgrade head`ni o'zi bajaradi.

## Yangi API yo'llari

| Yo'l | Maqsad |
|---|---|
| `POST /rooms/{id}/ai-design` | AI dizayner rejasi |
| `POST /orders` (o'zgargan) | Yetkazish ma'lumotlari, `furniture_id`, `store_id`, narx serverdan |
| `GET /seller/orders` | Do'konning buyurtmalari |
| `PATCH /seller/orders/{id}/status` | Buyurtmani keyingi bosqichga o'tkazish |

## Testlar

- **Backend: 773 o'tdi.** Yangi: `tests/test_seller_orders.py`, `test_orders.py` kengaytirildi (yetkazish ma'lumotlari, mebel narxi, bitta do'kon qoidasi, erkin qatorni rad etish).
- **Frontend: 1024 o'tdi, 1 yiqildi.** Yangi: `components/dokon/screens.test.tsx`, `pages/dokon/DokonPage.test.tsx`, `pages/seller/SellerOrders.test.tsx`, `ShopHome.test.tsx`.
- Haqiqiy lokal serverda ikki sotuvchi bilan to'liq oqim sinab ko'rildi (xaridor buyurtma beradi, sotuvchi A holatni o'zgartiradi, sotuvchi B ko'rmaydi va o'zgartira olmaydi).

## Ochiq masalalar

1. **Yiqilayotgan test:** `src/components/studio/ShopInquiryDialog.test.tsx` ("shows the server's message when the daily limit is reached"). Commit `1d1f87d6`dan beri bor, bu ishlarga aloqasi yo'q.
2. **Haqiqiy to'lov yo'q:** "Karta" faqat tanlov sifatida saqlanadi.
3. **Xabarnoma yo'q:** sotuvchiga yangi buyurtma haqida SMS yoki Telegram bormaydi (ro'yxat 30 soniyada o'zi yangilanadi).
4. **Admin tomoni:** adminning buyurtmalarni ko'rish yoki holatini o'zgartirish ekrani yo'q. Do'konsiz (`store_id` bo'sh) katalog mahsulotlarining buyurtmasini hech bir sotuvchi ko'rmaydi.
5. **Sotuvchi oqimi productionda sinalmagan:** buning uchun haqiqiy sotuvchi hisobi va admin tasdiqlagan do'kon kerak.
6. **OpenAI kaliti** chatda ko'rsatilgan: almashtirish tavsiya qilinadi. Serverdagi `.env` va uning zaxirasiga `chmod 600` berish hali qilinmagan.
7. **Eski 360 renderlar** (seam tuzatishidan oldingi) qayta ishlanmagan.
8. **Hali yangilanmagan oynalar:** model qo'shish/tahrirlash va do'kon dialoglari (sotuvchi va admin) oq ko'rinishda qoldi. Admin panellari va 3D studio ataylab tegilmagan.
9. **Tekshirilmagan holatlar:** yangi sahifalarning ko'pi tun rejimida va kompyuter o'lchamida ko'rilgan; telefon o'lchami va kunduz rejimi hamma sahifada alohida tekshirilmagan.

## Ishlash muhiti bo'yicha eslatma

- `node` kerak bo'lsa: `export PATH="$HOME/.local/node/bin:$PATH"` (shell uni o'zi topmaydi).
- `frontend/node_modules`da macOS uchun rollup yo'q edi, `@rollup/rollup-darwin-arm64` `--no-save` bilan o'rnatildi (`package.json` o'zgarmagan). Qayta `npm install` qilinsa, yana kerak bo'lishi mumkin.
- Backend testlari Docker ichida ishlaydi: `docker compose exec -T api python -m pytest`. Docker Desktop ishga tushirilgan bo'lishi kerak.
- Brauzer oldindan ko'rish uchun `.claude/launch.json`ga `frontend` yozuvi qo'shildi (bu fayl git'da kuzatilmaydi).
