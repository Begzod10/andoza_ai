# AndozaAI Test Coverage Implementation Plan

**Target:** 80%+ test coverage  
**Timeline:** 2-3 weeks  
**Status:** 🟡 In Progress

---

## 📊 Current State

| Layer | Current | Target | Gap |
|-------|---------|--------|-----|
| Backend Unit | 30% | 80% | +50% |
| Backend Integration | 15% | 70% | +55% |
| Frontend Unit | 5% | 75% | +70% |
| Frontend E2E | 0% | 40% | +40% |
| **Overall** | **15%** | **80%** | **+65%** |

---

## 🏗️ Test Structure

```
backend/tests/
├── conftest.py                      # Shared fixtures ✅
├── test_auth.py                     # Auth endpoints
├── test_room_operations.py          # Room CRUD + soft-delete ✅
├── test_meshy.py                    # Meshy AI integration ✅
├── test_estimate.py                 # Cost estimation
├── test_materials.py                # Material CRUD
├── test_furniture.py                # Furniture CRUD
├── test_ai_builder.py               # AI builder logic (has errors)
├── test_room_metrics.py             # Room calculations
└── test_api_endpoints.py            # Route coverage

frontend/src/__tests__/
├── lib/api.test.ts                  # API client
├── store/roomStore.test.ts          # Zustand store
├── components/Image3DConverter.test.tsx    # ✅
├── components/AiBuilderSheet.test.tsx      # AiBuilder UI
├── hooks/useRoom.test.ts            # Room hook
├── pages/index.test.tsx             # Pages
└── integration/                     # E2E-like tests
    └── room-creation.test.tsx
```

---

## 🚀 Phase-by-Phase Implementation

### **Phase 1: Setup & Fix (Days 1-2) ✅ DONE**

**What's done:**
- ✅ Added pytest-cov to requirements.txt
- ✅ Created conftest.py with database fixtures
- ✅ Updated pytest.ini with coverage config
- ✅ Created test_meshy.py (18 tests)
- ✅ Created test_room_operations.py (13 tests)
- ✅ Created Image3DConverter.test.tsx (12 tests)

**Remaining in Phase 1:**
- Fix import errors in test_ai_builder.py
- Test database connection with real PostgreSQL
- Verify fixture setup works with actual models

**Command:**
```bash
cd backend
./run_tests.sh  # Run with coverage report
```

---

### **Phase 2: Critical Backend Coverage (Days 3-5)**

#### **Priority 1: API Endpoints (40-50 tests)**

**File:** `test_api_endpoints.py` (NEW)

```python
# Room endpoints
POST /api/v1/apartments/{apt_id}/rooms (create)
GET  /api/v1/apartments/{apt_id}/rooms (list)
GET  /api/v1/rooms/{room_id} (get single)
PATCH /api/v1/rooms/{room_id} (update)
DELETE /api/v1/rooms/{room_id} (soft-delete)

# Meshy endpoints  
POST /api/meshy/convert (start conversion)
GET  /api/meshy/task/{task_id} (poll status)
POST /api/meshy/wait/{task_id} (wait for completion)

# Estimate endpoints
POST /api/v1/rooms/{room_id}/estimate (create)
GET  /api/v1/rooms/{room_id}/estimate (retrieve)
POST /api/v1/rooms/{room_id}/estimate/preview (preview)
```

**Tests needed per endpoint:**
- ✅ Happy path (valid input → success)
- ✅ Missing auth (401)
- ✅ Missing field (400)
- ✅ Not found (404)
- ✅ Invalid data type (422)
- ✅ Authorization (403 - wrong user)

#### **Priority 2: AI Builder (15-20 tests)**

**File:** `test_ai_builder.py` (EXISTING - FIX)

Fix the import error first:
```bash
# Install missing dependency
pip install openai>=1.0.0

# Then run
pytest tests/test_ai_builder.py -v
```

Add tests for:
- Parse room description → generate patch
- Apply patch to room design
- Handle API errors gracefully
- LLM budget tracking
- Cost estimation accuracy

#### **Priority 3: Materials & Furniture (20-25 tests)**

**File:** `test_materials.py` (NEW)

```python
def test_get_materials_by_category()
def test_get_materials_pagination()
def test_material_color_hex_validation()
def test_material_pbr_values()
def test_filter_materials_by_price()
def test_search_materials_by_name()
```

**File:** `test_furniture.py` (NEW)

```python
def test_get_furniture_by_category()
def test_furniture_dimensions()
def test_furniture_model_url_availability()
def test_furniture_pricing()
def test_furniture_search()
```

---

### **Phase 3: Frontend Coverage (Days 6-8)**

#### **Store Tests (20-30 tests)**

**File:** `store/roomStore.test.ts` (NEW)

```typescript
// Room state
describe('Room Store', () => {
  test('initializes with default design')
  test('updates room name')
  test('sets ceiling height')
  test('updates wall length')
  test('toggles wall element visibility')
  test('places furniture')
  test('removes furniture')
  test('applies material color')
  test('tracks undo state')
  test('persists to localStorage')
  test('loads from localStorage')
})
```

#### **Component Tests (30-40 tests)**

Already created:
- ✅ Image3DConverter.test.tsx (12 tests)

Still needed:
- AiBuilderSheet.test.tsx (15-20 tests)
- MaterialSelector.test.tsx (10-15 tests)
- RoomViewer.test.tsx (10-15 tests)
- RoomEditor.test.tsx (15-20 tests)

#### **Hook Tests (10-15 tests)**

**File:** `hooks/useRoom.test.ts` (NEW)

```typescript
describe('useRoom Hook', () => {
  test('fetches room on mount')
  test('updates room on state change')
  test('saves draft periodically')
  test('handles errors')
})
```

---

### **Phase 4: E2E Test Scenarios (Days 9-10)**

**File:** `integration/room-creation.test.tsx`

Key user flows:
1. Create apartment → Create room → Design room → Generate estimate
2. Upload image → Convert to 3D → Add to room
3. Apply AI suggestions → Review changes → Apply

---

## 📈 Coverage Targets by Module

| Module | Current | Target | Tests Needed |
|--------|---------|--------|--------------|
| `app/models/` | 60% | 90% | 8 |
| `app/routers/` | 25% | 85% | 35 |
| `app/services/` | 20% | 85% | 40 |
| `app/schemas/` | 10% | 90% | 15 |
| Frontend Components | 5% | 80% | 50 |
| Frontend Hooks | 0% | 80% | 20 |
| Frontend Store | 5% | 85% | 30 |

---

## 🔧 Running Tests

### Backend

**Run all tests:**
```bash
cd backend
./run_tests.sh
```

**Run specific file:**
```bash
pytest tests/test_meshy.py -v
```

**Run with coverage report:**
```bash
pytest tests/ --cov=app --cov-report=html --cov-report=term-missing
# Open htmlcov/index.html
```

**Run specific test:**
```bash
pytest tests/test_meshy.py::test_image_to_3d_conversion_success -v
```

### Frontend

**Run all tests:**
```bash
cd frontend
npm run test
```

**Run with coverage:**
```bash
npm run test:coverage
```

**Run specific file:**
```bash
npm test Image3DConverter
```

**Watch mode (auto-run on changes):**
```bash
npm test -- --watch
```

---

## 📝 Test Writing Guidelines

### Backend (pytest)

**Pattern: Arrange-Act-Assert (AAA)**

```python
@pytest.mark.asyncio
async def test_create_room(db_session, test_apartment):
    # Arrange
    room_data = {
        "name": "Living Room",
        "ceiling_h": 3000,
        "geometry": {...}
    }
    
    # Act
    room = Room(**room_data)
    db_session.add(room)
    await db_session.commit()
    
    # Assert
    assert room.id is not None
    assert room.name == "Living Room"
```

### Frontend (Vitest)

**Pattern: Arrange-Act-Assert**

```typescript
it('updates room design', () => {
  // Arrange
  const { getByText } = render(<RoomEditor />)
  
  // Act
  fireEvent.click(getByText('Save'))
  
  // Assert
  expect(mockApi.updateRoom).toHaveBeenCalled()
})
```

**Use fixtures for common setups:**

```typescript
// fixtures.ts
export const mockRoom = {
  id: 'room-1',
  name: 'Living Room',
  ceiling_h: 3000,
  // ...
}
```

---

## ✅ Pre-Commit Checklist

Before committing tests:

- [ ] All tests pass locally: `pytest tests/ -v`
- [ ] Coverage target met: `./run_tests.sh` shows ≥80%
- [ ] No skipped tests: `pytest -v | grep SKIPPED`
- [ ] No unused fixtures
- [ ] Test names clearly describe what's tested
- [ ] Docstrings explain complex test logic
- [ ] Mock external APIs (OpenAI, Meshy, etc.)
- [ ] Test database is clean (fixtures handle cleanup)

---

## 🎯 Quick Wins (Highest ROI Tests)

These tests cover the most code and catch the most bugs:

1. **API Endpoint Tests** (40-50 tests)
   - ROI: High (covers routing + validation + business logic)
   - Effort: Medium
   - Impact: Prevents deployment bugs

2. **Component Integration Tests** (20-30 tests)
   - ROI: High (catches UI regressions)
   - Effort: Medium
   - Impact: Prevents UX breaks

3. **Store Tests** (20-25 tests)
   - ROI: Medium (state management)
   - Effort: Low
   - Impact: Prevents data corruption

4. **Error Handling** (15-20 tests)
   - ROI: High (catches edge cases)
   - Effort: Low
   - Impact: Better error messages

---

## 📦 Dependencies Already Installed

Backend:
- ✅ pytest
- ✅ pytest-asyncio
- ✅ pytest-cov (added)
- ✅ fakeredis
- ✅ httpx-mock (added)

Frontend:
- ✅ vitest
- ✅ @testing-library/react
- ✅ @testing-library/user-event

---

## 🐛 Debugging Tests

### Backend

**Print statements:**
```python
import structlog
log = structlog.get_logger()
log.info("debug_info", value=something)
```

**Drop into debugger:**
```python
import pdb; pdb.set_trace()
```

**Run with verbose output:**
```bash
pytest -vv -s tests/test_meshy.py
```

### Frontend

**Debug in test:**
```typescript
screen.debug()  // Prints DOM
```

**Use Vitest UI:**
```bash
npm run test:ui
```

---

## 📈 Tracking Progress

After each test file, update:

```bash
# Run coverage report
./run_tests.sh

# Log progress
echo "✅ test_meshy.py: 18/18 tests passing, +2% coverage" >> PROGRESS.md
```

---

## 🚨 Common Issues

### Issue: "ModuleNotFoundError: No module named 'openai'"
**Solution:** `pip install openai`

### Issue: "Database transaction failed"
**Solution:** Ensure conftest.py fixtures are being used

### Issue: "Test passes locally but fails in CI"
**Solution:** Mock external APIs, use fakeredis, don't assume system libraries

### Issue: "Component test throws 'act' warning"
**Solution:** Wrap state updates in `act()` or use `waitFor()`

---

## 📞 Resources

- [Pytest Documentation](https://docs.pytest.org/)
- [Testing Library Docs](https://testing-library.com/)
- [Vitest Guide](https://vitest.dev/)
- [SQLAlchemy Test Patterns](https://docs.sqlalchemy.org/en/20/faq/testing.html)

---

## 🎓 Next Steps

1. **Today:** Review this plan and setup conftest.py
2. **Day 1-2:** Run `./run_tests.sh` and fix import errors
3. **Day 3-4:** Write API endpoint tests (40-50 tests)
4. **Day 5-6:** Write frontend component tests (30-40 tests)
5. **Day 7-8:** Fill gaps and achieve 80%+ coverage
6. **Day 9-10:** Add E2E scenarios and documentation

**Target completion: Production-ready test suite** ✅

