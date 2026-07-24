# Electrical Workflow - Real-World Usage Examples

This document provides practical examples of how to use the electrical workflow screens in your application.

## Example 1: Typical Bedroom Setup

### Scenario
User wants to plan electrical layout for a 3.5m × 4.5m bedroom with 2.8m ceiling.

### Step 1: Enter D1_ElectricalPlan
```
Room: "Yatak xonasi" 
Floor Plan: 3.5m × 4.5m drawn on screen
User places devices:
  - Wall A (3.5m length):
    - Ceiling spot light at 1m (height 280cm)
    - Wall light at 1.5m (height 110cm)
    - Outlet at 0.5m (height 30cm)
    - Outlet at 3m (height 30cm)
  - Wall B (4.5m length):
    - Switch at 0.2m (height 110cm)
    - Outlet at 2m (height 30cm)
  - Wall C (3.5m length):
    - Chandelier at center (height 280cm)
    - Switch at 0.2m (height 110cm)
  - Wall D (4.5m length):
    - Outlet at 1.5m (height 30cm)

Total devices placed: 9
```

### Step 2: Enter D2_DeviceSelection
```
User selects:
  Yoritish (Lighting):
    - Spot: 2 units
    - Chandelier: 1 unit
  Rozetkalar (Outlets):
    - Single socket: 3 units
  Kalitlar (Switches):
    - Single switch: 2 units
    - Double switch: 0 units
    - Sensor switch: 0 units

Total selected: 8 units (matches 8 light/socket/switch devices)
```

### Step 3: Enter D3_LightingPreview
```
3D View shows:
  ✓ 2 spot lights from walls (glow: 70-80% intensity)
  ✓ 1 chandelier on ceiling (glow: 90% intensity)
  
User rotates view around to see light spread.
Outlets and switches not shown (lighting-only view).
```

### Step 4: Enter D4_ElectricalSummary
```
Wire Calculations:
  - Lighting (3 fixtures): 3 × 25m = 75m
  - Outlets (3 units): 3 × 20m = 60m
  - Switches (2 units): 2 × 15m = 30m
  ─────────────────────────────
  Total wire: 165m
  Conduit needed: 165 × 1.3 = 214.5m

Cost Estimate:
  - Wire (165m × 8,000 som): 1,320,000 som
  - Conduit (214.5m × 5,000 som): 1,072,500 som
  - Devices (8 × 50,000 som): 400,000 som
  ─────────────────────────
  TOTAL: 2,792,500 som

User taps "Saqlash va Davom" → Saves to backend
Response: ✓ Success! Navigates to next stage
```

---

## Example 2: Small Apartment Kitchen

### Scenario
Compact 2.5m × 2m kitchen with 2.5m ceiling.

### Devices Placed (6 total)
```
D1_ElectricalPlan:
  - Ceiling: 2 spot lights (at 1m, 1.8m)
  - Wall A: 3 outlets (at 0.5m, 1.3m, 1.8m) - height 30cm
  - Wall B: 1 switch (at 0.2m) - height 110cm
```

### Device Selection
```
D2_DeviceSelection:
  - Spot lights: 2
  - Single sockets: 3
  - Single switch: 1
```

### Calculations (D4)
```
Wire Needed:
  - Lights: 2 × 25 = 50m
  - Outlets: 3 × 20 = 60m  
  - Switches: 1 × 15 = 15m
  Total: 125m
  Conduit: 162.5m

Cost:
  - Wire: 1,000,000 som
  - Conduit: 812,500 som
  - Devices: 300,000 som
  Total: 2,112,500 som
```

---

## Example 3: Large Living Room

### Scenario
4.5m × 5.5m living room with 3m ceiling, lots of seating areas.

### Devices Placed (15 total)
```
D1_ElectricalPlan:
  - Ceiling center: 1 chandelier (height 300cm)
  - Ceiling: 4 spot lights for ambient light
  - Walls: 5 outlets for devices/charging
  - Walls: 2 switches for light control
  - Walls: 2 outlets for entertainment center
```

### Device Selection
```
D2_DeviceSelection:
  - Chandelier: 1
  - Spot lights: 4
  - Single sockets: 5
  - Single switch: 2
  - Double sockets: 2 (for entertainment)
  
  Total: 14 devices (note: chandelier counts as 1 even though 5 devices)
```

### Calculations (D4)
```
Wire Needed:
  - Lights: 5 × 25 = 125m
  - Outlets: 7 × 20 = 140m
  - Switches: 2 × 15 = 30m
  Total: 295m
  Conduit: 383.5m

Cost:
  - Wire: 2,360,000 som
  - Conduit: 1,917,500 som
  - Devices: 700,000 som
  Total: 4,977,500 som (~$5,000)
```

---

## Example 4: Error Recovery Flow

### Scenario
User starts electrical plan but network fails during save.

### Flow
```
D1 → Places 5 devices ✓
D2 → Selects types ✓
D3 → Adjusts lights ✓
D4 → Clicks "Saqlash" 
    ↓
API Call: POST /rooms/room-123/electrical
    ↓
Network Timeout! ✗
    ↓
App shows:
  "Saqlashda xatolik"
  [Qayta | Bekor]
    ↓
User taps "Qayta" → Retry API call
    ↓
Success! ✓ Alert shown
    ↓
Navigate to next stage
```

### Code Example
```typescript
// In D4_ElectricalSummary.tsx
const handleSaveElectricalPlan = async () => {
  try {
    setSaving(true)
    const response = await apiClient.post(
      `/rooms/${activeRoom?.id}/electrical`,
      payload
    )
    
    if (response.data.success) {
      // SUCCESS
      Alert.alert('Muvaffaqiyat', 'Saqlandi', [
        { 
          text: 'Davom',
          onPress: () => navigation.navigate('NextScreen')
        }
      ])
    }
  } catch (err) {
    // FAILURE - Show retry option
    Alert.alert('Xato', 'Saqlashda xatolik', [
      { text: 'Qayta', onPress: handleSaveElectricalPlan },
      { text: 'Bekor', onPress: () => {} }
    ])
  } finally {
    setSaving(false)
  }
}
```

---

## Example 5: Device Count Validation

### Scenario
User tries to save without placing any devices.

### Flow
```
D1: No devices placed (0 devices) ✗
D2: "Next" button disabled ← App prevents invalid state
User must add at least 1 device in D1
```

### Code Example
```typescript
// In D1_ElectricalPlan.tsx
<TouchableOpacity
  onPress={() => navigation.navigate('D2_DeviceSelection')}
  disabled={electricalDevices.length === 0}  // ← Prevents invalid state
  className={electricalDevices.length === 0 ? 'bg-gray-300' : 'bg-blue-600'}
>
  <Text>Keyingi {electricalDevices.length > 0 ? '→' : ''}</Text>
</TouchableOpacity>
```

---

## Example 6: Device Modification Flow

### Scenario
User realizes they placed a device in wrong position.

### Flow
```
D1_ElectricalPlan:
  - User sees device on floor plan
  - Taps device → Shows delete confirmation
  - Confirms → Device removed from store
  - Placement resets
  - User can place new device in correct location
```

### Code Example
```typescript
// In D1_ElectricalPlan.tsx
const handleRemoveDevice = (deviceId: string) => {
  Alert.alert(
    'O\'chirish tasdig\'i',
    'Ushbu qurilmani o\'chirmoqchimisiz?',
    [
      { text: 'Bekor qilish', onPress: () => {} },
      {
        text: 'O\'chirish',
        onPress: () => removeDevice(deviceId),  // ← Zustand action
        style: 'destructive'
      }
    ]
  )
}
```

---

## Example 7: Intensity Adjustment

### Scenario
User wants to reduce brightness of some lights.

### Flow
```
D3_LightingPreview:
  - 3D view shows all lights
  - User taps Chandelier (center light)
  - Intensity slider appears
  - User drags to 70% brightness
  - Chandelier glow immediately updates
  - User can compare with original intensity
```

### Visual Effect
```
Original (100%):
  ⊙ ← Large bright glow

After adjustment (70%):
  ○ ← Smaller, dimmer glow
```

---

## Example 8: Complete Data State Through Workflow

### Tracking State Changes

```typescript
// Initial State (D1)
electricalDevices = [
  {
    id: "dev-001",
    type: "light",
    variant: undefined,  // Not yet assigned
    wall: "A",
    height: 110,
    position: 1.5,
    placed_at: "2026-07-24T10:00:00Z"
  }
]

// After D2 (Device Selection)
electricalDevices = [
  {
    ...dev-001,
    variant: "spot"  // ← Type assigned
  }
]

// After D3 (Lighting Adjustment)
// Note: intensities stored locally in D3, not persisted to store
// Store data unchanged

// Before D4 Save
// Same as after D2, ready to send to backend

// After D4 Save Success
electricalDevices = [
  {
    ...dev-001,
    placed_at: "2026-07-24T10:00:00Z"  // Timestamp from device creation
  }
]
// Response from backend confirms save:
// room_id, device_count, total_wire_length, plan_id, saved_at
```

---

## Example 9: Cost Breakdown Display

### Real Numbers Example

```
User saved plan with:
  - 3 lighting fixtures
  - 5 power outlets
  - 2 switches

D4 Displays:
┌─────────────────────────────────┐
│ Qurilmalar Xulosa               │
├─────────────────────────────────┤
│ Yoritgichlar (3):               │
│  - 3 × 25m = 75m sim           │
├─────────────────────────────────┤
│ Rozetkalar (5):                │
│  - 5 × 20m = 100m sim          │
├─────────────────────────────────┤
│ Kalitlar (2):                  │
│  - 2 × 15m = 30m sim           │
├─────────────────────────────────┤
│ JAMI: 205m sim                 │
│ Gofra: 266.5m                  │
└─────────────────────────────────┘

Cost Breakdown:
┌─────────────────────────────────┐
│ Elektr simlari                  │
│ 205m × 8,000 som = 1,640,000   │
├─────────────────────────────────┤
│ Gofra                           │
│ 266.5m × 5,000 som = 1,332,500 │
├─────────────────────────────────┤
│ Qurilmalar (10)                │
│ 10 × 50,000 som = 500,000      │
├─────────────────────────────────┤
│ JAMI: 3,472,500 som            │
└─────────────────────────────────┘
```

---

## Example 10: Backend Integration Test

### Testing the Complete Flow

```bash
#!/bin/bash

# 1. Test GET endpoint (fetch empty devices)
curl -X GET \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/rooms/test-room/electrical

# Expected:
# { "success": true, "data": { "devices": [] } }

# 2. Test POST endpoint (save plan)
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "room_id": "test-room",
    "devices": [...8 devices...],
    "total_wire_length": 165,
    "wire_by_type": {"yoritgich": 75, "rozeta": 60, "kalit": 30},
    "conduit_needed": 214.5,
    "device_count": 8
  }' \
  http://localhost:8000/api/v1/rooms/test-room/electrical

# Expected (201 Created):
# {
#   "success": true,
#   "data": {
#     "room_id": "test-room",
#     "saved_at": "2026-07-24T10:15:30Z",
#     "device_count": 8,
#     "total_wire_length": 165,
#     "estimated_cost": 2792500
#   }
# }

# 3. Test GET endpoint again (should now have devices)
curl -X GET \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/rooms/test-room/electrical

# Expected:
# { "success": true, "data": { "devices": [...8 devices...] } }
```

---

## Integration Checklist for Each Stage

### Before D1 Entry
- [ ] activeRoom is set
- [ ] User is authenticated
- [ ] Network connectivity available
- [ ] Zustand store initialized

### Before D2 Entry
- [ ] At least 1 device in electricalDevices
- [ ] All devices have type set
- [ ] All devices have wall/height/position
- [ ] Floor plan rendered successfully

### Before D3 Entry
- [ ] Devices selected with variants
- [ ] At least 1 lighting device
- [ ] 3D coordinates calculated
- [ ] Intensities initialized

### Before D4 Entry
- [ ] All lighting devices have variants
- [ ] Wire calculations possible
- [ ] Cost formula available
- [ ] Backend endpoint available

### After D4 Save
- [ ] API response success confirmed
- [ ] Plan ID received and stored
- [ ] User notification shown
- [ ] Next stage screen available

---

## Performance Tips

### For Large Device Counts (50+)
```typescript
// Optimize device list rendering with useMemo
const memoizedDevices = useMemo(
  () => electricalDevices.filter(d => d.wall === selectedWall),
  [electricalDevices, selectedWall]
)

// Render only visible items in list
{memoizedDevices.map(device => (
  <DeviceListItem key={device.id} device={device} />
))}
```

### For Slow Networks
```typescript
// Implement request timeout
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Timeout')), 10000)
)

const response = await Promise.race([
  apiClient.post('/rooms/{id}/electrical', payload),
  timeoutPromise
])
```

### For Memory Optimization
```typescript
// Clear devices when leaving workflow
useEffect(() => {
  return () => {
    // Optional: reset on unmount
    // resetElectricalDevices()
  }
}, [])
```

---

## Troubleshooting by Symptom

### "Devices disappear when I reload"
→ Check Zustand persistence (likely expected behavior - app state reset)

### "Save button is gray"
→ No devices added yet or all devices don't have variants selected

### "3D lights are too small/large"
→ Zoom in/out using zoom controls or reset view

### "Floor plan looks squished"
→ Check room dimensions in activeRoom (should have floor_area)

### "API error 401"
→ Token expired, user needs to re-authenticate

### "Can't add more than 100 devices"
→ Backend limit reached (documented limitation)

---

## Next Integration Points

After electrical workflow completes:
1. **Plumbing Workflow** (D5-D8) - Santexnika/water systems
2. **Cost Estimation** - Combine electrical + plumbing + materials
3. **Quote Generation** - Create formal quotation PDF
4. **Contractor Matching** - Find electricians/plumbers
5. **Project Timeline** - Estimate project duration
