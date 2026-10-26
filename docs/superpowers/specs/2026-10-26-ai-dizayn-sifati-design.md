# AI dizayn sifati: xona turi, uslubdan boshlash, izoh

Sana: 2026-10-26. Holat: tasdiqlash uchun.
Asos: [docs/research/2026-10-26-ai-design-eval.md](../../research/2026-10-26-ai-design-eval.md). Baholashda AI dizayner 2–6, tayyor uslublar 4–7 ball oldi.

## Muammo
Baholash to'rtta asosiy sababni topdi:
1. **Xona turi:** studiya har xonani `room_type: "mehmonxona"` deb yuboradi (`StudioPage.tsx` da qotirilgan). Natijada yotoqxonaga karavotsiz mehmonxona dizayni keladi. `rooms` jadvalida xona turi ustuni yo'q.
2. **Uslub va material:** AI uslubni materialga bog'lamaydi. 13 tadan 11 ta rejada parket, 9 tasida herringbone tanlangan. Hi-tech'da qandil, loft'da beton yo'q, milliy'da oboy yo'q. AI rejasida shift, plintus va galtel (`trim`) yo'q.
3. **Oltin rang:** `_SYSTEM` promptida oltin misol sifatida turibdi. Natijada 13 tadan 6 ta rejada so'ralmagan oltin aksent chiqdi.
4. **Izoh:** `ai_design_text.py` tekshiruvi juda qattiq va 13 tadan 12 ta izohni rad etdi. Sabablari:
   - tanlanmagan katalog nomlaridagi oddiy so'zlar ("yog'och", "naqshli", "stul") xato deb topiladi;
   - `\bshina` qolipi "shinam" so'ziga ham mos keladi;
   - zaxira matnda oltin "sariq" yoki "jigarrang" deb ataladi;
   - bir xil rangdagi aksent "ajratiladi" deb yoziladi.

## Maqsad va muvaffaqiyat mezoni
- **Yotoqxona:** "Shinam yotoqxona" so'rovi yotoqxona turidagi xonada har safar karavotli reja beradi.
- **Uslubga sodiqlik:** uslub aytilgan so'rovda pol, devor qoplamasi, chiroq turlari va `trim` o'sha tayyor uslubdan boshlanadi. Masalan loft'da beton yoki eski yog'och pol, milliy'da oboy, hi-tech'da qandilsiz chiroqlar.
- **Oltin:** oltin aksent faqat so'rovda "oltin" yoki "zarhal" bo'lsa chiqadi. "Och ranglar" so'ralganda aksent ham och bo'ladi.
- **Izoh:** baholashdagi 13 ta saqlangan javobning kamida 10 tasida AI izohi saqlanadi. Zaxira matnda rang nomlari to'g'ri bo'ladi.
- **Xona turini tanlash:** xona turi wizard'da, studiyadagi xona sozlamalarida va AI dizayner oynasida tanlanadi va saqlanadi.

## Doira
**Kiradi:**
- `rooms.room_type` ustuni va eski xonalarni nomdan to'ldirish;
- xona API'si, wizard, studiya sozlamalari va AI oynasidagi tanlagich;
- tayyor uslublarni umumiy JSON faylga ko'chirish;
- AI'ga uslubni "boshlang'ich reja" sifatida berish;
- AI rejasida `trim`;
- oltin rang qoidasi;
- izoh tekshiruvini tuzatish.

**Kirmaydi:**
- tayyor uslub mebel tanlovi (`aiDesignPresets.ts:pick`);
- pol chiroqlarining mebelga kirib qolishi;
- tanlangan mebel uslubini tekshirish (hisobotdagi 5–10-takliflar). Ular keyingi bosqich.
- mobil ilova (maydon qo'shimcha, eski mijozlar e'tiborsiz qoldiradi);
- AI quruvchi (chat).

---

## 1. Xona turi

**Ma'lumot.** Migratsiya `1786000042` (`down_revision = "1786000041"`):
- `rooms.room_type String(20) NULL` qo'shiladi.
- `CHECK room_type IN ('mehmonxona','yotoqxona','bolalar','oshxona','kabinet','hammom','balkon')` qo'shiladi.
- Eski xonalar nomdan to'ldiriladi (katta-kichik harf farqsiz, SQL `UPDATE … WHERE name ILIKE`, birinchi mosi):

  | Nomda | Tur |
  |---|---|
  | `bolalar`, `детск` | `bolalar` |
  | `yotoq`, `спальн` | `yotoqxona` |
  | `oshxona`, `кухн` | `oshxona` |
  | `kabinet`, `ish xona`, `кабинет` | `kabinet` |
  | `hammom`, `vanna`, `ванн`, `санузел` | `hammom` |
  | `balkon`, `балкон` | `balkon` |
  | `mehmon`, `zal`, `гостин` | `mehmonxona` |

  Qolganlari `NULL`. `downgrade` ustunni o'chiradi.
- **Yagona ro'yxat:** `backend/app/schemas/room.py` da `ROOM_TYPES = (…)`, tartib yuqoridagi CHECK bilan bir xil.

**API.**
- `RoomOut.room_type: str | None` qo'shiladi.
- `RoomCreate` va `RoomUpdate` ga `room_type: Literal[...] | None` qo'shiladi. `PATCH`'da `room_type: null` turni tozalaydi, maydon yuborilmasa o'zgarmaydi.
- Noto'g'ri qiymat 422 qaytaradi.

**Katalog moslashuvi** (`ai_designer.furniture_menu`, `room_type` bo'yicha saralash):
- `bolalar` → `yotoqxona` mebeli, nomida `bolalar|детск|kids` bo'lganlari birinchi;
- `kabinet` → `mehmonxona` mebeli, `desk` va `desk_chair` vazifali buyumlar birinchi.

Katalogdagi `ROOM_TYPES` (`schemas/admin_catalog.py`) o'zgarmaydi.

**Frontend.**
- **Wizard:** xona qo'shilganda "Xona turi" tanlagichi chiqadi. Standart qiymat xona nomidan taxmin qilinadi, migratsiya bilan bir xil qoida: `lib/roomType.ts` dagi `guessRoomType(name)`.
- **Studiya:** xona sozlamalarida ("Xona sozlamalari" oynasi) "Xona turi" tanlagichi bo'ladi.
- **AI dizayner oynasi:** tepada xonaning turi ko'rsatiladi va o'zgartirilsa xonaga `PATCH` qilinadi.
- **Qotirilgan qiymat:** `StudioPage.tsx` va `SharedRoomPage.tsx` dagi `room_type: "mehmonxona"` olib tashlanadi.
- **Yuborish:** `aiDesign*` chaqiruvlari `room.room_type ?? undefined` yuboradi. Tur `NULL` bo'lsa, frontend `guessRoomType(room.name)` ni yuboradi, u ham topmasa hech narsa yuborilmaydi.
- **Tarjima:** turlar nomi uz, ru va en tilida i18n kalitlari orqali (`rooms.type.*`).

## 2. AI tayyor uslubdan boshlaydi

**Umumiy fayl.** Backend va frontend Docker image'lari alohida build kontekstida (`./backend`, `./frontend`) yig'iladi, shuning uchun bitta faylni ikkalasi to'g'ridan-to'g'ri o'qiy olmaydi. Asosiy nusxa `backend/app/data/design_presets.json` da, aynan bir xil nusxasi `frontend/src/lib/data/design_presets.json` da turadi. Ikkalasi bir xil ekanini backend testi tekshiradi: CI repo ildizida ishlaydi va `../frontend/...` faylini o'qiydi, fayl topilmasa test o'tkazib yuboriladi. Faylda 9 ta tayyor uslub (`neoklassika`, `zamonaviy`, `hitech`, `milliy`, `dark`, `skandinav`, `klassik`, `loft`, `minimalist`) quyidagi maydonlar bilan saqlanadi:
- `id`, `furnitureStyle`;
- `walls` (main va accent);
- `floor` (type, pattern, tint);
- `lights` (type va zone);
- `trim` (ceiling, skirting, cornice);
- `furniture` (kind ro'yxati).

Tarjima kalitlari (`labelKey`, `titleKey`, `summaryKey`) faylda qoladi.

Faylda yana `trimProfiles` bo'limi bor: ruxsat etilgan `ceiling`, `skirting` va `cornice` profil id'lari, `frontend/src/lib/trimProfiles.ts` dagi id'lar bilan bir xil. Frontend testi bu mosligini tekshiradi.

`frontend/src/lib/aiDesignPresets.ts` frontend nusxasini import qiladi. Kerak bo'lsa `resolveJsonModule` yoqiladi. Tashqi API o'zgarmaydi: `DESIGN_PRESETS` va `presetPlan`. Backend faylni `app/services/design_presets.py: load_presets()` orqali o'qiydi va keshlaydi.

**Prompt** (`ai_designer.build_user_message`):
- **Uslub aniqlansa** (`styles_in_prompt` bitta yoki bir nechta qaytarsa, birinchisi olinadi): xabarga "Boshlang'ich reja (<uslub nomi>)" bloki qo'shiladi.
  - Blokda o'sha uslubning devori, poli, chiroqlari va `trim` qiymatlari JSON ko'rinishida beriladi.
  - Ko'rsatma: "Shu rejadan boshlang. So'rovda aniq aytilgan narsalarni o'zgartiring, qolganini saqlang. Pol turi va naqshini, chiroq turlarini sababsiz almashtirmang."
- **Uslub aniqlanmasa:** umumiy ko'rsatma beriladi.
  - Pol turini xona turi va atmosferaga qarab tanlang, har doim parket emas: oshxona va hammomda plitka, loft yoki sanoat ruhida beton.
  - Qandil faqat klassik va neoklassik ruhda.
  - So'ralmagan accent devor qo'ymang.
- **Oltin:** `_SYSTEM` dagi oltin qatori olib tashlanadi. So'rovda `oltin|zarhal|gold|золот` bo'lsa, xabarga alohida qator qo'shiladi: "Oltin talab qilingan: aksent yoki oboy accent_color uchun haqiqiy oltin tus (#C9A24B yoki #B8860B)".
- **Och ranglar:** so'rovda `och|yorug'|светл|light` bo'lsa, xabarga "Aksent ham och va asosiy rangga yaqin bo'lsin" qatori qo'shiladi.

**Javob shakli.** JSON'ga `"trim": {"ceiling": "<profil yoki null>", "skirting": "<profil yoki null>", "cornice": "<profil yoki null>"}` qo'shiladi. Ruxsat etilgan profillar ro'yxati `design_presets.json` dagi `trimProfiles` dan olinadi va xabarda beriladi.
- `validate_plan` noma'lum profilni tashlaydi.
- `DesignPlan.trim` maydoni qo'shiladi va javobda qaytadi. Frontend `AiDesignPlan.trim` ni allaqachon qo'llaydi.

## 3. AI izohi (`backend/app/services/ai_design_text.py`)
- **`_catalog_problems`:** tanlanmagan mebel tilga olinganini katalog nomining o'ziga xos qismi bilan tekshiradi.
  - O'ziga xos qism: to'liq nom yoki nomdagi kamida bitta so'z, katalogda boshqa nomlarda uchramaydigan va 4 harfdan uzun.
  - Umumiy so'zlar hisobga olinmaydi: material, rang, mebel turi nomlari (`yog'och`, `naqshli`, `kulrang`, `stul`, `stol`, `divan`, `karavot`…).
- **`_LIGHT_KINDS`:** qoliplar so'z chegarasi bilan qayta yoziladi. `trek` endi `\btrek\b|\bshina\b|\bшинн` bo'ladi va "shinam"ga mos kelmaydi. Boshqa turlar ham shu tarzda tekshiriladi.
- **`colour_name`:** oltin tuslar (H 38–50°, S≥0.45, L 0.35–0.65) uchun "oltin" nomi.
- **`describe_plan`:** aksent rangi asosiy rangdan sezilarsiz farq qilsa (ΔE < 10 yoki bir xil hex), "ajratiladi" jumlasi yozilmaydi.

## 4. Testlar
- **Saqlangan javoblar:** baholashdagi 13 ta AI javobi `backend/tests/fixtures/ai_design_eval/*.json` ga saqlanadi. Ular haqiqiy, lekin anonim: katalog id'lari test katalogiga moslanadi. Test ular bo'yicha:
  - `ai_design_text` izohni kamida 10 tasida saqlaydi;
  - zaxira matnda oltin "oltin" deyiladi;
  - "shinam" trek deb topilmaydi.
- **Prompt (unit):**
  - uslubli so'rovda "Boshlang'ich reja" bloki va o'sha uslub qiymatlari bor;
  - uslubsiz so'rovda yo'q;
  - oltin qatori faqat oltin so'ralganda chiqadi;
  - "och" so'ralganda och aksent qatori chiqadi.
- **`validate_plan`:** to'g'ri `trim` saqlanadi, noma'lum profil tashlanadi.
- **Migratsiya:** upgrade, downgrade va yana upgrade. Nomdan to'ldirish jadvalidagi har bir qator uchun misol.
- **API:**
  - `room_type` yaratish va o'zgartirish ishlaydi;
  - noto'g'ri qiymat 422;
  - `null` tozalaydi;
  - `RoomOut` da maydon bor.
- **`furniture_menu`:** `bolalar` va `kabinet` saralashi.
- **Frontend:**
  - `guessRoomType` uchun nomlar jadvali;
  - studiya AI'ga xonaning `room_type` qiymatini yuboradi, "mehmonxona" emas;
  - tanlagich o'zgarganda `PATCH` chaqiriladi;
  - `DESIGN_PRESETS` JSON'dan o'qiladi va avvalgi 9 ta uslub bir xil;
  - i18n kalitlari uch tilda bor.
- **Qo'lda (plan oxirida):** baholash skripti nusxasi bilan 13 ta so'rov qayta ishlatiladi. Natija hisobotga qo'shimcha sifatida yoziladi va baholar oldingisi bilan solishtiriladi.
