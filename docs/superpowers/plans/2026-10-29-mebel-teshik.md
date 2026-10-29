# Mebel teshiklar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detallarga teshiklar (konfirmat, polkoderjatel, petlya, yo'naltiruvchi), "Teshiklar" tabi, yig'ish chizmasi, PDF.

**Architecture:** `engine/holes.ts` `drillParts(parts, cabinets)` — detallarning 3D joylashuvidan (placement) tutashuvlarni topib, har detalga `holes` qo'shadi; `computeProject` oxirida chaqiradi. UI: `ui/DrillingPanel.tsx` (+ `ui/PartDrawing.tsx`), `ui/AssemblyDrawing.tsx`; PrintView'ga sahifalar.

**Tech Stack:** React + TS, vitest, SVG.

**Spec:** `docs/superpowers/specs/2026-10-29-mebel-teshik-design.md`

## Global Constraints
- Koordinatalar spec "Detal koordinatalari" bo'limi bo'yicha; qiymatlar yakuniy (finished) o'lchamda.
- Sukutlar: konfirmat Ø7 o'tib / Ø5 × 60; polkoderjatel Ø5 × 10, 37 mm, polka ostidan 5; petlya kosasi Ø35 × 12, qirradan 22.5, uchlardan 100; planka 2 × Ø5 × 12, 37 mm, ±16; yo'naltiruvchi Ø2.5 × 10, old qirradan 2+37 / 2+Ls/2 / 2+Ls−37, quti pastidan 8.
- i18n uz/ru/en. Node `export PATH=$HOME/.local/node/bin:$PATH`.

## Review Focus
1. `under_sides` taglik — konfirmat taglik ostida va yon panel pastki uchida, yon panel `B` yuzasida emas — Task 1.
2. HDF pazda (yon panel chuqurligi `D`) — `v` qiymatlari `Dc` bo'yicha to'g'ri, panel ichida — Task 1.
3. Devor/baland shkaf (tepa panel) — tepa panel konfirmatlari yon panel yuqorisida — Task 1.
4. Eshik balandligi < 300 (petlya 2 ta) va > 1600 (4 ta) — kosalar teng taqsimlangan, chetdan 100 — Task 1.
5. Teshiksiz loyiha (polka 0, fasad yo'q) — tab bo'sh holat matni, yiqilmaydi — Task 2.

---

### Task 1: Engine `holes`
Files: Create `frontend/src/features/mebel/engine/holes.ts`; Modify `engine/model.ts` (`Hole`, `Part.holes?: Hole[]`), `engine/index.ts`; Test `engine/__tests__/holes.test.ts`.
- [ ] Failing tests: spec "Testlar" qiymatlari aynan (namuna, ikki eshik, tortma); har teshik detal chegarasida; `under_sides`; devor shkafi tepa paneli; petlya soni 2/3/4 va taqsimoti.
- [ ] FAIL → implement → PASS (`npx vitest run src/features/mebel`) → commit `"Mebel engine: drilling map"`.

### Task 2: UI, yig'ish chizmasi, PDF
Files: Create `ui/DrillingPanel.tsx`, `ui/PartDrawing.tsx`, `ui/AssemblyDrawing.tsx`; Modify `pages/mebel/MebelProjectPage.tsx` (tab `drilling`), `export/PrintView.tsx`, i18n; Tests `ui/DrillingPanel.test.tsx`, `export/__tests__/PrintView.test.tsx`.
- [ ] Failing tests: tab ro'yxatida chap yon (teshiklar soni), tanlanganda SVG'da `circle[data-hole]` soni = teshiklar soni, jadval qatorlari; bo'sh loyihada `mebel.drill.empty`; PrintView'da har teshikli detal uchun `print-part` bo'limi va har shkaf uchun `print-assembly`.
- [ ] FAIL → implement → PASS (to'liq `npx vitest run`, `npx tsc --noEmit -p .`) → commit `"Mebel: drilling tab, assembly drawing and printable drilling pages"`.
