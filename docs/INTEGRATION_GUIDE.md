# Room State Workflow - Integration Guide

## Quick Start

### 1. Update Navigation

Add the three screens to your navigator stack. Update your navigation configuration:

```typescript
// navigation/RootNavigator.tsx

import B1_RoomStateScreen from '../screens/B1_RoomState'
import B2_3DEntryScreen from '../screens/B2_3DEntry'
import B3_OnboardingRailScreen from '../screens/B3_OnboardingRail'

// In your navigation stack:
const Stack = createNativeStackNavigator()

export function RoomWorkflowStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="B1_RoomState"
        component={B1_RoomStateScreen}
        options={{ title: 'Xona Holati' }}
      />
      <Stack.Screen
        name="B2_3DEntry"
        component={B2_3DEntryScreen}
        options={{ title: '3D Ko\'rinishi' }}
      />
      <Stack.Screen
        name="B3_OnboardingRail"
        component={B3_OnboardingRailScreen}
        options={{ title: 'Material Tanlash' }}
      />
    </Stack.Navigator>
  )
}
```

### 2. Navigate to First Screen

From any screen where a room is selected:

```typescript
import { useAppStore } from '../store/appStore'

export function MyScreen() {
  const activeRoom = useAppStore((state) => state.activeRoom)

  const handleStartWorkflow = () => {
    if (activeRoom) {
      navigation.navigate('B1_RoomState')
    }
  }

  return (
    <TouchableOpacity onPress={handleStartWorkflow}>
      <Text>Xona holatini tanlash</Text>
    </TouchableOpacity>
  )
}
```

### 3. Access Results After Workflow

After completing the workflow, access the saved state:

```typescript
import { useAppStore } from '../store/appStore'
import { useRoomStateStore } from '../store/roomStateStore'

export function EstimateScreen() {
  const roomState = useAppStore((state) => state.roomState)
  const selectedColor = useRoomStateStore((state) => state.selectedPaintColor)
  const completedStages = useRoomStateStore((state) => state.completedStages)

  // Use data to generate estimate, 3D visualization, etc.
}
```

## File Checklist

Verify all required files are in place:

```
✅ /src/screens/B1_RoomState.tsx
✅ /src/screens/B2_3DEntry.tsx
✅ /src/screens/B3_OnboardingRail.tsx

✅ /src/store/roomStateStore.ts

✅ /src/api/roomStateApi.ts

✅ /src/hooks/useRoomState.ts

✅ /src/components/RoomStateCard.tsx
✅ /src/components/StageProgressIndicator.tsx

✅ /src/theme/colors.ts

✅ /src/utils/perspective3D.ts
✅ /src/utils/stageHelpers.ts

✅ /docs/ROOM_STATE_WORKFLOW.md
✅ /docs/INTEGRATION_GUIDE.md
```

## Imports Reference

### In Your Component
```typescript
// Store access
import { useAppStore } from '../store/appStore'
import { useRoomStateStore } from '../store/roomStateStore'

// Custom hooks
import { useRoomState, useCameraControls, useMaterialSelection, useStageProgression } from '../hooks/useRoomState'

// Components
import { RoomStateCard } from '../components/RoomStateCard'
import { StageProgressIndicator } from '../components/StageProgressIndicator'

// API
import { getRoomState, updateRoomState } from '../api/roomStateApi'

// Utilities
import { calculateTransform3D, getWallColor } from '../utils/perspective3D'
import { getStageStatus, getProgressPercentage } from '../utils/stageHelpers'

// Types
import { RoomStateType, RoomState } from '../types'

// Theme
import { UyTamirTheme } from '../theme/colors'
```

## API Endpoint Configuration

Ensure your backend provides these endpoints:

### GET /rooms/{id}/state
Fetch room state

**Response:**
```json
{
  "room_id": "uuid",
  "current_state": "korobka|suvoq|shpaklovka",
  "floor_state": "xom|suvoq|tayyor",
  "ceiling_state": "xom|suvoq|tayyor",
  "created_at": "ISO-8601 timestamp",
  "updated_at": "ISO-8601 timestamp"
}
```

### POST /rooms/{id}/state
Create or update room state

**Request:**
```json
{
  "current_state": "korobka"
}
```

**Response:** Same as GET

### PATCH /rooms/{id}/state
Update specific state fields

**Request:**
```json
{
  "floor_state": "suvoq",
  "ceiling_state": "suvoq"
}
```

**Response:** Updated room state

## Custom Styling

### Override Theme Colors

Create a custom theme file:

```typescript
// theme/customTheme.ts
export const CustomTheme = {
  ...UyTamirTheme,
  primary: {
    main: '#FF6B6B', // Your brand color
  },
}
```

### Modify Tailwind Classes

All screens use NativeWind classes that respond to your tailwind.config.js. Adjust colors there:

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'uy-blue': '#0052CC',
      }
    }
  }
}
```

## State Flow Diagram

```
Start
  ↓
[B1_RoomState] Select state (korobka|suvoq|shpaklovka)
  ↓ Save to API + Store
[B2_3DEntry] View 3D room (camera controls)
  ↓ Navigate next
[B3_OnboardingRail] Select paint color + mark stages
  ↓ Save selection
[Estimate/Next Screen]
```

## Data Persistence

### Automatic Persistence
- ✅ Room state saved to API
- ✅ Selected paint color in Zustand (in-memory)
- ✅ Completed stages in Zustand (in-memory)

### Manual Persistence (if needed)
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage'

// Save selection locally
await AsyncStorage.setItem('selectedPaintColor', colorId)

// Load later
const color = await AsyncStorage.getItem('selectedPaintColor')
```

## Testing

### Unit Tests Example

```typescript
// __tests__/roomStateStore.test.ts
import { renderHook, act } from '@testing-library/react-native'
import { useRoomStateStore } from '../store/roomStateStore'

describe('roomStateStore', () => {
  it('should select state', () => {
    const { result } = renderHook(() => useRoomStateStore())
    
    act(() => {
      result.current.setSelectedState('korobka')
    })

    expect(result.current.selectedState).toBe('korobka')
  })

  it('should mark stage complete', () => {
    const { result } = renderHook(() => useRoomStateStore())
    
    act(() => {
      result.current.markStageComplete(0)
    })

    expect(result.current.completedStages.has(0)).toBe(true)
  })
})
```

### Integration Test Example

```typescript
// __tests__/B1_RoomState.integration.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import B1RoomStateScreen from '../screens/B1_RoomState'

describe('B1_RoomState Integration', () => {
  it('should save room state to API', async () => {
    const { getByText } = render(<B1RoomStateScreen />)

    // Select state
    fireEvent.press(getByText('Korobka (Qurilish bosqichi)'))
    
    // Save
    fireEvent.press(getByText('Davom et'))

    await waitFor(() => {
      expect(mockApi.updateRoomState).toHaveBeenCalled()
    })
  })
})
```

## Common Issues & Solutions

### Issue: API 401 Unauthorized
**Solution:** Ensure auth token is in AsyncStorage and passed in request headers. Check `config/api.ts` interceptors.

### Issue: 3D room not visible
**Solution:** 
- Verify CSS transform support in React Native
- Check that transforms are using correct syntax
- Clear cache and rebuild

### Issue: Stage progress not updating
**Solution:**
- Verify Zustand hook is connected correctly
- Check that `markStageComplete` is called with correct stageId
- Ensure component re-renders on state change

### Issue: Material rail animation janky
**Solution:**
- Use native driver: `useNativeDriver: true`
- Reduce animation duration if needed
- Profile with React DevTools

## Environment Variables

Add to your `.env` file:

```
EXPO_PUBLIC_API_URL=http://your-backend.com/api/v1
EXPO_PUBLIC_ENABLE_DEBUG=false
```

Use in code:
```typescript
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api/v1'
```

## Performance Tips

1. **Memoize selectors** - Use specific store selectors to avoid unnecessary re-renders
   ```typescript
   const selectedState = useRoomStateStore((state) => state.selectedState)
   ```

2. **Lazy load components** - Split large screens into smaller components
   ```typescript
   const RoomStateCard = lazy(() => import('./RoomStateCard'))
   ```

3. **Debounce API calls** - Avoid excessive API requests
   ```typescript
   const debouncedSave = debounce(saveRoomState, 300)
   ```

4. **Profile performance** - Use React Native DevTools
   ```bash
   expo start --offline
   ```

## Accessibility Improvements

Add accessibility labels:

```typescript
<TouchableOpacity
  accessible={true}
  accessibilityLabel="Korobka bosqichi tanlash"
  accessibilityHint="Xonaning qurilish bosqichini belgilaydi"
>
  <Text>Korobka</Text>
</TouchableOpacity>
```

## Localization

Screens are built with Uzbek text. To add other languages:

```typescript
// i18n/strings.ts
export const strings = {
  uz: {
    roomState: 'Xona holati',
    selectState: 'Xona holatini tanlang',
  },
  en: {
    roomState: 'Room State',
    selectState: 'Select room condition',
  }
}

// In screen
import { strings } from '../i18n/strings'
const locale = 'uz'
<Text>{strings[locale].roomState}</Text>
```

## Deployment Checklist

Before deploying to production:

- [ ] All API endpoints tested
- [ ] Auth tokens properly configured
- [ ] Error handling covers all scenarios
- [ ] Performance profiled
- [ ] Accessibility tested
- [ ] All Uzbek text reviewed
- [ ] No console errors or warnings
- [ ] Loading states implemented
- [ ] Offline handling considered
- [ ] Rate limiting on API calls

## Support

For issues or questions:
1. Check the troubleshooting section in ROOM_STATE_WORKFLOW.md
2. Review error messages in console
3. Verify API endpoint configuration
4. Test with mock data if API unavailable

## Next Steps

1. ✅ Implement room state workflow
2. ⬜ Add estimate calculation
3. ⬜ Add electrical planning
4. ⬜ Add material shopping integration
5. ⬜ Add project export (PDF, image)
