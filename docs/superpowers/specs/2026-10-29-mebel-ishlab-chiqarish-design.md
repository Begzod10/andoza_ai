# Mebel ishlab chiqarish mini-ilovasi (MVP: oshxona pastki shkafi)

Sana: 2026-10-29. Holat: tasdiqlash uchun.

## Muammo
Mebel ustaxonalari buyurtmaning detallar ro'yxatini (cut list) qo'lda yoki qimmat desktop dasturlarda (Bazis, K3, Mozaik) hisoblaydi. Kichik ustaxona uchun bu sekin, xatoga moyil (kromka qalinligi, orqa devor chuqurligi unutiladi) va LDSP do'konining raskroy xizmatiga yuboriladigan ro'yxatni har safar qaytadan yozish kerak bo'ladi.

## Maqsad va muvaffaqiyat mezoni
Ustaxona `andozaai.uz/mebel` da shkaf turini va o'lchamlarini kiritadi; tizim deterministik konstruksiya qoidalari bo'yicha 3D ko'rinish, detallar ro'yxati, kromka, materiallar va narxni darhol hisoblaydi va raskroy xizmatiga yuboriladigan CSV/PDF beradi.

MVP tayyor:
- 3-bo'limdagi namunaviy shkaf (600×720×560) testda aynan jadvaldagi raqamlarni beradi;
- 3 modulli qator (600 + 600 + 1200) 1 daqiqada kiritiladi;
- CSV Excel'da kirillcha to'g'ri ochiladi;
- narx ustaxonaning narx daftaridan hisoblanadi, narxsiz qatorlar "narxsiz" deb ko'rinadi (0 deb emas);
- telefon, planshet va kompyuterda ishlaydi.

Foydalanuvchi: mebel ustaxonasi (B2B). Joyi: alohida `/mebel` bo'limi, oddiy akkaunt bilan, hozircha bepul.

## Doira
**Kiradi (MVP, 2-bosqich):** bitta tur — oshxona pastki shkafi (ochiq korpus: yonlar, taglik, 2 ta tepa planka, polkalar, HDF orqa); konstruksiya variantlari; kromka (tomonma-tomon, kesish ↔ yakuniy o'lcham); jamlangan cut list; kromka metri; taxminiy list soni; BOM va narx (narx daftari, xizmatlar, ustama); `/mebel` UI va 3D; backend CRUD; material katalogiga `ldsp/mdf/hdf/kromka/furnitura` toifalari; CSV va PDF eksport.

**Kirmaydi (keyingi bosqichlar):** eshik/fasad, tortmalar, devor va baland shkaflar; teshik va furnitura koordinatalari; raskroy (nesting); DXF/CNC; QR yorliqlar; AI yordamchi; 3D Room Studio integratsiyasi; obuna/to'lov.

## Raqobatchilar tahlili (qisqa)
| | Mozaik | SketchList 3D | CabDesign | Cabsmith | Korpus |
|---|---|---|---|---|---|
| Platforma | Windows | Desktop | Web | Android | Web |
| Narx (oyiga) | $125+ | $49.99+ | beta, keyin $29 | bepul / $7.49 | €9+ |
| Parametrik shkaf | ha | ha (70+ o'zgaruvchi) | ha | ha | ha + tabiiy til |
| Kromka tomonma-tomon | ha | aniqlanmadi | ha | ha | ha |
| Kesish = yakuniy − kromka | ha (almashtirgich) | aniqlanmadi | ha | hisobga olinadi | aniqlanmadi |
| Teshiklar | furnitura brendi bo'yicha | aniqlanmadi | petlya kalkulyatori | yo'q | yo'q |
| Raskroy | true-shape | hisobot | kerf, tekstura, qoldiq | kerf, tekstura, qoldiq | guillotine, tekstura |
| Narx | taxmin | ha | ha | Pro | narx daftari, QQS, ustama |
| Eksport | CSV, G-code (175+) | PDF, CSV, DXF | rejada | PDF, DXF, G-code, QR | PDF; CSV/DXF Studio'da |
| AI | render | yo'q | dizayn bo'yicha savol, rasmdan cut list | ovoz, kamera | matndan shkaf |

MDH'da: Bazis-Mebelshchik va K3-Mebel (raskroy xaritalari, CNC post-protsessorlari). Raskroy xizmatlari ulardan yoki CSV'dan ro'yxat oladi.

Olinadigan qoidalar: kesish o'lchami = yakuniy − kromka qalinligi (har kromkali tomon, o'q bo'yicha); "oldindan frezalangan" rejimi (kromka ayrilmaydi); ikkala o'lchamni ko'rsatish; kromka 4 tomonda alohida (L1/L2/W1/W2); kromka metri + zapas, metrlab narx; tekstura yo'nalishi raskroyda burishni taqiqlaydi; LDSP butun list bo'yicha narxlanadi; narxi yo'q qator "narxsiz", 0 emas (Korpus); AI faqat parametr beradi, foydalanuvchi slayder bilan tuzatadi (Korpus).

Standartlar: LDSP listi 2800×2070 (Kronospan) va 2750×1830 (mahalliy); kromka 0.4×19 (ko'rinmas qirralar), 2 mm (ko'rinadigan qirralar).

Manbalar: mozaiksoftware.com, sketchlist.com/cabinet, cabdesign.app, cabsmith.app, korpus.ro/en, bazissoft.ru, kronospan.com, prom.uz.

## Dizayn

### 1. Arxitektura
Hisoblash brauzerda, sof TypeScript engine'da. Backend faqat loyiha JSON'ini va narx daftarini saqlaydi.

```
FurnitureProject (JSON, saqlanadi)
        │
        ▼
computeProject(project, catalog)  ← sof funksiya, I/O yo'q
        │
        ▼
Result { parts[], edgeTotals[], sheets[], bom[], warnings[] }
   │          │            │            │
   ▼          ▼            ▼            ▼
 3D (R3F)  Cut list    BOM/narx     CSV/PDF eksport
```

3D, jadval, narx va eksport faqat `Result`dan o'qiydi; hech biri o'lchamni o'zi hisoblamaydi.

```
frontend/src/features/mebel/
  engine/   model.ts, rules/baseCabinet.ts, edges.ts, cutlist.ts, bom.ts, validate.ts, index.ts
  three/    CabinetView.tsx
  ui/       MebelListPage.tsx, MebelProjectPage.tsx, ParamsPanel.tsx, CutListTable.tsx, BomPanel.tsx, PriceBookDialog.tsx
  export/   csv.ts, pdf.ts
backend/app/
  models/furniture_project.py, models/price_book.py
  routers/mebel.py, schemas/mebel.py
```

O'lchamlar butun mm; faqat kromka qalinligi kasr (0.4). Kesish o'lchami 0.1 mm gacha yaxlitlanadi.

### 2. JSON modeli
```ts
interface FurnitureProject {
  schemaVersion: 1
  name: string
  defaults: ConstructionDefaults
  cabinets: CabinetSpec[]
}
interface ConstructionDefaults {
  board: { materialId: string | null; thickness: 16 | 18 }
  back: { kind: "hdf_nailed" | "hdf_groove" | "none"; thickness: 3 | 4; grooveDepth: number; grooveOffset: number }  // 8, 16
  bottomJoint: "between_sides" | "under_sides"
  edge: { visible: EdgeBandRef; hidden: EdgeBandRef; premilled: boolean }
  sheet: { length: number; width: number }          // 2800 × 2070
  railDepth: number                                 // 100
  shelfSetback: number                              // 20
  shelfGap: number                                  // 1 (har yonda)
  backGap: number                                   // 1 (har tomonda)
  edgeAllowance: number                             // 50 mm har qirraga
  edgeWaste: number                                 // 0.10
  sheetWaste: number                                // 0.15
}
interface EdgeBandRef { materialId: string | null; thickness: 0 | 0.4 | 1 | 2; width: 19 | 22 | 28 }
interface CabinetSpec {
  id: string; type: "base"; label: string
  width: number; height: number; depth: number      // tashqi, mm
  shelves: number                                   // 0..4
  overrides?: Partial<ConstructionDefaults>
  position: { x: number; z: number }
}
interface Part {
  id: string; cabinetId: string
  role: "side_left" | "side_right" | "bottom" | "rail_front" | "rail_back" | "shelf" | "back"
  material: "board" | "back"; thickness: number
  finished: { length: number; width: number }
  cut: { length: number; width: number }
  grain: "length" | "width" | "none"
  edges: { L1: EdgeSide; L2: EdgeSide; W1: EdgeSide; W2: EdgeSide }
  qty: number
  placement: { x: number; y: number; z: number; sx: number; sy: number; sz: number }  // markaz va o'lcham, mm
}
type EdgeSide = { band: "visible" | "hidden"; thickness: number } | null
interface BomLine {
  kind: "board" | "back" | "edge" | "hardware" | "service"
  materialId: string | null; label: string
  qty: number; unit: "sheet" | "m" | "dona" | "m2"
  unitPrice: number | null; total: number | null    // null = narxsiz
}
```
`L1/L2` — detal uzunligi bo'ylab yotgan tomonlar (L1 = old), `W1/W2` — kalta tomonlar (W1 = tepa).

### 3. Pastki shkaf formulalari
Belgilar: `W, H, D` tashqi; `t` LDSP; `tb` HDF; `gd` paz chuqurligi; `go` paz chekinishi.

`Dc = D − tb` (HDF mixlanadi) yoki `Dc = D` (pazda / orqa yo'q).
`Dᵢ = Dc` (mixlanadi / yo'q) yoki `Dc − go − tb` (pazda).

| Detal | Soni | between_sides | under_sides | Tekstura |
|---|---|---|---|---|
| Yon panel | 2 | `H × Dc` | `(H − t) × Dc` | length |
| Taglik | 1 | `(W − 2t) × Dc` | `W × Dc` | length |
| Old / orqa planka | 1 + 1 | `(W − 2t) × railDepth` | xuddi shunday | length |
| Polka | n | `(W − 2t − 2·shelfGap) × (Dᵢ − shelfSetback)` | xuddi shunday | length |
| HDF (mixlanadi) | 1 | `(W − 2·backGap) × (H − 2·backGap)` | xuddi shunday | none |
| HDF (pazda) | 1 | `(W − 2t + 2gd − 2·backGap) × (H − t + gd − 2·backGap)` | xuddi shunday | none |

Kromka (sukut): yon panel L1 = ko'rinadigan, W1 = ko'rinmas; taglik, old planka, polka L1 = ko'rinadigan; orqa planka va HDF — yo'q.

Kesish o'lchami (premilled = false):
`cut.length = finished.length − e(W1) − e(W2)`, `cut.width = finished.width − e(L1) − e(L2)`.

Namuna (W600 H720 D560, t18, HDF 4 mixlanadi, between_sides, 1 polka, ko'rinadigan 2 mm, ko'rinmas 0.4 mm), `Dc = 556`:

| Detal | Yakuniy | Kesish | Kromka |
|---|---|---|---|
| Yon panel ×2 | 720 × 556 | 719.6 × 554 | L1 2, W1 0.4 |
| Taglik | 564 × 556 | 564 × 554 | L1 2 |
| Old planka | 564 × 100 | 564 × 98 | L1 2 |
| Orqa planka | 564 × 100 | 564 × 100 | — |
| Polka | 562 × 536 | 562 × 534 | L1 2 |
| HDF | 598 × 718 | 598 × 718 | — |

Furnitura (faqat soni): oyoqcha 4 (`W > 800` → 6); konfirmat: taglik 2 birikma × 3, har planka 2 birikma × 2 → jami `6 + 8 = 14`; polkoderjatel `4 × n`; HDF mixi `ceil(2(W + H) / 100)`.

### 4. Cut list, kromka va BOM
- ID: `<label>-NN`, tartib barqaror (yonlar, taglik, old planka, orqa planka, polkalar, orqa devor).
- Jamlangan ro'yxat: material + qalinlik + kesish o'lchami + tekstura + 4 tomon kromkasi bir xil detallar bitta qator (`qty`, ID'lar ro'yxati). Tartib: material, qalinlik, uzunlik kamayishi bo'yicha.
- Kromka (har tur = qalinlik × eni × material): `m = Σ (tomon uzunligi + edgeAllowance) × qty / 1000`, `mWithWaste = ceil(m × (1 + edgeWaste))`.
- List (taxminiy): `m2 = Σ cut.l × cut.w × qty / 1e6`, `listlar = ceil(m2 × (1 + sheetWaste) / (sheet.l × sheet.w / 1e6))`, LDSP va HDF alohida; UI "≈ N list (taxminiy)" deydi.
- BOM qatorlari: LDSP (list), HDF (list), har kromka turi (m), furnitura (dona), kesish xizmati (list), kromkalash xizmati (m, qalinlik bo'yicha), ustama (%). Narx manbai: narx daftaridagi o'z narxi, bo'lmasa katalogdagi tanlangan material narxi, bo'lmasa `null`.
- Jami: narxli qatorlar yig'indisi; narxsiz qator bo'lsa `hasUnpriced = true` va UI ogohlantiradi.

Narx daftari (`PriceBook`, foydalanuvchiga bitta):
```ts
interface PriceBook {
  materials: Record<string, number>           // materialId → narx (katalog narxini almashtiradi)
  cutPerSheet: number | null
  bandingPerMeter: { "0.4": number | null; "1": number | null; "2": number | null }
  hardware: { leg: number | null; confirmat: number | null; shelfPin: number | null; nail: number | null }
  markupPercent: number                       // 0..300
}
```

Eksport:
- CSV: `ID;Detal;Material;Qalinlik;Uzunlik;Eni;Soni;Tekstura;Kromka L1;Kromka L2;Kromka W1;Kromka W2`, UTF-8 BOM, `;` ajratuvchi, o'nlik ajratuvchi `,` (Excel ru/uz).
- PDF: cut list, kromka jamlanmasi, BOM va narx, 3D skrinshot.

### 5. UI va backend
UI: `/mebel` — loyihalar ro'yxati; `/mebel/:id` — chapda parametrlar (loyiha sozlamalari + shkaflar), o'rtada 3D, o'ng/pastda tablar: Detallar (kesish ↔ yakuniy), Kromka, BOM va narx, Ogohlantirishlar. Detalni 3D'da yoki jadvalda bosish ikkalasida belgilaydi. Telefonda tablar ketma-ket, 3D yig'iladi. Matnlar `mebel.*` i18n kalitlari bilan (uz/ru/en). O'zgarishdan 1 s keyin avtosaqlash.

Backend:
- `furniture_projects(id, user_id, name, data JSONB, schema_version, created_at, updated_at)`;
- `price_books(user_id unique, data JSONB, updated_at)`;
- `GET/POST /mebel/projects`, `GET/PUT/DELETE /mebel/projects/{id}`, `GET/PUT /mebel/price-book`; faqat egasi (boshqasiga 404);
- Pydantic: tuzilma va chegaralar (o'lchamlar, polka soni, shkaflar ≤ 30);
- `MaterialCategory` enum'iga `ldsp, mdf, hdf, kromka, furnitura` (Alembic).

### 6. Validatsiya
- Xato (hisob to'xtaydi): `W` 150–1200, `H` 300–1000, `D` 250–700 dan tashqari; `W − 2t ≤ 0`; polka 0–4 dan tashqari; `Dᵢ − shelfSetback ≤ 0`.
- Ogohlantirish: polka uzunligi > 800 va `t = 16` (egilish); detal listga sig'maydi (burilgan holda ham, tekstura qulfini hisobga olib); narxsiz qatorlar.

### 7. Testlar
- Engine (vitest): namuna golden testi; variantlar jadvali (between/under × nailed/groove/none × 16/18); premilled → `cut == finished`; L/W o'q qoidasi; jamlash va barqaror ID; BOM `null` narx; invariantlar: yonlar + taglik tashqi eni = `W`, hamma o'lchamlar musbat, `placement` qutilari kesishmaydi.
- Backend (pytest): CRUD, begona loyiha 404, validatsiya, migratsiya.
- UI (vitest + RTL): parametr → jadval yangilanadi; CSV mazmuni.

## Bosqichlar
1. Research & Architecture — shu spec.
2. **MVP** — shu spec doirasi; PR'lar: engine → backend → UI → 3D → eksport.
3. Eshik, tortma, devor/baland shkaflar, teshik va furnitura koordinatalari, yig'ish chizmasi.
4. Raskroy: guillotine nesting (kerf, chekka qoldig'i, tekstura), list chizmalari, qoldiqlar.
5. AI yordamchi: matn → parametr JSON; engine hisoblaydi.
6. DXF/CNC, QR yorliqlar, Room Studio integratsiyasi, obuna.

## Ochiq savollar
- Sukut qoidalari (planka eni 100, polka chekinishi 20, bo'shliqlar 1 mm) ustaxonalar bilan tekshirilmagan; hammasi `ConstructionDefaults`da sozlanadi.
