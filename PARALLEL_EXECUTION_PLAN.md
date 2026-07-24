# Parallel Execution Plan: Web 80% Coverage + Mobile MVP

**Goal:** Simultaneous development of web testing + mobile app  
**Timeline:** 4-6 weeks  
**Resource:** Single developer (optimal parallel workflow)

---

## 📊 Parallel Workflow

```
┌─ TRACK 1: Web Backend (Coverage to 80%)    [3-4 weeks]
│  ├─ Week 1: Phase 2 (router tests)
│  ├─ Week 2: Phase 3 (service tests)
│  ├─ Week 3: Phase 4 (frontend tests)
│  └─ Week 4: Polish & 80% verification
│
├─ TRACK 2: Mobile MVP (Batch A+B)          [4-5 weeks]
│  ├─ Week 1: Navigation + auth flow
│  ├─ Week 2: Measurement workflow (A6-A9)
│  ├─ Week 3: Room state + 3D entry (B1-B3)
│  ├─ Week 4: Testing + refinement
│  └─ Week 5: App store ready
│
└─ SYNC POINTS (Weekly)
   ├─ Monday: Plan sprint
   ├─ Wednesday: Mid-week sync
   └─ Friday: Review + adjust
```

---

## 🏃 Week-by-Week Execution

### **WEEK 1: Foundation + Measurement**

#### **Track 1 (Web - Monday-Tuesday)**
**Goal:** Set up router tests infrastructure + first 10 tests

```bash
# Day 1: Router test setup
cd backend
./venv/bin/pytest tests/test_auth_router.py --collect-only

# Day 2: Write first batch
# File: backend/tests/test_auth_router.py (NEW)
# Tests: 8 auth endpoint tests
#   - POST /auth/otp/request → 200
#   - POST /auth/otp/verify → 200/401
#   - POST /auth/refresh → 200/401
#   - POST /auth/logout → 200
#   - Error cases (400, 429)
```

**Deliverable:** `test_auth_router.py` with 8 passing tests

#### **Track 2 (Mobile - Monday-Tuesday)**
**Goal:** Navigation + auth flow working

```bash
# Day 1: React Navigation setup
cd ../tamir_uy_mobile
npm install
# Create: src/navigation/RootNavigator.tsx
# - BottomTabNavigator (4 tabs + FAB)
# - AuthStack (login/OTP)
# - AppStack (Uy/Do'kon/Ustalar/Profil)

# Day 2: Auth flow
# Create: src/screens/Auth/LoginScreen.tsx
# Create: src/screens/Auth/OTPScreen.tsx
# Wire to backend (POST /auth/login, /auth/otp/verify)
```

**Deliverable:** User can log in via OTP

#### **Sync Point (Wednesday):** Review progress, adjust sprint

---

### **WEEK 2: Router Coverage + Measurement UI**

#### **Track 1 (Web - Full Week)**
**Goal:** 24 more router tests → 60% coverage

**Files to create:**
- `backend/tests/test_rooms_router.py` (10 tests)
- `backend/tests/test_materials_router.py` (6 tests)
- `backend/tests/test_estimate_router.py` (8 tests)

```bash
# Day 1-2: Rooms router
POST /projects/{id}/rooms → 201
GET /projects/{id}/rooms → 200
GET /rooms/{id} → 200/404
PATCH /rooms/{id} → 200
DELETE /rooms/{id} → 204 (soft-delete)

# Day 3: Materials router
GET /materials → 200
GET /materials?category=paint → 200
Pagination tests

# Day 4-5: Estimate router
POST /rooms/{id}/estimate → 200
GET /rooms/{id}/estimate → 200/404
Coverage calculation tests
```

**Run each day:**
```bash
./run_tests.sh
# Target: 45-50% coverage
```

#### **Track 2 (Mobile - Full Week)**
**Goal:** Complete measurement workflow (A6-A9)

**Create screens:**
- `src/screens/A6_RoomDimensions.tsx` — Manual input form
- `src/screens/A7_WallMeasurement.tsx` — Wall-by-wall measurement
- `src/screens/A8_OpeningSheet.tsx` — Add doors/windows
- `src/screens/A9_Summary.tsx` — Confirmation screen

```bash
# Day 1: A6 Screen
- TextInputs: length (m), width (m), height (m)
- Steppers: doors count, windows count
- POST /projects/{id}/rooms
- Save room_id to store

# Day 2: A7 Screen
- Show walls A/B/C/D
- Slider for wall length
- Display openings
- POST /rooms/{id}/walls/{wall_id}

# Day 3: A8 Sheet Modal
- Type selector: Eshik/Deraza/Balkon
- Size presets: 90×205, 80×205, etc.
- Position slider
- POST /rooms/{id}/walls/{wall_id}/openings

# Day 4-5: A9 Summary + Testing
- Show stats: 34.6 m² floor, 75 m² walls
- GET /rooms/{id}/measurement
- Confirm button → next screen
```

**Test:**
```bash
npm run test
# Manual: Try flow end-to-end in simulator
```

**Deliverable:** Measure a room, save to backend

#### **Sync Point (Friday):** Both teams present progress

---

### **WEEK 3: High-Coverage Sprint + Room State**

#### **Track 1 (Web - Full Week)**
**Goal:** 20 more service tests → 70% coverage

**Files to create:**
- `backend/tests/test_llm_translation.py` (8 tests)
- `backend/tests/test_meshy_service.py` (6 tests)
- `backend/tests/test_room_geometry.py` (6 tests)

```bash
# Day 1-2: LLM translation
test_to_openai_tools
test_from_openai_response
test_call_llm_retries
test_call_llm_timeout

# Day 3: Meshy service
test_image_to_3d_conversion
test_get_task_status
test_wait_for_completion
test_task_failure

# Day 4-5: Room geometry helpers
test_compute_floor_area
test_compute_perimeter
test_wall_area_netto (minus openings)
```

**Run daily:**
```bash
./run_tests.sh
# Target: 65-70% coverage
```

#### **Track 2 (Mobile - Full Week)**
**Goal:** B1-B3 complete (room state → 3D entry)

**Create screens:**
- `src/screens/B1_RoomState.tsx` — State radio selection
- `src/screens/B2_3DEntry.tsx` — First-person 3D room
- `src/screens/B3_OnboardingRail.tsx` — Paint/wallpaper intro

```bash
# Day 1: B1 Screen
- Radio: Korobka / Suvoq / Shpaklovka
- POST /rooms/{id}/state
- Save to store

# Day 2-3: B2 Screen (3D)
- CSS perspective room rendering
- Walls + floor texture per chosen state
- Camera controls (touch)
- GET /rooms/{id}/state to load texture

# Day 4-5: B3 Onboarding
- Right-side rail (collapsed)
- Paint swatch column
- Drag-drop animation intro
- Stage line indicator
```

**Deliverable:** Enter the 3D room with chosen state

---

### **WEEK 4: Final Coverage Push + Decoration Start**

#### **Track 1 (Web - Full Week)**
**Goal:** 15+ more tests → 80%+ coverage

**Create:**
- `backend/tests/test_frontend_api.py` (10 tests)
- `backend/tests/test_furniture_router.py` (5 tests)

```bash
# Day 1-2: Core integration
test_full_room_flow (measure → state → estimate)
test_soft_delete_workflow
test_open_file_permissions

# Day 3: Furniture
test_list_furniture
test_furniture_by_category
test_add_to_cart

# Day 4-5: Final gap filling
Audit: ./run_tests.sh
Target: >= 80%
```

**Verify:**
```bash
./run_tests.sh
# Should show: TOTAL >= 80%
```

#### **Track 2 (Mobile - Full Week)**
**Goal:** Decoration stage basics (C1-C3)

**Create:**
- `src/screens/C1_PaintWallpaper.tsx` — Material selection
- `src/screens/C2_DragAnimation.tsx` — Drag preview
- `src/screens/C3_MaterialApplied.tsx` — Confirmation

```bash
# Day 1: C1 Screen
- Paint color swatches
- Wallpaper pattern grid
- GET /materials?type=paint
- SELECT material → ready for drag

# Day 2-3: Drag interaction
- React Native Gesture Handler
- Animated swatch following finger
- Wall highlights on hover
- Ghost preview of material

# Day 4-5: Apply & test
- POST /rooms/{id}/finishes
- Toast: ✓ Shpaklovka qo'shildi
- Stage line updates
```

**Deliverable:** Drag paint/wallpaper to walls in 3D

---

### **WEEK 5: Polish + App Ready**

#### **Track 1 (Web)**
```bash
# Day 1-2: Final tests for edge cases
test_permissions_enforcement
test_concurrent_updates
test_estimate_calculation_accuracy

# Day 3-4: Coverage verification
./run_tests.sh
# Confirm >= 80% across all modules

# Day 5: Documentation
# Update TEST_COVERAGE_PLAN.md with results
# Create TESTING_GUIDE.md for future devs
```

**Deliverable:** 80%+ coverage verified ✅

#### **Track 2 (Mobile)**
```bash
# Day 1-2: Complete C4-C9 screens (furniture + walkthrough)
# Day 3: Testing on iOS simulator
# Day 4: Testing on Android emulator
# Day 5: Release build setup

# Deliverable: iOS + Android builds ready
```

---

## 📋 Task Tracking

### **Daily Standup Template**
```
📌 TODAY (Track 1 - Web):
  - Writing: test_auth_router.py
  - Target: 8 passing tests
  - Blocker: None

📌 TODAY (Track 2 - Mobile):
  - Building: A6 measurement screen
  - Target: Manual dimension input working
  - Blocker: Waiting on TypeScript types

✅ YESTERDAY:
  - Completed: Navigation setup
  - Coverage: 40% → 42%
  - Released: Auth flow MVP
```

### **Checklist: Week 1**

#### Web Track
- [ ] Router test setup
- [ ] test_auth_router.py (8 tests) ✓
- [ ] Run coverage → 37%+
- [ ] Commit & push

#### Mobile Track
- [ ] Navigation setup
- [ ] Auth login screen
- [ ] Auth OTP screen
- [ ] Backend integration
- [ ] Can log in via OTP
- [ ] Commit & push

---

## 🚀 Parallel Commands

### **Setup (One Time)**
```bash
# Terminal 1: Backend running
cd /home/rimefara/projects/tamir_uy/backend
source venv/bin/activate
# Already running on :8000

# Terminal 2: Frontend running
cd /home/rimefara/projects/tamir_uy/frontend
# Already running on :5174

# Terminal 3: Mobile dev
cd /home/rimefara/projects/tamir_uy_mobile
npm install
npm run dev
# Choose: iOS, Android, or Web

# Terminal 4: Your editor
# Edit code in both directories
```

### **Daily Web Testing**
```bash
# Terminal (dedicated to web tests)
cd /home/rimefara/projects/tamir_uy/backend
watch -n 10 './run_tests.sh'
# Auto-runs every 10 seconds
```

### **Daily Mobile Dev**
```bash
# Terminal (dedicated to mobile)
cd /home/rimefara/projects/tamir_uy_mobile
npm run dev
# Hot reload on file change
```

---

## 📊 Progress Tracking

### **Web Coverage Target**
```
Week 1: 35% → 40%  (baseline + routers start)
Week 2: 40% → 55%  (routers + materials)
Week 3: 55% → 70%  (services)
Week 4: 70% → 80%+ (integration + polish)
```

### **Mobile Features**
```
Week 1: Auth flow ✅
Week 2: Measurement (A6-A9) ✅
Week 3: Room state (B1-B3) ✅
Week 4: Decoration (C1-C3) ✅
Week 5: App store ready ✅
```

---

## 🎯 Sync Points (Weekly)

### **Monday 10:00 AM**
- Sprint planning
- Assign tasks for both tracks
- Review blockers from last week

### **Wednesday 3:00 PM**
- Mid-week check-in
- Share progress screenshots
- Adjust sprint if needed

### **Friday 5:00 PM**
- Show & tell demos
- Review: Web coverage report
- Review: Mobile simulator demo
- Plan next week

---

## 🔄 Integration Points

### **Backend ← → Mobile**
```
Week 2: Mobile measurement → Backend API
- POST /projects/{id}/rooms
- POST /rooms/{id}/walls
- POST /rooms/{id}/walls/{wall_id}/openings

Week 3: Mobile state → Backend API
- POST /rooms/{id}/state
- GET /rooms/{id}/state

Week 4: Mobile finishes → Backend API
- POST /rooms/{id}/finishes
- GET /rooms/{id}/finishes
```

### **Frontend (Web) ← → Shared Backend**
- No changes: both use same API
- Tests verify endpoints work
- Mobile uses tested endpoints

---

## ✅ Success Criteria

### **Track 1 (Web): COMPLETE ✅**
- [ ] 80%+ code coverage
- [ ] All router tests passing
- [ ] All service tests passing
- [ ] Documentation updated
- [ ] CI/CD green

### **Track 2 (Mobile): MVP READY ✅**
- [ ] Auth flow working
- [ ] Measurement workflow complete (A6-A9)
- [ ] Room state selection (B1-B3)
- [ ] Decoration start (C1-C3)
- [ ] iOS + Android builds
- [ ] Ready for TestFlight/Play Store

---

## 📞 Support & Escalation

**Blocker?** Escalate same day:
- Web: Check `run_tests.sh` output
- Mobile: Check Xcode/Android Studio console
- Backend: Verify server running on :8000

**Need help?** Fork both branches:
- Web tests → separate branch
- Mobile → separate branch
- Merge only when both ready

---

## 🎁 Deliverables (End of Week 5)

```
✅ Web:
   - 80%+ test coverage
   - 44 → 120+ tests passing
   - COVERAGE_REPORT.md updated
   - Ready for production

✅ Mobile:
   - Auth working
   - Measurement → Decoration flow
   - iOS build
   - Android build
   - Ready for TestFlight/Play Store
```

---

**Ready to execute?** Start with Week 1 tasks! 🚀
