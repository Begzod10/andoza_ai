# UyTa'mir Mobile App - Development Plan

**Status:** 🚀 Project Initialized  
**Date:** 2026-07-24  
**Backend:** Shared (FastAPI at localhost:8000)  
**Database:** Shared PostgreSQL  
**Platform:** React Native (Expo)  
**Product Scope:** Full (29 screens, A-D batches)

---

## 🏗️ Project Structure

```
tamir_uy_mobile/
├── src/
│   ├── screens/          # 29 screen components (A1-D10)
│   ├── components/       # Reusable UI components
│   │   ├── Navigation/
│   │   ├── Forms/
│   │   ├── Cards/
│   │   ├── Buttons/
│   │   ├── Rails/
│   │   └── Modals/
│   ├── store/           # Zustand state (✅ created)
│   ├── lib/             # Utilities & helpers
│   ├── types/           # TypeScript types (✅ created)
│   ├── config/          # Configuration (✅ API client)
│   ├── navigation/      # React Navigation setup
│   └── hooks/           # Custom React hooks
├── assets/              # Images, icons, fonts
├── app.json            # Expo config (✅ created)
├── package.json        # Dependencies (✅ created)
└── README.md           # Project docs
```

---

## 📱 Screen Hierarchy (29 screens)

### **Batch A: Entry & Measurement (9 screens)**

| Screen | Name | Purpose | Status |
|--------|------|---------|--------|
| **A1** | Bosh sahifa (bo'sh) | Greeting + empty state + quick actions | ⏳ TODO |
| **A2** | Bosh sahifa (loyihalar) | Active project + project list | ⏳ TODO |
| **A3** | Yangi loyiha sheet | LiDAR / 360° / Manual entry | ⏳ TODO |
| **A4** | LiDAR scan mode | Dark camera + green scan + progress | ⏳ TODO |
| **A5** | 360° capture mode | 8-point capture UI + compass | ⏳ TODO |
| **A6** | Xona o'lchamlari (manual) | Tabs: manual input / plan upload | ⏳ TODO |
| **A7** | Devor A o'lchovi ⭐ | Wall-by-wall measurement | ⏳ TODO |
| **A8** | Eshik/Deraza qo'shish | Opening type + size selection | ⏳ TODO |
| **A9** | Xona xulosasi ⭐ | Summary stats + confirmation | ⏳ TODO |

### **Batch B: Room State (2 screens)**

| Screen | Name | Purpose | Status |
|--------|------|---------|--------|
| **B1** | Xona holati | Radio: Korobka / Suvoq / Shpaklovka | ⏳ TODO |
| **B1-alt** | Pol/Shift sheet | Optional per-surface state | ⏳ TODO |
| **B2** | Xonaga kirish ⭐ | First-person 3D entry | ⏳ TODO |
| **B3** | Bosqich + rail ⭐ | Paint/wallpaper intro + onboarding | ⏳ TODO |

### **Batch C: Decoration (9 screens)**

| Screen | Name | Purpose | Status |
|--------|------|---------|--------|
| **C1** | Bo'yoq/Oboi stage | Paint color swatches | ⏳ TODO |
| **C2** | Drag mid-action ⭐ | Animation: finger dragging swatch | ⏳ TODO |
| **C3** | Wallpaper applied | Toast + "apply to all" | ⏳ TODO |
| **C4** | Pol stage | Floor tile/laminate selection | ⏳ TODO |
| **C5** | Mebel stage | Furniture room tabs + drag | ⏳ TODO |
| **C6** | Selected item card | Furniture detail + colors + rotate | ⏳ TODO |
| **C7** | Walkthrough | First-person + joystick | ⏳ TODO |
| **C8** | Top-down plan | 2D overhead view + furniture | ⏳ TODO |
| **C9** | Bezash yakunlandi | Decoration complete ✓ | ⏳ TODO |

### **Batch D: Electrical & Plumbing (10 screens)**

| Screen | Name | Purpose | Status |
|--------|------|---------|--------|
| **D1** | Elektr stage | Device list: box / switches / sockets | ⏳ TODO |
| **D2** | Electrical box placement | Drag to wall + settings | ⏳ TODO |
| **D3** | Socket placement ⭐ | Drag next to sofa (furniture-driven) | ⏳ TODO |
| **D4** | Device settings card | Height / type / color picker | ⏳ TODO |
| **D5** | Switch placement | By door with position hint | ⏳ TODO |
| **D6** | Light placement | Ceiling drag + color temp | ⏳ TODO |
| **D7** | Plumbing | Faucet/toilet with hot/cold pipes | ⏳ TODO |
| **D8** | Wire routing ⭐ | 2D plan + 3D view with red lines | ⏳ TODO |
| **D9** | Elektr natijasi ⭐ | Stats: 79.97m sim / 9 devices | ⏳ TODO |
| **D10** | Loyihangiz tayyor | Green ✓ + "Smetani ko'rish" button | ⏳ TODO |

**Bonus (E batch - future):**
- **E1-E3** | Smeta / Cost estimate | Material list + prices | ⏳ PENDING |

---

## 🧩 Component Library (Reusable)

**Navigation:**
- BottomNavBar (4 tabs + FAB)
- SegmentedControl (tabs, paint/wallpaper, etc.)
- StepIndicator (A7 walls A/B/C/D)
- StageLineBar (gray ✓ + blue active + light)

**Forms & Input:**
- TextInput (dimensions)
- Stepper (doors/windows count)
- SliderInput (wall length, position)
- UploadZone (floor plan image)
- ColorSwatch (paint/wallpaper)

**Cards & Containers:**
- ProjectCard (thumbnail + name + date)
- RoomMeasurementCard (stats: 34.6 m²)
- DeviceCard (socket/switch/light detail)
- EstimateLineCard (material + price)

**Modals & Sheets:**
- BottomSheet (A3, A8, B1-alt, drag handle)
- ConfirmDialog (delete furniture)
- Toast (✓ Shpaklovka qo'shildi)
- HintPill (translucent white + icon)

**3D/Canvas:**
- RoomViewer3D (first-person perspective)
- FloorPlanView (2D overhead)
- TouchJoystick (walkthrough control)
- WireRoutingOverlay (D8 red lines)

---

## 🔗 API Contracts (Shared Backend)

### Authentication
```
POST /auth/login
POST /auth/otp/request
POST /auth/otp/verify
POST /auth/refresh
POST /auth/logout
```

### Projects
```
GET /projects
POST /projects
GET /projects/{id}
PATCH /projects/{id}
DELETE /projects/{id}
```

### Rooms & Measurement
```
POST /projects/{id}/rooms
GET /projects/{id}/rooms
GET /rooms/{id}
PATCH /rooms/{id}

POST /rooms/{id}/measurement
GET /rooms/{id}/measurement
PUT /rooms/{id}/measurement

POST /rooms/{id}/walls
PATCH /rooms/{id}/walls/{wall_id}
POST /rooms/{id}/walls/{wall_id}/openings
DELETE /rooms/{id}/walls/{wall_id}/openings/{opening_id}
```

### Room State
```
GET /rooms/{id}/state
POST /rooms/{id}/state
```

### Materials & Finishes
```
GET /materials
GET /materials/{id}
POST /rooms/{id}/finishes
GET /rooms/{id}/finishes
DELETE /rooms/{id}/finishes/{finish_id}
```

### Furniture
```
GET /furniture
GET /furniture/{id}
POST /rooms/{id}/furniture
GET /rooms/{id}/furniture
DELETE /rooms/{id}/furniture/{furniture_id}
```

### Electrical
```
POST /rooms/{id}/electrical-devices
GET /rooms/{id}/electrical-devices
PATCH /rooms/{id}/electrical-devices/{device_id}
DELETE /rooms/{id}/electrical-devices/{device_id}
GET /rooms/{id}/electrical-plan
```

### Estimate
```
GET /rooms/{id}/estimate
POST /rooms/{id}/estimate/calculate
```

---

## 🎨 Design Tokens (from UyTamir spec)

### Colors
```typescript
const colors = {
  primary: '#1E3A8A',        // Deep blue
  primary_tint: '#EEF1F8',   // Light blue bg
  accent: '#F97316',         // Orange
  success: '#16A34A',        // Green
  gray_existing: '#C4CCE0',  // Gray for "already done"
  
  bg_surface: '#F8FAFC',
  bg_card: '#FFFFFF',
  text_primary: '#1A2340',
  text_secondary: '#5A6785',
  text_muted: '#98A2BC',
  border: '#E2E7F2',
}
```

### Typography
```typescript
const fonts = {
  title_screen: { size: 24, weight: '800' },    // Do'kon
  title_section: { size: 17, weight: '800' },   // Headers
  title_card: { size: 15, weight: '700' },      // Card titles
  body: { size: 13, weight: '500' },            // Body text
  label: { size: 11, weight: '600' },           // Captions
}
```

### Spacing
```typescript
const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
}
```

### Border Radius
```typescript
const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 28,
}
```

---

## 📦 Phase-by-Phase Implementation

### **Phase 1: Foundation (Week 1-2)**
- ✅ Project scaffold (done)
- ✅ Types & store (done)
- ✅ API client (done)
- ⏳ Navigation setup (4 tabs + FAB)
- ⏳ Auth flow (login → A1)
- ⏳ Component library base

**Screens:** None (infrastructure)

### **Phase 2: Entry & Measurement (Week 3-5)**
- ⏳ A1: Greeting (empty state)
- ⏳ A2: Project list
- ⏳ A3: Entry sheet (LiDAR / 360° / Manual)
- ⏳ A6-A9: Manual dimension workflow
- ⏳ A4-A5: Placeholder (camera modes)

**Deliverable:** User can measure a room end-to-end

### **Phase 3: Room State & 3D Entry (Week 5-6)**
- ⏳ B1: Room state selector
- ⏳ B2: First-person 3D entry
- ⏳ B3: Paint/wallpaper intro + rail

**Deliverable:** User enters the 3D room

### **Phase 4: Decoration (Week 7-10)**
- ⏳ C1-C3: Paint/wallpaper with drag
- ⏳ C4-C6: Floor + furniture
- ⏳ C7-C8: Walkthrough + top-down
- ⏳ C9: Decoration complete

**Deliverable:** Full decoration workflow

### **Phase 5: Electrical & Plumbing (Week 11-14)**
- ⏳ D1-D7: Device placement
- ⏳ D8-D9: Wire routing + stats
- ⏳ D10: Project complete

**Deliverable:** Electrical planning complete

### **Phase 6: Polish & Launch (Week 15-16)**
- ⏳ Estimate integration (E1-E3)
- ⏳ Animations & interactions
- ⏳ Testing & QA
- ⏳ App store builds

---

## 🚀 Getting Started

### **1. Install Dependencies**
```bash
cd tamir_uy_mobile
npm install
```

### **2. Set Environment Variables**
```bash
# .env.local
EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1
EXPO_PUBLIC_APP_ENV=development
```

### **3. Start Development Server**
```bash
npm run dev
```

### **4. Open in Simulator/Device**
```bash
# iOS
npm run ios

# Android
npm run android

# Web (for testing)
npm run web
```

---

## 📋 Development Checklist

- [ ] Phase 1: Navigation + Auth
- [ ] Phase 2: Measurement workflow
- [ ] Phase 3: Room state + 3D
- [ ] Phase 4: Decoration UI
- [ ] Phase 5: Electrical workflow
- [ ] Phase 6: Polish + launch
- [ ] All 29 screens implemented
- [ ] API integration complete
- [ ] Testing suite passing
- [ ] App store builds working
- [ ] Performance profiled (<3s load)
- [ ] Accessibility audit done

---

## 🔗 Connections to Backend

**Same database, same API:**
- User auth → `GET /auth/me`
- Projects → `GET /projects`
- Rooms + measurements → `GET /rooms/{id}`
- Materials/furniture → `GET /materials`, `GET /furniture`
- Electrical devices → `GET /rooms/{id}/electrical-devices`
- Estimate → `GET /rooms/{id}/estimate`

**No mobile-specific endpoints needed** — reuse backend as-is.

---

## ⏱️ Timeline

- **Foundation:** 2 weeks
- **Measurement:** 3 weeks
- **Decoration:** 4 weeks
- **Electrical:** 4 weeks
- **Polish & Launch:** 2 weeks

**Total: 15 weeks (3-4 months) to full product**

---

## 🎯 Next Steps

1. **Set up React Navigation** (Tab.Navigator)
2. **Create auth flow** (login → A1)
3. **Build measurement wizard** (A6-A9)
4. **Integrate 3D rendering** (B2 first-person)
5. **Implement drag-drop** (C/D stages)

Ready to start Phase 1? 🚀
