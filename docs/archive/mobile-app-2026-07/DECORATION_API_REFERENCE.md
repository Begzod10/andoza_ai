# Decoration Workflow - API & Code Reference

## Quick API Reference

### Material Loading

```typescript
// Get paint materials
GET /materials?type=paint

// Response
{
  "success": true,
  "data": [
    {
      "id": "paint_001",
      "type": "paint",
      "name": "Kumush",
      "color": "#C0C0C0",
      "price": 85000
    }
  ]
}
```

### Submit Wall Finishes

```typescript
// Submit single wall finish
POST /rooms/{roomId}/finishes

{
  "wall_id": "A",
  "material_id": "paint_001",
  "material_type": "paint"
}

// Response
{
  "success": true,
  "data": { "finish_id": "finish_001" }
}
```

### Complete Stage

```typescript
POST /rooms/{roomId}/stage-complete

{
  "stage": 2,
  "total_cost": 425000,
  "materials_count": 5
}

// Response
{ "success": true }
```

---

## Zustand Store API

### useDecorationStore()

```typescript
import { useDecorationStore } from '@/store/decorationStore'

// State
const {
  // Available materials
  availablePaints: Material[]
  availableWallpapers: Material[]
  availableFloorMaterials: Material[]

  // Applied materials
  appliedWallMaterials: Map<string, AppliedMaterial>
  appliedFloorMaterial: AppliedMaterial | null

  // Current selection
  selectedMaterial: Material | null

  // Costs
  totalCost: number

  // Workflow step
  currentDecorStep: 1 | 2 | 3 | 4 | 5
} = useDecorationStore()

// Actions
const {
  setAvailablePaints: (materials: Material[]) => void
  setAvailableWallpapers: (materials: Material[]) => void
  setAvailableFloorMaterials: (materials: Material[]) => void
  setWallMaterial: (wallId: string, material: Material) => void
  setFloorMaterial: (material: Material) => void
  clearWallMaterial: (wallId: string) => void
  clearFloorMaterial: () => void
  setSelectedMaterial: (material: Material | null) => void
  calculateTotalCost: () => void
  setCurrentDecorStep: (step: 1 | 2 | 3 | 4 | 5) => void
  reset: () => void
} = useDecorationStore()
```

### Example Usage

```typescript
export default function MyComponent() {
  const { appliedWallMaterials, totalCost, setWallMaterial } = useDecorationStore()

  const applyPaint = (wallId: string, material: Material) => {
    setWallMaterial(wallId, material) // Updates store & recalculates cost
  }

  return (
    <View>
      <Text>Total: {totalCost.toLocaleString()} so'm</Text>
      <Text>Applied walls: {appliedWallMaterials.size}</Text>
    </View>
  )
}
```

---

## useDecoration() Hook

### API

```typescript
import { useDecoration } from '@/hooks/useDecoration'

const {
  loading: boolean
  error: string | null
  loadPaintMaterials: () => Promise<void>
  loadWallpaperMaterials: () => Promise<void>
  loadFloorMaterials: () => Promise<void>
  submitWallFinish: (wallId: string) => Promise<void>
  completeDecoration: () => Promise<void>
} = useDecoration()
```

### Example Usage

```typescript
export default function MaterailScreen() {
  const { loading, error, loadPaintMaterials } = useDecoration()

  useEffect(() => {
    loadPaintMaterials()
  }, [])

  if (loading) return <ActivityIndicator />
  if (error) return <Text className="text-red-600">{error}</Text>

  return <Text>Materials loaded!</Text>
}
```

---

## Utility Functions

### Currency Formatting

```typescript
import { formatSom } from '@/utils/decoration'

formatSom(125000)
// Returns: "125,000 so'm"
```

### Material Names (Uzbek)

```typescript
import { getWallNameUz, getMaterialTypeUz } from '@/utils/decoration'

getWallNameUz('A')        // "A devari"
getWallNameUz('floor')    // "Pol"

getMaterialTypeUz('paint')     // "Bo'yoq"
getMaterialTypeUz('tile')      // "Plitka"
```

### Tile Calculations

```typescript
import { 
  parseTileSize, 
  calculateTilesNeeded 
} from '@/utils/decoration'

// Parse size string
const size = parseTileSize("30x30")
// Returns: { width: 30, height: 30 }

// Calculate tiles needed
const tilesNeeded = calculateTilesNeeded(25, "30x30")
// For 25 m² room with 30x30cm tiles = 278 tiles
```

### Material Sorting & Filtering

```typescript
import {
  sortMaterialsByPrice,
  filterMaterialsByPrice,
  groupMaterialsByType
} from '@/utils/decoration'

// Sort by price
const cheapest = sortMaterialsByPrice(materials, 'asc')
const expensive = sortMaterialsByPrice(materials, 'desc')

// Filter by price range
const affordable = filterMaterialsByPrice(materials, 50000, 150000)

// Group by type
const grouped = groupMaterialsByType(materials)
// { paint: [...], wallpaper: [...], tile: [...] }
```

---

## Screen Navigation

### From Any Screen

```typescript
import { useNavigation } from '@react-navigation/native'

const navigation = useNavigation<NavigationProp>()

// Navigate to decoration workflow
navigation.navigate('C1_PaintWallpaper')

// Or to specific screen in workflow
navigation.navigate('C2_DragAnimation')
navigation.navigate('C5_Summary')

// Go back
navigation.goBack()
```

### Complete Flow

```typescript
// Screen 1: Material Selection
navigation.navigate('C1_PaintWallpaper')
  // User selects material
  // User taps "Continue"
  // setCurrentDecorStep(2)

// Screen 2: Drag to Walls
navigation.navigate('C2_DragAnimation')
  // User drags material to walls
  // User taps "Continue"
  // setCurrentDecorStep(3)

// Screen 3: Confirmation
navigation.navigate('C3_MaterialApplied')
  // User taps "Confirm & Save"
  // API: POST /rooms/{id}/finishes (batched)
  // setCurrentDecorStep(4)

// Screen 4: Floor Materials
navigation.navigate('C4_FloorSelection')
  // User selects floor material
  // User taps "Continue"
  // setCurrentDecorStep(5)

// Screen 5: Summary
navigation.navigate('C5_Summary')
  // User reviews everything
  // User taps "Complete Stage"
  // API: POST /rooms/{id}/stage-complete
  // reset() and move to next stage
```

---

## Type Definitions

### Material

```typescript
interface Material {
  id: string
  type: 'paint' | 'wallpaper' | 'tile' | 'laminate' | 'parquet'
  name: string
  color?: string          // Hex color code
  pattern?: string        // Pattern name (wallpaper)
  image_url?: string      // Material preview image
  price?: number         // Price in som
  sizes?: string[]       // Tile sizes like ["30x30", "40x40"]
}
```

### AppliedMaterial

```typescript
interface AppliedMaterial {
  wallId: string         // "A", "B", "C", "D", "floor"
  material: Material     // The material applied
  appliedAt: string      // ISO date string
}
```

### DecorationState

```typescript
interface DecorationState {
  // Materials
  availablePaints: Material[]
  availableWallpapers: Material[]
  availableFloorMaterials: Material[]

  // Applied
  appliedWallMaterials: Map<string, AppliedMaterial>
  appliedFloorMaterial: AppliedMaterial | null
  selectedMaterial: Material | null

  // Costs
  totalCost: number

  // UI
  currentDecorStep: 1 | 2 | 3 | 4 | 5

  // ... action methods
}
```

---

## Component Props

### Screen Props

```typescript
type ScreenProps = {
  navigation: NavigationProp<any>
  route?: RouteProp<any, string>
}

// Usage
export default function MyScreen({ navigation }: ScreenProps) {
  const handlePress = () => {
    navigation.navigate('NextScreen')
  }
  // ...
}
```

### Common Component Props

```typescript
interface MaterialCardProps {
  material: Material
  onSelect: (material: Material) => void
  isSelected?: boolean
}

interface WallZoneProps {
  wall: Wall
  material?: Material
  onDrop?: (wallId: string) => void
}
```

---

## Error Handling Pattern

```typescript
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)

const handleAction = async () => {
  try {
    setLoading(true)
    setError(null)
    
    // Do something
    await apiClient.post('/endpoint', data)
    
  } catch (err) {
    setError('Xatolik yuz berdi') // Uzbek message
    console.error(err) // Debug log
  } finally {
    setLoading(false)
  }
}

// In JSX
{loading && <ActivityIndicator />}
{error && <Text className="text-red-600">{error}</Text>}
```

---

## Common Patterns

### Load Materials on Mount

```typescript
useEffect(() => {
  const loadData = async () => {
    try {
      const response = await apiClient.get('/materials?type=paint')
      setMaterials(response.data.data || [])
    } catch (err) {
      setError('Materiallarni yuklashda xato')
    }
  }
  
  loadData()
}, [])
```

### Update Store on Selection

```typescript
const handleSelectMaterial = (material: Material) => {
  setSelectedMaterial(material)
  setCurrentDecorStep(nextStep)
  navigation.navigate('NextScreen')
}
```

### Submit with Error Handling

```typescript
const handleSubmit = async () => {
  if (!selectedMaterial) {
    Alert.alert('⚠️', 'Iltimos, material tanlang')
    return
  }

  try {
    setLoading(true)
    await apiClient.post(`/rooms/${activeRoom.id}/finishes`, {
      wall_id: wallId,
      material_id: selectedMaterial.id,
      material_type: selectedMaterial.type,
    })
    Alert.alert('✓ Muvaffaqiyat', 'Material saqlandi')
  } catch (err) {
    Alert.alert('❌ Xato', 'Saqlashda xato yuz berdi')
  } finally {
    setLoading(false)
  }
}
```

---

## State Flow Diagram

```
User Input
   ↓
[C1] Material Selected
   ↓
useDecorationStore.setSelectedMaterial(material)
   ↓
[C2] Dragged to Walls
   ↓
useDecorationStore.setWallMaterial(wallId, material)
   ↓
[C3] Confirm Selection
   ↓
apiClient.post('/rooms/{id}/finishes', {...})
   ↓
useDecorationStore.calculateTotalCost()
   ↓
[C4] Floor Material Selected
   ↓
useDecorationStore.setFloorMaterial(material)
   ↓
[C5] Review & Complete
   ↓
apiClient.post('/rooms/{id}/stage-complete', {...})
   ↓
useDecorationStore.reset()
   ↓
Next Stage
```

---

## Testing Examples

### Test Material Loading

```typescript
test('loads paint materials on mount', async () => {
  const { getByText, getByTestId } = render(<C1_PaintWallpaper />)
  
  // Mock API
  mockApiClient.get.mockResolvedValue({
    data: { data: [{ id: '1', name: 'Kumish' }] }
  })
  
  // Wait for materials
  await waitFor(() => {
    expect(getByText('Kumish')).toBeTruthy()
  })
})
```

### Test Navigation

```typescript
test('navigates to C2 after material selection', async () => {
  const navigation = useNavigation()
  const { getByTestId } = render(<C1_PaintWallpaper navigation={navigation} />)
  
  fireEvent.press(getByTestId('continue-button'))
  
  expect(navigation.navigate).toHaveBeenCalledWith('C2_DragAnimation')
})
```

### Test Store Updates

```typescript
test('updates decoration store on material selection', () => {
  const { result } = renderHook(() => useDecorationStore())
  
  act(() => {
    result.current.setWallMaterial('A', mockMaterial)
  })
  
  expect(result.current.appliedWallMaterials.get('A')).toEqual({
    wallId: 'A',
    material: mockMaterial,
    appliedAt: expect.any(String)
  })
})
```

---

## Performance Tips

### Avoid Re-renders

```typescript
// ✓ Good: Use selector to get specific value
const totalCost = useDecorationStore((state) => state.totalCost)

// ✗ Bad: Get entire store
const store = useDecorationStore()
const totalCost = store.totalCost
```

### Memoize Callbacks

```typescript
const handleSelectMaterial = useCallback((material: Material) => {
  setSelectedMaterial(material)
}, []) // Dependencies
```

### Batch API Calls

```typescript
// ✓ Good: Promise.all
const [paintRes, floorRes] = await Promise.all([
  apiClient.get('/materials?type=paint'),
  apiClient.get('/materials?type=floor'),
])

// ✗ Bad: Sequential
const paintRes = await apiClient.get('/materials?type=paint')
const floorRes = await apiClient.get('/materials?type=floor')
```

---

## Debugging

### Log State Changes

```typescript
// In decorationStore.ts
const store = create<DecorationState>((set) => ({
  setWallMaterial: (wallId, material) => {
    console.log('Setting wall material:', { wallId, material })
    set({ /* ... */ })
  }
}))
```

### Log API Calls

```typescript
// In api.ts interceptor
apiClient.interceptors.request.use((config) => {
  console.log('API Request:', config.method, config.url)
  return config
})
```

### Debug Navigation

```typescript
// Add to navigation
const linking = {
  prefixes: ['uytamir://', 'https://uytamir.com'],
  config: {
    screens: {
      C1_PaintWallpaper: 'decoration/paint',
      C2_DragAnimation: 'decoration/drag',
      // ...
    },
  },
}

// Enable logging
<NavigationContainer linking={linking} fallback={<Loading />}>
  {/* ... */}
</NavigationContainer>
```

---

**Last Updated:** July 24, 2024
**Version:** 1.0.0
