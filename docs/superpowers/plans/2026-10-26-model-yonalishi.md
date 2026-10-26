# Mebel modeli yo'nalishi (`model_yaw`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every furniture model's back faces local −Z everywhere (3-D, 2-D plan, collision, AI layout), via a per-model `model_yaw` that is auto-detected at upload, editable by admins and back-filled for old models.

**Architecture:** A new `furniture.model_yaw` (0/90/180/270) column; stored footprints are always post-yaw, so footprint consumers stay unchanged. The browser detects yaw at upload from the tall "back" part of the model. Renderers wrap the GLB in an inner yaw group. A Node backfill script in the converter container fixes existing rows.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic + Pydantic; React 18 + TS + R3F/three.js + vitest + react-i18next; Node 20 + @gltf-transform/core + meshoptimizer (server image).

**Spec:** `docs/superpowers/specs/2026-10-26-model-yonalishi-design.md`

## Global Constraints
- `model_yaw` values: exactly `0, 90, 180, 270` (degrees). Default `0`. DB: `SMALLINT NOT NULL DEFAULT 0`, CHECK `ck_furniture_model_yaw` `model_yaw IN (0, 90, 180, 270)`. Migration id `1786000043`, down_revision `1786000042`.
- Meaning: rotating the model about +Y by `model_yaw` degrees (three.js `rotation.y = yaw·π/180`, the same sense as a placement's `rotation`) makes its back face −Z and its front +Z. Back on −X → 270, +X → 90, +Z → 180, −Z → 0.
- `footprint_w/footprint_d` are always the post-yaw size (width along the front). When yaw parity changes (0/180 ↔ 90/270), w and d swap.
- Auto-detection only for roles `bed`, `sofa`, `armchair`, `dining_chair`, `desk_chair` (`inferRole` / `infer_role`). Every other role gets 0.
- Detection: the top 25% of height is the "back" part; normalised offsets `dx/sizeX` and `dz/sizeZ` of its mean from the AABB centre; both below `0.10` → 0 and `detected: false`.
- Catalog cache key prefix becomes `furniture:v2:` (`backend/app/routers/catalog.py:~184`).
- All user-visible text goes through i18n keys in uz/ru/en (the untranslated-text guard test).
- Merge to master deploys production with migrations; do not push or merge.

## Review Focus
1. An admin changes yaw 90 → 270 (same parity): footprints must NOT swap. Test in Task 1 (`test_patch_same_parity_keeps_footprint`).
2. A cached old catalog item without `model_yaw` renders exactly as today (yaw 0). Test in Task 3 (`renders an item without model_yaw unrotated`).
3. A user who placed a 90°-yawed model and rotates it by hand: the live `rotation.y` writes still turn only the outer group, and the inner yaw stays. Test in Task 3 (`live rotation keeps the inner yaw`).
4. A symmetric round armchair or pouf is not given a random yaw. Test in Task 2 (`a symmetric model is not turned`).
5. Backfill run twice does not swap footprints back. It only touches rows with `model_yaw = 0`. Test in Task 5 (`test_backfill_skips_rows_already_turned`).

---

### Task 1: Backend column, API and PATCH swap

**Files:**
- Create: `backend/alembic/versions/1786000043_model_yaw.py` (template: `1786000033_glb_opt_key.py`)
- Modify: `backend/app/models/furniture.py` (next to `placement` ~:78), `backend/app/schemas/catalog.py:8` `FurnitureOut`, `backend/app/routers/catalog.py:134,184` (`_furniture_out`, cache key), `backend/app/schemas/admin_catalog.py:105,123` (`FurnitureUpdate`, `FurnitureAdminOut`), `backend/app/routers/admin_catalog.py:244,479` (upload form field, `update_furniture`), `backend/app/schemas/seller.py:100` (`SellerFurnitureOut`), `backend/app/routers/seller.py:216` (upload form field)
- Test: `backend/tests/test_model_yaw.py`

**Interfaces:**
- Produces: `ModelYaw = Literal[0, 90, 180, 270]` in `backend/app/schemas/admin_catalog.py`; `model_yaw: int` on `FurnitureOut`, `FurnitureAdminOut`, `SellerFurnitureOut`; `model_yaw: ModelYaw | None` on `FurnitureUpdate`; multipart form field `model_yaw` (int, default 0) on both upload endpoints; helper `apply_model_yaw(furniture, new_yaw: int, footprint_sent: bool) -> None` in `backend/app/services/model_yaw.py` (swaps `footprint_w/d` when the parity changes and `footprint_sent` is false, then sets `model_yaw`).

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_model_yaw.py`, following `test_admin_catalog.py` fixtures and auth helpers:
  - `test_migration_adds_model_yaw_with_check`: the migration module's `upgrade` adds the column with `server_default="0"` and creates `ck_furniture_model_yaw` (mock `op` as in `test_room_type.py`).
  - `test_patch_parity_change_swaps_footprint`: a row 232×197, yaw 0. PATCH `{"model_yaw": 270}` gives yaw 270, w=197, d=232.
  - `test_patch_same_parity_keeps_footprint`: yaw 90, 197×232. PATCH 270 keeps 197×232.
  - `test_patch_with_footprint_does_not_swap`: PATCH `{"model_yaw": 90, "footprint_w": 200, "footprint_d": 160}` stores exactly 200×160.
  - `test_patch_bad_yaw_is_422`: `{"model_yaw": 45}` gives 422.
  - `test_catalog_and_admin_out_carry_model_yaw`: the public `/catalog/furniture` item and the admin list item both have `model_yaw`.
  - `test_upload_takes_model_yaw_form_field`: admin upload with `model_yaw=270` stores 270. Without the field it stores 0.
- [ ] **Step 2: Run them and see them fail.** Run: `docker exec andoza_ai-api-1 pytest -q tests/test_model_yaw.py`. Expected: FAIL (no column / field).
- [ ] **Step 3: Implement.** Add the column and the CHECK in the model and the migration (downgrade drops the constraint, then the column). Add the schema fields, `apply_model_yaw` and its use in `update_furniture` (`footprint_sent` = `footprint_w` or `footprint_d` in `model_fields_set`, applied before the generic setattr loop, and `model_yaw` excluded from that loop). Add the upload form fields validated against `ModelYaw` (an invalid value is 422) and the `furniture:v2:` cache key.
- [ ] **Step 4: Run the whole suite.** Run: `docker exec andoza_ai-api-1 pytest -q`. Expected: all pass.
- [ ] **Step 5: Commit** — `git commit -m "Furniture: model_yaw column, API and footprint swap"`.

### Task 2: Yaw detection and upload forms

**Files:**
- Create: `frontend/src/lib/modelYaw.ts`, `frontend/src/lib/__tests__/modelYaw.test.ts`, `frontend/src/lib/__tests__/fixtures/modelYawCases.json`
- Modify: `frontend/src/pages/dokon/admin/ModelPreview3D.tsx:39-57` (`onMeasured` also reports the scene's sample points or the detected yaw), `frontend/src/pages/dokon/admin/ModelFormDialog.tsx:~89,207`, `frontend/src/pages/seller/SellerModelFormDialog.tsx:~82,161`, `frontend/src/lib/api/admin.ts:126-138`, `frontend/src/lib/api/seller.ts:~109`, locales uz/ru/en
- Test: `modelYaw.test.ts`, `ModelFormDialog.test.tsx`

**Interfaces:**
- Consumes: the upload form field `model_yaw` (Task 1).
- Produces:
  - `export type ModelYaw = 0 | 90 | 180 | 270`
  - `export function yawFromPoints(points: ReadonlyArray<readonly [number, number, number]>): { yaw: ModelYaw; detected: boolean }`
  - `export function detectModelYaw(scene: THREE.Object3D, role: FurnitureRole | null): { yaw: ModelYaw; detected: boolean }`: samples ≤5000 world-space vertices per mesh; returns `{yaw: 0, detected: false}` for roles outside the Global Constraints list.
  - `export function turnedSize(size: { w: number; d: number }, yaw: ModelYaw): { w: number; d: number }`: swaps w and d for 90/270.
  - `export const MODEL_YAWS: ModelYaw[] = [0, 90, 180, 270]`.
  - `modelYawCases.json`: an array of `{ name, points: [x,y,z][], yaw, detected }`. It holds a synthetic bed (box 2×0.4×1.6 mattress plus a 2×1.0×0.1 headboard slab) turned to back −Z, +X, +Z and −X, a symmetric box, and a cylinder-like ring. Task 5 reuses this file.

- [ ] **Step 1: Write the failing tests.**
  - `modelYaw.test.ts`, `yawFromPoints` over every fixture case: expect `yaw` and `detected` as listed. Back −Z → 0, +X → 90, +Z → 180, −X → 270.
  - `modelYaw.test.ts`, `a symmetric model is not turned`: the box and the ring give `{yaw: 0, detected: false}`.
  - `modelYaw.test.ts`, `detectModelYaw` on a three.js group built from the bed slabs rotated so that the back is at −X: `{yaw: 270, detected: true}`. The same group with role `dining_table`: `{yaw: 0, detected: false}`.
  - `modelYaw.test.ts`, `turnedSize({w: 2.32, d: 1.97}, 270)` gives `{w: 1.97, d: 2.32}`; with yaw 180 it is unchanged.
  - `ModelFormDialog.test.tsx`, `shows the detected front and sends model_yaw with the turned footprint`: mock the preview's measured callback with size 232×197 and yaw 270 detected. The form shows the i18n text for "Old tomon: avtomatik aniqlandi (270°)" and a select whose value is 270. Submit sends `model_yaw=270`, `footprint_w=197`, `footprint_d=232`. Changing the select to 0 sends 0, 232, 197.
- [ ] **Step 2: Run and see them fail.** Run (from `frontend/`): `PATH=/Users/mac/.local/node/bin:$PATH npx vitest run src/lib/__tests__/modelYaw.test.ts src/pages/dokon/admin/ModelFormDialog.test.tsx`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.**
  - `modelYaw.ts`. Mapping: the larger normalised offset wins; dz<0 → 0, dx>0 → 90, dz>0 → 180, dx<0 → 270.
  - Preview and forms: the role comes from `inferRole(category, name)`, so a category or name change re-detects. Footprints are passed through `turnedSize` before `sizeFields`.
  - Seller form: the same behaviour.
  - i18n keys `models.front_label`, `models.front_auto` (with `{{deg}}`), `models.front_none`, `models.front_option` (with `{{deg}}`).
- [ ] **Step 4: Run.** Run the full vitest suite, then `npx tsc --noEmit`. Expected: all pass, tsc clean.
- [ ] **Step 5: Commit** — `git commit -m "Model upload detects the model's front"`.

### Task 3: Rendering, collision and plan

**Files:**
- Modify:
  - `frontend/src/lib/api/catalog.ts:9` (`model_yaw?: number`)
  - `frontend/src/lib/furnitureCatalog.ts:125` (`catalogToFurnitureEntry` carries `modelYaw`)
  - the furniture entry type (where `sizeM`/`autoScale` are declared)
  - `frontend/src/features/studio/StudioFurniture.tsx:152-197` (`FurnitureItem`) and `:234-472` (`DraggableFurnitureItem`: geometry half-extents ~:369-392, primitive ~:466)
  - `frontend/src/features/studio/PlanFurniture.tsx:~89,149`
- Test: `frontend/src/features/studio/StudioFurniture.yaw.test.tsx`, `frontend/src/features/studio/PlanFurniture.test.tsx` (create if missing)

**Interfaces:**
- Consumes: `ModelYaw` and `turnedSize` (Task 2); `model_yaw` in the catalog (Task 1).
- Produces: `entry.modelYaw: ModelYaw` (0 when missing); `yawRadians(yaw: number | undefined): number` exported from `modelYaw.ts`.

- [ ] **Step 1: Write the failing tests.**
  - `renders an item without model_yaw unrotated`: an inner group with rotation.y 0, outer rotation equal to `item.rotation`.
  - `turns the model by its yaw inside the placement rotation`: entry yaw 90 gives an inner group with rotation.y ≈ π/2 and outer = `item.rotation`.
  - `live rotation keeps the inner yaw`: on a draggable item, after the rotate gesture or handler sets a new rotation, the inner yaw is unchanged and the outer group has the new value.
  - `reports a turned collision footprint`: a geometry AABB of 2.32×1.97 with yaw 270 makes `onFootprint` get half-extents 0.985/1.16 (w/2, d/2 swapped).
  - `PlanFurniture`, `the plan outline turns with the yaw`: the outline hull of an asymmetric shape with yaw 90 equals the yaw-0 hull rotated by 90° (compare the bounds).

  Use the existing R3F test setup in `StudioFurniture.pick.test.tsx` as the template.
- [ ] **Step 2: Run and see them fail.** Run: `npx vitest run src/features/studio`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Inner `<group rotation={[0, yawRadians(entry.modelYaw), 0]}>` around `<primitive>` in both renderers. Live `rotation.y` writes keep targeting the outer object.
  - Geometry footprint half-extents pass through `turnedSize`.
  - Plan outline points are rotated by the yaw before the placement rotation.
- [ ] **Step 4: Run.** Run the full vitest suite and tsc. Expected: pass.
- [ ] **Step 5: Commit** — `git commit -m "Studio turns each model by its yaw"`.

### Task 4: Admin edit control

**Files:**
- Modify: `frontend/src/pages/dokon/admin/ModelEditDialog.tsx:44-129`, `frontend/src/lib/api/admin.ts:75,148`, locales
- Test: `frontend/src/pages/dokon/admin/ModelEditDialog.test.tsx`

**Interfaces:**
- Consumes: `MODEL_YAWS`, `yawRadians` (Tasks 2–3); PATCH `model_yaw` (Task 1); `ModelPreview3D` (accepts a new optional `yaw?: ModelYaw` prop that turns the preview and draws a front arrow).
- Produces: nothing used later.

- [ ] **Step 1: Write the failing tests.**
  - `ModelEditDialog`, `shows the model's front and saves a new one`: a fixture with `model_yaw: 0` and `glb_url`. The select labelled "Old tomon" has value 0. Choose 270 and save, and the PATCH payload contains `model_yaw: 270` and no footprint fields.
  - `ModelEditDialog`, `leaves model_yaw out when unchanged`.
- [ ] **Step 2: Run and see them fail.** Run: `npx vitest run src/pages/dokon/admin/ModelEditDialog.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** The select sits next to the placement select. The small preview uses `ModelPreview3D` with `yaw` when `glb_url` exists. `AdminFurniture.model_yaw: number`.
- [ ] **Step 4: Run.** Run the full vitest suite and tsc. Expected: pass.
- [ ] **Step 5: Commit** — `git commit -m "Admin can set a model's front"`.

### Task 5: Backfill for existing models

**Files:**
- Create: `backend/scripts/model_yaw_detect.mjs`, `backend/scripts/model_yaw_backfill.py` (template: `backend/scripts/optimize_models.py`)
- Test: `backend/tests/test_model_yaw_backfill.py`

**Interfaces:**
- Consumes: `apply_model_yaw` (Task 1); `frontend/src/lib/__tests__/fixtures/modelYawCases.json` (Task 2) for parity.
- Produces:
  - `model_yaw_detect.mjs`:
    - CLI `node model_yaw_detect.mjs <file.glb>...` prints one JSON line per file: `{file, yaw, detected, size: [x, y, z]}`.
    - `--points <cases.json>` runs `yawFromPoints` over fixture points and prints `[{name, yaw, detected}]`.
    - It loads `@gltf-transform/core`, `@gltf-transform/extensions` and `meshoptimizer` via `createRequire('/usr/local/lib/node_modules/@gltf-transform/cli/package.json')`.
    - It has the same `yawFromPoints` algorithm as Task 2.
  - `model_yaw_backfill.py`:
    - `--dry-run`, `--only <id>`, `--limit N`.
    - Selects rows with `model_yaw = 0`, a local `glb_key` (not `http`), and a role (`infer_role(category, name_uz)`) in the Global Constraints list.
    - Runs the detector on `media/<glb_key>` and calls `apply_model_yaw(row, yaw, footprint_sent=False)` when `detected`.
    - Prints one line per row: `name, old→new yaw, footprint before→after, placements=<count of room furniture rows using this furniture id>`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_model_yaw_backfill.py`:
  - `test_detector_matches_frontend_cases`: run `node backend/scripts/model_yaw_detect.mjs --points frontend/src/lib/__tests__/fixtures/modelYawCases.json`. Each result equals the case's `yaw` and `detected`. Skip if `node` or the fixture is missing (as the JSON parity test skips).
  - `test_backfill_dry_run_changes_nothing`: patch the detector call to return 270 and detected. In dry-run the row stays at 0 and 232×197, and the output line has "0→270".
  - `test_backfill_turns_and_swaps`: without dry-run the row becomes 270 and 197×232.
  - `test_backfill_skips_rows_already_turned`: a row with yaw 270 is not selected; running twice leaves 197×232.
  - `test_backfill_skips_roles_without_a_back`: a dining table is not selected.
- [ ] **Step 2: Run and see them fail.** Run: `docker exec andoza_ai-api-1 pytest -q tests/test_model_yaw_backfill.py`. Expected: FAIL.
- [ ] **Step 3: Implement** both scripts. The Python script calls the detector by subprocess (`node`, with a timeout of 60 s per file). Detector errors are reported and skipped.
- [ ] **Step 4: Run.** Run the full backend suite. Expected: pass.
- [ ] **Step 5: Commit** — `git commit -m "Backfill: detect existing models' front"`.
- [ ] **Step 6: Production dry-run (read-only, after merge only, with the user's go-ahead).** Run `docker exec andoza_ai-converter-1 python scripts/model_yaw_backfill.py --dry-run`. Expected: Karavot 1 0→270 with 232×197→197×232, Karavot 2 unchanged.
