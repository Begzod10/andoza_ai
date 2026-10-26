# Mebel modeli yo'nalishi (`model_yaw`)

Sana: 2026-10-26. Holat: tasdiqlash uchun.

## Muammo
Studiya va AI layout har bir mebel modelini bir xil yo'nalishda deb hisoblaydi:
- eni local X o'qi bo'ylab, chuqurligi Z o'qi bo'ylab;
- old tomoni +Z, orqasi (karavot boshi, divan suyanchig'i) −Z.

Modelning o'zi esa har xil yasalgan bo'lishi mumkin. Production'dagi ikkala karavot modeli serverda o'lchandi (baland qismining o'rtasi — bosh tomoni):

| Model | Hajm x × y × z (m) | Baland qism | Natija |
|---|---|---|---|
| Karavot 2 (`41180fea…`) | 2.02 × 0.69 × 2.45 | z −0.47 | to'g'ri: bosh −Z'da |
| Karavot 1 (`92195a47…`) | 2.32 × 1.22 × 1.97 | x −1.07 | 90° burilgan: bosh −X'da |

Karavot 1 studiyada yon tomoni bilan devorga qo'yiladi. AI layout karavotning o'tish joylarini, oyoq tomonini va tumbochkalarni noto'g'ri tomonga hisoblaydi. Hozir kodda yo'nalishni tuzatadigan hech narsa yo'q.

## Maqsad va muvaffaqiyat mezoni
- Har bir karavot, divan, kreslo va stul studiyada (3-D va 2-D reja) va AI layout'da orqa tomoni devorga qarab turadi.
- Karavot 1 ga o'xshash burilgan model yuklanganda yo'nalish avtomatik aniqlanadi. Admin uni yuklash va tahrirlash oynasida ko'radi va kerak bo'lsa tuzatadi.
- Eski modellar bir martalik skript bilan tuzatiladi.
- Yo'nalishi to'g'ri modellar (Karavot 2, yo'nalish 0) bilan hech narsa o'zgarmaydi.

## Doira
**Kiradi:**
- `furniture.model_yaw` ustuni (0/90/180/270), migratsiya `1786000043`;
- yuklashda brauzerda avtomatik aniqlash (admin va sotuvchi formalari);
- admin tahrirlash oynasida qo'lda tuzatish;
- 3-D ko'rinish, 2-D reja, to'qnashuv va AI layout'da hisobga olish;
- eski modellar uchun backfill skripti.

**Kirmaydi:**
- foydalanuvchining o'z modellari (`user_models` jadvali) — alohida yo'l, keyinroq;
- model markazini (pivot) tuzatish — hozirgi xatti-harakat saqlanadi;
- shkaf, tumba, javon kabi old tomoni eshik bilan belgilanadigan buyumlarni avtomatik aniqlash — ishonchli belgi yo'q; ular uchun faqat admin tuzatadi;
- eski Expo mobil ilova (`src/`) — u GLB ko'rsatmaydi.

## Dizayn

### 1. Ma'lumot: `model_yaw` va o'lcham qoidasi
- `furniture.model_yaw SMALLINT NOT NULL DEFAULT 0`, CHECK `model_yaw IN (0, 90, 180, 270)`. Migratsiya `1786000043_model_yaw.py` (`1786000033_glb_opt_key.py` namunasi). Mavjud qatorlar 0 bo'ladi: hozirgi xatti-harakat.
- **Ma'nosi:** modelni +Y o'qi atrofida (joylashtirish `rotation` bilan bir xil yo'nalishda) shuncha gradusga burilsa, uning orqasi −Z'ga, old tomoni +Z'ga qaraydi.
- **O'lcham qoidasi:** `footprint_w/footprint_d` doim **burilgandan keyingi** o'lcham (eni = old tomon bo'ylab). Shunda o'lchamni ishlatadigan hamma joy (`sizeOf`, katalog `sizeM`, kartochkalardagi "W×D", AI menyusi, eni slayderi) o'zgarishsiz qoladi.
- **Yo'nalish juftligi o'zgarsa** (0/180 ↔ 90/270), o'lcham almashtiriladi:
  - yuklash formasida brauzer o'lchamni burilgan modeldan oladi;
  - admin PATCH'da `model_yaw` juftligi o'zgarsa va shu so'rovda o'lcham yuborilmagan bo'lsa, server `footprint_w` va `footprint_d` ni almashtiradi;
  - backfill skripti ham shunday qiladi.
- API: `FurnitureOut` (ochiq katalog), `FurnitureAdminOut`, `FurnitureUpdate`, `SellerFurnitureOut`, yuklash formalari (`model_yaw` form maydoni, ixtiyoriy, standart 0). Katalog keshi kaliti versiyasi oshiriladi (`furniture:v2:…`), aks holda eski javoblarda maydon 10 daqiqagacha bo'lmaydi.
- Frontend `CatalogFurniture.model_yaw?: number` (eski keshlangan katalogda yo'q bo'lsa 0).

### 2. Avtomatik aniqlash (`detectModelYaw`)
- Qayerda: `frontend/src/lib/modelYaw.ts`, yuklash formasidagi `ModelPreview3D` o'lchash bilan bir joyda (`onMeasured`). Brauzerda allaqachon three.js va meshopt dekoderi bor, server CPU'si esa gltf-transform'ni ishonchli ishlatmasligi mumkin.
- Faqat orqasi baland buyumlar: rol (`inferRole`, nom va kategoriyadan) `bed`, `sofa`, `armchair`, `dining_chair`, `desk_chair` bo'lsa. Qolganlarida 0.
- **Algoritm:**
  1. Modelning dunyo koordinatalaridagi nuqtalari (har mesh'dan ko'pi bilan ~5000 ta), umumiy AABB.
  2. Balandligining yuqori 25% qismidagi nuqtalar ("orqa qism").
  3. Ularning AABB markaziga nisbatan o'rtacha siljishi (dx, dz) X va Z bo'yicha mos o'lchamga bo'linadi.
  4. Kattaroq nisbiy siljish o'qi va ishorasi orqa tomonni beradi: −Z → 0, +X → 90, +Z → 180, −X → 270 (+Y atrofida o'ng qo'l qoidasi: −X'dagi orqa 270° burilganda −Z'ga tushadi, demak Karavot 1 → 270).
  5. Siljish ikkala o'qda ham o'lchamning 10% idan kichik bo'lsa (simmetrik model) → 0 va "aniqlanmadi".
- Natija formada ko'rsatiladi: "Old tomon: avtomatik aniqlandi (90°)" va tanlagich (0/90/180/270). Admin yoki sotuvchi uni o'zgartirishi mumkin.

### 3. Ko'rsatish va joylashtirish
- **3-D (`StudioFurniture.tsx`):** `FurnitureItem` va `DraggableFurnitureItem`'da `<primitive>` ichki `<group rotation={[0, yaw, 0]}>` ichiga olinadi. Tashqi aylanish (`item.rotation`, jonli `rotation.y` yozuvlari) o'zgarmaydi.
- **To'qnashuv o'lchami:** geometriyadan olinadigan yarim o'lchamlar (`onFootprint`, ~:369-392) 90/270 da almashtiriladi.
- **2-D reja (`PlanFurniture.tsx`):** `topViewOutline` konturi yaw'ga buriladi. Zaxira to'rtburchak `sizeM` dan olinadi, u allaqachon burilgandan keyingi.
- **Yuklanish o'rnidagi soya (`FurniturePlaceholder`)** `sizeM` dan foydalanadi, o'zgarmaydi.
- **AI layout** (`aiDesign.ts`, `furnitureGroups.ts`) o'lchamni katalogdan oladi, qoida bo'yicha o'zgarmaydi.

### 4. Admin tahrirlash
- `ModelEditDialog.tsx`: joylashuv tanlagichi yonida "Old tomon" tanlagichi (0/90/180/270, i18n uz/ru/en) va kichik 3-D ko'rinish (`ModelPreview3D`, yaw bilan, "old" strelkasi).
- Saqlanganda PATCH `model_yaw`; o'lcham almashtirishni server bajaradi.

### 5. Eski modellar (backfill)
- `backend/scripts/model_yaw_backfill.mjs` va uni ishga tushiruvchi `backend/scripts/model_yaw_backfill.py` (`optimize_models.py` namunasi: `--dry-run`, `--only`, `--limit`).
- Node qismi converter konteynerida ishlaydi (gltf-transform + meshoptimizer, serverda sinalgan) va 2-bo'limdagi algoritmni bajaradi. Algoritm TS va Node'da bir xil bo'lishi uchun ikkalasi bitta umumiy test to'plamidagi (sintetik model) natijalarga solishtiriladi.
- Faqat `model_yaw = 0` va `glb_key` lokal bo'lgan, orqasi baland rollar. 90/270 bo'lsa o'lcham almashtiriladi.
- Skript har o'zgarish uchun shu modeldan foydalangan joylashtirishlar sonini chiqaradi (pastga qarang).

### 6. Mavjud xonalardagi mebellar
Yaw o'zgargan modelni foydalanuvchi allaqachon qo'lda joylashtirgan bo'lsa, u xonada model yaw qadar buriladi. Bu to'g'ri tomonga burilish (avval yon tomoni devorda edi), lekin to'qnashuv o'lchami ham almashadi va mebel qo'shnisiga tegishi mumkin. Production'da hozir faqat 2 ta karavot modeli bor, shuning uchun bunga kompensatsiya qilinmaydi. Backfill bunday joylashtirishlar sonini chiqaradi.

## Xatolar va chekka holatlar
- Model yuklanmasa yoki o'lchab bo'lmasa: yaw 0, "aniqlanmadi".
- Simmetrik model (dumaloq kreslo, puf): 0.
- Noto'g'ri qiymat (masalan 45): API 422 qaytaradi; DB CHECK ham.
- Eski keshlangan katalogda `model_yaw` yo'q: 0 sifatida o'qiladi.
- Sotuvchi yuklagan model `pending` holatida; admin moderatsiyada yo'nalishni ko'radi.

## Test
- **Backend:** migratsiya (ustun, CHECK, standart 0); PATCH juftlik o'zgarganda o'lchamni almashtiradi, o'lcham ham yuborilsa almashtirmaydi; 45 → 422; ochiq katalog va admin javoblarida `model_yaw`; yuklash form maydoni; backfill `--dry-run`.
- **Frontend:**
  - `detectModelYaw`: sintetik karavot (baland bosh qismi) 4 yo'nalishda → 0/90/180/270; simmetrik quti → 0; orqasiz rol (stol) → 0.
  - `FurnitureItem` yaw guruhini qo'llaydi; `onFootprint` 90 da almashtirilgan o'lcham beradi.
  - `PlanFurniture` konturi buriladi.
  - Yuklash formasi aniqlangan yaw'ni ko'rsatadi va yuboradi; burilgan modelda o'lcham almashtirilgan.
  - `ModelEditDialog` tanlagichi PATCH'ga `model_yaw` yuboradi.
- **Production tekshiruvi:** backfill `--dry-run` Karavot 1 → 270, Karavot 2 → 0 ko'rsatadi.
