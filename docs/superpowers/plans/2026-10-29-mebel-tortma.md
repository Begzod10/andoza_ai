# Mebel tortmalar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pastki shkafda 0–4 sharikli tortma: fasadlar, qutilar, yo'naltiruvchilar, BOM, UI, backend.

**Architecture:** Engine'ga `rules/drawers.ts` (`drawerParts`, `drawerFacadeOrder`, `slideLength`); `computeProject` tortmali shkafda eshik va polka o'rniga tortmalarni qo'shadi. UI shkaf kartasiga "Tortmalar" maydoni, backend chegarasi.

**Tech Stack:** React + TS, vitest; FastAPI + Pydantic, pytest.

**Spec:** `docs/superpowers/specs/2026-10-29-mebel-tortma-design.md`

## Global Constraints
- Yo'naltiruvchi har yonda 12.5 mm (jami 25); standart uzunliklar 250–550, 50 qadam; `Ls ≤ Dᵢ − 10`.
- Quti LDSP 16 mm, HDF tag ostiga mixlanadi; `hq = fasad balandligi − 40`, kamida 80.
- `drawers > 0` bo'lsa eshik va polka yo'q. Eski loyiha (`drawers` yo'q) natijasi o'zgarmaydi.
- i18n uz/ru/en; Node `export PATH=$HOME/.local/node/bin:$PATH`.

## Review Focus
1. Tortmali shkaf + MDF fasad — quti detallari cut list'da, fasadlar faqat buyurtmada — Task 1.
2. Tortmali shkaf + `facade.kind: none` — qutilar va yo'naltiruvchilar bor, fasad yo'q — Task 1.
3. Sayoz pastki shkaf (D 250) — `drawer_shallow`, sahifa yiqilmaydi — Task 1.
4. Quti 16 mm, korpus 18 mm — raskroyda alohida guruh (qalinlik bo'yicha), BOM'da alohida list qatori — Task 1.
5. `drawers: null` saqlangan (eski avto) — 0 deb o'qiladi, xato yo'q — Task 1 va Task 2.

---

### Task 1: Engine

**Files:** Create `frontend/src/features/mebel/engine/rules/drawers.ts`; Modify `engine/model.ts` (`CabinetSpec.drawers?`, `PartRole` + `drawer_front | drawer_side | drawer_end | drawer_bottom`, `PriceBook.hardware.slide`), `engine/index.ts`, `engine/bom.ts` (`HARDWARE_KEYS` + slide; `slide_<L>` qatorlari; ruchka/konfirmat), `engine/validate.ts`, `rules/carcass.ts` (`shelves` 0 when drawers), `rules/doors.ts` (eshik yo'q when drawers), i18n.
Test: `engine/__tests__/drawers.test.ts`.

**Interfaces:** `slideLength(depthInside: number): number | null`; `drawerParts(cab, d, firstIndex): Part[]` (LDSP fasadlar + qutilar); `drawerFacadeOrder(cab, d): FacadeOrderLine[]`; `drawerSlides(cab, d): { length: number; pairs: number } | null`.

- [ ] Step 1: failing tests — spec "Testlar" bo'limidagi qiymatlar aynan; `drawers null` → 0; validatsiya kodlari `drawers_range`, `drawers_type`, `drawer_low` (H 300, 4 tortma), `drawer_shallow` (D 250, HDF mixlanadi); 3D kesishmaslik; BOM `slide_500` qty 3, ruchka 3, petlya 0; 16 mm quti alohida raskroy guruhi.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: `npx vitest run src/features/mebel` PASS. Step 5: commit `"Mebel engine: drawers on base cabinets"`.

### Task 2: Backend va UI

**Files:** Modify `backend/app/schemas/mebel.py` (`drawers: int | None` 0–4; `wall`/`tall` da > 0 → 422), `backend/app/routers/mebel.py` (`_stored` `drawers` None ni ham olib tashlaydi), `backend/tests/test_mebel.py`; `frontend/src/features/mebel/ui/ParamsPanel.tsx` (pastki shkaf kartasida "Tortmalar" 0–4 tanlovi; tortma > 0 bo'lsa "Eshiklar" va "Polkalar" o'chiq), `ui/ParamsPanel` ERROR_FIELD (`drawers_*` → `drawers`), `pages/mebel/MebelProjectPage.test.tsx`, i18n.

- [ ] Step 1: failing tests — backend: `drawers 5` 422, wall `drawers 1` 422, base `drawers 3` 201, auto (`drawers` yo'q) saqlanganda kalit yo'q. UI: "Tortmalar" 3 tanlansa detallar jadvalida `mebel.part.drawer_side` qatori bor, "Fasad" (eshik) yo'q; polka maydoni `disabled`.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS; to'liq `npx vitest run`, `npx tsc --noEmit -p .`, backend `pytest tests/test_mebel.py`. Step 5: commit `"Mebel: drawers in the API and the settings panel"`.
