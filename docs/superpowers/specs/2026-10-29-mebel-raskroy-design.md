# Mebel: raskroy (listga joylash va kesish xaritasi)

Sana: 2026-10-29. Holat: tasdiqlash uchun. Oldingi spec: `2026-10-29-mebel-ishlab-chiqarish-design.md` (4-bosqich).

## Muammo
`/mebel` LDSP va HDF list sonini maydon × (1 + 15%) bilan taxmin qiladi. Ustaxona listni o'zi formatno-raskroy stanogida kesadi: unga har bir list uchun arrada kesiladigan (guillotine) xarita, aniq list soni va qoldiqlar kerak. Taxmin ba'zan bir list kam yoki ortiq chiqadi, narx ham shunga mos noto'g'ri bo'ladi.

## Maqsad va muvaffaqiyat mezoni
- Har bir material (material + materialId + qalinlik) uchun detallar listlarga guillotine usulida joylanadi; BOM'dagi list soni shu joylashdan olinadi va "taxminiy" emas.
- "Raskroy" tabida har bir list o'lchamga mos chizma: detallar (ID, o'lcham, tekstura/burilish belgisi), kesish chiziqlari tartibi bilan, ≥ 200×200 qoldiqlar, foydalanish foizi.
- PDF (chop etish) har bir listni alohida A4 albom sahifada, detallar jadvali va kesish tartibi bilan beradi.
- Natija deterministik; 30 shkaf (~250 detal) 300 ms dan tez.

## Doira
**Kiradi:** sof TS `nestSheets` engine funksiyasi; `kerf` va `trim` sozlamalari; `Result.nesting`; BOM list soni joylashdan; "Raskroy" tabi (SVG); chop etish sahifalari; sig'magan detallar ro'yxati; testlar.

**Kirmaydi:** qoldiqlar ombori va qayta ishlatish; CNC/DXF; xaritani qo'lda tahrirlash; bitta materialda turli o'lchamli listlar; Web Worker.

## Dizayn

### 1. Algoritm
- Guruhlash: `groupParts` natijasidan material + materialId + qalinlik bo'yicha; `qty` bo'yicha alohida bo'laklarga yoyiladi (har bo'lak `partId` bilan, `CutGroup.partIds` tartibida).
- Ishchi maydon: `(L − 2·trim) × (W − 2·trim)`, koordinatalar ishchi maydonning chap-past burchagidan (mm). List koordinatasi: `x` uzunlik bo'ylab (0..L), `y` eni bo'ylab (0..W); joylashuv `x = trim + …`.
- Bo'lak o'lchami: `length` (x bo'ylab) × `width` (y bo'ylab) = kesish o'lchami. Teksturali (`grain !== 'none'`) bo'lak burilmaydi; `grain: 'none'` bo'lak sig'masa yoki yaxshiroq joy bo'lsa 90° burilishi mumkin (`rotated: true`, o'lchamlari almashadi).
- Guillotine joylash: bo'sh to'rtburchaklar ro'yxati; bo'lak tanlangan qoidaga ko'ra (BAF — eng kam qolgan maydon; BSSF — eng kam qolgan qisqa tomon) bo'sh to'rtburchakka qo'yiladi; qolgan joy ikkita to'rtburchakka bo'linadi (SAS — qisqa qoldiq o'qi bo'yicha, LAS — uzun qoldiq o'qi bo'yicha):
  - o'ng: `(x + l + kerf, y, W_r − l − kerf, h_split)`, ust: `(x, y + w + kerf, w_split, H_r − w − kerf)` — bo'lish yo'nalishiga qarab; manfiy yoki nol o'lchamli to'rtburchak tashlanadi.
  - Har bo'lish bitta to'g'ri kesim: kesimlar daraxti saqlanadi va `cuts` (kesish tartibi bilan, daraxtni oldindan aylanib) shundan chiqadi.
- Bo'lak hech bir bo'sh joyga (yangi to'liq listga ham) sig'masa — `unplaced`.
- Urinishlar: tartib {maydon ↓, uzun tomon ↓, eni ↓, perimetr ↓} × qoida {BAF, BSSF} × bo'lish {SAS, LAS} = 16. Eng yaxshisi: eng kam list; teng bo'lsa oxirgi listdagi detal maydoni eng kichigi (katta qoldiq qoladi); yana teng bo'lsa urinishlar tartibidagi birinchisi.
- Qoldiqlar: listdagi bo'sh to'rtburchaklardan ikkala tomoni ≥ 200 mm bo'lganlari.
- Foydalanish: `Σ bo'lak maydoni / (listlar soni × L × W)` (list maydoni, trim bilan).

### 2. Model
```ts
interface NestPlacement { partId: string; x: number; y: number; length: number; width: number; rotated: boolean }
interface NestCut { x1: number; y1: number; x2: number; y2: number; order: number }
interface NestRect { x: number; y: number; length: number; width: number }
interface NestedSheet { placements: NestPlacement[]; cuts: NestCut[]; offcuts: NestRect[]; utilization: number }
interface NestResult {
  material: 'board' | 'back'; materialId: string | null; thickness: number
  sheet: { length: number; width: number }
  sheets: NestedSheet[]; utilization: number; unplaced: string[]
}
function nestSheets(groups: CutGroup[], sheet: { length: number; width: number }, opts: { kerf: number; trim: number }): NestResult[]
```
- `ConstructionDefaults`: `kerf` (sukut 4), `trim` (sukut 10); eski loyihada yo'q bo'lsa sukut ishlatiladi (`resolve`da to'ldiriladi). `sheetWaste` qoladi (eski loyihalar), lekin hisobda ishlatilmaydi.
- `Result.sheets: SheetEstimate[]` o'rniga `Result.nesting: NestResult[]`. BOM: list qatori `qty = sheets.length` har material uchun; kesish xizmati jami listlar soni.
- Ogohlantirish `part_exceeds_sheet` endi `unplaced` dan olinadi (har sig'magan detal uchun bitta).
- Validatsiya: `kerf` chekli son 0–10, `trim` chekli son 0–50, aks holda `settings_invalid`; ishchi maydon (`L − 2·trim`, `W − 2·trim`) musbat bo'lmasa `sheet_size`.

### 3. UI va PDF
- "Raskroy" tabi (`mebel.tab.nesting`): material bo'yicha xulosa (`LDSP 18 mm: 3 list, 87%`); har list kartasida SVG (`viewBox` = list mm), list konturi, trim chizig'i, detallar (ID, `uzunlik×eni`, teksturali ↔, burilgan ⟳), kesish chiziqlari va tartib raqamlari (yoqib/o'chirish), qoldiqlar shtrixlangan va o'lchami bilan. Detal bosilsa `selectedPartId` (jadval va 3D bilan bir xil). Sig'magan detallar qizil ro'yxatda.
- Sozlamalar paneli: "Arra kesimi, mm", "Chekka qoldiq, mm".
- BOM: list qatorlari "taxminiy" yozuvisiz; "≈ N list" chipi o'rniga "N list, foydalanish X%".
- Chop etish: har list alohida sahifa (`break-before: page`, albom), qora-oq chizma, ostida detallar jadvali (ID, o'lcham, burilgan) va kesish tartibi.
- i18n: uz/ru/en `mebel.nest.*`.

### 4. Testlar
- Invariantlar (200 ta tasodifiy, urug'i qat'iy loyiha): hamma bo'lak joylangan yoki `unplaced`da, aynan bir marta; bo'laklar kesishmaydi va oralig'i ≥ kerf (bir xil qatordagi qo'shni bo'laklar uchun); hammasi ishchi maydon ichida; teksturali bo'lak `rotated === false`; guillotine: list `cuts` bilan rekursiv bo'linib, har bo'lak alohida qismga tushadi.
- Golden: spec namunasi → LDSP 1 list, HDF 1 list; 4 × 600 shkaf → LDSP 2 list; bitta 720×2900 detal (list 2800) → `unplaced`.
- Determinizm: ikki chaqiruv natijasi `toEqual`.
- Tezlik: 30 shkaf < 300 ms.
- UI: tab listlar sonini ko'rsatadi; SVG'da detal bosilsa tanlanadi; sig'magan detal ro'yxatda; BOM list soni joylashdan.

## Ochiq savollar
- Sukut `kerf` 4 mm va `trim` 10 mm ustaxona stanogiga qarab o'zgaradi; sozlamada.
