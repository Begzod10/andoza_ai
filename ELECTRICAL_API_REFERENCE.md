# Electrical Workflow - Complete API Reference & Examples

## Complete Data Flow Example

This document shows a complete example of how data flows through the electrical workflow screens and what the backend should return.

## Scenario: User Places Electrical Devices in Bedroom

### Step 1: User Enters D1_ElectricalPlan

**What happens**:
1. App fetches existing devices for room
2. Room is "Yatak xonasi" with 280cm ceiling, ~15m² area
3. Floor plan is drawn based on room dimensions

**API Call**:
```http
GET /api/v1/rooms/bedroom-001/electrical
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** (first time, no devices exist):
```json
{
  "success": true,
  "data": {
    "devices": []
  },
  "error": null
}
```

**What the app does**:
- Clears electrical devices array in Zustand store
- Displays empty floor plan with grid
- User can now place devices

**User Actions in D1**:
- Places 2 ceiling lights at height 110cm (typical height for spots)
- Places 1 chandelier light at height 280cm (on ceiling)
- Places 3 outlets at height 30cm (standard height)
- Places 2 switches at height 110cm

**Devices added to store**:
```typescript
[
  {
    id: "dev-001",
    room_id: "bedroom-001",
    type: "light",
    variant: undefined, // Will be set in D2
    wall: "A",
    height: 110,
    position: 1.5,
    placed_at: "2026-07-24T10:00:00Z"
  },
  {
    id: "dev-002",
    room_id: "bedroom-001",
    type: "light",
    variant: undefined,
    wall: "B",
    height: 110,
    position: 2.0,
    placed_at: "2026-07-24T10:01:00Z"
  },
  {
    id: "dev-003",
    room_id: "bedroom-001",
    type: "light",
    variant: undefined,
    wall: "ceiling",
    height: 280,
    position: 1.5,
    placed_at: "2026-07-24T10:02:00Z"
  },
  {
    id: "dev-004",
    room_id: "bedroom-001",
    type: "socket",
    variant: undefined,
    wall: "A",
    height: 30,
    position: 0.5,
    placed_at: "2026-07-24T10:03:00Z"
  },
  // ... 4 more devices ...
]
```

### Step 2: User Enters D2_DeviceSelection

**What happens**:
1. User selects device types for the 8 placed devices
2. Sets quantities for each variant

**User Selections**:
- Lighting section:
  - Spot lights: 2 (for wall lights)
  - Chandelier: 1 (for ceiling)
  - LED strip: 0
- Outlets section:
  - Single socket: 3
  - Double socket: 0
- Switches section:
  - Single switch: 2
  - Double switch: 0
  - Sensor switch: 0

**App Behavior**:
- Shows summary: 8 total devices, 8 variants selected (2/4)
- Maps first 2 spot lights to dev-001 and dev-002
- Maps chandelier to dev-003
- Maps 3 single sockets to dev-004, dev-005, dev-006
- Maps 2 switches to dev-007, dev-008

**Store after D2**:
```typescript
electricalDevices = [
  { ...dev-001, variant: "spot" },
  { ...dev-002, variant: "spot" },
  { ...dev-003, variant: "chandelier" },
  { ...dev-004, variant: "single_socket" },
  { ...dev-005, variant: "single_socket" },
  { ...dev-006, variant: "single_socket" },
  { ...dev-007, variant: "single_switch" },
  { ...dev-008, variant: "single_switch" },
]
```

### Step 3: User Enters D3_LightingPreview

**What happens**:
1. Shows 3D room with 3 lights (spots and chandelier)
2. 3 outlets and 2 switches are not shown (only lights in this view)
3. User can rotate, zoom, and adjust light intensities

**Light Intensities Set**:
```typescript
{
  "dev-001": 0.8, // Spot light 80% bright
  "dev-002": 0.7, // Spot light 70% bright
  "dev-003": 0.9, // Chandelier 90% bright
}
```

**3D Projection Example** (for dev-001 spot):
```
Input: wall=A, height=110cm, position=1.5m
3D coords: x=1.5, y=1.1 (110/100), z=0.2 (random)

After rotation (rx=0.3, ry=0.4, zoom=1.0):
Projected: {
  x: 187.5, // pixels from left
  y: 142.0, // pixels from top
  size: 28   // pixel size
}
```

**Store State**:
- currentStage: 7 (out of 8)
- electricalDevices: all 8 with variants

### Step 4: User Enters D4_ElectricalSummary

**What happens**:
1. Calculate wire needed based on device types
2. Show cost breakdown
3. User saves the plan

**Wire Calculations**:
```typescript
const calculations = [
  {
    type: "yoritgich", // Lighting
    quantity: 3,
    estimatedLength: 75 // 3 × 25m per fixture
  },
  {
    type: "rozeta", // Outlets
    quantity: 3,
    estimatedLength: 60 // 3 × 20m per outlet
  },
  {
    type: "kalit", // Switches
    quantity: 2,
    estimatedLength: 30 // 2 × 15m per switch
  }
]

totalWireLength = 165 meters
conduitNeeded = 165 × 1.3 = 214.5 meters
```

**Cost Estimate**:
```
Elektr simlari (Wire):     165m × 8,000 som/m = 1,320,000 som
Gofra (Conduit):           214.5m × 5,000 som/m = 1,072,500 som
Qurilmalar (Devices):      8 × 50,000 som = 400,000 som
                                    TOTAL = 2,792,500 som
```

**API Save Call**:
```http
POST /api/v1/rooms/bedroom-001/electrical
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "room_id": "bedroom-001",
  "devices": [
    {
      "id": "dev-001",
      "room_id": "bedroom-001",
      "type": "light",
      "variant": "spot",
      "wall": "A",
      "height": 110,
      "position": 1.5,
      "placed_at": "2026-07-24T10:00:00Z"
    },
    ... (7 more devices) ...
  ],
  "total_wire_length": 165,
  "wire_by_type": {
    "yoritgich": 75,
    "rozeta": 60,
    "kalit": 30
  },
  "conduit_needed": 214.5,
  "device_count": 8
}
```

**Expected Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "room_id": "bedroom-001",
    "saved_at": "2026-07-24T10:15:00Z",
    "device_count": 8,
    "total_wire_length": 165,
    "estimated_cost": 2792500
  },
  "error": null
}
```

**App Behavior After Save**:
- Sets currentStage to 8 (next stage)
- Navigates to next workflow step
- All electrical data now persisted on backend

---

## Complete API Reference

### Endpoint 1: GET /rooms/{id}/electrical

Fetch electrical plan for a room (used by D1_ElectricalPlan)

**Request**:
```http
GET /api/v1/rooms/bedroom-001/electrical
Authorization: Bearer {token}
Accept: application/json
```

**Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "devices": [
      {
        "id": "dev-001",
        "room_id": "bedroom-001",
        "type": "light",
        "variant": "spot",
        "wall": "A",
        "height": 110,
        "position": 1.5,
        "color": null,
        "placed_at": "2026-07-24T10:00:00Z"
      },
      {
        "id": "dev-002",
        "room_id": "bedroom-001",
        "type": "socket",
        "variant": "double_socket",
        "wall": "B",
        "height": 30,
        "position": 2.0,
        "color": null,
        "placed_at": "2026-07-24T10:01:00Z"
      }
    ]
  },
  "error": null
}
```

**Not Found (404)**:
```json
{
  "success": false,
  "data": null,
  "error": "Xona topilmadi"
}
```

**Unauthorized (401)**:
```json
{
  "success": false,
  "data": null,
  "error": "Token muddati tugagan"
}
```

---

### Endpoint 2: POST /rooms/{id}/electrical

Save completed electrical plan (used by D4_ElectricalSummary)

**Request**:
```http
POST /api/v1/rooms/bedroom-001/electrical
Authorization: Bearer {token}
Content-Type: application/json
Content-Length: 1847

{
  "room_id": "bedroom-001",
  "devices": [
    {
      "id": "dev-001",
      "room_id": "bedroom-001",
      "type": "light",
      "variant": "spot",
      "wall": "A",
      "height": 110,
      "position": 1.5,
      "color": null,
      "placed_at": "2026-07-24T10:00:00Z"
    },
    {
      "id": "dev-002",
      "room_id": "bedroom-001",
      "type": "light",
      "variant": "chandelier",
      "wall": "ceiling",
      "height": 280,
      "position": 1.5,
      "color": null,
      "placed_at": "2026-07-24T10:01:00Z"
    },
    {
      "id": "dev-003",
      "room_id": "bedroom-001",
      "type": "socket",
      "variant": "single_socket",
      "wall": "A",
      "height": 30,
      "position": 0.5,
      "color": null,
      "placed_at": "2026-07-24T10:02:00Z"
    },
    {
      "id": "dev-004",
      "room_id": "bedroom-001",
      "type": "socket",
      "variant": "single_socket",
      "wall": "B",
      "height": 30,
      "position": 1.0,
      "color": null,
      "placed_at": "2026-07-24T10:03:00Z"
    },
    {
      "id": "dev-005",
      "room_id": "bedroom-001",
      "type": "socket",
      "variant": "single_socket",
      "wall": "C",
      "height": 30,
      "position": 1.5,
      "color": null,
      "placed_at": "2026-07-24T10:04:00Z"
    },
    {
      "id": "dev-006",
      "room_id": "bedroom-001",
      "type": "switch",
      "variant": "single_switch",
      "wall": "A",
      "height": 110,
      "position": 0.2,
      "color": null,
      "placed_at": "2026-07-24T10:05:00Z"
    },
    {
      "id": "dev-007",
      "room_id": "bedroom-001",
      "type": "switch",
      "variant": "single_switch",
      "wall": "B",
      "height": 110,
      "position": 0.2,
      "color": null,
      "placed_at": "2026-07-24T10:06:00Z"
    },
    {
      "id": "dev-008",
      "room_id": "bedroom-001",
      "type": "light",
      "variant": "spot",
      "wall": "B",
      "height": 110,
      "position": 2.0,
      "color": null,
      "placed_at": "2026-07-24T10:07:00Z"
    }
  ],
  "total_wire_length": 165,
  "wire_by_type": {
    "yoritgich": 75,
    "rozeta": 60,
    "kalit": 30
  },
  "conduit_needed": 214.5,
  "device_count": 8
}
```

**Success Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "room_id": "bedroom-001",
    "saved_at": "2026-07-24T10:15:30Z",
    "device_count": 8,
    "total_wire_length": 165,
    "total_conduit": 214.5,
    "estimated_cost": 2792500,
    "plan_id": "plan-001"
  },
  "error": null
}
```

**Validation Error (400)**:
```json
{
  "success": false,
  "data": null,
  "error": "Qurilmalar bo'sh bo'lishi mumkin emas"
}
```

**Room Not Found (404)**:
```json
{
  "success": false,
  "data": null,
  "error": "Xona topilmadi"
}
```

**Unauthorized (401)**:
```json
{
  "success": false,
  "data": null,
  "error": "Himoyalash tokeni noto'g'ri"
}
```

---

## Type Definitions (TypeScript)

```typescript
// Device classification
type DeviceType = 'box' | 'socket' | 'switch' | 'light' | 'plumbing'

// Specific device subtypes
type DeviceVariant =
  | 'single_socket'
  | 'double_socket'
  | 'single_switch'
  | 'double_switch'
  | 'sensor_switch'
  | 'chandelier'
  | 'spot'
  | 'strip'
  | 'faucet'
  | 'toilet'
  | 'shower'

// Physical location on room
type WallPosition = 'A' | 'B' | 'C' | 'D' | 'ceiling'

// Complete device record
interface ElectricalDevice {
  id: string                    // Unique ID
  room_id: string              // Which room
  type: DeviceType             // Category
  variant?: DeviceVariant      // Specific type (optional until D2)
  wall?: WallPosition          // Which wall (A/B/C/D/ceiling)
  height: number               // Height in cm from ground
  position: number             // Position along wall in meters
  color?: string               // Optional color
  placed_at: string            // ISO8601 timestamp
}

// Electrical plan for a room
interface ElectricalPlan {
  room_id: string
  devices: ElectricalDevice[]
  total_wire_length: number    // meters
  wire_by_type: Record<string, number> // "yoritgich" -> 75
  conduit_needed: number       // meters (gofra)
  device_count: number
  calculated_at: string        // ISO8601 timestamp
}

// API Response wrapper
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string | null
}

// Specific response for GET electrical
type GetElectricalResponse = ApiResponse<{
  devices: ElectricalDevice[]
}>

// Specific response for POST electrical save
type PostElectricalResponse = ApiResponse<{
  room_id: string
  saved_at: string
  device_count: number
  total_wire_length: number
  total_conduit: number
  estimated_cost: number
  plan_id: string
}>
```

---

## Implementation Checklist for Backend

- [ ] GET /rooms/{id}/electrical endpoint created
  - [ ] Fetch devices for room from database
  - [ ] Return empty array if no devices exist
  - [ ] Check user authorization (token)
  - [ ] Return 404 if room doesn't exist

- [ ] POST /rooms/{id}/electrical endpoint created
  - [ ] Validate all required fields present
  - [ ] Check user authorization (token)
  - [ ] Validate device count > 0
  - [ ] Store devices in database
  - [ ] Calculate costs if needed
  - [ ] Return 201 Created on success
  - [ ] Return 400 on validation error

- [ ] Database schema for electrical_devices table
  - [ ] id (primary key)
  - [ ] room_id (foreign key)
  - [ ] type enum (light, socket, switch, etc)
  - [ ] variant (string, nullable)
  - [ ] wall enum (A, B, C, D, ceiling, nullable)
  - [ ] height (integer)
  - [ ] position (decimal)
  - [ ] color (string, nullable)
  - [ ] placed_at (timestamp)
  - [ ] created_at (timestamp)
  - [ ] updated_at (timestamp)

- [ ] Database schema for electrical_plans table
  - [ ] id (primary key)
  - [ ] room_id (foreign key)
  - [ ] total_wire_length (decimal)
  - [ ] conduit_needed (decimal)
  - [ ] device_count (integer)
  - [ ] estimated_cost (integer, som)
  - [ ] saved_at (timestamp)

- [ ] Wire calculation algorithm
  - [ ] Lights: 25m per device
  - [ ] Outlets: 20m per device
  - [ ] Switches: 15m per device
  - [ ] Conduit: wire_length × 1.3

- [ ] Cost calculation algorithm
  - [ ] Wire: 8,000 som/meter
  - [ ] Conduit: 5,000 som/meter
  - [ ] Devices: 50,000 som average

---

## Error Handling Examples

### When User Has No Internet

**D1 Behavior**:
```typescript
try {
  const response = await apiClient.get(`/rooms/${room.id}/electrical`)
} catch (err) {
  // Network error caught
  showAlert("Xato", "Internetga ulanib olib ko'ring")
  showRetryButton()
}
```

### When Device Count Exceeds Limit (e.g., max 100)

**Backend Response** (400):
```json
{
  "success": false,
  "error": "Qurilmalar soni 100 tadan ko'p bo'lishi mumkin emas (100+ ta topildi)"
}
```

**D4 Behavior**:
```typescript
if (!response.data.success) {
  Alert.alert('Xato', response.data.error)
  // Don't navigate away, keep user on screen to reduce count
}
```

### When Session Expires During Save

**Backend Response** (401):
```json
{
  "success": false,
  "error": "Himoyalash tokeni muddati tugagan"
}
```

**D4 Behavior**:
```typescript
catch (err) {
  if (err.response?.status === 401) {
    Alert.alert('Xato', 'Qayta kirish kerak', [
      { text: 'Kirish', onPress: () => navigation.navigate('Login') }
    ])
  } else {
    Alert.alert('Xato', 'Saqlashda xatolik. Qayta urinish?', [
      { text: 'Qayta', onPress: handleSave },
      { text: 'Bekor', onPress: () => {} }
    ])
  }
}
```

---

## Testing Scenarios

### Scenario 1: Happy Path (Complete Success)
- User places 5 devices ✓
- Selects types for all ✓
- Adjusts light intensities ✓
- Saves successfully ✓
- Navigates to next stage ✓

### Scenario 2: Network Failure on Fetch
- User enters D1 ✗ Network error
- Shows error message ✓
- User taps Retry ✓
- Fetch succeeds ✓
- Continues workflow ✓

### Scenario 3: Validation Error on Save
- User tries to save with 0 devices ✗
- Backend returns 400 ✓
- App shows error ✓
- User adds devices ✓
- Retry succeeds ✓

### Scenario 4: Token Expiration
- User on D4, token expires ✗
- Save request returns 401 ✓
- App detects auth error ✓
- Redirects to login ✓
- After login, can retry ✓
