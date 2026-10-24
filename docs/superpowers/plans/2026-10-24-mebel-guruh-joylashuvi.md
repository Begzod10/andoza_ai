# AI dizaynda mebel guruh joylashuvi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The AI designer and ready-made styles place furniture as usable groups (chairs round the table facing it, sofa against a wall facing the room, a 70 cm walkway from the door), dropping what does not fit and saying so.

**Architecture:** The backend asks the model for a `role` per piece and fills a missing/invalid one with `infer_role`. The frontend turns roles into groups; `furnitureGroups.ts` builds ranked candidate placements per group from the room's walls; `walkway.ts` checks door-to-use-point reachability on a 10 cm grid; `layoutFurniture` places the primary group first, then the rest, dropping groups that do not fit. `applyDesignPlan` uses it and reports `dropped`.

**Tech Stack:** FastAPI/pytest (backend), React 18 + TS + vitest (frontend), react-i18next.

**Spec:** `docs/superpowers/specs/2026-10-24-mebel-guruh-joylashuvi-design.md`

## Global Constraints
- Roles (exactly 14, spec §1 table): lounge = sofa, armchair, coffee_table, tv_unit; dining = dining_table, dining_chair; sleep = bed, nightstand; work = desk, desk_chair; storage = wardrobe, shelf; extra = decor, rug.
- Distances (metres): `WALL_GAP` 0.04; coffee table 0.40–0.45 in front of the sofa; armchair 0.20–0.40 ahead of the sofa front line, turned ≤ 90°; chair back space 0.60; chair tucked 0.10 under the table edge; bed sides and foot 0.60; wardrobe/shelf front 0.70; desk chair back 0.60; `PATH_WIDTH` 0.70; grid cell 0.10.
- Chairs: table long side ≥ 1.6 → 6, ≥ 1.1 → 4, else 2; reduce 6 → 4 → 2 before moving the table.
- Primary group: `mehmonxona` → lounge, `oshxona` → dining, `yotoqxona` → sleep; otherwise from roles: bed → sleep, sofa → lounge, dining_table → dining, desk → work.
- Order after primary: lounge, dining, sleep, work, storage, extra.
- Optional pieces that may drop alone: armchair, tv_unit, nightstand, decor.
- Rugs: under the primary group's centre, never collide.
- Front of a piece: studio rule, direction `(sin(rotation), cos(rotation))`.
- User's own furniture (`fromDesign` false) stays and is taken space; earlier design pieces are removed (unchanged).
- Message copy: uz "Joy yetmadi: {{list}} qo'yilmadi." / ru "Не хватило места: {{list}} не размещены." / en "Not enough room: {{list}} left out."; list items are joined with ", " (item keys in Task 5).
- Unchanged: manual placement, `lightSpot`, saved rooms, `ai_builder.py`, mobile.
- Tests run in uz; uz copy unchanged elsewhere. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Node: prefix `PATH=/Users/mac/.local/node/bin:$PATH`. Backend tests: `docker compose exec -T api pytest -q <path>` from repo root.

## Review Focus
1. A room whose only long wall carries the door: the sofa must take another wall rather than stand in the door swing or in the middle. Test in Task 4 (`lounge avoids the door wall`).
2. A tiny room (2.4 × 2.2 m) with a sofa and a dining set: the primary group stays, the other is dropped and reported, nothing overlaps. Test in Task 5.
3. A model answer listing the same chair twice or two tables: the second table becomes its own candidate group only once; duplicate chairs collapse into the generated count. Test in Task 5 (`duplicate dining pieces collapse`).
4. Catalog pieces with no footprint (null `footprint_w/d`): fallback size `0.9 × 0.7` (existing `FALLBACK_SIZE`) is used and layout still runs. Test in Task 5.
5. Language switch after a design: the "Joy yetmadi" notice is built with `t()` at apply time; acceptable as a snapshot like the other notices — no test, noted.

---

### Task 1: Backend — `role` in the AI design plan

**Files:**
- Modify: `backend/app/services/ai_designer.py` (constants near line 37; `_SYSTEM` prompt; `validate_plan` furniture loop ~lines 215–240)
- Test: `backend/tests/test_ai_designer.py`

**Interfaces:**
- Produces: `FURNITURE_ROLES: tuple[str, ...]` (the 14 roles of spec §1 in table order); `infer_role(category: str | None, name: str) -> str`; plan furniture items become `{"id", "name", "role"}` (no `zone`).

- [ ] **Step 1: Write failing tests**

```python
@pytest.mark.parametrize("category,name,role", [
    ("boshqa", "Jun gilam", "rug"), ("stol", "Jurnal stoli", "coffee_table"),
    ("boshqa", "TV tumba", "tv_unit"), ("stol", "Tumbochka", "nightstand"),
    ("stol", "Yozuv stoli", "desk"), ("divan", "Kreslo Milano", "armchair"),
    ("shkaf", "Garderob", "wardrobe"), ("shkaf", "Kitob javoni", "shelf"),
    ("divan", "Divan Roma", "sofa"), ("karavot", "Karavot", "bed"),
    ("stol", "Ovqat stoli", "dining_table"), ("stul", "Stul", "dining_chair"),
    ("boshqa", "Puf", "decor"),
])
def test_infer_role(category, name, role):
    assert infer_role(category, name) == role

def test_validate_plan_keeps_a_known_role(): ...      # role "sofa" stays
def test_validate_plan_infers_a_bad_or_missing_role(): ...  # role "throne" / absent → infer_role result
def test_validate_plan_ignores_old_zone(): ...       # {"id":"F1","zone":"wall_A"} → item has role, no "zone" key
def test_prompt_lists_roles(): ...                   # every FURNITURE_ROLES value appears in _SYSTEM
```
Each body builds a `furniture_by_label` like the existing tests in this file and asserts `plan.furniture[0]["role"]` / `"zone" not in plan.furniture[0]`.

- [ ] **Step 2: Run** `docker compose exec -T api pytest -q tests/test_ai_designer.py` — Expected: FAIL (ImportError `infer_role`).

- [ ] **Step 3: Implement** `FURNITURE_ROLES`, `infer_role` (rules exactly in spec §1 order: name regexes first, then category map, else `decor`), `validate_plan` writing `role`, and the prompt: replace the furniture `zone` line in the JSON shape with `"furniture": [{"id": "F1", "role": "<vazifa>"}]`, add a "Vazifalar:" line listing roles with their Uzbek meaning, and remove the sentences about furniture zones ("Joy (zone) faqat …", "Katta mebelni … eng uzun devor oldiga", "Har bir mebelga BOSHQA joy bering"). Keep the door/window sentence for lights only if still referenced; lights keep `zone`.

- [ ] **Step 4: Run** the same command — Expected: PASS; then `docker compose exec -T api pytest -q` — all green.

- [ ] **Step 5: Commit** `git commit -m "AI design plan carries a furniture role"`.

---

### Task 2: Frontend — roles, plan type, presets

**Files:**
- Create: `frontend/src/lib/furnitureRole.ts`
- Modify: `frontend/src/lib/api/ai.ts:53` (`furniture` item type), `frontend/src/lib/aiDesignPresets.ts` (`Kind` → role, drop `zone`)
- Test: `frontend/src/lib/__tests__/furnitureRole.test.ts`, existing `aiDesignPresets.test.ts`

**Interfaces:**
- Produces:
  - `type FurnitureRole = 'sofa'|'armchair'|'coffee_table'|'tv_unit'|'dining_table'|'dining_chair'|'bed'|'nightstand'|'desk'|'desk_chair'|'wardrobe'|'shelf'|'decor'|'rug'`
  - `type GroupId = 'lounge'|'dining'|'sleep'|'work'|'storage'|'extra'`
  - `ROLE_GROUP: Record<FurnitureRole, GroupId>`; `isRole(v: unknown): v is FurnitureRole`
  - `inferRole(category: string | null | undefined, name: string): FurnitureRole` — same rules as backend `infer_role`
  - `AiDesignPlan.furniture: Array<{ id: string; name: string; role?: FurnitureRole; zone?: string }>`

- [ ] **Step 1: Write failing tests** — `furnitureRole.test.ts`: the same 13 category/name cases as Task 1 against `inferRole`; `ROLE_GROUP.dining_chair === 'dining'`, `ROLE_GROUP.rug === 'extra'`; `isRole('throne') === false`. In `aiDesignPresets.test.ts` add: every preset plan furniture item has `role` and no `zone`; the `divan` kind maps to `sofa`, `stol` → `coffee_table`, `tumba` → `tv_unit`, `gilam` → `rug`, `shkaf` → `shelf`, `kreslo` → `armchair`.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/furnitureRole.test.ts src/lib/__tests__/aiDesignPresets.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the module, the type change, and presets (preset `furniture` entries become `{ kind }`; `presetPlan` emits `role` from a `KIND_ROLE` map).
- [ ] **Step 4: Run** the two tests, then `npx tsc --noEmit` — Expected: PASS, tsc clean (other `zone` readers in `aiDesign.ts` compile because `zone` is optional).
- [ ] **Step 5: Commit** `"Furniture roles on the frontend; presets use roles"`.

---

### Task 3: Walkway check

**Files:**
- Create: `frontend/src/lib/walkway.ts`
- Test: `frontend/src/lib/__tests__/walkway.test.ts`

**Interfaces:**
- Consumes: `RoomModel`, `Rect`, `rectCorners` from `lib/aiDesignLayout.ts`.
- Produces:
  - `type Pt = [number, number]` (world metres)
  - `doorEntries(model: RoomModel): Pt[]` — for each door opening, the point 0.40 m into the room from the door's centre.
  - `walkable(model: RoomModel, taken: Rect[], from: Pt[], to: Pt[], width?: number): boolean` — default `width = 0.7`, cell 0.10: a cell is blocked if outside the room or within `width/2` of a taken rect; true when every `to` point connects to some `from` point by 4-neighbour BFS. A `to` point that falls in a blocked cell snaps to the nearest free cell within 0.4 m, else counts as unreachable. Empty `from` (room with no door) → true.

- [ ] **Step 1: Write failing tests**
  - empty 4 × 3 room, door on wall A: `walkable(model, [], doorEntries(model), [[1, 1]])` is true;
  - a wall-to-wall bar rect splitting the room between door and target: false;
  - a 0.6 m gap between two rects: false at width 0.7, true at width 0.5;
  - room with no doors: true;
  - `doorEntries` for one door returns one point 0.40 m inside, on the door's centreline (±0.01).
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/walkway.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** as specified; grid over `model.box`, inside test with `model.inside` on a cell-sized rect.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `"Walkway check on a 10 cm grid"`.

---

### Task 4: Group placers

**Files:**
- Create: `frontend/src/lib/furnitureGroups.ts`
- Test: `frontend/src/lib/__tests__/furnitureGroups.test.ts`

**Interfaces:**
- Consumes: Task 2 types; `RoomModel`, `Rect`, `WallInfo`, `overlaps` semantics (export `overlaps` from `aiDesignLayout.ts` if not exported), `blocksOpening` rule (export it too).
- Produces:
  - `interface Piece { id: string; name: string; role: FurnitureRole; w: number; d: number; tall: boolean }`
  - `interface Placed { piece: Piece; rect: Rect }`
  - `interface GroupCandidate { placed: Placed[]; usePoints: Pt[]; dropped: Piece[]; score: number }`
  - `groupCandidates(group: GroupId, pieces: Piece[], model: RoomModel, taken: Rect[]): GroupCandidate[]` — every candidate is inside the room, overlaps nothing in `taken` or itself (except rugs), blocks no door swing and (tall pieces) no window; sorted by `score` desc. `usePoints`: sofa front centre 0.5 m out, each chair's back point 0.4 m behind it, one bed side point, wardrobe front 0.5 m out, desk chair back point.
  - `chairCount(tableLongSide: number): 2 | 4 | 6`
- Rules: spec §2 per group, distances from Global Constraints. Candidates: one per wall (lounge, sleep, work, storage anchors) or per free-floor grid point at 0.25 m (dining table), each also with reduced optional sets (dining: 6→4→2 chairs; lounge: without armchairs, then without tv_unit; sleep: without nightstands). Score: +distance from nearest door entry, +1 if no window blocked, +wall length/10; dining: +1 if within 1.5 m of a window, − distance from free-floor centre.

- [ ] **Step 1: Write failing tests** (4.5 × 3.2 room, walls A–D, one door on A, one window on C, unless stated):
  - `chairs face the table`: dining candidate with a 1.6 × 0.9 table → 6 chairs; each chair's front `(sin r, cos r)` points at the table centre within 15°;
  - `chair backs keep 0.6 m`: each chair's back point is inside the room and outside every other rect;
  - `chairCount`: 1.8 → 6, 1.2 → 4, 0.9 → 2;
  - `sofa against a wall facing in`: lounge best candidate: sofa back edge ≤ 0.06 m from its wall, front points into the room (dot with wall normal > 0.99);
  - `coffee table in front`: gap between sofa front and coffee-table back 0.40–0.45, centres aligned within 0.05 on the sofa axis;
  - `armchairs face the coffee table`: angle between each armchair front and the direction to the coffee table centre < 90°;
  - `lounge avoids the door wall`: room 5 × 3, door in the middle of the 5 m wall A → sofa is not on A;
  - `bed head on a wall with 0.6 m sides`; `nightstands beside the head`;
  - `wardrobe keeps 0.7 m in front and is not in a door swing`;
  - `L-shaped room`: using the L-shape geometry from `aiDesignHardRooms.test.ts`, the lounge candidate's rects are all `model.inside`.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/furnitureGroups.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `groupCandidates` and `chairCount`.
- [ ] **Step 4: Run** — Expected: PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `"Group placers: lounge, dining, sleep, work, storage, extras"`.

---

### Task 5: Layout orchestration, apply, notice

**Files:**
- Create: `frontend/src/lib/furnitureLayout.ts`
- Modify: `frontend/src/lib/aiDesign.ts` (`AppliedCounts`, `applyDesignPlan(plan, parts, catalog, roomType?)` furniture branch), `frontend/src/components/studio/AiBuilderSheet.tsx:138` (notice; pass `roomType` into `applyDesignPlan`), locale files (`ai.joy_yetmadi`, `ai.dropped_item_one/_other` with ru `_few/_many`)
- Test: `frontend/src/lib/__tests__/furnitureLayout.test.ts`, new `frontend/src/lib/__tests__/aiDesignLivingRoom.test.ts`, existing `aiDesign*.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `primaryGroup(roomType: string | undefined, roles: FurnitureRole[]): GroupId`
  - `layoutFurniture(pieces: Piece[], model: RoomModel, roomType: string | undefined, taken: Rect[]): { placed: Placed[]; dropped: Array<{ name: string; count: number }> }`
  - `AppliedCounts` gains `dropped: Array<{ name: string; count: number }>`; `skipped` stays = total dropped count.
- Algorithm: group pieces by `ROLE_GROUP` (role from plan, else `inferRole(category, name)`); collapse duplicate `dining_chair`/same-id pieces; place primary group first taking the first candidate whose placed rects + `taken` keep `walkable(model, all, doorEntries, allUsePoints)`; if none, take its best candidate ignoring walkway; then the rest in the Global-Constraints order, dropping a group with no passing candidate; rugs last at the primary group's centre, rotation of its anchor; everything not placed goes to `dropped` (chairs counted by how many were wanted minus placed).

- [ ] **Step 1: Write failing tests**
  - `primaryGroup`: `('mehmonxona', [...]) → 'lounge'`, `('oshxona') → 'dining'`, `('yotoqxona') → 'sleep'`, `(undefined, ['desk','bed']) → 'sleep'`, `(undefined, ['dining_table']) → 'dining'`;
  - `screenshot room` (`aiDesignLivingRoom.test.ts`): geometry 4.5 × 3.2 with a door on A and a window on C; catalog: sofa 2.3 × 0.95, dining table 1.4 × 0.8, chair 0.45 × 0.5, 2 armchairs 0.75 × 0.75, pouf 0.5 × 0.5, wardrobe 1.2 × 0.6; plan roles accordingly, `roomType 'mehmonxona'`; after `applyDesignPlan(..., 'mehmonxona')`: the sofa is placed, back ≤ 0.06 m from a wall and facing in; no two placed footprints overlap; `walkable` from the door to the sofa front is true; `applied.dropped` is non-empty if anything was left out and the notice text built by `AiBuilderSheet` contains "Joy yetmadi";
  - `tiny room` 2.4 × 2.2, sofa + dining table + chair, `mehmonxona` → sofa placed, dining group in `dropped` with the table and chairs;
  - `duplicate dining pieces collapse`: plan lists the chair id twice → chairs placed = `chairCount` result (or fewer), not doubled;
  - `missing footprint` piece uses 0.9 × 0.7 and is placed;
  - `user furniture stays`: a non-design piece in the store is untouched and nothing overlaps it;
  - update existing `aiDesign*.test.ts` expectations that asserted zone positions to the new rules (keep their intent: nothing overlaps, nothing outside, doors kept clear).
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/furnitureLayout.test.ts src/lib/__tests__/aiDesignLivingRoom.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `furnitureLayout.ts`, wire `applyDesignPlan` (sizes via existing `sizeOf`, `tall` via `tallOf`), `AppliedCounts.dropped`, and the notice: `t('ai.joy_yetmadi', { list })` where `list` joins `t('ai.dropped_item', { name, count })` with ", "; it replaces the `ai.sigmadi` text when `dropped` is non-empty. Keys: uz `joy_yetmadi` "Joy yetmadi: {{list}} qo'yilmadi.", `dropped_item_one` "{{name}}", `dropped_item_other` "{{count}} ta {{name}}"; ru "Не хватило места: {{list}} не размещены.", "{{name}}", "{{name}} ({{count}})" for few/many/other; en "Not enough room: {{list}} left out.", "{{name}}", "{{name}} ({{count}})".
- [ ] **Step 4: Run** the new tests, then the full suite `npx vitest run` and `npx tsc --noEmit` — Expected: all green.
- [ ] **Step 5: Commit** `"AI design lays furniture out in groups and names what did not fit"`.

---

## Final
Push `feat/furniture-groups`, open the PR (merge only when the user asks; merge = production deploy).
