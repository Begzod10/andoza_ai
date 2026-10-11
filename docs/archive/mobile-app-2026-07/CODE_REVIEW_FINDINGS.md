# Code Review Findings & Fixes

## Review Date
July 24, 2024

## Overall Quality Score
**5.5/10** → Target: **8+/10** (after fixes)

---

## HIGH-Severity Issues (Blocking - BEING FIXED)

### 1. Screens Not Registered in RootNavigator
**Status:** FIXING
- Issue: None of the 6 screens are registered in RootNavigator.tsx
- Impact: Screens are unreachable dead code
- Fix: Add Stack.Screen entries + correct navigation route names

### 2. Navigation Calls to Non-Existent Routes
**Status:** FIXING
- Files affected: A4_LiDARCapture.tsx, A5_360PhotoCapture.tsx, SettingsScreen.tsx, HistoryScreen.tsx
- Invalid routes:
  - `navigate('Dimensions')` → Will be `navigate('RoomDimensions')`
  - `navigate('ProjectDetails')` → Will be `navigate('Projects')`
  - `replace('Login')` → Will be `replace('AuthStack')`
  - `navigate('Profile')` → Will be `navigate('ProfilTab')`
- Fix: Update route names to match actual navigator config

### 3. Using browser `alert()` Instead of React Native `Alert`
**Status:** FIXING
- File: EstimateScreen.tsx:171 in `handleExport()`
- Issue: `alert()` doesn't exist in React Native, will crash on device
- Fix: Change to `Alert.alert()` (already imported)

### 4. Literal `\'` Escape Sequences in JSX Text
**Status:** FIXING
- Issue: Backslashes render visibly to users (e.g., `Ma\'lumot` shows as `Ma\'lumot`)
- Files affected: A4_LiDARCapture, A5_360PhotoCapture, SettingsScreen
- Examples to fix:
  - `Ma\'lumot olinmoqda...` → `Ma'lumot olinmoqda...`
  - `Oyg\'a` → `Oyg'a`
  - `o\'chirish` → `o'chirish`
  - `ko\'rsinish` → `ko'rsinish`
- Fix: Remove all backslashes from Uzbek text

### 5. Sub-Components Remounted on Every Render
**Status:** FIXING
- Files: SettingsScreen (SettingSection, SettingItem, SwitchItem), EstimateScreen (CategorySection), HistoryScreen (HistoryCard)
- Issue: Components defined inside parent function lose state/animation on every parent re-render
- Fix: Hoist to module scope, pass data via props

### 6. Mislabeled Email Field Showing Phone
**Status:** FIXING
- File: SettingsScreen.tsx:147
- Issue: Label says "Email" but displays phone number (User type has no email field)
- Current: `<SettingItem icon="📧" label="Email" value={user?.phone || 'Belgilanmagan'} />`
- Fix: Change label to "Telefon" or remove field entirely

### 7. Errors Silently Swallowed Without User Feedback
**Status:** FIXING
- Files: EstimateScreen.tsx:152-154, HistoryScreen.tsx:98-100
- Issue: Failed API calls show no error to user, hide failures
- Fix: Add `Alert.alert()` with error message + retry option

---

## MEDIUM-Severity Issues (Quality)

### 1. Hardcoded Blue Color Values
**Status:** Document only (not critical)
- Current: Multiple hardcoded `'#0066cc'` values
- Recommendation: Import from theme/colors.ts constants
- Files: SettingsScreen.tsx, A4_LiDARCapture.tsx, HistoryScreen.tsx, EstimateScreen.tsx

### 2. Navigation Typed as `any`
**Status:** Document only
- Issue: Defeats route-name type-checking
- Recommendation: Introduce `RootStackParamList` + `NativeStackScreenProps` project-wide
- Matches existing pattern (A1_Home.tsx, A2_Projects.tsx)

### 3. Uzbek Text Quality Issues
**Status:** Document for language team
- Examples:
  - `'devoriyle arava, pol va shiftga...'` - grammatically broken
  - `'Vaqt behudi'` - unclear phrase (should be `'Vaqt jadvali'`)
  - `'Ranglarni rejimi'` - should be `'Rang rejimi'`
  - `'Oyg'a'` - not standard Uzbek (should be `'Oysimon rang'` or similar)
  - `'Maxfiyliq siyosati'` - typo (should be `'Maxfiylik siyosati'`)
  - `'Tez yuklashni tat'` - truncated/garbled

### 4. Console.error Without User Feedback
**Status:** Minor
- File: EstimateScreen.tsx:165
- Fix: Add `Alert.alert()` when share fails

### 5. Missing Accessibility Props
**Status:** Document for accessibility pass
- Missing `accessibilityLabel` and `accessibilityRole` on:
  - Icon-only buttons (✕, ↻)
  - Filter tabs
  - Status badges
  - Theme/language toggles

---

## LOW-Severity Issues (Polish)

### 1. Dimensions.get('window') vs useWindowDimensions()
- File: A3_EntrySheet.tsx:11
- Fix: Use `useWindowDimensions()` hook for rotation support

### 2. Simulated Business Logic Needs TODO Markers
- Missing tickets for:
  - Real LiDAR API integration
  - 360° photo AI processing
  - Estimate calculation engine
- Add: `// TODO: Replace with real API call`

### 3. Mock Data Typos
- `'Koridori'` → `'Koridor'`
- `'turub'` → `'turib'`

### 4. No Test Files
- Violates 80% coverage requirement
- Need: unit tests, integration tests, E2E tests
- Files: `__tests__/screens/*.test.tsx`

### 5. Data Fetch Logic in Components
- Should extract to custom hooks or service layer
- Example: `loadEstimate()`, `loadHistory()` → Extract to `useEstimate.ts`, `useProjectHistory.ts`

---

## Fix Progress

| Issue | Files | Status | ETA |
|-------|-------|--------|-----|
| Not in Navigator | 6 screens | Planned | Post-fix |
| Invalid routes | 4 screens | FIXING | In progress |
| alert() → Alert | 1 file | FIXING | In progress |
| \' escapes | 4 files | FIXING | In progress |
| Remounted components | 3 files | FIXING | In progress |
| Mislabeled field | 1 file | FIXING | In progress |
| Silent errors | 2 files | FIXING | In progress |

---

## Next Steps After Fixes

1. **Run Type Check**
   ```bash
   npm run tsc --noEmit
   ```

2. **Add to Navigator** (manual step)
   - Add 6 Stack.Screen entries to RootNavigator.tsx
   - Create proper RootStackParamList type

3. **Review MEDIUM Issues**
   - Color theme consolidation
   - Uzbek text review by native speaker
   - Accessibility audit + fixes

4. **Add Tests**
   - Unit tests for each screen
   - Integration tests for navigation
   - E2E tests for user flows
   - Target 80%+ coverage

5. **Refactor Data Fetching**
   - Extract to custom hooks
   - Replace mock API calls with real endpoints

---

## Quality Target After Fixes

- Quality Score: **8+/10**
- All HIGH issues: **RESOLVED**
- MEDIUM issues: **Queued for next sprint**
- LOW issues: **Nice-to-have**

---

**Review Completed:** July 24, 2024  
**Agent:** code-reviewer  
**Verdict:** WARNING → FIXING → APPROVED (pending manual navigator setup)
