# Mebel uslubi va smeta narxlari

Sana: 2026-10-19. Holat: tasdiqlash uchun.
Oldingi ish: tayyor uslublar ([#24](https://github.com/Begzod10/andoza_ai/pull/24), [#25](https://github.com/Begzod10/andoza_ai/pull/25)) va smeta ([#26](https://github.com/Begzod10/andoza_ai/pull/26)–[#29](https://github.com/Begzod10/andoza_ai/pull/29)) production'da ishlayapti.

## Maqsad
Hozir har bir tayyor uslub (Neoklassika, Hi-Tech, Milliy va boshqalar) katalogdagi bir xil mebelni oladi: `pick` faqat mebel turi va xona turiga qaraydi. Natijada Hi-Tech va Milliy uslublarida bir xil divan turadi. Bundan tashqari smetadagi uchta kichik ish yakunlanadi.

**Muvaffaqiyat mezoni:**
- sotuvchi va admin mebelga bir yoki bir nechta uslub belgilay oladi;
- tayyor uslub o'z uslubidagi mebelni birinchi tanlaydi, bunday mebel bo'lmasa xona bo'sh qolmaydi;
- uslubi belgilanmagan mebel hamma uslubga mos hisoblanadi, ya'ni mavjud katalog avvalgidek ishlaydi;
- smeta mahsulot tanlanmagan pol, oboy va bo'yoqni eng arzon emas, o'rta (mediana) narxdan hisoblaydi;
- galtelning standart narxi bozor narxiga tushiriladi;
- lokal test akkaunti o'chiriladi.

## Doira
**Kiradi:**
- A: `furniture.styles` maydoni, sotuvchi va admin API va formalari, katalog API javobi, tayyor uslubning mebel tanlovi;
- B: smetada mediana narx;
- C: galtel standart narxi;
- E: lokal `qa_presets` akkauntini o'chirish.

**Kirmaydi:**
- AI dizaynerga (backend prompt) uslub bo'yicha mebel tanlatish;
- mavjud mebelga uslubni avtomatik (AI bilan) qo'yish;
- katalog API'da uslub bo'yicha filtr: studiya katalogni to'liq yuklaydi va tanlovni o'zi qiladi;
- mobil ilova formalari: maydon qo'shimcha, eski mijozlar uni e'tiborsiz qoldiradi;
- eski, belgisiz chiroq va mebelni tozalash (D): ularni foydalanuvchi qo'yganidan ajratib bo'lmaydi.

---

## A. Mebel uslubi

### Uslublar ro'yxati
`FURNITURE_STYLES = {"neoklassika", "klassik", "zamonaviy", "hitech", "minimalist", "skandinav", "loft", "milliy"}`

Ro'yxat ikki joyda turadi: backend `app/schemas/admin_catalog.py` (`ROOM_TYPES` yonida) va frontend `lib/furnitureStyles.ts`. Frontend faylida o'zbekcha nomlar ham bo'ladi: Neoklassika, Klassik, Zamonaviy, Hi-Tech, Minimalist, Skandinav, Loft, Milliy. Ikki ro'yxat bir xilligini frontend testi tekshirmaydi (backend'ni o'qiy olmaydi), lekin backend noto'g'ri qiymatga 422 qaytaradi.

### Ma'lumotlar bazasi
- `furniture.styles`: `ARRAY(String(20))`, `nullable=False`, `server_default='{}'`.
- Bo'sh ro'yxat "hamma uslubga mos" degani. Mavjud qatorlar migratsiyadan keyin bo'sh ro'yxat bilan qoladi.
- Alembic migratsiyasi joriy head'dan, `downgrade` ustunni o'chiradi.

### Backend API
Uslub qiymatlari tekshiriladi: har biri `FURNITURE_STYLES` da bo'lishi kerak, takrorlar olib tashlanadi, tartib ro'yxat tartibida saqlanadi. Noto'g'ri qiymatga 422 qaytadi, xabari `room_type` xabari kabi o'zbekcha.

| Endpoint | O'zgarish |
|---|---|
| `POST /seller/furniture` (multipart) | `styles: str \| None = Form(None)`, vergul bilan ajratilgan (`"zamonaviy,minimalist"`); bo'sh yoki yo'q bo'lsa `[]` |
| `PATCH /seller/furniture/{id}` (JSON) | `styles: list[str] \| None`; `None` bo'lsa o'zgarmaydi, `[]` bo'lsa tozalanadi |
| admin yuklash (multipart) | sotuvchi kabi |
| `PATCH` admin (JSON) | sotuvchi kabi |
| `SellerFurnitureOut`, `FurnitureAdminOut`, `FurnitureOut` (katalog) | `styles: list[str]` |

Katalog kesh kaliti (`catalog.py`) o'zgarmaydi, chunki filtr yo'q. Lekin kesh qiymatiga yangi maydon kiradi, shuning uchun deploy'dan keyin eski kesh muddati tugaguncha (u qisqa) `styles` bo'lmasligi mumkin. Frontend `styles` yo'q bo'lsa uni `[]` deb oladi.

### Frontend: formalar
- Sotuvchi: `SellerModelFormDialog.tsx`, yuklash va tahrirlash.
- Admin: `ModelFormDialog.tsx` (yuklash) va `ModelEditDialog.tsx` (tahrirlash).
- "Xona" tanlovi ostida "Uslub" chiplari: bir nechtasini tanlash mumkin, hech biri tanlanmasa izohda "hamma uslubga mos" yoziladi.
- `lib/api/seller.ts` va `lib/api/admin.ts`: yuklashda `styles` vergul bilan qo'shiladi, tahrirlashda massiv yuboriladi; `CatalogFurniture`, seller va admin tiplariga `styles?: string[]` qo'shiladi.

### Frontend: tayyor uslubning mebel tanlovi
- Har bir `Preset` ga `furnitureStyle` qo'shiladi. Qiymatlar: neoklassika→`neoklassika`, zamonaviy→`zamonaviy`, hitech→`hitech`, milliy→`milliy`, dark (Qorong'i)→`zamonaviy`, skandinav→`skandinav`, klassik→`klassik`, loft→`loft`, minimalist→`minimalist`.
- `pick(kind, catalog, roomType, used, style)` mos mebellar orasidan eng yuqori ballisini tanlaydi:
  - uslub bali: `styles` ichida shu uslub bor → 2, `styles` bo'sh → 1, boshqa uslub → 0;
  - xona bali (hozirgi tartib saqlanadi): `room_type === roomType` → 2, `room_type === null` → 1, boshqasi → 0;
  - avval uslub bali, keyin xona bali solishtiriladi; teng bo'lsa katalog tartibi saqlanadi.
- Boshqa uslubdagi mebel ham tanlanishi mumkin (ball 0), lekin faqat mos variant bo'lmasa. Bu ataylab qilingan: xona bo'sh qolgandan ko'ra boshqa uslubdagi divan yaxshiroq.

### Testlar
- Backend: sotuvchi va admin yuklash va tahrirlashda `styles` saqlanishi, noto'g'ri qiymatga 422, takrorlar olib tashlanishi, `[]` tozalashi, katalog javobida `styles` borligi.
- Frontend: `pick` tartibi (uslub xonadan ustun, belgisiz mebel boshqa uslubdan ustun, mos mebel bo'lmasa boshqa uslubdagi olinadi), har bir preset'da `furnitureStyle` ro'yxatdagi qiymat ekani, formalarda chiplar va yuborilayotgan qiymat.

---

## B. Smetada mediana narx
- `app/services/estimate_catalog.py`: `pick_cheapest_finishes` o'rniga `pick_median_finishes`. Har bir `finish:<category>` uchun mos birlikdagi faol mahsulotlar birlik narxi bo'yicha saralanadi va o'rtadagisi olinadi. Juft sonda pastki o'rtadagisi olinadi, ya'ni haqiqiy mahsulot, ikki narxning o'rtachasi emas.
- `smeta_key` mahsulotlari (suvoq, grunt, plintus, kabel va boshqalar) eng arzon narxda qoladi.
- `FINISH_STAND_IN_NOTE` matni: "Mahsulot tanlanmagan — do'kondagi o'rtacha narx olindi. Aniq narx uchun o'zingiz mahsulot tanlang."
- Smeta sahifasidagi pol izohi: "narx do'kondagi o'rtacha poldan olindi (taxminiy)".
- Testlar: 1, 2, 3 va 4 ta mahsulotda qaysi biri olinishi; nofaol va boshqa birlikdagi mahsulotlar e'tiborga olinmasligi.

## C. Galtel standart narxi
- `GALTEL_PIECE_PRICE_UZS`: 40 000 dan **11 000** so'mga (2 metrli ko'pik polosa).
- Manba (kod izohida): 2026-10-19 da wert.uz (TERMOTECH PENOPLAST LUX, 5 460–17 160 so'm, 80×80 modeli 2 m va 7 800 so'm), prom.uz (Де-Багет / ТЕПЛОДОМ, 7 500–24 000 so'm, 50×50 modeli 2 m va 7 500 so'm) va stroyka.uz (8 000–13 500 so'm) e'lonlarining medianasi.
- Qator "taxminiy" bo'lib qoladi. Do'kon `galtel` mahsuloti bo'lsa, uning narxi ustun turadi (o'zgarmaydi).
- Testlar konstanta orqali ishlaydi, raqam o'zgarishi ularni buzmaydi.

## E. Lokal test akkaunti
Lokal bazadan `qa_presets` foydalanuvchisi, uning kvartirasi va xonasi o'chiriladi. Bu kod o'zgarishi emas, PR'ga kirmaydi. Productionga tegilmaydi.

## Bajarish tartibi va PR'lar
1. E (kod yo'q).
2. B va C: bitta backend PR.
3. A: bitta PR (migratsiya, backend, frontend).

Merge production'ga deploy degani va migratsiyani ham ishga tushiradi. Shuning uchun har bir PR siz aytganda, CI yashil bo'lgandan keyin merge qilinadi.
