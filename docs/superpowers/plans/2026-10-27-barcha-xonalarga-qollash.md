# Barcha xonalarga qo'llash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One button applies the current room's AI design or ready-made style to every other room of the apartment: the same surfaces and lights, furniture by each room's type, the user's own pieces kept, one-step undo, and stale rooms skipped.

**Architecture:**
- The design is computed on the client. `applyDesignPlan` is split into a pure `designRoomState`. `planForRoom` builds a plan for another room from the source plan, which is either a preset or an AI plan.
- Each other room is saved with `PATCH /rooms/{id}`, carrying a new optional `expected_updated_at` guard that returns 409 when the room changed.
- `DesignPlan` gains `style` (the preset id the AI started from).

**Tech Stack:** FastAPI + SQLAlchemy async + Pydantic; React 18 + TS + TanStack Query + zustand + vitest + react-i18next.

**Spec:** `docs/superpowers/specs/2026-10-27-barcha-xonalarga-qollash-design.md`

## Global Constraints
- Rooms in scope: those of the current room's apartment (`getRooms(aptId)`), excluding the current room. The button shows only when the apartment has ≥ 2 rooms.
- Same for every room: walls (main paint/oboy), ceiling, skirting, cornice, light style, and the floor. Room-specific rules then apply:
  - oshxona and hammom get floor `{type: 'tile', pattern: null, tint: null}`;
  - a tile floor carried into a dry room becomes `{type: 'laminate', pattern: null, tint: null}`;
  - hammom gets no oboy (it becomes paint in the base colour), no chandelier, pendant or floor_lamp, and a ceiling light.
- Furniture: `presetPlan(style, catalog, roomType, wallIds, roomSize).furniture`. Pieces flagged `fromDesign` are replaced; the user's own pieces and lights stay.
- Room type: `effectiveRoomType(room.room_type, room.name)`, falling back to `'mehmonxona'`.
- Wall remap for AI plans: a source wall at index `i` maps to `target.wallIds[i % target.wallIds.length]`. A zone that can't be mapped becomes `center`.
- PATCH guard: when `expected_updated_at` differs from the room's `updated_at`, return 409 and write nothing. When the field is absent, behaviour is unchanged.
- All user-visible text goes through `ai.*` i18n keys in uz/ru/en, with `_one`/`_other` plurals.
- Merging to master deploys to production. Do not push or merge.

## Review Focus
1. **A room never opened before** (`state` null): it gets a full design built from `DEFAULT_DESIGN_STATE`, with its geometry taken from the API. Test in Task 4.
2. **Undo after the user has edited a target room in another tab:** that room is not overwritten, and the notice says so. Test in Task 4.
3. **The current room's apply and undo still behave exactly as today.** Test in Task 2, where the existing tests run unchanged.
4. **A 3-wall room receiving a 4-wall AI plan:** the accent and lights land on real walls, with no dead `wallCoverings` keys. Test in Task 3.
5. **The catalog has nothing for a room type:** the room still gets surfaces and lights, and the confirm list says "mebel topilmadi". Test in Tasks 3 and 5.

---

### Task 1: Backend — PATCH guard and plan style

**Files:**
- Modify:
  - `backend/app/schemas/room.py` (`RoomUpdate`: `expected_updated_at: datetime | None`)
  - `backend/app/routers/rooms.py:~323-369` (the PATCH handler)
  - `backend/app/services/ai_designer.py` (the `DesignPlan` dataclass ~:124-139; `design_room`, where `starting_preset` is computed ~:829)
  - `backend/app/routers/ai.py` (if the response is built field by field)
- Test: `backend/tests/test_rooms_patch_guard.py`, `backend/tests/test_ai_designer.py`

**Interfaces:**
- Produces:
  - `PATCH /rooms/{id}` body field `expected_updated_at`. The 409 detail is the i18n message key `room_changed` (add ru/en to `app/i18n/messages.py`).
  - The AI design response field `style: str | None`. It is the preset id from `starting_preset(...)`, the room-type default included, or None.

- [ ] **Step 1: Write the failing tests.**
  - `test_patch_with_matching_updated_at_writes`
  - `test_patch_with_stale_updated_at_is_409_and_writes_nothing`
  - `test_patch_without_guard_unchanged`
  - `test_design_plan_style_named` ("loft" gives "loft")
  - `test_design_plan_style_room_default` (no style in a yotoqxona gives "skandinav")
  - `test_design_plan_style_none_with_image`
- [ ] **Step 2: Run the tests and watch them fail.** Run `docker exec andoza_ai-api-1 pytest -q tests/test_rooms_patch_guard.py tests/test_ai_designer.py -k "patch or style"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Compare the timestamps at microsecond precision, both timezone-aware.
  - The check must run before any write.
- [ ] **Step 4: Run the full suite.** Run `docker exec andoza_ai-api-1 pytest -q`. Expected: all pass.
- [ ] **Step 5: Commit.** Message: "Rooms: a guarded PATCH; AI plans name the style they started from".

### Task 2: Frontend — pure `designRoomState`

**Files:**
- Modify:
  - `frontend/src/lib/aiDesign.ts` (`applyDesignPlan` ~:171-286)
  - `frontend/src/lib/aiDesignPresets.ts` (export `bathroomWalls` and `bathroomLights` for reuse)
- Test: `frontend/src/lib/__tests__/designRoomState.test.ts`

**Interfaces:**
- Produces:
  - `export function designRoomState(prev: { designState: DesignState; furniture: PlacedFurniture[]; lights: PlacedLight[] }, geometry: RoomGeometry, plan: AiDesignPlan, parts: DesignParts, catalog: CatalogFurniture[], roomType?: string): { designState: DesignState; furniture: PlacedFurniture[]; lights: PlacedLight[]; applied: AppliedCounts }`
    - It is pure: it never touches `useRoomStore`.
    - Item ids use `nanoid` as today.
  - `applyDesignPlan(plan, parts, catalog, roomType)` keeps its signature. It reads the store, calls `designRoomState`, and writes the result back, matching today's setter semantics:
    - `setWallCovering('ALL')` replaces the whole map;
    - the ceiling-keep rule stays.
  - Use the existing store and type names; check `store/types.ts`.

- [ ] **Step 1: Write the failing tests.**
  - `designRoomState keeps the user's own furniture and lights`
  - `replaces only fromDesign items`
  - `does not touch the store` (spy on `useRoomStore.setState`)
  - `equals what applyDesignPlan writes for the same input`
- [ ] **Step 2: Run the tests and watch them fail.** Run `npx vitest run src/lib/__tests__/designRoomState.test.ts`. Expected: FAIL (not exported).
- [ ] **Step 3: Implement the extraction.**
- [ ] **Step 4: Run the full vitest suite and `npx tsc --noEmit`.** Expected: all existing `aiDesign*` tests pass unchanged.
- [ ] **Step 5: Commit.** Message: "AI design: a pure designRoomState under applyDesignPlan".

### Task 3: Frontend — `planForRoom`

**Files:**
- Create:
  - `frontend/src/lib/planForRoom.ts`
  - `frontend/src/lib/__tests__/planForRoom.test.ts`

**Interfaces:**
- Consumes:
  - `presetPlan`, `roomSizeOf`, and `bathroomWalls`/`bathroomLights` (from Task 2);
  - `effectiveRoomType`;
  - `apiGeometryToStoreGeometry` (`lib/apiRoomGeometry.ts:74`) and `roomModel`;
  - `AiDesignPlan.style` (from Task 1).
- Produces:
  - `export type DesignSource = { kind: 'preset'; id: string } | { kind: 'ai'; plan: AiDesignPlan; wallIds: string[] }`
    - `wallIds` are the source room's.
  - `export function planForRoom(source: DesignSource, target: { geometry: RoomGeometry; wallIds: string[]; roomType: string; size?: RoomSize }, catalog: CatalogFurniture[]): AiDesignPlan`
  - `export function styleOfPlan(plan: AiDesignPlan, catalog: CatalogFurniture[], roomType: string): string`
    - Returns `plan.style` if it is set.
    - Otherwise returns the furnitureStyle shared by the most catalog styles among the plan's furniture, mapped to a preset id (the preset whose id equals the style, else the first whose `furnitureStyle` matches).
    - Otherwise returns the room-type default: mehmonxona/oshxona → zamonaviy; yotoqxona/bolalar/balkon → skandinav; kabinet/hammom → minimalist.

- [ ] **Step 1: Write the failing tests.**
  - The preset source gives exactly `presetPlan(...)` for the target.
  - With an AI source, the target keeps the source's walls/floor/trim, and its furniture is `presetPlan(styleOfPlan(...)).furniture` for the target type.
  - The accent on source wall index 2 lands on `target.wallIds[2 % n]`, and a 3-wall target uses index 2.
  - A `corner_W1_W2` light maps by index, and an unmappable zone becomes `center`.
  - An oshxona target gets a tile floor; a dry target given a tile floor gets laminate.
  - A hammom target gets painted walls, no chandelier/pendant/floor_lamp, and a ceiling light.
  - `styleOfPlan`: with `style` set, inferred from the catalog, and with the room default.
  - A catalog with nothing for the type gives `furniture: []` and keeps the surfaces.
- [ ] **Step 2: Run the tests and watch them fail.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and tsc.** Expected: all pass.
- [ ] **Step 5: Commit.** Message: "AI design: a plan for another room of the apartment".

### Task 4: Frontend — applying and undoing across rooms

**Files:**
- Create:
  - `frontend/src/lib/applyToRooms.ts`
  - `frontend/src/lib/__tests__/applyToRooms.test.ts`
- Modify:
  - `frontend/src/lib/api/rooms.ts` (`updateRoom` accepts `expected_updated_at`; a 409 surfaces as a typed error, `RoomChangedError`)

**Interfaces:**
- Consumes: `designRoomState` (Task 2), `planForRoom` (Task 3), `getRooms`, `updateRoom`, and the PATCH guard (Task 1).
- Produces:
  - `export type RoomOutcome = { roomId: string; name: string; status: 'applied' | 'changed' | 'failed' }`
  - `export type RoomsUndo = Array<{ roomId: string; name: string; prevState: unknown; writtenAt: string }>`
  - `export async function applyToOtherRooms(args: { aptId: string; currentRoomId: string; source: DesignSource; parts: DesignParts; catalog: CatalogFurniture[] }): Promise<{ outcomes: RoomOutcome[]; undo: RoomsUndo }>`
    - It reads `getRooms(aptId)` and skips `currentRoomId`.
    - For each room it computes and merges `{...state, designState, furniture, lights}`. A null `state` starts from `DEFAULT_DESIGN_STATE`, with the geometry from `room.geometry`.
    - It sends PATCH with `expected_updated_at: room.updated_at` for every room in parallel, using `Promise.allSettled`.
    - It records `writtenAt` from each response's `updated_at`.
  - `export async function undoOtherRooms(undo: RoomsUndo): Promise<RoomOutcome[]>`
    - It PATCHes each `prevState` with `expected_updated_at: writtenAt`.
    - A 409 gives `'changed'`.
  - `export function previewOtherRooms(rooms, source, catalog): Array<{ roomId; name; roomType; guessed: boolean; furnitureNames: string[] }>`
    - This feeds the confirm list.
    - It is pure and reuses `planForRoom`.

- [ ] **Step 1: Write the failing tests.** Mock the API module.
  - Three other rooms are PATCHed with merged state and the guard.
  - A never-opened room gets a full design.
  - A 409 room gives `'changed'` and the others still apply.
  - A network error gives `'failed'`.
  - Undo restores `prevState` with guard `writtenAt`.
  - Undo of a room changed since gives `'changed'` and leaves it untouched.
  - `previewOtherRooms` lists types, the guessed flag, and furniture names.
  - An empty furniture list shows as none.
- [ ] **Step 2: Run the tests and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite and tsc.** Expected: all pass.
- [ ] **Step 5: Commit.** Message: "AI design: apply to and undo from the apartment's other rooms".

### Task 5: Frontend — the button, the confirm list, the notice

**Files:**
- Modify:
  - `frontend/src/components/studio/AiBuilderSheet.tsx` (`commit`/`revert` ~:143-157, :260-272; the floating bar ~:503-530)
  - `frontend/src/pages/studio/three-d/ThreeDOverlaySheets.tsx:~101` (pass `aptId`)
  - locales uz/ru/en
- Test: `frontend/src/components/studio/AiBuilderSheet.test.tsx`

**Interfaces:**
- Consumes: `applyToOtherRooms`, `undoOtherRooms` and `previewOtherRooms` (Task 4); `['apt-rooms', aptId]` (`useFlatRooms`).
- Produces: UI only.
  - **Button:** "Barcha xonalarga qo'llash" appears after a design is applied, and only when the apartment has ≥ 2 rooms.
  - **Confirm dialog:** a list of rooms, each with its type ("(taxmin)" if guessed) and furniture names, or "mebel topilmadi". It has a "Qo'llash" button.
  - **After apply:** a notice, either "{{count}} ta xonaga qo'llandi" or one listing the rooms skipped and why: `ai.rooms_changed` / `ai.rooms_failed`.
  - **Cache:** invalidate `['apt-rooms', aptId]`, plus `['room', id]` and `['studio-nav-total', id]` for each applied room.
  - **Undo:** "Qaytarish" restores the current room as today, then calls `undoOtherRooms`, and shows skipped rooms in the notice.
  - **New design:** after a new variant is applied, the multi-room undo info is cleared, and the other rooms keep the last bulk result until the user applies again.

- [ ] **Step 1: Write the failing tests.**
  - The button is hidden with 1 room and shown with 3.
  - The confirm list shows the types, the guessed mark and the furniture.
  - Confirming calls `applyToOtherRooms` with the current source (preset id or AI plan with wallIds).
  - The notice shows counts and the skipped rooms.
  - Undo calls `undoOtherRooms` and shows the changed rooms.
  - Every new string exists in uz/ru/en.
- [ ] **Step 2: Run the tests and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full vitest suite and tsc.** Expected: all pass.
- [ ] **Step 5: Commit.** Message: "Studio: apply the design to every room of the apartment".
