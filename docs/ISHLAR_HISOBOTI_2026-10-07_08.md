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

### 8. Kechqurun (8-oktabr): AI dizayner, bekor qilish va tozalash
- **AI joylashtirish eshik va derazani hisobga oladi** (`b26d373f`): eshik oldidagi ochilish zonasi bo'sh qoladi, baland yoki devorga osiladigan mebel deraza oldiga qo'yilmaydi, devor chiroqlari va burchak torsheri ochiqliklardan chetda. Joy yetmasa avval deraza, keyin eshik qoidasi bekor qilinadi.
- **AI matni rejaga mos** (`bc73f457`): prompt qat'iylashdi (matn oxirida, faqat tanlangan narsa, mebel va chiroqqa rang yo'q). Javobdan keyin matn rejaga solishtiriladi (`ai_design_text.py`); mos kelmasa matn rejaning o'zidan yoziladi. 600 belgidan uzun matn to'liq jumlada kesiladi.
- **Buyurtmani bekor qilish** (migratsiya `1786000031`: `order_status` enumiga `cancelled`, `orders.cancelled_by`, `orders.cancel_reason`):
  - xaridor faqat "Qabul qilindi"da, sababsiz ham bekor qila oladi;
  - do'kon "Yig'ilmoqda"gacha, sabab majburiy (xaridorga ko'rsatiladi);
  - administrator yetkazilmaganini hammasini, sabab majburiy.
  Qoidalar bitta joyda (`services/order_status.py`). `delivered` va `cancelled` yakuniy.
- **Xaridorning buyurtmalar tarixi:** Do'konda "Buyurtmalarim" ro'yxati va tafsilot ekrani.
- **Admin "Buyurtmalar" bo'limi:** `GET /admin/orders` (holat bo'yicha filtr), `PATCH /admin/orders/{id}/status`. Do'konsiz mahsulotlar buyurtmasini faqat administrator boshqaradi.
- **Yangi buyurtma belgisi:** sotuvchi sahifasida "Yangi" belgisi va brauzer yorlig'ida soni. SMS yuborilmaydi (Eskiz shablonlari va narxi tekshirib bo'lmaydi).
- **Dialoglar:** `Dialog`, `Select`, `PhotoToModelField` uchun ixtiyoriy `themed` parametri; sotuvchining uch dialogi tunda ham mos.
- **Telefon va kunduz tekshiruvi:** Ustalar saralash tugmalari chipga o'tdi, Do'kon asosiy kartasida nom kesilmaydi va rasmsiz karta to'q fonda.
- **Yiqilayotgan test tuzatildi:** `ShopInquiryDialog.test.tsx` kodida emas, testning `beforeEach`ida xato bor edi (mock funksiyasini qaytarib, vitest uni "tozalash" deb chaqirardi).
- **Production:**
  - eski 360° renderlar tuzatildi: 46 tadan 45 tasi (chiziq ko'rsatkichi 70–90% kamaydi; asl nusxalar `renders-backup/` ostida);
  - serverdagi `.env`, uning zaxiralari va buyurtmalar zaxirasi `chmod 600` (faqat root).

### 9. Keyingi bosqich: AI chegaralari, admin ko'rinishi, ikonkalar, sahifalash
- **Mebel balandligi** (migratsiya `1786000032`: `furniture.height_cm`): model yuklanganda 3D ko'rinishdan (studiya ham ishlatadigan `extractSceneInfo` bilan) eni, chuqurligi va balandligi avtomatik o'lchanadi va saqlanadi (`lib/modelSize.ts`). Avval formalarda o'lcham maydoni umuman yo'q edi, shuning uchun yuklangan modellar o'lchamsiz qolib, AI ularni taxminiy 0,9 × 0,7 m deb joylardi. AI endi balandligi 90 sm (deraza tokchasi) dan baland mebelni deraza oldiga qo'ymaydi; balandligi yo'q eski modellar avvalgidek nomi bo'yicha aniqlanadi.
- **Eshik ochilish zonasi eshik kengligiga bog'liq** (0,7–1,1 m), avvalgi qat'iy 95 sm o'rniga.
- **AI matni tekshiruvi katalogning haqiqiy nomlarini ham o'qiydi:** tanlanmagan "pufik" yoki "peshtaxta" tilga olinsa ushlanadi (avval faqat qat'iy ro'yxat bor edi).
- **Admin paneli tema bo'yicha:** `Card`, statistika kartalari, filtr paneli, hamma admin dialoglari (do'kon, model, oboy) tun va kunduzda mos.
- **Studiodagi emojilar ikonkalarga almashtirildi** (`lib/catalogIcons.tsx`): chiroq turlari, mebel belgilari, yoy menyusi, 2D reja (SVG ichida ham), eshik/deraza belgisi. Ma'lumotdagi `emoji` maydoni "tur belgisi" sifatida qoldi, faqat chizish o'zgardi.
- **Buyurtma ro'yxatlari sahifalanadi** (50 tadan, "Yana yuklash"): xaridor, do'kon va admin uchun.
- **Kunduz va telefon tekshiruvi:** Smeta ham ko'rildi.

## Productionda sinash tartibi (siz bajarasiz)
Hisob yaratish va haqiqiy buyurtma yozuvi qoldirgani uchun buni men qila olmayman. Tartib:
1. Ikkita oddiy hisob oching: **sotuvchi** va **xaridor** (yoki bitta sotuvchi, ikkinchisi xaridor).
2. Sotuvchi hisobida **Profil → Sotuvchi paneli**da do'kon arizasini yuboring.
3. **Administrator** hisobida **Do'kon** sahifasidagi "Ko'rib chiqishni kutmoqda" ro'yxatidan do'konni tasdiqlang.
4. Sotuvchi hisobida "Yangi model" orqali bitta mebel yuklang (narx bilan). Administrator uni ham tasdiqlasin. Formada "O'lchami (modeldan aniqlandi)" yozuvi chiqishi kerak.
5. Xaridor hisobida **Do'kon**da shu mebelni savatga qo'shib, manzil va telefon bilan buyurtma bering.
6. Sotuvchi sahifasida buyurtma "Yangi" belgisi bilan chiqishi va brauzer yorlig'ida "(1)" ko'rinishi kerak. "Yig'ishni boshlash" ni bosing.
7. Xaridorda **Buyurtmalarim → buyurtma**da holat "Yig'ilmoqda" bo'lishi va "Bekor qilish" tugmasi yo'qolishi kerak (30 soniya ichida yangilanadi).
8. Ikkinchi sinov buyurtmasini xaridor bekor qilsin (hali "Qabul qilindi"da), sotuvchida u "Bekor qilingan" bo'lib chiqishi kerak.
9. Administratorda Do'kon sahifasidagi "Buyurtmalar" bo'limida hammasi ko'rinishi kerak.
10. Sinovdan keyin sinov buyurtmalarini administrator bekor qilishi mumkin (yetkazilmaganlarini).

## Migratsiyalar

| Revision | Nima qiladi | Qaytarish |
|---|---|---|
| `1786000021` | `orders`: `delivery_address`, `phone`, `payment_method` + `ck_orders_payment_method` | `downgrade` bor |
| `1786000022` | `order_lines.furniture_id` | `downgrade` bor |
| `1786000023` | `orders.store_id` + indeks `ix_orders_store_id` | `downgrade` bor |
| `1786000031` | `order_status` enumiga `cancelled`, `orders.cancelled_by`, `orders.cancel_reason` | `downgrade` bor (enum qiymati qoladi, bekor qilinganlar "Qabul qilindi"ga qaytadi) |
| `1786000032` | `furniture.height_cm` | `downgrade` bor |

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

1. ~~Yiqilayotgan test~~ — tuzatildi (yuqorida).
2. **Haqiqiy to'lov yo'q:** "Karta" faqat tanlov sifatida saqlanadi.
3. **SMS/Telegram xabarnoma yo'q:** sotuvchi sahifada "Yangi" belgisini va yorliqdagi sonni ko'radi, lekin telefoniga xabar bormaydi.
4. ~~Admin tomoni~~ — qilindi (yuqorida). Do'konsiz mahsulot buyurtmasini faqat administrator boshqaradi.
5. **Sotuvchi oqimi productionda sinalmagan:** buning uchun haqiqiy sotuvchi hisobi va admin tasdiqlagan do'kon kerak.
6. **OpenAI kaliti** chatda ko'rsatilgan: almashtirish tavsiya qilinadi (hali qilinmagan). Serverdagi `.env` va zaxiralariga `chmod 600` berildi.
7. ~~Eski 360 renderlar~~ — qayta ishlandi. Ularning 27 tasida qoldiq farq 3–9 daraja (asl 4–44 dan): qayta ishga tushirish ularni yana o'zgartiradi, shuning uchun bir marta ishlatildi.
8. ~~Admin dialoglari~~ — yangilandi. 3D studio ko'rinishi (rang, joylashuv) ataylab tegilmagan.
9. **Tekshirilmagan holatlar:** kunduz rejimi va telefon o'lchami deyarli hamma sahifa uchun ko'rilgan; Share sahifasi telefonda va Smetaning pastki qismi alohida ko'rilmagan.

## Ishlash muhiti bo'yicha eslatma

- `node` kerak bo'lsa: `export PATH="$HOME/.local/node/bin:$PATH"` (shell uni o'zi topmaydi).
- `frontend/node_modules`da macOS uchun rollup yo'q edi, `@rollup/rollup-darwin-arm64` `--no-save` bilan o'rnatildi (`package.json` o'zgarmagan). Qayta `npm install` qilinsa, yana kerak bo'lishi mumkin.
- Backend testlari Docker ichida ishlaydi: `docker compose exec -T api python -m pytest`. Docker Desktop ishga tushirilgan bo'lishi kerak.
- Brauzer oldindan ko'rish uchun `.claude/launch.json`ga `frontend` yozuvi qo'shildi (bu fayl git'da kuzatilmaydi).
