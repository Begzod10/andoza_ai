# Electrical Workflow Screens Documentation

This document describes the 4-screen electrical planning workflow for the Tamir Uy mobile app.

## Overview

The electrical workflow guides users through creating a comprehensive electrical plan for a room. It consists of 4 screens:

1. **D1_ElectricalPlan** - Floor plan with fixture placement
2. **D2_DeviceSelection** - Device type and quantity selection
3. **D3_LightingPreview** - 3D visualization with intensity controls
4. **D4_ElectricalSummary** - Final plan summary with cost estimates

## Screen Details

### D1_ElectricalPlan.tsx

**Purpose**: Display room floor plan and allow users to place electrical devices

**Features**:
- Displays floor plan with grid background
- Visualizes already-placed devices as interactive dots
- Allows selection of wall (A, B, C, D, or ceiling)
- Height slider (0-280cm from ground)
- Position slider (0-6m along wall)
- List of all placed devices
- Quick preset buttons for common heights

**State Management**:
- Uses `useAppStore()` for:
  - `electricalDevices` - current room's electrical devices
  - `addDevice()` - add new device
  - `removeDevice()` - remove device
  - `activeRoom` - currently selected room

**API Integration**:
- **GET** `/rooms/{id}/electrical` - Fetch existing electrical devices for room
- Response format:
  ```json
  {
    "success": true,
    "data": {
      "devices": [
        {
          "id": "string",
          "room_id": "string",
          "type": "light|socket|switch|box",
          "variant": "spot|chandelier|strip|single_socket|...",
          "wall": "A|B|C|D|ceiling",
          "height": 110,
          "position": 2.5,
          "placed_at": "ISO8601"
        }
      ]
    }
  }
  ```

**Error Handling**:
- Network error message displayed to user
- Retry button on error state
- Loading spinner while fetching

**Navigation**:
- Back button returns to previous screen
- Next button navigates to D2_DeviceSelection (disabled if no devices)

---

### D2_DeviceSelection.tsx

**Purpose**: Allow users to specify device types and quantities

**Features**:
- Expandable device categories:
  - Yoritish (Lighting): Spot, Chandelier, Strip
  - Rozetkalar (Outlets): Single, Double
  - Kalitlar (Switches): Single, Double, Sensor
- Quantity selector for each variant (±/count display)
- Visual indication of selected items
- Summary shows total devices and selected variants
- Progress indicator (2/4)

**State Management**:
- Local state:
  - `selectedVariants` - tracks selected device types and quantities
  - `expandedCategory` - tracks which category is open
- Uses `useAppStore()` for:
  - `updateDevice()` - update device variants
  - `setCurrentStage()` - update workflow stage

**Validation**:
- Next button disabled until at least one variant is selected
- Shows warning if no devices to update

**Navigation**:
- Back button returns to D1_ElectricalPlan
- Next button proceeds to D3_LightingPreview

---

### D3_LightingPreview.tsx

**Purpose**: Provide interactive 3D visualization of lights in the room

**Features**:
- 3D perspective projection of room with light fixtures
- Interactive rotation controls:
  - Left/Right arrow buttons for horizontal rotation
  - Up/Down arrow buttons for vertical rotation
  - Reset button to restore default view
- Zoom controls:
  - In/Out buttons
  - Zoom percentage display
- Individual light intensity slider (0-100%)
- Tap lights to select and adjust intensity
- Real-time visual feedback:
  - Selected light has white border
  - Light intensity affects glow/core opacity
  - Glow effect represents light spread
- Statistics panel:
  - Total lights count
  - Average light output
  - Progress indicator (3/4)

**Visualization Logic**:
- Simple 3D projection with rotation matrices
- Lights positioned based on:
  - Horizontal position (x-axis along wall)
  - Height from ground (y-axis)
  - Random depth for visual interest (z-axis)
- Light size scales based on depth perspective

**Navigation**:
- Back button returns to D2_DeviceSelection
- Next button proceeds to D4_ElectricalSummary

---

### D4_ElectricalSummary.tsx

**Purpose**: Display final electrical plan summary with cost estimates and save to backend

**Features**:
- Device breakdown by type with icons
- Wire length calculations:
  - Lighting: ~25m per fixture to main panel
  - Outlets: ~20m per outlet to main panel
  - Switches: ~15m per switch to main panel
  - Conduit (gofra): 30% more than total wire length
- Estimated costs (per-unit pricing):
  - Wire: 8,000 som/meter
  - Conduit: 5,000 som/meter
  - Devices: 50,000 som average
- Recommendations:
  - LED lighting benefits
  - Outlet placement suggestions
  - Circuit breaker reminder
- Progress indicator (4/4)
- Save button triggers API POST request

**State Management**:
- Local state:
  - `wireCalculations` - breakdown by device type
  - `totalWireLength` - total wire needed
  - `conduitNeeded` - total conduit
  - `saving` - loading state during save
- Uses `useAppStore()` for:
  - `setCurrentStage()` - update workflow stage to 8 (complete)

**API Integration**:
- **POST** `/rooms/{id}/electrical` - Save completed electrical plan
- Request format:
  ```json
  {
    "room_id": "string",
    "devices": [...],
    "total_wire_length": 245.5,
    "wire_by_type": {
      "yoritgich": 125.0,
      "rozeta": 80.0,
      "kalit": 40.5
    },
    "conduit_needed": 318.15,
    "device_count": 12
  }
  ```
- Response format:
  ```json
  {
    "success": true,
    "data": {
      "room_id": "string",
      "saved_at": "ISO8601"
    },
    "error": null
  }
  ```

**Error Handling**:
- Save failure shows alert with error message
- Retry possible without losing data
- Loading spinner during save
- Back button disabled during save

**Navigation**:
- Back button returns to D3_LightingPreview (disabled during save)
- Save button triggers API call, then navigates to finish screen

---

## Navigation Flow

```
D1_ElectricalPlan
    ↓ (devices added)
D2_DeviceSelection
    ↓ (variants selected)
D3_LightingPreview
    ↓ (intensities set)
D4_ElectricalSummary
    ↓ (saved)
Finish / Next Stage
```

## Integration with Router

Add to your navigation configuration:

```typescript
<Stack.Screen
  name="D1_ElectricalPlan"
  component={D1_ElectricalPlanScreen}
  options={{ title: 'Elektr sxemasi' }}
/>
<Stack.Screen
  name="D2_DeviceSelection"
  component={D2_DeviceSelectionScreen}
  options={{ title: 'Qurilma turini tanlang' }}
/>
<Stack.Screen
  name="D3_LightingPreview"
  component={D3_LightingPreviewScreen}
  options={{ title: 'Yorug\'lik ko\'rinishi' }}
/>
<Stack.Screen
  name="D4_ElectricalSummary"
  component={D4_ElectricalSummaryScreen}
  options={{ title: 'Elektr sxemasi xulosa' }}
/>
```

## Zustand Store Extensions

The app store already includes electrical device methods. These are used:

```typescript
// Add a new device
addDevice(device: ElectricalDevice): void

// Remove a device
removeDevice(deviceId: string): void

// Update a device
updateDevice(deviceId: string, updates: Partial<ElectricalDevice>): void

// Get all devices
electricalDevices: ElectricalDevice[]

// Set current stage
setCurrentStage(stage: number): void
```

## Types Reference

```typescript
interface ElectricalDevice {
  id: string
  room_id: string
  type: DeviceType // 'box' | 'socket' | 'switch' | 'light' | 'plumbing'
  variant?: DeviceVariant // Device subtype
  wall?: 'A' | 'B' | 'C' | 'D' | 'ceiling'
  height: number // cm from ground
  position: number // offset along wall (m)
  color?: string
  placed_at: string // ISO8601
}

type DeviceType = 'box' | 'socket' | 'switch' | 'light' | 'plumbing'

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
```

## Styling Notes

- All screens use NativeWind (Tailwind for React Native)
- Blue theme consistent throughout:
  - Primary: `bg-blue-600` (#2563eb)
  - Light: `bg-blue-50` (#eff6ff)
  - Gradient header: `bg-gradient-to-r from-blue-600 to-blue-400`
- Uzbek language in all user-facing text
- Responsive layout using `flex-1`, `flex-row`, `flex-wrap`

## Testing Considerations

### Unit Tests
- Device placement logic
- Wire length calculations
- Cost estimation formulas

### Integration Tests
- API call success/failure scenarios
- Navigation between screens
- Zustand store state updates

### E2E Tests
- Complete workflow from device placement to save
- Error recovery (retry on API failure)
- Validation (can't proceed without meeting requirements)

## Future Enhancements

1. **Advanced 3D rendering** - Use Three.js for photorealistic room visualization
2. **Material suggestions** - Recommend wire gauges and conduit sizes based on load
3. **Code compliance** - Check against local electrical codes
4. **PDF export** - Generate detailed electrical plan PDF
5. **Collaboration** - Share plans with electricians for feedback
6. **AR preview** - Augmented reality visualization of actual devices in room
7. **Device catalog** - Integrate with product database for pricing
8. **Consumption calculator** - Estimate monthly electricity usage based on devices

## Troubleshooting

### Devices not appearing on floor plan
- Ensure room dimensions are loaded correctly
- Check that activeRoom is set in Zustand store
- Verify device wall/position values are within valid ranges

### 3D preview not showing lights
- Verify electricalDevices array is populated
- Check that variant types are correctly assigned
- Ensure zoom level hasn't made lights too small to see

### API calls failing
- Check network connectivity
- Verify API endpoint URLs are correct
- Ensure authentication token is valid
- Check request payload format matches backend expectations

### Save button not working
- Verify all devices have been placed and configured
- Check that room_id is present in activeRoom
- Ensure API endpoint returns success response
- Check console for error messages
