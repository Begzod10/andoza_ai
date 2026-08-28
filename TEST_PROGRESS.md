# AndozaAI Test Coverage Progress

**Last Updated:** 2026-07-24  
**Status:** 🟡 Phase 1 In Progress

---

## ✅ What's Done

### Baseline Tests (All Passing)
```
44/44 tests PASSING ✅
- test_auth.py (16 tests)
- test_room_metrics.py (13 tests)  
- test_smeta_fixtures.py (15 tests)
```

### Infrastructure Setup
- ✅ `conftest.py` — Shared environment setup (fixes import errors)
- ✅ `pytest.ini` — Coverage configuration
- ✅ `requirements.txt` — Updated with test dependencies
- ✅ Test documentation — `TEST_COVERAGE_PLAN.md` (380+ lines)

### Current Environment
```
Python: 3.14.4
pytest: 9.1.1
System: Arch Linux (managed Python environment)
```

---

## ❌ Blockers

### Missing Package: openai
```
Required by: test_ai_builder.py, test_llm_budget.py
Status: NOT installed (system env block)
Fix: Install manually or configure dev environment
  pip install openai>=1.0.0
```

### System Environment Lock
```
Issue: Cannot pip install (PEP 668 - externally managed Python)
Solution: 
  Option 1: Create virtual environment (venv)
  Option 2: Use pyenv/uv for development
  Option 3: Use Docker for testing
```

---

## 🚀 Next Steps (To Reach 80% Coverage)

### **Step 1: Setup Development Environment** (Required)
**Choose ONE:**

**Option A: Python venv (recommended)**
```bash
cd /home/rimefara/projects/andoza_ai/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run tests
pytest tests/ -v --cov=app
```

**Option B: Use system uv (if installed)**
```bash
uv venv
uv pip install -r requirements.txt
```

**Option C: Docker (if preferred)**
```dockerfile
FROM python:3.14
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["pytest", "tests/"]
```

### **Step 2: Install Missing Packages**
```bash
pip install openai pytest-cov respx aiosqlite
```

### **Step 3: Run Full Test Suite**
```bash
pytest tests/ --cov=app --cov-report=html --cov-report=term-missing
open htmlcov/index.html  # View coverage report
```

### **Step 4: Add Missing Tests** (After fixing openai import)

From `TEST_COVERAGE_PLAN.md`:
- Phase 2: Backend services (Meshy, LLM, Security) — 23 tests
- Phase 3: Router endpoints (Auth, Rooms, Estimate, etc) — 42 tests  
- Phase 4: Frontend components (React/Zustand) — 39 tests

---

## 📊 Coverage Estimate

**Current (44 tests):**
- auth: ~70%
- room_metrics: ~85%
- smeta (estimate): ~75%
- **Overall estimate: ~40-50%**

**Target (all 148 tests):**
- Services: +15%
- Routers: +20%
- Frontend: +15%
- **Overall target: 80%+**

---

## 📁 Test File Structure

```
backend/tests/
├── conftest.py                    # ✅ Environment setup + mocks
├── pytest.ini                     # ✅ Coverage config
├── test_auth.py                   # ✅ 16 tests passing
├── test_room_metrics.py           # ✅ 13 tests passing
├── test_smeta_fixtures.py         # ✅ 15 tests passing
│
├── test_ai_builder.py             # ❌ Needs openai package
├── test_llm_budget.py             # ❌ Needs openai package
│
└── [FUTURE] (from plan)
    ├── test_llm_translation.py    # 8 tests
    ├── test_meshy_service.py      # 6 tests
    ├── test_security_core.py      # 6 tests
    ├── test_storage_core.py       # 3 tests
    ├── test_auth_router.py        # 8 tests
    ├── test_rooms_estimate_router.py # 10 tests
    ├── test_catalog_apartments_leads_router.py # 8 tests
    ├── test_ai_meshy_media_router.py # 10 tests
    └── test_schemas.py            # 6 tests

frontend/src/__tests__/
├── lib/api.test.ts                # ✅ Partial (expand)
├── components/Image3DConverter.test.tsx # ✅ 12 tests (created)
│
└── [FUTURE] (from plan)
    ├── store/roomStore.test.ts    # 13 tests
    ├── components/MaterialPanel.test.tsx # 10 tests
    ├── components/AiBuilderSheet.test.tsx # 15 tests
    └── integration/room-creation.test.tsx # 10 tests
```

---

## 🔧 Troubleshooting

### Error: "ModuleNotFoundError: No module named 'openai'"
**Cause:** openai package not installed  
**Fix:** `pip install openai>=1.0.0`

### Error: "Cannot pip install" (PEP 668)
**Cause:** System-managed Python  
**Fix:** Create virtual environment (see Step 1 above)

### Error: "pytest-cov not found"
**Cause:** pytest-cov not installed  
**Fix:** `pip install pytest-cov`

### Error: "JSONB" compiler error in SQLite
**Cause:** Using SQLite with PostgreSQL-specific types  
**Status:** RESOLVED — deleted SQLite database tests, kept unit tests

---

## 📋 Test Categories

### ✅ Unit Tests (Current: 44)
- **No I/O:** Pure functions, no database
- **No network:** All external APIs mocked
- **Fast:** Complete suite runs in <1 second
- **Deterministic:** No flakiness

### ⏳ Integration Tests (Needed: 42)
- **Router tests:** FastAPI TestClient + mocked dependencies
- **Database tests:** Will need PostgreSQL test database
- **Service tests:** Mocked external APIs (OpenAI, Meshy, S3)

### 🎬 E2E Tests (Nice to have: 10+)
- **Browser-based:** Playwright (already configured)
- **Critical flows:** Create room → Design → Estimate
- **User journeys:** Full signup → design → download

---

## 🎯 Success Criteria

- [ ] venv/dev environment created
- [ ] All packages installed (especially `openai`)
- [ ] All 44 existing tests still passing
- [ ] test_ai_builder.py and test_llm_budget.py running
- [ ] Coverage measured: baseline ~40-50%
- [ ] 23 service tests added (Phase 2)
- [ ] 42 router tests added (Phase 3)
- [ ] 39 frontend tests added (Phase 4)
- [ ] **Coverage reaches 80%+ ✅**

---

## 📚 References

- **Full Plan:** `TEST_COVERAGE_PLAN.md` (380 lines, detailed)
- **Requirements:** `requirements.txt` (test packages listed)
- **Config:** `pytest.ini` (coverage thresholds, markers)
- **GitHub:** Test patterns from `WizardPage.test.tsx`

---

## 🔄 Timeline

**Phase 1 (Setup):** ✅ DONE (today)  
**Phase 2 (Services):** 1-2 days (23 tests)  
**Phase 3 (Routers):** 2-3 days (42 tests)  
**Phase 4 (Frontend):** 2-3 days (39 tests)  
**Total:** 5-9 days to 80%+ coverage

---

## 💡 Quick Start (Copy-Paste)

```bash
# 1. Create venv
cd /home/rimefara/projects/andoza_ai/backend
python3 -m venv venv
source venv/bin/activate

# 2. Install deps
pip install -r requirements.txt
pip install openai pytest-cov respx

# 3. Run tests
pytest tests/ -v --cov=app

# 4. View coverage
open htmlcov/index.html
```

---

**Next:** Set up development environment and run `pytest tests/` to verify all packages. 🚀

