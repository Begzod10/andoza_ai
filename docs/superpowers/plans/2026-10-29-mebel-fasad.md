# Mebel fasad, devor va baland shkaflar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/mebel` ga devor va baland shkaf turlari, LDSP/MDF fasad (eshik) va tegishli furnitura.

**Architecture:** Engine'da umumiy korpus yordamchisi (`rules/carcass.ts`) va tur bo'yicha qoidalar (`base`, `wall`, `tall`), fasad `rules/doors.ts` da. LDSP fasad oddiy `Part` (`material: 'facade'`) bo'lib cut list va raskroyga o'zi tushadi; MDF fasad `Result.facadeOrder` ga. UI va backend turga moslashtiriladi.

**Tech Stack:** React + TS, vitest + RTL, R3F; FastAPI + Pydantic, pytest.

**Spec:** `docs/superpowers/specs/2026-10-29-mebel-fasad-design.md`

## Global Constraints
- Eski saqlangan loyiha (`type` va `facade` yo'q) natijasi avvalgidek: `type` → `'base'`, `facade` → `{ kind: 'none', materialId: null, thickness: 18, gap: 2 }`. Yangi loyiha (`newProject`) → `facade.kind: 'ldsp'`.
- Fasad: `length = H − gap`, `width = floor(W / n − gap)`; `n` = `doors ?? (W > 600 ? 2 : 1)`.
- Chegaralar: base W150–1200 H300–1000 D250–700 polka 0–4; wall W150–1200 H300–1000 D200–400 polka 0–4; tall W150–1200 H1200–2400 D300–650 polka 0–8. Fasad tirqishi 0–5, qalinligi 16/18/19.
- Petlya: `H ≤ 900 → 2`, `≤ 1600 → 3`, aks holda 4 (har eshikka). Ruchka 1/eshik. Oyoqcha: base, tall (eni > 800 → 6, aks holda 4); wall 0. Ilgak: wall 2. Konfirmat: base 14, wall/tall 12.
- Devor shkafi 3D'da pastki qirrasi `y = 1400`.
- Matnlar i18n (uz/ru/en). Node `export PATH=$HOME/.local/node/bin:$PATH`. Frontend test `cd frontend && npx vitest run <path>`; backend `cd backend && <venv>/bin/python -m pytest <path> -q`.

## Review Focus
1. `doors: 0` — fasad detali ham, buyurtma qatori ham, petlya/ruchka ham yo'q — Task 2.
2. LDSP fasad `materialId` korpus LDSP bilan bir xil — raskroyda baribir korpus bilan bitta guruh bo'lishi mumkin (bir material), lekin kromka metri to'g'ri — Task 2.
3. Turini `base` → `tall` ga o'zgartirilgan shkaf (o'lchami 720 qolgan) — `height_range` xatosi, sahifa yiqilmaydi — Task 1 va Task 4.
4. MDF fasad tanlangan, material narxi yo'q — BOM fasad qatori `unpriced`, jami narxsiz qatorlarsiz — Task 2.
5. Pastki va devor shkaflari aralash qator — 3D'da devor shkaflari pastkilar ustida, kesishmaydi — Task 4 (meshSpecs testi).

---

### Task 1: Korpus turlari (`base`, `wall`, `tall`) va validatsiya

**Files:**
- Create: `frontend/src/features/mebel/engine/rules/carcass.ts`, `rules/wallCabinet.ts`, `rules/tallCabinet.ts`, `rules/index.ts`
- Modify: `engine/model.ts` (`CabinetSpec.type`, `doors?`, `PartRole` + `'top' | 'door'`, `Part.material` + `'facade'`, `ConstructionDefaults.facade`, `DEFAULTS`/`newCabinet(label, x, type = 'base')`), `rules/baseCabinet.ts` (umumiy qismlar `carcass.ts` ga), `engine/validate.ts` (`LIMITS` turga ko'ra), `engine/index.ts` (`withDefaults` `type`/`facade` to'ldiradi; `cabinetParts` tur bo'yicha)
- Test: `engine/__tests__/cabinetTypes.test.ts`; mavjud `baseCabinet.test.ts` o'zgarishsiz o'tishi kerak

**Interfaces:**
- Produces: `cabinetParts(cab: CabinetSpec, d: ConstructionDefaults): Part[]` (`rules/index.ts`; fasadsiz korpus); `wallCabinetParts`, `tallCabinetParts` (bir xil imzo); `LIMITS_BY_TYPE: Record<CabinetSpec['type'], { width; height; depth; shelves }>`; `newCabinet(label: string, x: number, type?: CabinetSpec['type']): CabinetSpec` (turga mos sukut o'lcham/polka).
- Detal tartibi (ID uchun): base o'zgarmaydi; wall/tall: `side_left, side_right, bottom, top, shelf×n, back`.

- [ ] **Step 1: Failing tests** (`cabinetTypes.test.ts`):
  - `'wall 600×720×300 matches the spec'` — `[id, role, finished.l, finished.w]`: `M1-01 side_left 720 296`, `M1-02 side_right 720 296`, `M1-03 bottom 564 296`, `M1-04 top 564 296`, `M1-05 shelf 562 276`, `M1-06 back 598 718`; top L1 visible band.
  - `'tall 600×2100×560 has four shelves'` — `newCabinet('M1', 0, 'tall')` → H 2100, D 560, shelves 4; parts 2 side + bottom + top + 4 shelf + back.
  - `'groove back on a wall cabinet sits in top and bottom'` — back `(600−36+16−2) × (720−36+16−2)`.
  - `it.each(['wall','tall'] × ['hdf_nailed','hdf_groove','none'] × [16,18])` — outer box W×H×D, no overlap (groove back × sides/bottom/top exempt).
  - `'limits follow the type'` — wall depth 450 → `depth_range`; tall height 720 → `height_range`; tall shelves 8 ok, 9 → `shelves_range`.
  - `'an old project without type is a base cabinet'` — `delete cab.type` → result equals the same project with `type: 'base'` (`toEqual` on parts).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** `npx vitest run src/features/mebel` PASS. **Step 5:** Commit `"Mebel engine: wall and tall cabinets"`.

### Task 2: Fasad, furnitura va BOM

**Files:**
- Create: `frontend/src/features/mebel/engine/rules/doors.ts`
- Modify: `engine/index.ts` (fasadlar, `facadeOrder`), `engine/bom.ts` (`hardwareCounts(cab, d)` yangi qoidalar; MDF fasad qatori; `PriceBook.hardware` + `hinge`, `handle`, `hanger`), `engine/model.ts` (`Result.facadeOrder`, `BomLine.kind` + `'facade'`, `EMPTY_PRICE_BOOK`), `engine/validate.ts` (`doors_range`, fasad `settings_invalid`), `ui/format.ts` (`bomLabel` fasad/yangi furnitura), i18n (`mebel.part.door`, `mebel.part.top`, `mebel.material.facade`, `mebel.bom.hinge|handle|hanger|facade`, `mebel.error.doors_range`)
- Test: `engine/__tests__/doors.test.ts`

**Interfaces:**
- Produces: `doorCount(cab: CabinetSpec): number`; `doorParts(cab, d, firstIndex: number): Part[]` (LDSP; ID davom etadi: korpusdan keyin); `facadeOrderLines(cab, d): FacadeOrderLine[]` (MDF); `type FacadeOrderLine = { id: string; cabinetId: string; length: number; width: number; qty: number; materialId: string | null }`.
- 3D: fasad `placement.z` = korpus old tekisligi + `thickness/2` (korpus oldida), eshiklar orasida `gap`.

- [ ] **Step 1: Failing tests** (`doors.test.ts`):
  - `'600 base, one LDSP door 718×598, cut 714×594, all four sides banded'`.
  - `'800 base gets two doors 718×398'`; `'doors: 0 means no door, no hinge, no handle'`.
  - `'LDSP doors nest apart from the carcass when their material differs'` — `facade.materialId 'oak'` → `nesting` da `material: 'facade'` guruhi.
  - `'MDF doors are an order line, not a part'` — `facadeOrder` [{length 718, width 598, qty 1}], `parts` da `door` yo'q, BOM `kind: 'facade', unit: 'm2', qty: 0.429`; narx yo'q → `total null`.
  - `'hinges by height'` — base 720 → 2/eshik; tall 2100 → 4/eshik; H 1200 → 3.
  - `'wall cabinet: two hangers, no legs, 12 confirmats'`.
  - `'old project without facade has no doors'` — `delete p.defaults.facade` → no door parts, no facadeOrder.
  - `'doors 3 is doors_range'`; `'facade gap 6 is settings_invalid'`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS (`src/features/mebel`). **Step 5:** Commit `"Mebel engine: doors (LDSP and MDF) and hardware"`.

### Task 3: Backend validatsiyasi

**Files:**
- Modify: `backend/app/schemas/mebel.py` (`CabinetIn.type: Literal['base','wall','tall'] = 'base'`, `doors: int | None` 0–2, turga mos chegaralar `model_validator` bilan; `PriceBookData` o'zgarmaydi)
- Test: `backend/tests/test_mebel.py`

- [ ] **Step 1: Failing tests:** `test_accepts_wall_and_tall_cabinets` (wall 600×720×300, tall 600×2100×560 → 201); `test_rejects_out_of_range_for_the_type` (wall depth 450, tall height 720, base height 2100 → 422); `test_rejects_doors_3` (422); `test_old_cabinet_without_type_is_base` (type yo'q, H 720 → 201; H 2100 → 422).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** `pytest tests/test_mebel.py -q` PASS. **Step 5:** Commit `"Mebel API: cabinet types and their size limits"`.

### Task 4: UI — turlar, eshiklar, fasad sozlamasi, MDF buyurtmasi, 3D, PDF

**Files:**
- Create: `frontend/src/features/mebel/ui/FacadeOrder.tsx`, `frontend/src/features/mebel/export/facadeCsv.ts`
- Modify: `ui/ParamsPanel.tsx` (qo'shish menyusi Pastki/Devor/Baland; kartada tur belgisi va "Eshiklar" Avto/0/1/2; "Fasad" guruhi: turi, material — `ldsp` yoki `mdf` katalogi, qalinlik, tirqish), `useMebelProject.ts` (`mdf` katalogi ham), `pages/mebel/MebelProjectPage.tsx` (BOM tabida `FacadeOrder`, CSV tugmasi), `three/CabinetView.tsx` (`meshSpecs`: fasad rangi; devor shkafi `y` + 1400 — engine `placement.y` da emas, `meshSpecs` da), `export/PrintView.tsx` (MDF bo'lsa fasad bo'limi), `ui/CutListTable` (fasad nomi), i18n
- Test: `ui/FacadeOrder.test.tsx`, `export/__tests__/facadeCsv.test.ts`, `three/CabinetView.test.tsx`, `pages/mebel/MebelProjectPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 `Result.facadeOrder`, `FacadeOrderLine`.
- Produces: `facadeOrderCsv(lines: FacadeOrderLine[], labels: { cabinet(id: string): string; material(id: string | null): string }): string` — sarlavha aynan `Shkaf;Uzunlik;Eni;Soni;Material;m²`, UTF-8 BOM, CRLF, `;`, o'nlik vergul, formula himoyasi (mavjud `csv.ts` dagi `cell`/`num` ni eksport qilib qayta ishlatish); `FacadeOrder({ lines, total, materialName, labelOf })`.

Ruling for the implementer: devor shkafining `y` siljishi faqat 3D'da (`meshSpecs(parts, sel, { center, wallLift: (cabId) => number })`), engine `placement` korpusning o'z koordinatasida qoladi — engine invariantlari (W×H×D, polda) o'zgarmaydi.

- [ ] **Step 1: Failing tests:** facadeCsv — sarlavha, `1;718;598;1;MDF Oq;0,429` qatori, formula himoyasi; FacadeOrder — qatorlar, jami m²; CabinetView — devor shkafi detallari `y ≥ 1.4` m, pastki shkaf bilan kesishmaydi, fasad rangi alohida; Page — "Shkaf qo'shish" menyusidan "Devor" → kartada `M2` va D 300; "Eshiklar" 0 → detallar jadvalida "Fasad" yo'q; fasad turi MDF → BOM tabida fasad buyurtmasi va CSV tugmasi; tall turidagi shkaf H 720 → `height_range` xatosi.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; to'liq `npx vitest run`, `npx tsc --noEmit -p .`. **Step 5:** Commit `"Mebel: cabinet types, doors and the MDF facade order in the UI"`.
