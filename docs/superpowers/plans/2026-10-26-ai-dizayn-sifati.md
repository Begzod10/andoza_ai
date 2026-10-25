# AI dizayn sifati — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The AI designer gets the room's real type, starts each style from its ready-made preset (with trim), adds gold only when asked, and keeps its own summary unless it is really wrong.

**Architecture:** A nullable `rooms.room_type` (migration 1786000042, back-filled from names) flows through the room API to the studio, wizard and AI sheet; the hard-coded `"mehmonxona"` goes. The nine presets move to a JSON file (backend copy + identical frontend copy); the backend prompt embeds the matching preset as a starting plan and accepts `trim`. `ai_design_text.py` stops flagging common words, fixes word boundaries and colour names.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, pydantic; React 18 + TS + vitest; react-i18next.

**Spec:** `docs/superpowers/specs/2026-10-26-ai-dizayn-sifati-design.md` (evidence: `docs/research/2026-10-26-ai-design-eval.md`)

## Global Constraints
- Room types, in this order: `mehmonxona, yotoqxona, bolalar, oshxona, kabinet, hammom, balkon`; `rooms.room_type String(20) NULL` with that CHECK; migration `1786000042`, `down_revision = "1786000041"`.
- Name → type back-fill (case-insensitive, first match wins, in this order): `bolalar|детск` → bolalar; `yotoq|спальн` → yotoqxona; `oshxona|кухн` → oshxona; `kabinet|ish xona|кабинет` → kabinet; `hammom|vanna|ванн|санузел` → hammom; `balkon|балкон` → balkon; `mehmon|zal|гостин` → mehmonxona; else NULL. The frontend `guessRoomType` uses the same table.
- Catalog `ROOM_TYPES` in `schemas/admin_catalog.py` is unchanged; menu mapping: `bolalar` → yotoqxona items with `bolalar|детск|kids` names first; `kabinet` → mehmonxona items with role `desk`/`desk_chair` first.
- Presets: canonical `backend/app/data/design_presets.json`, byte-identical copy `frontend/src/lib/data/design_presets.json`; contains the 9 presets (`neoklassika, zamonaviy, hitech, milliy, dark, skandinav, klassik, loft, minimalist`) and a `trimProfiles` section `{ceiling:[ids], skirting:[ids], cornice:[ids]}` matching `frontend/src/lib/trimProfiles.ts`.
- Gold line only when the prompt matches `oltin|zarhal|gold|золот`: "Oltin talab qilingan: aksent yoki oboy accent_color uchun haqiqiy oltin tus (#C9A24B yoki #B8860B)". Light line when the prompt matches `och|yorug'|светл|light`: "Aksent ham och va asosiy rangga yaqin bo'lsin".
- Starting-plan instruction (verbatim): "Shu rejadan boshlang. So'rovda aniq aytilgan narsalarni o'zgartiring, qolganini saqlang. Pol turi va naqshini, chiroq turlarini sababsiz almashtirmang."
- No-style guidance (verbatim lines): "Pol turini xona turi va atmosferaga qarab tanlang, har doim parket emas: oshxona va hammomda plitka, loft yoki sanoat ruhida beton." / "Qandil faqat klassik va neoklassik ruhda." / "So'ralmagan accent devor qo'ymang."
- Gold colour name: H 38–50°, S ≥ 0.45, L 0.35–0.65 → "oltin". Accent counts as distinct only if ΔE ≥ 10 from the main colour.
- i18n: every new UI string via `t()` in uz/ru/en (untranslated-text guard test exists); type labels under `rooms.type.<id>`.
- Node: `PATH=/Users/mac/.local/node/bin:$PATH`; backend tests `docker compose exec -T api pytest -q <path>` from repo root. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Merge = production deploy with migration; only when the user asks.

## Review Focus
1. A room whose name matches two rules ("Bolalar yotoqxonasi") gets the first rule's type (`bolalar`). Test in Task 1 and Task 5 (`guessRoomType`).
2. A prompt naming two styles ("loft va minimalist") uses the first detected style's preset only. Test in Task 3.
3. Older clients that send no `room_type` and rooms whose type is NULL still get a design (type inferred from furniture as today). Test in Task 3 (`build_user_message` with `room_type=None`).
4. A `PATCH` without `room_type` leaves an existing type untouched; `room_type: null` clears it. Test in Task 1.
5. Changing the type in the AI sheet while a design is open does not lose the current design; the next request uses the new type. Test in Task 5.

---

### Task 1: `rooms.room_type` — migration, model, API

**Files:**
- Create: `backend/alembic/versions/1786000042_room_type.py`
- Modify: `backend/app/models/room.py`, `backend/app/schemas/room.py` (`ROOM_TYPES`, `RoomCreate`, `RoomUpdate`, `RoomOut`), `backend/app/routers/rooms.py` (create/patch persist the field)
- Test: `backend/tests/test_room_type.py`

**Interfaces:**
- Produces: `ROOM_TYPES: tuple[str, ...]`; `RoomType = Literal[...]`; `guess_room_type(name: str) -> str | None` in `backend/app/services/room_type.py` (used by the migration's SQL generation and tests); `RoomOut.room_type: str | None`.

- [ ] **Step 1: Failing tests** — `test_guess_room_type` parametrized over the back-fill table incl. "Bolalar yotoqxonasi" → `bolalar`, "Спальня" → `yotoqxona`, "Xona 2" → `None`; `test_create_room_with_type`; `test_patch_room_type_set_and_clear` (absent → unchanged, `null` → None); `test_invalid_room_type_422`; `test_room_out_has_room_type`; `test_migration_backfill` (upgrade on rows named per table → types; downgrade drops column; upgrade again works) — follow the pattern of the existing migration tests in `backend/tests` (find one for 1786000040).
- [ ] **Step 2:** Run `docker compose exec -T api pytest -q tests/test_room_type.py` — Expected: FAIL.
- [ ] **Step 3:** Implement; the migration's back-fill is SQL `UPDATE rooms SET room_type=… WHERE room_type IS NULL AND name ILIKE ANY(ARRAY[...])`, one statement per table row in order.
- [ ] **Step 4:** Run the file, then the full backend suite — Expected: PASS.
- [ ] **Step 5:** Commit `"rooms.room_type: stored room type, back-filled from names"`.

### Task 2: Presets as shared JSON

**Files:**
- Create: `backend/app/data/design_presets.json`, `frontend/src/lib/data/design_presets.json` (identical), `backend/app/services/design_presets.py`
- Modify: `frontend/src/lib/aiDesignPresets.ts` (read presets from JSON; `DESIGN_PRESETS`, `presetPlan` signatures unchanged), `frontend/tsconfig*.json` only if `resolveJsonModule` is off
- Test: `backend/tests/test_design_presets.py`, `frontend/src/lib/__tests__/aiDesignPresets.test.ts`

**Interfaces:**
- Produces: `load_presets() -> dict[str, dict]` (keyed by id, cached), `trim_profiles() -> dict[str, list[str]]`; each preset has `id, furnitureStyle, walls, floor, lights, trim, furniture`.

- [ ] **Step 1: Failing tests** — backend: `test_presets_has_nine_ids` (exact set), `test_frontend_copy_identical` (reads `../frontend/src/lib/data/design_presets.json` relative to repo root; `pytest.skip` if absent), `test_trim_profiles_sections`; frontend: existing preset tests still pass plus `trim profile ids in JSON equal trimProfiles.ts ids`, `DESIGN_PRESETS ids unchanged`.
- [ ] **Step 2:** Run both — Expected: FAIL.
- [ ] **Step 3:** Generate the JSON from the current `aiDesignPresets.ts` data (values unchanged); switch the TS module to import it.
- [ ] **Step 4:** Run backend file + `npx vitest run` + `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5:** Commit `"Design presets live in one JSON shared by backend and frontend"`.

### Task 3: Prompt — start from the preset, gold/light rules, trim, room-type menu

**Files:**
- Modify: `backend/app/services/ai_designer.py` (`_SYSTEM`, `build_user_message`, `validate_plan`, `DesignPlan`, `furniture_menu`)
- Test: `backend/tests/test_ai_designer.py`

**Interfaces:**
- Consumes: Task 2 `load_presets`, `trim_profiles`; Task 1 `ROOM_TYPES`.
- Produces: `DesignPlan.trim: dict | None` (keys ceiling/skirting/cornice, values profile id or None); JSON shape gains `"trim"`.

- [ ] **Step 1: Failing tests:**
  - `test_style_prompt_embeds_starting_plan` — "Loft, g'isht va qora metall" → message contains "Boshlang'ich reja", the loft preset floor type and the verbatim starting-plan instruction;
  - `test_two_styles_use_first` — "loft va minimalist" → only loft's block;
  - `test_no_style_gets_general_guidance` — the three verbatim lines present, no "Boshlang'ich reja";
  - `test_gold_line_only_when_asked` — absent for "Neoklassik, och ranglar", present for "Klassik, oltin detallar"; `_SYSTEM` no longer contains "#C9A24B";
  - `test_light_accent_line` — present for "och ranglar";
  - `test_room_type_none_still_builds` — `room_type=None` builds a message;
  - `test_validate_plan_keeps_known_trim` / `test_validate_plan_drops_unknown_trim_profile`;
  - `test_menu_bolalar_prefers_kids_items`, `test_menu_kabinet_prefers_desk`.
- [ ] **Step 2:** Run `pytest -q tests/test_ai_designer.py` — Expected: FAIL.
- [ ] **Step 3:** Implement. Style detection uses existing `styles_in_prompt`; first style = first in `FURNITURE_STYLES` order among matches (document in a comment). Trim profiles listed in the message from `trim_profiles()`.
- [ ] **Step 4:** Run the file and the full backend suite — Expected: PASS.
- [ ] **Step 5:** Commit `"AI designer starts from the style's preset, adds gold only when asked, returns trim"`.

### Task 4: Honest summaries

**Files:**
- Modify: `backend/app/services/ai_design_text.py` (`_catalog_problems`, `_LIGHT_KINDS`, `colour_name`, `describe_plan`)
- Test: `backend/tests/test_ai_design_text.py`

- [ ] **Step 1: Failing tests** (reproduce each failure documented in the eval report):
  - `test_common_words_not_flagged` — summary saying "yog'och", "naqshli", "kulrang", "stul" with a catalog containing unchosen "Stul Yog'och naqshli" is kept;
  - `test_distinctive_unchosen_name_flagged` — mentioning an unchosen distinctive model word ("Vitrina Neo" when not chosen) is still flagged;
  - `test_shinam_is_not_track_light`;
  - `test_gold_named_oltin` — `colour_name("#C9A24B") == "oltin"`, `colour_name("#B8860B") == "oltin"`;
  - `test_same_colour_accent_not_described_as_distinct`.
- [ ] **Step 2:** Run `pytest -q tests/test_ai_design_text.py` — Expected: FAIL.
- [ ] **Step 3:** Implement per spec §3; distinctive word = token ≥ 5 chars appearing in exactly one catalog name and not in a stop-list of materials/colours/furniture kinds (define the list as a module constant).
- [ ] **Step 4:** Run the file + full backend suite — Expected: PASS.
- [ ] **Step 5:** Commit `"AI summaries survive: common words, word boundaries, gold and accent wording"`.

### Task 5: Frontend — room type everywhere

**Files:**
- Create: `frontend/src/lib/roomType.ts`
- Modify: `frontend/src/lib/api/*` room types (`room_type?: RoomType | null` on room, create, update), `frontend/src/pages/wizard/WizardPage.tsx` (type picker when a room is created, default `guessRoomType(name)`), `frontend/src/components/studio/RoomSettingsSheet.tsx` (picker, PATCH), `frontend/src/components/studio/AiBuilderSheet.tsx` (header picker; change PATCHes the room and is used by the next request), `frontend/src/pages/studio/StudioPage.tsx` and `frontend/src/pages/share/SharedRoomPage.tsx` (drop hard-coded `"mehmonxona"`; send `room.room_type ?? guessRoomType(room.name) ?? undefined`), locales `rooms.type.*` in uz/ru/en
- Test: `frontend/src/lib/__tests__/roomType.test.ts`, existing studio/wizard/AI sheet tests

**Interfaces:**
- Consumes: Task 1 `RoomOut.room_type` and PATCH.
- Produces: `type RoomType = 'mehmonxona'|'yotoqxona'|'bolalar'|'oshxona'|'kabinet'|'hammom'|'balkon'`; `ROOM_TYPES: RoomType[]`; `guessRoomType(name: string): RoomType | null`.

- [ ] **Step 1: Failing tests:**
  - `guessRoomType` table (same cases as Task 1, incl. "Bolalar yotoqxonasi" → bolalar);
  - `studio sends the room's own type to aiDesign` (room_type 'yotoqxona' → call arg 'yotoqxona', never 'mehmonxona');
  - `NULL type falls back to the guess from the name`;
  - `AI sheet picker PATCHes and the next request uses the new type` and `keeps the open design`;
  - `room settings picker PATCHes room_type`;
  - `wizard creates the room with the picked type`;
  - locale keys present in all three locales.
- [ ] **Step 2:** `npx vitest run <those files>` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Full `npx vitest run` + `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5:** Commit `"Room type is picked, saved and sent to the AI designer"`.

### Task 6: Re-run the evaluation

**Files:**
- Modify: `backend/scripts/eval_ai_design.py` (give seeded pieces a model key so `has_model=true` sees them; add the four rooms living 4.5×3.2, bedroom 4×3.5, kids 3.5×3, small 3×2.6 with their `room_type`; record the model's raw summary and whether it was kept — reuse `/private/tmp/claude-501/-Users-mac-Projects-andoza-ai/3fd8fe5c-d9c1-4c28-815c-e1f7c8f83e8c/scratchpad/ai-eval/eval_run.py` as reference)
- Modify: `docs/research/2026-10-26-ai-design-eval.md` (append "Qayta baholash" section)

- [ ] **Step 1:** Run the 13 prompts once (≤ 15 OpenAI calls) and the 9 presets; record per design: style match, gold usage, trim present, summary kept, bed present in bedrooms.
- [ ] **Step 2:** Expected: bedroom prompts contain a bed; ≥ 10/13 summaries kept; gold only in "Klassik, oltin detallar"; loft floor = preset's floor type; hi-tech has no chandelier. Score each design 1–10 as before and compare.
- [ ] **Step 3:** Clean up harness data; commit the script and the report section `"AI design re-evaluation after fixes"`.
