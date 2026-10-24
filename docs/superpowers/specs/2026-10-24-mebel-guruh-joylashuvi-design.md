# AI dizaynda mebelni odam ishlatadigandek joylashtirish

Sana: 2026-10-24. Holat: tasdiqlash uchun.

## Muammo
Production'dagi "Mehmonxona ta'miri" (4.5 × 3.2 m) xonasida AI dizayn natijasi:
- divan xona o'rtasida, o'tiradigan tarafi old devorga, orqasi ovqat stoliga qarab turibdi;
- stullar stol atrofida emas, har xil burchakda turibdi;
- 14 m² ga ovqat guruhi, divan, ikki kreslo, puf va shkaf tiqilgan, eshikdan yuradigan yo'l yo'q;
- kreslolar burchaklarga tiqilgan, hech narsaga qaramaydi.

**Sabab** (`frontend/src/lib/aiDesignLayout.ts`, `aiDesign.ts`):
- har bir mebel boshqalaridan mustaqil joylashtiriladi;
- `center` zonasidagi mebel doim 0° burchakda turadi;
- faqat eshik, deraza va ustma-ust tushish tekshiriladi, foydalanish qulayligi tekshirilmaydi.

## Maqsad
AI dizayner va tayyor uslublar mebelni guruh bo'lib, odam ishlatadigandek joylashtirsin.

**Muvaffaqiyat mezoni:**
- har bir stul stolga qarab turadi, divan devorga suyanib xonaga qaraydi, kreslolar divan yoki jurnal stoliga qaraydi;
- eshikdan har bir guruhning ishlatiladigan tarafiga kamida 70 sm enli yo'l ochiq;
- asosiy guruh doim joylashadi, sig'magan guruh tashlab ketiladi va foydalanuvchiga nomi bilan aytiladi;
- skrinshotdagi xona test sifatida qayta yaratilganda yuqoridagi muammolarning birortasi takrorlanmaydi.

## Doira
**Kiradi:** AI javobidagi mebel vazifasi (`role`); serverda vazifani tekshirish va topish; frontendda guruh bo'yicha joylashtirish; yuradigan yo'l tekshiruvi; tashlab ketilgan mebel haqida xabar; tayyor uslublarning vazifaga o'tishi.

**Kirmaydi:**
- studiyada mebelni qo'lda joylashtirish va surish;
- chiroqlarni joylashtirish (`lightSpot` o'zgarmaydi);
- saqlangan xonalar (yangi qoidalar faqat keyingi AI dizaynga ishlaydi);
- AI quruvchi (`ai_builder.py`, `place_furniture` tool) — u alohida oqim;
- mobil ilova.

---

## 1. Mebel vazifasi (`role`)

| Guruh | Vazifalar |
|---|---|
| `lounge` (dam olish) | `sofa`, `armchair`, `coffee_table`, `tv_unit` |
| `dining` (ovqat) | `dining_table`, `dining_chair` |
| `sleep` (yotoq) | `bed`, `nightstand` |
| `work` (ish) | `desk`, `desk_chair` |
| `storage` (saqlash) | `wardrobe`, `shelf` |
| `extra` | `decor`, `rug` |

- **Backend** (`backend/app/services/ai_designer.py`):
  - `FURNITURE_ROLES` konstantasi shu 14 ta qiymat bilan;
  - prompt: har bir mebel uchun `{"id": "F3", "role": "<vazifa>"}` so'raladi. `zone` mebeldan olib tashlanadi, chiroqlarda qoladi;
  - `validate_plan`: `role` ro'yxatda bo'lmasa, `infer_role(category, name)` bilan topiladi va mebel elementiga `role` yoziladi. Eski `zone` maydoni bo'lsa, u e'tiborsiz qoldiriladi.
- **`infer_role` qoidalari** (nom kichik harfda, birinchi mos kelgani olinadi):
  - `gilam|rug|carpet|kovrolin` → `rug`;
  - `jurnal|kofe|coffee` → `coffee_table`;
  - `tv|televizor|tumba` → `tv_unit`;
  - `tumbochka|nightstand|prikrovat` → `nightstand`;
  - `yozuv|kompyuter|desk|ish stoli` → `desk`;
  - `kreslo|armchair` → `armchair`;
  - `shkaf|garderob|wardrobe` → `wardrobe`;
  - `javon|komod|stellaj|vitrina|bookcase` → `shelf`;
  - kategoriya bo'yicha: `divan` → `sofa`, `karavot` → `bed`, `stol` → `dining_table`, `stul` → `dining_chair`;
  - qolgani → `decor`.
- **Stullar soni:** AI `dining_chair` ni bitta model sifatida tanlaydi. Server bir xil mebelni takror qaytarmaydi. Sonni frontend stol eniga qarab hal qiladi (3-bo'lim).
- **Frontend tipi:** `AiDesignPlan.furniture[i]` ga `role: FurnitureRole` qo'shiladi. `zone` ixtiyoriy bo'lib qoladi: eski javob kelsa ham buzilmaydi, `role` bo'lmasa frontend xuddi shu `infer_role` qoidalarini qo'llaydi (`lib/furnitureRole.ts`).
- **Tayyor uslublar** (`aiDesignPresets.ts`): `Kind` → `role` (`divan` → `sofa`, `kreslo` → `armchair`, `stol` → `coffee_table`, `tumba` → `tv_unit`, `gilam` → `rug`, `shkaf` → `shelf`). `zone` olib tashlanadi.

## 2. Joylashtirish qoidalari

Yangi modul: `frontend/src/lib/furnitureGroups.ts`. Hozirgi `aiDesignLayout.ts` dagi `roomModel`, `Rect`, `overlaps`, `rectCorners` va eshik/deraza bo'sh joylari (`ClearZone`) shu yerda qayta ishlatiladi.

Har bir mebelning old tarafi studiya qoidasi bilan: `rotation` bo'yicha `(sin, cos)` yo'nalishi.

**Dam olish (`lounge`)**
- `sofa`: orqasi devorga (`WALL_GAP` 4 sm), old tarafi xonaga. Devor tanlash: ustida eshik yo'q, eng uzun, iloji bo'lsa derazasiz.
- `coffee_table`: divan oldida, oralig'i 40–45 sm, divan o'qida.
- `tv_unit`: qarama-qarshi devorda, divan o'qiga eng yaqin joyda, divanga qarab. U yerda eshik bo'lsa, devor bo'ylab suriladi.
- `armchair`: divanning bir yoki ikki uchida, divan old chizig'idan 20–40 sm oldinda. Jurnal stoli markaziga qarab buriladi (to'g'ridan-to'g'ri `atan2`), lekin 90° dan ortiq emas.
- Guruh devorga yetmasa (xona juda kichik), divan va jurnal stoli qoladi, kreslo va TV tushadi.

**Ovqat (`dining`)**
- `dining_table`: dam olish guruhidan bo'sh qolgan joyda. Stol va stullar orqasidagi 60 sm to'liq sig'adigan nuqtalar ichidan quyidagi tartibda tanlanadi: eshik yo'lida emas; derazaga yaqin; bo'sh joy o'rtasiga yaqin. Uzun tomoni xonaning uzun o'qiga parallel.
- **Stullar soni:** stol eni (uzun tomoni) ≥ 1.6 m → 6, ≥ 1.1 m → 4, aks holda 2.
- **Joyi:** avval uzun tomonlarga juft-juft, 6 bo'lsa ikki uchiga bittadan. Har bir stul stol markaziga qaraydi, stol chetidan 10 sm ichkariga kirib turadi.
- **Stul orqasi:** 60 sm bo'sh joy qoladi. U boshqa mebelga yoki devorga to'g'ri kelsa, stullar 6 → 4 → 2 ga kamaytiriladi, keyin stol boshqa nuqtaga ko'chiriladi.

**Yotoq (`sleep`)**
- `bed`: bosh tarafi devorga, iloji bo'lsa derazasiz va eshiksiz devorga. Ikki yoni va oyoq tarafida 60 sm bo'sh joy.
- `nightstand`: bosh tarafda, karavotning ikki yonida, karavot bilan bir yo'nalishda.

**Ish (`work`)**
- `desk`: devorga suyanadi, iloji bo'lsa deraza devoriga yoki unga qo'shni devorga.
- `desk_chair`: stol oldida, stolga qarab, 60 sm orqa joyi bilan.

**Saqlash (`storage`)**
- `wardrobe`, `shelf`: orqasi devorga. Oldida 70 sm bo'sh joy qoladi. Eshik va deraza oldini to'smaydi (hozirgi `blocksOpening` qoidasi, baland mebel).

**Boshqa (`extra`)**
- `decor`: bo'sh burchaklarga, burchak bo'lmasa devor bo'yiga.
- `rug`: asosiy guruh markaziga, uning ostiga (ustma-ust tushish tekshirilmaydi).

**Yuradigan yo'l**
- Xona 10 sm lik katakchalarga bo'linadi. Mebel egallagan katak va devor yonidagi katak band hisoblanadi.
- Har bir eshikning ichki tarafidan har bir guruhning **ishlatiladigan nuqtasi**gacha yo'l bo'lishi kerak. Ishlatiladigan nuqta: divan oldi, har bir stul orqasi, karavotning bir yoni, shkaf oldi, ish stuli orqasi.
- Yo'l eni kamida 70 sm (`PATH_WIDTH = 0.7`). Bu band kataklarni 35 sm ga kengaytirib, keyin oddiy BFS orqali tekshiriladi.
- Eshik ochiladigan joy va deraza oldi qoidalari hozirgidek ishlaydi.

**Murakkab xonalar:** L-shakl va qiyshiq devorli xonalar hozirgi `roomModel` orqali ishlaydi. Devor yo'nalishi `WallInfo` dan, "ichkarida" tekshiruvi `model.inside` dan olinadi.

## 3. Tartib va tashlab ketish

1. **Asosiy guruh:**
   - xona turi bo'yicha: `mehmonxona` → `lounge`, `oshxona` → `dining`, `yotoqxona` → `sleep`;
   - xona turi boshqa yoki noma'lum bo'lsa, rejadagi vazifalardan: `bed` bo'lsa `sleep`, `sofa` bo'lsa `lounge`, `dining_table` bo'lsa `dining`, `desk` bo'lsa `work`.
2. **Asosiy guruh birinchi joylashtiriladi.** Har bir devor uchun nomzod joylashuv quriladi va ball beriladi. Yo'l tekshiruvidan o'tmagani chiqarib tashlanadi. Ball: eshikdan uzoqlik +, deraza to'silmagani +, devor uzunligi +. Eng yuqori ballisi olinadi.
3. **Keyingi guruhlar** shu tartibda qo'shiladi: `lounge`, `dining`, `sleep`, `work`, `storage`, `extra` (asosiy guruhdan tashqari). Har biridan keyin yo'l qayta tekshiriladi.
4. **Sig'masa:** asosiy bo'lmagan guruh joylashmasa yoki yo'lni to'sib qo'ysa, butunlay tashlanadi. `dining` uchun avval stullar soni kamaytiriladi (2-bo'lim). Guruh ichida majburiy bo'lmagan mebel (`armchair`, `tv_unit`, `nightstand`, `decor`) alohida tashlanishi mumkin.
5. **Asosiy guruh ham sig'masa** (masalan, divan hech bir devorga sig'maydi): yo'l qoidasisiz bir marta qayta urinib ko'riladi. Bo'lmasa, bu guruh ham tashlanadi.
6. **Foydalanuvchi qo'ygan mebel** (`fromDesign` emas) joyida qoladi va band joy hisoblanadi. Avvalgi AI dizayn mebellari hozirgidek o'chiriladi.

**Natija** (`applyDesignPlan` qaytaradi): hozirgi `AppliedCounts` ga `dropped: Array<{ name: string; count: number }>` qo'shiladi.

**Xabar:** AI dizayner oynasida (dizayn natijasi ostida) chiqadi:
- uz: "Joy yetmadi: {{list}} qo'yilmadi.";
- ru: "Не хватило места: {{list}} не размещены.";
- en: "Not enough room: {{list}} left out.".

Ro'yxat nom va soni bilan beriladi, masalan "Ovqat stoli, 4 ta stul". Kalitlar `uz/ru/en.json` da.

## 4. Testlar

**Frontend** (vitest, `lib/__tests__/furnitureGroups.test.ts`):
- har bir stul old tarafi stol markaziga qaraydi (burchak farqi < 15°);
- divan orqasi devorga tegadi (≤ 6 sm), old tarafi xona ichiga qaraydi;
- jurnal stoli divan oldida, 40–45 sm narida;
- kreslolar jurnal stoliga 90° dan kam burchak bilan qaraydi;
- karavot bosh tarafi devorda, ikki yonida 60 sm bo'sh;
- shkaf oldida 70 sm bo'sh, eshik ochiladigan joyda mebel yo'q.

**Skrinshotdagi xona** (`aiDesignRealRoom` uslubida yangi test):
- xona 4.5 × 3.2 m, bitta eshik, bitta deraza;
- reja: divan, ovqat stoli, stul, 2 kreslo, puf, shkaf, xona turi `mehmonxona`;
- natija: divan devorga suyanib xonaga qaraydi, eshikdan divan oldigacha 70 sm yo'l bor, joylashmagan guruh `dropped` da va xabar matnida.

**Boshqa holatlar:**
- L-shakl va qiyshiq devorli xona: barcha mebel `model.inside` ichida va yo'l ochiq;
- stullar soni: 1.8 m stol → 6, 1.2 m → 4, 0.9 m → 2, joy yetmasa kamayadi;
- `role` siz eski reja (`zone` bilan) frontendda `infer_role` orqali ishlaydi.

**Backend** (pytest):
- `role` ro'yxatdagi qiymat bo'lsa saqlanadi;
- noto'g'ri yoki yo'q `role` → `infer_role` natijasi (har bir qoida uchun misol);
- eski `zone` li javob xato bermaydi;
- prompt `role` ro'yxatini o'z ichiga oladi.
