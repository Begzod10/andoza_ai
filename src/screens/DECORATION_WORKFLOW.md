# Decoration Workflow Implementation

## Overview

The decoration workflow is a 5-step process that allows users to select and apply paint, wallpaper, and floor materials to rooms. The workflow is implemented using React Native with TypeScript, Zustand for state management, and Reanimated for smooth animations.

## Architecture

### Screens (C1 - C5)

```
C1_PaintWallpaper.tsx
  ↓ (User selects paint/wallpaper)
C2_DragAnimation.tsx
  ↓ (User drags materials to walls)
C3_MaterialApplied.tsx
  ↓ (Confirm and save materials)
C4_FloorSelection.tsx
  ↓ (Select floor material)
C5_Summary.tsx
  ↓ (Review and complete stage)
```

### State Management

**decorationStore.ts** (Zustand)
- Manages all decoration-related state
- Tracks available materials (paints, wallpapers, floors)
- Tracks applied materials per wall
- Calculates total cost
- Maintains current step in workflow

**appStore.ts** (Zustand)
- Manages global app state
- Tracks active room and project
- Manages current stage/step

### API Integration

All screens use `apiClient` configured in `/src/config/api.ts`

**Key Endpoints:**
- `GET /materials?type=paint` - Fetch paint materials
- `GET /materials?type=wallpaper` - Fetch wallpaper materials
- `GET /materials?type=floor` - Fetch floor materials
- `POST /rooms/{id}/finishes` - Submit applied materials
- `POST /rooms/{id}/stage-complete` - Mark stage as complete

## Screen Details

### C1_PaintWallpaper.tsx - Material Selection

**Purpose:** Display material swatches in a grid and allow user selection

**Features:**
- Grid display of paint colors and wallpaper patterns
- Material info cards with name and price
- Type tabs to switch between paint/wallpaper
- Selection indicator (blue border)
- Bottom panel shows selected material with proceed button

**State Used:**
- `availablePaints` - List of paint materials
- `availableWallpapers` - List of wallpaper materials
- `selectedMaterial` - Currently selected material

**API Calls:**
- Parallel fetch of both paint and wallpaper materials on mount

### C2_DragAnimation.tsx - Drag to Walls

**Purpose:** Interactive drag-and-drop to apply materials to walls

**Features:**
- Draggable color swatch at top (using React Native Gesture Handler)
- 4 wall drop zones (A, B, C, D)
- Smooth animations with Reanimated
- Visual feedback when dragging over walls
- Clear button to remove applied materials
- Prevents proceeding without at least one wall

**Animation Details:**
- Scale up on drag start (1.0 → 1.2)
- Wall highlight on hover (border color change)
- Spring animation on drop
- Smooth transition to idle state

**State Used:**
- `selectedMaterial` - Material to apply
- `appliedWallMaterials` - Map of wall_id → applied material
- `setWallMaterial()` - Update wall finish

### C3_MaterialApplied.tsx - Confirmation

**Purpose:** Review applied materials and submit to backend

**Features:**
- List all applied materials with preview
- Show applied time
- Total cost calculation
- Success animation after submission
- Proceed or go back buttons

**API Calls:**
- `POST /rooms/{id}/finishes` - Submit each wall finish (batched)

**State Used:**
- `appliedWallMaterials` - Materials to submit
- `totalCost` - Total cost display

### C4_FloorSelection.tsx - Floor Materials

**Purpose:** Select and configure floor materials

**Features:**
- Material type tabs (tile, laminate, parquet)
- Material cards with:
  - Color preview
  - Name and type
  - Price per unit
  - Size selector (for tiles)
- Selection indicator
- Material grid filtered by type

**Size Selection:**
- Tiles: 30x30cm, 40x40cm, 50x50cm options
- Laminate/Parquet: Single size or preset options

**State Used:**
- `availableFloorMaterials` - Floor material list
- `setFloorMaterial()` - Save selected floor material

### C5_Summary.tsx - Completion

**Purpose:** Final review and stage completion

**Features:**
- Room information display
- Complete material summary with colors
- Cost breakdown by category
- Stage progress indicator
- Option to skip decoration if needed

**API Calls:**
- `POST /rooms/{id}/stage-complete` - Mark stage as complete

**State Used:**
- `appliedWallMaterials` - Wall materials summary
- `appliedFloorMaterial` - Floor material summary
- `totalCost` - Total cost calculation

## Utilities

### decoration.ts

Helper functions for the decoration workflow:

```typescript
// Formatting
formatSom(amount: number) → string // Format to Som currency
formatDateUz(date) → string // Uzbek date format
formatTimeUz(date) → string // Uzbek time format

// Calculations
calculateMaterialCost(materials, area?, coverage?) → number
calculateTilesNeeded(areaM2, tileSizeStr) → number
calculateQuantityNeeded(area, coveragePerUnit) → number

// Material helpers
getWallNameUz(wallId) → string // "A devari", "Pol", etc.
getMaterialTypeUz(type) → string // "Bo'yoq", "Plitka", etc.
groupMaterialsByType(materials) → Record<string, any[]>
sortMaterialsByPrice(materials, order?) → any[]
filterMaterialsByPrice(materials, min, max) → any[]

// Parsing
parseTileSize(size: string) → {width, height} | null
```

### useDecoration.ts

Custom hook for decoration logic:

```typescript
const {
  loading,
  error,
  loadPaintMaterials(),
  loadWallpaperMaterials(),
  loadFloorMaterials(),
  submitWallFinish(wallId),
  completeDecoration(),
} = useDecoration()
```

## Styling

All screens use **NativeWind** (Tailwind CSS for React Native):

**Color Scheme:**
- Primary: Blue (`#2563EB`, `from-blue-600 to-blue-400`)
- Success: Green (`#16A34A`)
- Error: Red (`#DC2626`)
- Background: White/Gray

**Layout Patterns:**
- Header with gradient background
- Centered content with padding (16px/px-4)
- Bottom action panel (fixed position)
- Scrollable content area

## Navigation

New screens are registered in `RootNavigator.tsx`:

```tsx
<Stack.Screen name="C1_PaintWallpaper" component={C1_PaintWallpaper} />
<Stack.Screen name="C2_DragAnimation" component={C2_DragAnimation} />
<Stack.Screen name="C3_MaterialApplied" component={C3_MaterialApplied} />
<Stack.Screen name="C4_FloorSelection" component={C4_FloorSelection} />
<Stack.Screen name="C5_Summary" component={C5_Summary} />
```

Access from other screens:
```tsx
navigation.navigate('C1_PaintWallpaper')
```

## Types

Extended Material type from `/src/types/index.ts`:

```typescript
interface Material {
  id: string
  type: 'paint' | 'wallpaper' | 'tile' | 'laminate' | 'parquet'
  name: string
  color?: string
  pattern?: string
  image_url?: string
  // Extended for this workflow:
  price?: number
  sizes?: string[] // for tiles: ["30x30", "40x40"]
}
```

## Error Handling

Each screen implements consistent error handling:

```typescript
const [error, setError] = useState<string | null>(null)

try {
  // API call or operation
  setError(null)
} catch (err) {
  setError('User-friendly Uzbek message')
  console.error(err) // Debug logging
} finally {
  setLoading(false)
}
```

Error messages are displayed in a red banner at the top of the screen.

## Testing the Workflow

### Mock API Responses

For development, ensure backend provides:

```json
{
  "data": [
    {
      "id": "paint_001",
      "type": "paint",
      "name": "Kumush",
      "color": "#C0C0C0",
      "price": 85000
    },
    {
      "id": "tile_001",
      "type": "tile",
      "name": "Seramika",
      "color": "#D3D3D3",
      "price": 150000,
      "sizes": ["30x30", "40x40", "50x50"]
    }
  ]
}
```

### Test Scenarios

1. **Happy Path:** Select paint → Drag to walls → Apply → Select floor → Complete
2. **Skip Decoration:** Navigate through all 5 screens and click "Skip decoration"
3. **Multiple Materials:** Apply different materials to each wall
4. **Error Handling:** Test network errors, missing data, API failures
5. **Back Navigation:** Test going back from each screen maintains state

## Performance Considerations

- **Image Loading:** Material images are loaded via `image_url` - ensure images are optimized
- **Animation Performance:** Reanimated runs on native thread - smooth even with 60fps
- **API Calls:** Materials fetched once on C1 mount and reused
- **Cost Calculation:** Debounced to avoid unnecessary recalculations

## Future Enhancements

- [ ] Material image preview in list
- [ ] Compare materials side-by-side
- [ ] Save favorites for quick selection
- [ ] AI-based color recommendations
- [ ] Material reviews and ratings
- [ ] Integration with contractor pricing
- [ ] 3D room preview with applied materials
- [ ] Material quantity calculator based on room dimensions

## Troubleshooting

**Issue: Materials not loading**
- Check API endpoint in `/src/config/api.ts`
- Verify backend is running and accessible
- Check browser console for network errors

**Issue: Drag animation not smooth**
- Ensure React Native Gesture Handler is properly linked
- Check Reanimated is initialized in app.json

**Issue: State not persisting**
- Verify Zustand store methods are called correctly
- Check React.StrictMode (may cause double renders in dev)

**Issue: Navigation issues**
- Ensure all screen names match exactly in navigator
- Check route names in `navigation.navigate()` calls
- Verify back button handling in each screen

## Code Style

- Use TypeScript for all new code
- Follow Uzbek naming conventions for UI text
- Use descriptive variable names
- Keep components focused (single responsibility)
- Extract reusable logic to utils/hooks
- Always handle errors explicitly
