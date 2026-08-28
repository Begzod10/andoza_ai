# AndozaAI Test Coverage Report

**Date:** 2026-07-24  
**Status:** ✅ **44/44 tests PASSING**

---

## 📊 Current Coverage: 35%

```
TOTAL: 2283 statements, 1493 uncovered → 35% coverage
Target: 80%+
Gap: +45%
```

### By Module

| Module | Coverage | Status | Priority |
|--------|----------|--------|----------|
| **app/core/security** | 100% ✅ | COMPLETE | - |
| **app/services/smeta** | 96% ✅ | NEAR COMPLETE | Low |
| **app/services/room_geometry** | 93% ✅ | NEAR COMPLETE | Low |
| **app/schemas/auth** | 95% ✅ | NEAR COMPLETE | Low |
| **app/schemas/room** | 91% ✅ | NEAR COMPLETE | Low |
| **app/config** | 86% ✅ | GOOD | Medium |
| **app/database** | 56% | PARTIAL | Medium |
| **app/routers/auth** | 53% | PARTIAL | **HIGH** |
| **app/api/v1/deps** | 44% | PARTIAL | Medium |
| **app/core/sms** | 48% | PARTIAL | Medium |
| **app/core/cache** | 38% | POOR | Low |
| **app/routers/catalog** | 0% ❌ | MISSING | HIGH |
| **app/routers/rooms** | 0% ❌ | MISSING | HIGH |
| **app/routers/estimate** | 0% ❌ | MISSING | HIGH |
| **app/routers/meshy** | 0% ❌ | MISSING | HIGH |
| **app/routers/apartments** | 0% ❌ | MISSING | HIGH |
| **app/routers/ai** | 0% ❌ | MISSING | HIGH |
| **app/services/ai_builder** | 0% ❌ | MISSING | HIGH |
| **app/services/llm** | 0% ❌ | MISSING | HIGH |
| **app/services/meshy** | 0% ❌ | MISSING | HIGH |
| **app/main** | 0% ❌ | MISSING | CRITICAL |

---

## ✅ What's Tested (44 tests)

### test_auth.py (16 tests) — 53% router coverage
```
✅ JWT token verification (valid/expired/tampered)
✅ OTP verification (correct/wrong/missing)
✅ Cookie helpers (httpOnly, samesite, scoping)
✅ OTP IP rate limiting (11th request → 429)

Missing:
❌ OTP request endpoint
❌ OTP verify endpoint  
❌ Token refresh endpoint
❌ Logout endpoint
❌ Register endpoint
```

### test_room_metrics.py (13 tests) — 93% coverage ✅
```
✅ Shoelace formula for area (rectangle, triangle, L-shape)
✅ Perimeter calculation
✅ Openings handling
✅ Schema validation (min 3 walls)
✅ Legacy metric compatibility
```

### test_smeta_fixtures.py (15 tests) — 96% coverage ✅
```
✅ Material waste factors (paint, wallpaper, tile)
✅ Cost estimation (15 realistic room scenarios)
✅ Openings reduction
✅ Ceiling height impact
✅ Plinth calculations
```

---

## ❌ Critical Gaps (Need 45% more to reach 80%)

### Tier 1: API Routes (0% coverage, 10+ routers)

**app/routers/rooms.py** (0% → need 77 lines)
- POST /apartments/{apt_id}/rooms (create)
- GET /apartments/{apt_id}/rooms (list)
- GET /rooms/{room_id} (retrieve)
- PATCH /rooms/{room_id} (update)
- DELETE /rooms/{room_id} (soft-delete)

**app/routers/estimate.py** (0% → need 136 lines)
- POST /rooms/{room_id}/estimate
- GET /rooms/{room_id}/estimate
- POST /rooms/{room_id}/estimate/preview
- GET /rooms/{room_id}/estimate/pdf

**app/routers/meshy.py** (0% → need 51 lines)
- POST /meshy/convert
- GET /meshy/task/{task_id}
- POST /meshy/wait/{task_id}

**app/routers/ai.py** (0% → need 128 lines)
- POST /rooms/{room_id}/ai-build (streaming)
- POST /rooms/{room_id}/smeta/ask

### Tier 2: Services (0% coverage)

**app/services/llm.py** (0% → need 146 lines)
- LLM client initialization
- Format translation (Anthropic ↔ OpenAI)
- Retry logic & budget tracking

**app/services/ai_builder.py** (0% → need 157 lines)
- Room description parsing
- Patch generation & validation
- Tool call handling

**app/services/meshy.py** (0% → need 80 lines)
- Image-to-3D conversion
- Task polling
- Model format conversion

### Tier 3: Storage & Infrastructure (0% coverage)

**app/core/storage.py** (0% → need 23 lines)
- S3 presigned URL generation
- Object key sanitization

**app/routers/media.py** (0% → need 36 lines)
- File upload endpoints

---

## 🎯 Path to 80% (Prioritized)

### Phase 2: Complete Router Tests (±30-35% coverage)
```python
# test_auth_router.py (8 tests)
✅ POST /auth/otp/request
✅ POST /auth/otp/verify
✅ POST /auth/refresh
✅ POST /auth/logout
✅ Error cases (400, 401, 429)

# test_rooms_estimate_router.py (10 tests)
✅ POST /apartments/{id}/rooms
✅ GET /rooms/{id}
✅ PATCH /rooms/{id}
✅ DELETE /rooms/{id}
✅ POST /rooms/{id}/estimate

# test_meshy_router.py (6 tests)
✅ POST /meshy/convert (start)
✅ GET /meshy/task/{id} (poll)
✅ POST /meshy/wait/{id} (wait)
```

### Phase 3: Services & Core (±20% coverage)
```python
# test_llm_service.py (8 tests)
✅ call_llm with OpenAI mock
✅ Format translation helpers
✅ Budget tracking

# test_meshy_service.py (6 tests)
✅ Image-to-3D conversion
✅ Task polling logic
✅ Error handling

# test_storage_core.py (3 tests)
✅ Presigned URL generation
✅ Key sanitization
```

### Phase 4: Frontend Tests (±15% coverage)
```typescript
# Image3DConverter.test.tsx (12 tests) ✅ Already created
# AiBuilderSheet.test.tsx (15 tests)
# RoomStore tests (13 tests)
```

---

## 📈 Estimated Timeline

| Phase | Tests | Effort | Timeline | Target Coverage |
|-------|-------|--------|----------|-----------------|
| **1** ✅ | 44 | 1 hour | Today | 35% |
| **2** | +24 | 4-5 hours | 1 day | 55-60% |
| **3** | +17 | 3-4 hours | 1 day | 70-75% |
| **4** | +40 | 4-5 hours | 1-2 days | **80%+** |

**Total:** ~85 new tests in 3-4 days

---

## 🔧 How to Run Tests Locally

```bash
# Activate venv (already created)
source venv/bin/activate

# Run all tests with coverage
pytest tests/ --cov=app --cov-report=html --cov-report=term-missing

# Generate coverage report
open htmlcov/index.html

# Watch specific module
pytest tests/ --cov=app.services --cov-report=term-missing -v
```

---

## 📋 Next Immediate Steps

1. **Commit current progress**
   ```bash
   git add .
   git commit -m "test: establish test infrastructure and baseline (44 tests, 35% coverage)"
   ```

2. **Start Phase 2: Router tests** (1 day)
   - Write test_auth_router.py (8 tests)
   - Write test_rooms_estimate_router.py (10 tests)
   - Aim for 55-60% coverage

3. **Then Phase 3: Services** (1 day)
   - Write test_llm_service.py (8 tests)
   - Write test_meshy_service.py (6 tests)
   - Aim for 70-75% coverage

4. **Finally Phase 4: Frontend** (1-2 days)
   - Expand Image3DConverter tests
   - Add React component tests
   - Aim for **80%+** ✅

---

## 📊 Coverage Badges

```
Current:    ████░░░░░░░░░░░░░░░░ 35%
Target:     ████████████████░░░░ 80%
Gap:        ───────────────────── 45%
```

---

## 🎓 Test Infrastructure Working ✅

```
✅ conftest.py              — Environment setup, mocks
✅ pytest.ini              — Coverage config
✅ venv                    — Virtual environment
✅ requirements.txt        — All dependencies installed
✅ pytest-cov              — Coverage reporting
✅ 44 baseline tests       — All passing
```

Ready for Phase 2! 🚀
