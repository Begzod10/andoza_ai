# Mebel raskroy (guillotine nesting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detallarni listlarga arrada kesiladigan (guillotine) qilib joylash, aniq list soni bilan BOM, "Raskroy" tabi va har list uchun chop etiladigan sahifa.

**Architecture:** Sof TS `nestSheets(groups, sheet, {kerf, trim})` (`engine/nest.ts`) 16 ta evristik urinishdan eng yaxshisini tanlaydi; `computeProject` uni chaqirib `Result.nesting` beradi va BOM list sonini undan oladi. UI va chop etish faqat `Result.nesting`ni o'qiydi.

**Tech Stack:** React + TS, vitest + RTL, SVG (kutubxonasiz).

**Spec:** `docs/superpowers/specs/2026-10-29-mebel-raskroy-design.md`

## Global Constraints
- Sukut: `kerf` 4 mm, `trim` 10 mm; qoldiq kamida 200×200 mm.
- Deterministik: `Math.random`, `Date` yo'q; teng natijada urinishlar tartibidagi birinchisi.
- Teksturali (`grain !== 'none'`) bo'lak hech qachon burilmaydi; uning `length` i list `length` (x) bo'ylab.
- Koordinatalar mm, `x` list uzunligi bo'ylab, `y` eni bo'ylab, (0,0) — listning chap-past burchagi (trim ichida emas).
- Matnlar faqat i18n (`mebel.nest.*`, uz/ru/en). Node: `export PATH=$HOME/.local/node/bin:$PATH`; test: `cd frontend && npx vitest run <path>`.

## Review Focus
1. Bo'lak ishchi maydondan aynan teng (masalan uzunligi 2780, trim 10, list 2800) — sig'adi, `unplaced` emas — Task 1.
2. `kerf: 0` va `trim: 0` — bo'laklar tegib turadi, kesishmaydi, invariantlar o'tadi — Task 1.
3. Faqat HDF (grain none) bo'laklar — burilish ishlatiladi va list soni burilmasdan kam yoki teng — Task 1.
4. Eski saqlangan loyiha (`kerf`/`trim` yo'q) — sukut qiymatlar bilan hisoblanadi, xato yo'q — Task 2.
5. Hamma detal sig'maydigan material (list 600×500) — `nesting` da `sheets: []`, `unplaced` to'liq, BOM list qatori 0 list, sahifa yiqilmaydi — Task 2 va Task 3.

---

### Task 1: `nestSheets` algoritmi

**Files:**
- Create: `frontend/src/features/mebel/engine/nest.ts`
- Modify: `frontend/src/features/mebel/engine/model.ts` (tiplar)
- Test: `frontend/src/features/mebel/engine/__tests__/nest.test.ts`

**Interfaces:**
- Consumes: `CutGroup` (`partIds`, `cut`, `grain`, `material`, `materialId`, `thickness`).
- Produces (model.ts): `NestPlacement { partId; x; y; length; width; rotated }`, `NestCut { x1; y1; x2; y2; order }`, `NestRect { x; y; length; width }`, `NestedSheet { placements; cuts; offcuts; utilization }`, `NestResult { material; materialId; thickness; sheet; sheets; utilization; unplaced }` (spec 2-bo'lim). nest.ts: `nestSheets(groups: CutGroup[], sheet: {length:number;width:number}, opts: {kerf:number; trim:number}): NestResult[]` — natija tartibi `groups` dagi materiallar birinchi uchragan tartibda.

Algoritm (spec 1-bo'lim): bitta urinish = `packOnce(items, sheet, opts, order, fit, split)`. Bo'sh to'rtburchak `R(x,y,l,w)` ga `a×b` bo'lak qo'yilganda: SAS/LAS qoidasiga ko'ra yo
`right = (x+a+kerf, y, l−a−kerf, b)`, `top = (x, y+b+kerf, l, w−b−kerf)` (gorizontal bo'lish: avval y bo'yicha to'liq kesim) yoki
`right = (x+a+kerf, y, l−a−kerf, w)`, `top = (x, y+b+kerf, a, w−b−kerf)` (vertikal bo'lish). SAS: qolgan `l−a` < `w−b` bo'lsa vertikal, aks holda gorizontal; LAS teskari. O'lchami ≤ 0 to'rtburchak tashlanadi. Har bo'lish kesimlar daraxtiga bitta kesim qo'shadi (`order` — joylash tartibida o'sib boradi). Bo'lak hech bir mavjud bo'sh joyga sig'masa yangi list ochiladi; yangi bo'sh listga ham sig'masa `unplaced`.

- [ ] **Step 1: Failing tests** (`nest.test.ts`):
```ts
const SHEET = { length: 2800, width: 2070 }, OPTS = { kerf: 4, trim: 10 }
// helpers: g(id, l, w, grain='length', qty=1, material='board') → CutGroup
it('the spec sample needs one LDSP and one HDF sheet', ...)        // groupParts(baseCabinetParts(600×720×560)) → board 1 list, back 1 list
it('four 600 mm cabinets need two LDSP sheets', ...)
it('a part longer than the sheet is unplaced', ...)                 // 2900×500 → unplaced ['P1'], sheets []
it('a part exactly the working length fits', ...)                   // 2780×500, trim 10 → 1 list, unplaced []
it('kerf 0 and trim 0: parts touch but never overlap', ...)
it('grained parts are never rotated; plain ones may be', ...)       // 8 × (1900×300 grain none) on 2800×2070: rotated used and ≤ the unrotated count
it('is deterministic', ...)                                          // two calls toEqual
it('holds every invariant on 200 seeded random projects', ...)      // seeded LCG; per sheet: every placement inside [trim, L−trim]×[trim, W−trim]; pairwise gap ≥ kerf on the separating axis; grained rotated===false; each partId exactly once across sheets+unplaced; guillotine: recursiveSplit(placements, cuts) puts each placement in its own leaf
it('offcuts are free rectangles at least 200×200', ...)
it('nests 30 cabinets in under 300 ms', ...)
```
- [ ] **Step 2:** `npx vitest run src/features/mebel/engine/__tests__/nest.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `nestSheets` (16 urinish: tartib {maydon↓, uzun tomon↓, eni↓, perimetr↓} × {BAF, BSSF} × {SAS, LAS}; tanlov: kam list → oxirgi listda kam detal maydoni → birinchi urinish).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `"Mebel engine: guillotine nesting"`.

### Task 2: Engine'ga ulash — sozlamalar, `Result.nesting`, BOM

**Files:**
- Modify: `engine/model.ts` (`ConstructionDefaults.kerf`, `trim`; `DEFAULTS` 4/10; `Result.nesting: NestResult[]` — `Result.sheets` olib tashlanadi), `engine/index.ts`, `engine/bom.ts` (`buildBom({ nesting, ... })`), `engine/validate.ts`, `engine/rules/baseCabinet.ts` (`resolveDefaults` eski loyihada yo'q `kerf`/`trim` ni `DEFAULTS` dan to'ldiradi), `engine/cutlist.ts` (`estimateSheets` olib tashlanadi)
- Test: `engine/__tests__/compute.test.ts`, `engine/__tests__/cutlist.test.ts` (estimateSheets testlari olib tashlanadi)

**Interfaces:**
- Consumes: Task 1 `nestSheets`.
- Produces: `Result.nesting`; BOM list qatori `qty = nesting[i].sheets.length` (unit `sheet`), kesish xizmati `Σ sheets.length`; `part_exceeds_sheet` ogohlantirishi har `unplaced` detal uchun (`cabinetId`, `params {length, width}` — detalning cut o'lchami).

- [ ] **Step 1: Failing tests** (`compute.test.ts`): `'BOM sheet count comes from the nesting'` (4 × 600 → board qatori qty 2, nesting[0].sheets.length 2); `'an old project without kerf/trim uses the defaults'` (`delete p.defaults.kerf; delete p.defaults.trim` → errors [], nesting bor); `'kerf or trim out of range is settings_invalid'` (kerf 11, trim −1, kerf NaN); `'a working area of zero is sheet_size'` (sheet 100×2070, trim 50); `'when nothing fits, the board line is 0 sheets and the parts are unplaced'` (sheet 600×500 → board qty 0, warnings `part_exceeds_sheet` ≥ 1, parts > 0). Mavjud testlar `r.sheets` → `r.nesting` ga moslanadi.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** `npx vitest run src/features/mebel` PASS. **Step 5:** Commit `"Mebel engine: exact sheet count from the nesting"`.

### Task 3: "Raskroy" tabi va sozlamalar

**Files:**
- Create: `frontend/src/features/mebel/ui/NestingPanel.tsx`, `frontend/src/features/mebel/ui/SheetDrawing.tsx`
- Modify: `ui/BomPanel.tsx` (`sheets` prop → `nesting`; chip "N list, foydalanish X%"), `ui/ParamsPanel.tsx` ("Arra kesimi, mm", "Chekka qoldiq, mm"), `pages/mebel/MebelProjectPage.tsx` (tab `nesting`), i18n uz/ru/en (`mebel.tab.nesting`, `mebel.nest.*`, `mebel.kerf`, `mebel.trim`)
- Test: `frontend/src/features/mebel/ui/NestingPanel.test.tsx`, `pages/mebel/MebelProjectPage.test.tsx`

**Interfaces:**
- Consumes: `Result.nesting`, `selectedPartId`, `onSelect`.
- Produces: `NestingPanel({ nesting, selectedPartId, onSelect, materialName })`; `SheetDrawing({ sheet: NestResult['sheet'], nested: NestedSheet, trim, showCuts, selectedPartId, onSelect, print?: boolean })` — `<svg viewBox="0 0 L W" role="img" aria-label=…>`, y o'qi SVG'da pastdan yuqoriga (transform), har detal `<g data-part-id>` (rect + ID + `length×width` + ↔ yoki ⟳), kesimlar `<line>` + tartib raqami (`showCuts`), qoldiqlar shtrix pattern + o'lcham.

- [ ] **Step 1: Failing tests:** NestingPanel — har material uchun xulosa `t('mebel.nest.summary', { name, t: thickness, n: sheets.length, p: Math.round(utilization*100) })`; har list uchun bitta `svg[role=img]`; `g[data-part-id="M1-03"]` bosilsa `onSelect('M1-03')`; `unplaced` bo'lsa `t('mebel.nest.unplaced', …)` ro'yxati. Page — tab `mebel.tab.nesting` bosilsa SVG'lar chiqadi; kerf maydoni 6 ga o'zgarsa qayta hisoblanadi (xulosa o'zgarmasa ham xato yo'q); BOM'da "≈" yo'q.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS (`npx vitest run src/features/mebel src/pages/mebel`, `npx tsc --noEmit -p .`). **Step 5:** Commit `"Mebel: cutting layout tab with sheet drawings"`.

### Task 4: Chop etish — har list alohida sahifa

**Files:**
- Modify: `frontend/src/features/mebel/export/PrintView.tsx` (ichida `<style>{"@page { size: A4 landscape }"}</style>` — butun chop etish albom)
- Test: `frontend/src/features/mebel/export/__tests__/PrintView.test.tsx`

**Interfaces:**
- Consumes: Task 3 `SheetDrawing` (`print` rejimi: qora-oq, yirik shrift), `Result.nesting`.
- Produces: `PrintView` har `NestedSheet` uchun `<section data-testid="print-sheet" style="break-before: page">` — sarlavha (`material, list i/N, foydalanish`), `SheetDrawing print showCuts`, detallar jadvali (ID, o'lcham, burilgan) va kesish tartibi ro'yxati (`order`, kesim uzunligi).

- [ ] **Step 1: Failing test:** 4 × 600 loyiha → `getAllByTestId('print-sheet')` soni = jami listlar soni (LDSP 2 + HDF 1 yoki aniq natija); har birida `svg` va detallar jadvali.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; to'liq `npx vitest run` va `npx tsc --noEmit -p .` toza. **Step 5:** Commit `"Mebel: printable sheet pages"`.
