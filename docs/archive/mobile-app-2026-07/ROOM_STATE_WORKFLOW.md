# Room State Workflow - Implementation Guide

## Overview

The Room State Workflow consists of three integrated React Native screens that guide users through selecting their room's renovation state, visualizing it in 3D, and selecting materials. The workflow is built with production-ready code using React Native, Zustand for state management, and Tailwind/NativeWind styling.

## Architecture

### State Management

**Zustand Stores:**

1. **`appStore`** - Global app state (managed existing)
   - `roomState: RoomState | null` - Current room state from API
   - `activeRoom: Room | null` - Selected room

2. **`roomStateStore`** (new) - Room state workflow state
   - `selectedState: RoomStateType` - User's selected room state
   - `selectedPaintColor: string | null` - Selected paint color ID
   - `cameraRotationX/Y: number` - 3D camera angles
   - `cameraZoom: number` - 3D zoom level
   - `isRailOpen: boolean` - Material rail collapse state
   - `completedStages: Set<number>` - Completed renovation stages

### API Integration

**Endpoints** (in `/src/api/roomStateApi.ts`):

- `GET /rooms/{id}/state` - Fetch current room state
- `POST /rooms/{id}/state` - Update room state (condition selection)
- `PATCH /rooms/{id}/state` - Update floor/ceiling state

**Request body example:**
```json
{
  "current_state": "korobka" | "suvoq" | "shpaklovka"
}
```

**Response:**
```json
{
  "room_id": "uuid",
  "current_state": "korobka",
  "floor_state": "xom",
  "ceiling_state": "xom",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-01T00:00:00Z"
}
```

## Screens

### Screen 1: B1_RoomState.tsx - Room Condition Selection

**Purpose:** Allow user to select their room's current renovation state.

**Features:**
- 3 radio button options (Korobka, Suvoq, Shpaklovka)
- Visual state descriptions with icons
- Color-coded state indicators
- Progress bar (1/3)
- Save to API + Zustand store

**User Flow:**
1. Select one of three states
2. Click "Davom et" to save
3. Navigate to 3D visualization

**Key Components:**
- `RoomStateCard` - Reusable state selection card
- Form validation (must select state)
- Loading state during API call

**Props:**
```typescript
interface B1RoomStateProps {
  navigation?: any
}
```

### Screen 2: B2_3DEntry.tsx - 3D Room Visualization

**Purpose:** Show 3D perspective view of room based on selected state.

**Features:**
- CSS 3D perspective rendering
- Dynamic wall colors/textures based on room state
- Touch drag controls for camera rotation
- Zoom in/out buttons
- Reset camera position
- Real-time rotation/zoom display

**User Flow:**
1. View 3D room representation
2. Drag to rotate camera
3. Use +/- buttons to zoom
4. Click "Qayta o'rnatish" to reset
5. Proceed to material selection

**3D Rendering:**
- Uses CSS 3D transforms (not native 3D engine)
- Walls with state-specific colors and textures
- Floor with material texture
- Ceiling with contrast color
- Perspective: 1200px

**Camera Controls:**
```typescript
// Rotation range
rotationX: -45° to +45° (vertical)
rotationY: -∞ to +∞ (horizontal)

// Zoom range
zoom: 0.5x to 5x
```

**Touch Interaction:**
- Drag: 1px = 0.5° rotation
- Pinch: Not implemented (use zoom buttons)

### Screen 3: B3_OnboardingRail.tsx - Material Selection + Stage Progress

**Purpose:** Guide material selection with animated rail and show renovation progress.

**Features:**
- Right-side collapsible material rail
- Paint color swatches organized by category
  - Oq Ranglar (Whites)
  - Ko'k Ranglar (Blues)
  - Kulrang Ranglar (Grays)
  - Aksent Ranglar (Accents)
- Drag-drop animations (visual feedback)
- Stage progression indicator (vertical timeline)
- Interactive stage completion marking
- Progress percentage display

**User Flow:**
1. View main content with stage progress
2. Click toggle to open material rail
3. Browse color swatches by category
4. Long-press to drag color (visual feedback)
5. Tap to select color
6. Click "Davom et" to proceed to estimate

**Rail Features:**
- Slide in from right (animation duration: 300ms)
- Sticky position in right panel
- Smooth show/hide transition
- Scroll paint colors vertically
- Color preview with name and hex code

**Stage System:**
- 8 stages (0-7) from Suvoq to Santexnika
- Users can mark stages complete manually
- Progress bar and percentage display
- Timeline visualization with dots and connecting lines

## Theme & Colors

**UyTa'mir Theme** (`/src/theme/colors.ts`):

```typescript
// Primary blues
primary.dark: #003D9E (Deep UyTa'mir blue)
primary.main: #0052CC (Primary)
primary.light: #3B7FFF (Light)

// Room states
korobka: #9CA3AF (Gray - raw construction)
suvoq: #EC6B3E (Orange - drying)
shpaklovka: #D4A373 (Beige - finishing)

// Paint colors organized by category
whites: 4 shades
blues: 4 shades
grays: 3 shades
accent: 3 colors
```

## Utility Functions

### 3D Perspective (`/src/utils/perspective3D.ts`)

```typescript
calculateTransform3D(rotationX, rotationY, zoom): Transform3D
getWallColor(state): string
getWallTexturePattern(state): string
getFloorTexture(state): string
normalizeAngle(angle): number
clampRotation(angle, max): number
```

### Stage Helpers (`/src/utils/stageHelpers.ts`)

```typescript
getStageById(stageId): Stage
getProgressPercentage(completed, total): number
canStartStage(stageId, completedStages): boolean
getNextIncompleteStage(completedStages): StageId | null
getStageStatus(stageId, completedStages, currentStageId): StageStatus
```

## Custom Hooks

### `useRoomState(options)` 
- Auto-loads room state on mount
- Provides `loadRoomState()` and `saveRoomState(state)` functions
- Handles loading/error states

### `useCameraControls()`
- `rotate(deltaX, deltaY)`, `rotateX(delta)`, `rotateY(delta)`
- `zoomIn()`, `zoomOut()`, `zoom(factor)`
- `reset()` - Reset to neutral position

### `useMaterialSelection()`
- `selectColor(colorId)`, `clearSelection()`
- `selectedColor`, `hasSelection`

### `useStageProgression()`
- `markComplete(stageId)`, `isComplete(stageId)`
- `completedStages`, `progress`, `progressPercentage`

## Component Library

### `RoomStateCard`
Reusable card for state selection with icon, color, description, and radio button.

### `StageProgressIndicator`
Vertical timeline showing stage completion status with progress bar.

## Error Handling

All screens implement comprehensive error handling:

```typescript
// API errors
Alert.alert('Xato', 'Xona holatini saqlashda xato yuz berdi')

// Validation errors
if (!selectedState) {
  Alert.alert('Xato', 'Iltimos, xona holatini tanlang')
}

// Console logging for debugging
console.error('Failed to save room state:', error)
```

## Accessibility

- Proper touch targets (minimum 44x44 points)
- Semantic color usage (not relying solely on color)
- Large text for main interactions
- Clear visual hierarchy
- Uzbek language labels throughout

## Performance Optimizations

1. **Zustand selectors** - Only re-render on relevant state changes
2. **Memoized calculations** - Transform values computed when needed
3. **Lazy loading** - API calls only on screen entry
4. **Animation performance** - Using Animated API for 60fps transitions

## Testing Checklist

- [ ] Room state selection persists to API
- [ ] 3D camera rotates smoothly on drag
- [ ] Zoom buttons scale room 0.5x-5x
- [ ] Paint colors display correctly
- [ ] Stage marking updates progress bar
- [ ] Rail animation smooth on toggle
- [ ] All Uzbek text displays correctly
- [ ] No console errors or warnings
- [ ] API calls include auth token
- [ ] Error states show proper alerts

## Integration with Navigation

Add these routes to your navigator:

```typescript
{
  name: 'B1_RoomState',
  component: B1RoomStateScreen,
}
{
  name: 'B2_3DEntry',
  component: B2_3DEntryScreen,
}
{
  name: 'B3_OnboardingRail',
  component: B3OnboardingRailScreen,
}
```

## Next Steps After Workflow

After completing the room state workflow:
1. Proceed to estimate calculation
2. Save decoration preferences
3. Move to electrical planning
4. Generate material list
5. Calculate cost estimate

## Known Limitations

1. **3D Rendering** - Uses CSS transforms, not true 3D engine
   - Works well for perspective visualization
   - Sufficient for showing room condition states
   - Doesn't support complex geometry

2. **Touch Interaction** - Drag-based rotation only
   - No pinch zoom (use +/- buttons instead)
   - No two-finger gestures

3. **Material Rail** - Simple slide animation
   - No momentum scrolling customization
   - Always 300px wide

## Future Enhancements

1. WebGL 3D rendering for richer visualization
2. Gesture support (pinch zoom, rotate with two fingers)
3. Room measurements overlay in 3D
4. Photo texture preview
5. AR preview (if device supports)

## File Structure

```
src/
├── screens/
│   ├── B1_RoomState.tsx          # Room condition selection
│   ├── B2_3DEntry.tsx            # 3D visualization
│   └── B3_OnboardingRail.tsx      # Material selection + progress
├── store/
│   ├── appStore.ts               # Global store (existing)
│   └── roomStateStore.ts          # Room state workflow store (new)
├── api/
│   └── roomStateApi.ts            # API endpoints (new)
├── hooks/
│   └── useRoomState.ts            # Custom hooks (new)
├── components/
│   ├── RoomStateCard.tsx          # State selection card
│   └── StageProgressIndicator.tsx # Progress timeline
├── theme/
│   └── colors.ts                  # UyTa'mir theme colors
├── utils/
│   ├── perspective3D.ts           # 3D calculations
│   └── stageHelpers.ts            # Stage utilities
└── types/
    └── index.ts                   # TypeScript definitions
```

## Troubleshooting

**3D room not showing:**
- Check that CSS perspective is supported in your React Native environment
- Ensure transforms are applied correctly
- Check console for CSS errors

**Camera not rotating:**
- Verify touch handlers are properly connected
- Check that `isDragging` state updates correctly
- Ensure start coordinates are captured on mouse down

**API errors:**
- Verify auth token is present in localStorage
- Check that room ID is valid
- Ensure backend is running on expected URL

**Rail animation stuttering:**
- Use native driver for Animated components
- Reduce animation duration if needed
- Check for unnecessary re-renders

## Support & Debugging

Enable debug logging:

```typescript
console.log('Room state:', roomState)
console.log('Camera rotation:', cameraRotationX, cameraRotationY)
console.log('Zoom level:', cameraZoom)
console.log('Completed stages:', completedStages)
```

Monitor performance with React Profiler and Redux DevTools (if using Redux middleware).
