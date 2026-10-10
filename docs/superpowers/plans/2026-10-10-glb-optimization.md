# GLB optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every catalog and user-uploaded GLB is also served as a compressed copy (meshopt geometry, WebP textures at most 2048 px), and the original stays untouched.

**Architecture:**
- Two nullable columns hold the key of the compressed copy. URL builders prefer that key and fall back to the original.
- A Celery task on the existing `converter` queue runs `gltf-transform optimize` in a temp dir and stores `<key>.opt.glb` only when the copy is smaller. Uploads enqueue the task best-effort, and deletes remove the copy too.
- A one-off script backfills the existing models.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Celery, Node `@gltf-transform/cli@4.1.1`, React/three.js (`three-stdlib` MeshoptDecoder).

**Spec:** `docs/superpowers/specs/2026-10-10-glb-optimization-design.md`

## Global Constraints

- Optimize command, verbatim: `gltf-transform optimize <in> <out> --compress meshopt --texture-compress webp --texture-size 2048 --simplify false`. Never simplify.
- Subprocess time limit: 300 s.
- Compressed key: the original key with its trailing `.glb` replaced by `.opt.glb`.
- Keys starting with `http` are external URLs. They are never optimized.
- Columns: `furniture.glb_opt_key`, `user_models.opt_key`, both `String(255)`, nullable, in migration `1786000033` (revises `1786000032`).
- Original files are never modified or deleted by the optimizer.
- API response shapes stay the same: `glb_url` and `url` simply point at the compressed file when there is one.
- Never commit or push unless the user asks. The "commit" steps below are checkpoints only.

## Review Focus

1. **Model deleted while its task is queued.** The task must find no row and return without error, and it must not upload an orphan file. Test in Task 3.
2. **Optimizer output not smaller, empty, non-zero exit, or timed out.** Nothing is uploaded and the column stays null. Test in Task 2.
3. **Broker down at upload time.** The upload still returns 201 and the original is served. Test in Task 3.
4. **User re-imports the same file (same sha256).** Only the metadata is updated, nothing is enqueued, and an existing `opt_key` is kept. Test in Task 3.
5. **Script re-run after a partial run.** Models that already have an opt key are skipped. Test in Task 5.

---

### Task 1: Columns and URL selection

**Files:**
- Create: `backend/alembic/versions/1786000033_glb_opt_key.py`
- Modify: `backend/app/models/furniture.py`, `backend/app/models/user_model.py`
- Modify: URL builders in `backend/app/routers/catalog.py:137`, `backend/app/routers/admin_catalog.py:91`, `backend/app/routers/seller.py:89`, `backend/app/routers/user_models.py:40`
- Create: `backend/app/core/model_files.py`
- Test: `backend/tests/test_glb_opt_urls.py`

**Interfaces:**
- Produces, in `app/core/model_files.py`:
  - `opt_key_for(key: str) -> str`: replaces a trailing `.glb` with `.opt.glb`, otherwise appends `.opt.glb`.
  - `served_key(original: str, opt: str | None) -> str`: returns `opt or original`.
  - `model_keys(original: str | None, opt: str | None) -> list[str]`: returns the non-empty keys, for deletion.

- [ ] **Step 1:** Write the failing tests.
  - `opt_key_for("furniture/a.glb") == "furniture/a.opt.glb"` and `opt_key_for("x") == "x.opt.glb"`.
  - `served_key("a.glb", None) == "a.glb"` and `served_key("a.glb", "a.opt.glb") == "a.opt.glb"`.
  - API: after `furniture.glb_opt_key` is set in the DB, `GET /catalog/furniture` returns `glb_url` ending in `.opt.glb`. With it null, the URL ends in `.glb` and not in `.opt.glb`. Same check for `GET /user-models` (`url`).
- [ ] **Step 2:** Run `docker compose exec -T api python -m pytest tests/test_glb_opt_urls.py -q`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the module, the columns and the migration. Make the four builders call `served_key(...)`.
- [ ] **Step 4:** Run the test plus `tests/test_admin_catalog.py tests/test_seller.py tests/test_user_models.py`. Expected: PASS. Run `alembic upgrade head` inside the api container. Expected: head is `1786000033`.
- [ ] **Step 5:** Checkpoint (no commit unless asked).

### Task 2: The optimizer

**Files:**
- Create: `backend/app/services/glb_optimizer.py`
- Test: `backend/tests/test_glb_optimizer.py`

**Interfaces:**
- Produces:
  - `optimize_glb_bytes(data: bytes, *, timeout: float = 300.0, cli: str = "gltf-transform") -> bytes | None`
    - Writes `in.glb` to a `tempfile.TemporaryDirectory()`.
    - Runs the Global-Constraints command with `subprocess.run(..., timeout=timeout, capture_output=True)`.
    - Returns the output bytes only if the exit code is 0, the output is non-empty, and `len(out) < len(data)`. Otherwise returns `None` and logs `glb_optimize_skipped` with a reason.
    - `FileNotFoundError` (CLI missing) and `TimeoutExpired` also return `None`.

- [ ] **Step 1:** Write failing tests. Monkeypatch `subprocess.run` with a fake that writes a chosen `out.glb`:
  - `test_smaller_output_is_returned`
  - `test_bigger_or_equal_output_is_rejected` returns `None`
  - `test_nonzero_exit_returns_none`
  - `test_timeout_returns_none` (fake raises `subprocess.TimeoutExpired`)
  - `test_missing_cli_returns_none` (fake raises `FileNotFoundError`)
  - `test_command_is_exactly_the_spec`: assert that the argv passed after `cli` equals `["optimize", <in>, <out>, "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "2048", "--simplify", "false"]`
- [ ] **Step 2:** Run `pytest tests/test_glb_optimizer.py -q`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Checkpoint.

### Task 3: The task, and enqueue on upload

**Files:**
- Modify: `backend/app/tasks/media.py` (new task), `backend/celery_app.py` (route `app.tasks.media.optimize_model_glb` to `converter`)
- Create: `backend/app/services/model_optimize_queue.py`
- Modify: `backend/app/routers/admin_catalog.py` (`upload_furniture_model`), `backend/app/routers/seller.py` (`upload_furniture`), `backend/app/routers/user_models.py` (`POST`, new-row branch only)
- Test: `backend/tests/test_optimize_model_task.py`

**Interfaces:**
- Consumes:
  - `optimize_glb_bytes` (Task 2);
  - `opt_key_for` (Task 1);
  - `download_file`, `upload_file` from `app.core.storage`.
- Produces:
  - Celery task `optimize_model_glb(kind: str, model_id: str) -> dict`, where `kind` is `"furniture"` or `"user_model"`, named `app.tasks.media.optimize_model_glb`, on queue `converter`, with `max_retries=0`. Its body is `asyncio.run(_optimize_model(kind, model_id))`.
  - `async _optimize_model(kind, model_id) -> dict`. Uses its own engine and session, as `_with_room` does. Steps:
    1. Load the row. Return `{"status": "missing"}` if it is gone.
    2. Skip (`{"status": "skipped"}`) if the original key starts with `http` or the opt key is already set.
    3. Download the file, then run `optimize_glb_bytes` in a thread (`anyio.to_thread.run_sync`). Return `{"status": "not_smaller"}` on `None`.
    4. Upload to `opt_key_for(original)` with `content_type="model/gltf-binary"`.
    5. Re-load the row. If it is gone now, delete the uploaded copy and return `"missing"`. Otherwise set the column, commit, and return `{"status": "ok", "before": n, "after": m}`.
  - `enqueue_optimize(kind: str, model_id: str) -> None` in `model_optimize_queue.py` calls `optimize_model_glb.delay(...)` inside `try/except Exception`, logging `glb_optimize_enqueue_failed`. The routers call it after the row is created, via `run_after_commit` where the router already uses it, otherwise right after flush.

- [ ] **Step 1:** Write failing tests:
  - `_optimize_model` with storage and optimizer monkeypatched:
    - `ok` sets the column to `furniture/x.opt.glb`;
    - `not_smaller` leaves it null;
    - an http key returns `skipped` and never downloads;
    - a missing row returns `missing` and never uploads;
    - a row deleted between download and save makes the uploaded copy get deleted.
  - Routers:
    - each of the three uploads calls `enqueue_optimize` once with the new id (monkeypatch);
    - a user-model re-import of the same bytes does not call it;
    - when `enqueue_optimize`'s `.delay` raises, the upload still returns 201.
- [ ] **Step 2:** Run `pytest tests/test_optimize_model_task.py -q`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test plus `tests/test_admin_catalog.py tests/test_seller.py tests/test_user_models.py -q`. Expected: PASS.
- [ ] **Step 5:** Checkpoint.

### Task 4: Delete the copy with the original

**Files:**
- Modify the four delete paths:
  - `backend/app/routers/admin_catalog.py`: `delete_furniture` (~:455) and `delete_store` (~:199);
  - `backend/app/routers/seller.py`: `delete_furniture` (:341);
  - `backend/app/routers/user_models.py`: `delete_user_model` (:248).
- Test: extend `backend/tests/test_glb_opt_urls.py` (same fixtures) or add `backend/tests/test_glb_opt_delete.py`

**Interfaces:**
- Consumes: `model_keys(original, opt)` (Task 1).

- [ ] **Step 1:** Failing tests. For each of the four paths, a row with `glb_opt_key`/`opt_key` set is deleted, and the monkeypatched `delete_file` (or `_delete_files`) receives both keys.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Build each `keys` list with `model_keys(...)` plus the thumbnail.
- [ ] **Step 4:** Run the new tests and the three router test files. Expected: PASS.
- [ ] **Step 5:** Checkpoint.

### Task 5: Backfill script

**Files:**
- Create: `backend/scripts/optimize_models.py`
- Test: `backend/tests/test_optimize_models_script.py`

**Interfaces:**
- Consumes: `_optimize_model` (Task 3).
- Produces:
  - `async find_candidates(db, only: str | None) -> list[tuple[str, str, str]]` returns `(kind, id, original_key)` for rows whose opt key is null and whose original key does not start with `http`. Furniture first, then user models.
  - The CLI is `python scripts/optimize_models.py [--dry-run] [--only furniture|user_models] [--limit N]`:
    - `--dry-run` prints the count, then one line per model with its size in KB from `download_file` length (or `?` if unreadable), then the total. It writes nothing.
    - Without `--dry-run`, it awaits `_optimize_model` sequentially for each model, prints `kind id before_kb -> after_kb status`, and finally prints the totals.

- [ ] **Step 1:** Failing tests:
  - `find_candidates` skips rows with an opt key and http keys, and respects `only`;
  - running `main(["--dry-run"])` with storage monkeypatched never calls `upload_file`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Use `app.database.engine` in the same way as the existing `scripts/eval_ai_design.py`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Checkpoint.

### Task 6: Server image carries the CLI

**Files:**
- Modify: `backend/Dockerfile`: add `nodejs npm` to the apt install line, then `RUN npm install -g @gltf-transform/cli@4.1.1 && gltf-transform --version`.

- [ ] **Step 1:** Run `docker compose build api && docker compose up -d api worker converter`. Expected: the build prints `4.1.1`.
- [ ] **Step 2:** Real end-to-end check. Copy a real model into the container, run `optimize_glb_bytes` on it in `docker compose exec -T api python -c ...`, and check that it returns smaller bytes. Then load the result in the existing spike viewer, or check it with `gltf-transform inspect`: meshopt is listed in `extensionsUsed`.
- [ ] **Step 3:** Run the whole backend suite with `docker compose exec -T api python -m pytest -q`. Expected: all pass.
- [ ] **Step 4:** Checkpoint.

### Task 7: Frontend import path decodes meshopt

**Files:**
- Modify: `frontend/src/lib/modelConverter.ts:579,594,660`
- Test: `frontend/src/lib/__tests__/modelConverter.meshopt.test.ts`

**Interfaces:**
- Produces: `makeGltfLoader(manager?: THREE.LoadingManager): GLTFLoader` (exported from `modelConverter.ts`). It returns `new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder)`, with `MeshoptDecoder` imported from the same `three/examples/jsm` / `three-stdlib` package that `modelConverter.ts` already imports `GLTFLoader` from. The three call sites use it.

- [ ] **Step 1:** Failing test: `makeGltfLoader()` has a meshopt decoder set. Assert on the loader's own decoder field, which is `meshoptDecoder` in three's GLTFLoader.
- [ ] **Step 2:** Run `npx vitest run src/lib/__tests__/modelConverter.meshopt.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement and replace the three call sites.
- [ ] **Step 4:** Run the test, `tsc --noEmit`, and the full `vitest run`. Expected: PASS. The `AiBuilderSheet` "undoes from the bar" flake is pre-existing and is noted separately.
- [ ] **Step 5:** Checkpoint.

### After the plan: production (each step needs the user's go-ahead)
1. Commit and push when the user asks, then wait for the deploy. Check that the migration head is `1786000033` and that `gltf-transform --version` works in the prod `converter` container.
2. Run `python scripts/optimize_models.py --dry-run` on prod and report it.
3. With the user's permission, run the script for real and report the before/after totals.
4. Open the studio and check 2–3 heavy models by eye. Confirm that `glb_url` ends in `.opt.glb`.
