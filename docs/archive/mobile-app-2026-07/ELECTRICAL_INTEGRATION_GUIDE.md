# Electrical Workflow Integration Guide

This guide explains how to integrate the 4-screen electrical workflow into your Tamir Uy mobile app.

## Files Created

- `src/screens/D1_ElectricalPlan.tsx` - Floor plan with device placement
- `src/screens/D2_DeviceSelection.tsx` - Device type/quantity selection
- `src/screens/D3_LightingPreview.tsx` - 3D visualization
- `src/screens/D4_ElectricalSummary.tsx` - Summary & save

## Step 1: Update Navigation

In your `RootNavigator.tsx` or equivalent navigation file:

```typescript
import D1_ElectricalPlanScreen from '../screens/D1_ElectricalPlan'
import D2_DeviceSelectionScreen from '../screens/D2_DeviceSelection'
import D3_LightingPreviewScreen from '../screens/D3_LightingPreview'
import D4_ElectricalSummaryScreen from '../screens/D4_ElectricalSummary'

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* ... existing screens ... */}
        
        {/* Electrical Workflow - Stage 5 (stages 0-4 are prior decoration steps) */}
        <Stack.Screen
          name="D1_ElectricalPlan"
          component={D1_ElectricalPlanScreen}
          options={{
            title: 'Elektr sxemasi',
            headerShown: true,
            headerBackVisible: true,
          }}
        />
        <Stack.Screen
          name="D2_DeviceSelection"
          component={D2_DeviceSelectionScreen}
          options={{
            title: 'Qurilma turini tanlang',
            headerShown: true,
            headerBackVisible: true,
          }}
        />
        <Stack.Screen
          name="D3_LightingPreview"
          component={D3_LightingPreviewScreen}
          options={{
            title: 'Yorug\'lik ko\'rinishi',
            headerShown: true,
            headerBackVisible: true,
          }}
        />
        <Stack.Screen
          name="D4_ElectricalSummary"
          component={D4_ElectricalSummaryScreen}
          options={{
            title: 'Elektr sxemasi xulosa',
            headerShown: true,
            headerBackVisible: true,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
```

## Step 2: Link from Previous Screen

In your prior decoration/furniture screen, add a button to enter electrical workflow:

```typescript
<TouchableOpacity
  onPress={() => {
    setCurrentStage(5) // Electrical is stage 5
    navigation.navigate('D1_ElectricalPlan')
  }}
  className="bg-blue-600 py-3 px-4 rounded-lg items-center justify-center"
>
  <Text className="text-white font-bold">Elektr → (Keyingi bosqich)</Text>
</TouchableOpacity>
```

## Step 3: Backend API Endpoints

You need to implement these endpoints on your backend:

### GET /rooms/{id}/electrical

**Purpose**: Fetch existing electrical devices for a room

**Request**:
```http
GET /api/v1/rooms/room-123/electrical
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "devices": [
      {
        "id": "device-1",
        "room_id": "room-123",
        "type": "light",
        "variant": "spot",
        "wall": "A",
        "height": 110,
        "position": 2.5,
        "placed_at": "2026-07-24T10:30:00Z"
      }
    ]
  },
  "error": null
}
```

**Response** (404):
```json
{
  "success": false,
  "data": null,
  "error": "Xona topilmadi"
}
```

### POST /rooms/{id}/electrical

**Purpose**: Save the completed electrical plan

**Request**:
```http
POST /api/v1/rooms/room-123/electrical
Authorization: Bearer {token}
Content-Type: application/json

{
  "room_id": "room-123",
  "devices": [
    {
      "id": "device-1",
      "room_id": "room-123",
      "type": "light",
      "variant": "spot",
      "wall": "A",
      "height": 110,
      "position": 2.5,
      "placed_at": "2026-07-24T10:30:00Z"
    }
  ],
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

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "room_id": "room-123",
    "saved_at": "2026-07-24T10:35:00Z",
    "device_count": 12,
    "total_wire_length": 245.5
  },
  "error": null
}
```

**Response** (400 Bad Request):
```json
{
  "success": false,
  "data": null,
  "error": "Qurilmalar bo'sh bo'lishi mumkin emas"
}
```

## Step 4: State Management Verification

Ensure your Zustand store (`src/store/appStore.ts`) includes these fields (already present):

```typescript
// Electrical devices array
electricalDevices: ElectricalDevice[]
addDevice: (device: ElectricalDevice) => void
removeDevice: (deviceId: string) => void
updateDevice: (deviceId: string, updates: Partial<ElectricalDevice>) => void

// Stage tracking
currentStage: number
setCurrentStage: (stage: number) => void

// Active room
activeRoom: Room | null
setActiveRoom: (room: Room | null) => void
```

## Step 5: Type Definitions

Verify `src/types/index.ts` includes these types (already present):

```typescript
export interface ElectricalDevice {
  id: string
  room_id: string
  type: DeviceType
  variant?: DeviceVariant
  wall?: 'A' | 'B' | 'C' | 'D' | 'ceiling'
  height: number // cm
  position: number // m
  color?: string
  placed_at: string
}

export type DeviceType = 'box' | 'socket' | 'switch' | 'light' | 'plumbing'

export type DeviceVariant =
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

export interface ElectricalPlan {
  room_id: string
  devices: ElectricalDevice[]
  total_wire_length: number
  wire_by_type: Record<string, number>
  conduit_needed: number
  device_count: number
  calculated_at: string
}
```

## Step 6: Next Stage Navigation

After successful electrical plan save, update the navigation to proceed to the next stage (likely plumbing/santexnika):

```typescript
// In D4_ElectricalSummary.tsx, after successful save:

if (response.data.success) {
  Alert.alert(
    'Muvaffaqiyat',
    'Elektr sxemasi saqlandi',
    [
      {
        text: 'Davom etish',
        onPress: () => {
          setCurrentStage(8) // Or whatever next stage number
          navigation.navigate('NextStageScreen') // Replace with actual screen
        },
      },
    ]
  )
}
```

## Step 7: Environment Variables

Ensure your `.env` file has the correct API URL:

```bash
# .env or .env.local
EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1
# For production:
# EXPO_PUBLIC_API_URL=https://api.tamir-uy.uz/api/v1
```

## Testing the Integration

### 1. Manual Test Flow

1. Navigate to the decoration/furniture screen
2. Click "Elektr → (Keyingi bosqich)" button
3. D1: Place 3-5 devices on different walls/heights
4. D2: Select device types (at least 1 lighting, 1 outlet, 1 switch)
5. D3: Adjust light intensities, rotate/zoom view
6. D4: Review calculations and save
7. Verify API POST succeeds and user is guided to next stage

### 2. Network Testing

```bash
# Test fetch endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/v1/rooms/room-id/electrical

# Test save endpoint
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @payload.json \
  http://localhost:8000/api/v1/rooms/room-id/electrical
```

### 3. Edge Cases to Test

- No devices placed → Next button disabled
- Network error on fetch → Error message with retry
- Slow network → Loading spinner visible
- Save failure → Error alert, can retry
- Very small room → Floor plan scaling works
- Very large room → Floor plan scaling works

## Performance Considerations

### Bundle Size
- All 4 screens total ~51KB (unminified)
- With minification & gzip: ~8-10KB
- NativeWind compilation is efficient

### Runtime Performance
- 3D projection uses simple math (O(n) where n = device count)
- Max recommended devices per room: 50-100
- State updates are immutable (no mutations)
- Navigation between screens is instant

### Optimization if Needed

If experiencing slowness:
1. Reduce animation complexity in D3_LightingPreview
2. Use `useCallback` for expensive calculations
3. Memoize device list rendering with `useMemo`
4. Profile with React Native DevTools

## Common Issues & Solutions

### Issue: Devices not showing on floor plan
**Solution**: Check that:
- `activeRoom` is set with valid dimensions
- Device `wall` and `height` values are within valid ranges
- Floor plan scale calculations are correct (check calculateFloorPlanDimensions)

### Issue: API calls returning 401
**Solution**: Check that:
- Access token is valid and not expired
- Token is being sent in Authorization header
- Backend is configured to accept your token format

### Issue: Navigation stack issues
**Solution**: Ensure:
- All screen names match exactly (case-sensitive)
- Navigation object has access to navigator (passed via props)
- All Stack.Screen components are inside Stack.Navigator

### Issue: 3D preview showing weird perspective
**Solution**: Try:
- Resetting view (Reset button)
- Adjusting zoom level
- Checking device position values are in valid range (0-6m)

## Localization Notes

All text is currently in Uzbek. To add other languages:

1. Create i18n/uz.json, i18n/en.json, i18n/ru.json
2. Import translations in each screen
3. Replace hardcoded strings with translation keys

Example:
```typescript
import { useTranslation } from 'react-i18next'

export default function D1_ElectricalPlanScreen() {
  const { t } = useTranslation()
  return <Text>{t('electrical.title')}</Text>
}
```

## Support & Maintenance

- Check logs for API errors: `console.log(err.response?.data?.error)`
- Validate device IDs are unique: `new Set(devices.map(d => d.id)).size === devices.length`
- Monitor room dimension edge cases (very small or very large)
- Collect user feedback on 3D visualization usability

## Production Checklist

- [ ] All 4 screens integrated in navigation
- [ ] Backend endpoints implemented and tested
- [ ] API URL correctly set for production
- [ ] Error handling works for all API failures
- [ ] Zustand store properly configured
- [ ] Next stage screen created/linked
- [ ] E2E tests passing for complete workflow
- [ ] Device limits documented (max ~100 per room)
- [ ] Performance profiled and acceptable
- [ ] Uzbek text reviewed for accuracy
- [ ] Blue theme colors consistent
- [ ] All touch targets > 44x44pt
- [ ] Accessibility tested (screen reader compatible)
