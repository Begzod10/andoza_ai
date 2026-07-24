# Utility & Support Screens

## Overview

Six new support screens have been added to the Tamir Uy mobile application to enhance functionality and user experience. All screens follow the existing project patterns and use Tailwind/NativeWind styling, Zustand state management, and Uzbek language.

## Screens Created

### 1. **A3_EntrySheet.tsx** - Entry Point Selection Modal
**Purpose:** Modal dialog for users to select how they want to measure the room.

**Features:**
- 3 measurement methods: LiDAR, 360° Photos, Manual Entry
- Visual icons and descriptions for each method
- Smooth modal animation
- Info box with helpful tips
- Color-coded method cards

**Key Props:**
- `visible`: boolean - Controls modal visibility
- `onClose`: () => void - Close handler
- `onSelectMethod`: (method) => void - Selection handler

**Integration:** Navigate from measurement screen or project entry flow

---

### 2. **A4_LiDARCapture.tsx** - LiDAR Measurement Screen
**Purpose:** Captures LiDAR point cloud data and processes it to extract room dimensions.

**Features:**
- Real-time progress indicator (0-100%)
- Point cloud data collection simulation
- AI-powered dimension extraction
- Room dimension display (length, width, height)
- Retry functionality
- Tips for best results

**State Management:**
- Uses Zustand store: `setMeasurementCeilingHeight()`
- Local state for capture progress, points, and dimensions

**Data Flow:**
1. User presses Start button
2. Simulates LiDAR capture over 3 seconds
3. Generates mock point cloud (1000 points)
4. User triggers AI processing
5. Returns room dimensions
6. Navigates to next screen

**Integration:** Connected to entry sheet for LiDAR selection

---

### 3. **A5_360PhotoCapture.tsx** - 360° Photo Measurement
**Purpose:** Captures photos from 4 room corners and uses AI to extract dimensions.

**Features:**
- 4-corner photo capture system (NW, NE, SE, SW)
- Visual status indicators for each corner
- Photo preview with timestamps
- Retake individual photos
- AI-powered dimension extraction
- Dimension display after processing

**State Management:**
- Tracks captured photos with corner labels
- Processing status for AI
- Extracted dimensions

**Workflow:**
1. Display current corner (highlights next corner to capture)
2. User presses Capture button
3. Moves to next corner automatically
4. After 4 captures, enables AI processing
5. Shows extracted dimensions
6. Can retake individual photos

**Integration:** Accessible from entry sheet

---

### 4. **EstimateScreen.tsx** - Cost Estimate Display
**Purpose:** Shows detailed cost breakdown for room renovation/finishing.

**Features:**
- Total cost summary card with prominent display
- Expandable cost categories:
  - Building materials
  - Labor services
  - Other expenses
- Itemized breakdown (quantity, unit price, total)
- 10% VAT calculation
- Timeline estimate (15-20 days)
- Export as PDF (placeholder)
- Share functionality

**Categories:**
- 🏗️ Building materials (sand, cement, plaster, paint, etc.)
- 👷 Labor services (wall prep, painting, flooring, etc.)
- 📦 Other costs (transport, project management, etc.)

**Features:**
- Expandable/collapsible category sections
- Cost per item with quantities
- Running totals
- Terms and conditions section
- Export and share buttons

**Integration:** Accessible from project navigation

---

### 5. **SettingsScreen.tsx** - Application Settings
**Purpose:** Centralized settings for app customization and user account management.

**Features:**
- **Account Section:**
  - User profile info
  - Email/phone display
  
- **Display Section:**
  - Light/Dark theme toggle (light by default)
  - Language selection: Uzbek, Russian, English
  
- **Notifications:**
  - Enable/disable notifications (toggle switch)
  - Notification settings link
  
- **About Section:**
  - App version
  - Terms of service link
  - Privacy policy link
  - Feedback submission
  - App rating link
  
- **Data Section:**
  - Clear cache
  - Export data as backup
  - Delete all data (with confirmation)
  
- **Danger Zone:**
  - Logout with confirmation

**State Management:**
- Uses Zustand store:
  - `language`, `setLanguage()`
  - `theme`, `setTheme()`
  - `notificationsEnabled`, `setNotificationsEnabled()`
  - `setUser()`, `reset()` for logout

**Design:**
- Organized in clear sections
- Visual icons for each setting
- Toggle switches for boolean settings
- Confirmation dialogs for destructive actions

**Integration:** Accessible from profile/navigation menu

---

### 6. **HistoryScreen.tsx** - Project History & Management
**Purpose:** Shows past projects, estimates, and project status tracking.

**Features:**
- **Project List:**
  - Project name and room name
  - Status badge (Completed, In Progress, Draft)
  - Estimated cost display
  - Date created
  - Room dimensions
  
- **Filter Tabs:**
  - All projects
  - Draft projects
  - In Progress projects
  - Completed projects
  - Shows count for each tab

- **Project Actions:**
  - View details
  - Download/export project
  
- **Statistics Summary:**
  - Total number of projects
  - Total estimated cost
  - Number of completed projects

**Status Types:**
- ✓ Completed (green)
- ⟳ In Progress (yellow)
- 📝 Draft (gray)

**Data Structure:**
```typescript
interface HistoryItem {
  id: string
  projectName: string
  roomName: string
  status: 'draft' | 'completed' | 'in-progress'
  estimatedCost: number
  createdDate: Date
  completedDate?: Date
  roomDimensions?: { length, width, height }
}
```

**Integration:** Main navigation screen for project management

---

## Store Integration

All screens integrate with the Zustand store (`useAppStore`) for state management:

```typescript
// Settings management
const language = useAppStore((state) => state.language)
const setLanguage = useAppStore((state) => state.setLanguage)
const theme = useAppStore((state) => state.theme)
const notificationsEnabled = useAppStore((state) => state.notificationsEnabled)

// Measurement data
const setMeasurementCeilingHeight = useAppStore((state) => state.setMeasurementCeilingHeight)

// Project/room data
const activeProject = useAppStore((state) => state.activeProject)
const activeRoom = useAppStore((state) => state.activeRoom)
const user = useAppStore((state) => state.user)
```

## Styling Conventions

All screens follow the project's Tailwind/NativeWind conventions:

- **Primary Color:** `blue-600` (main actions, headers)
- **Success Color:** `green-600` (completed, success states)
- **Warning Color:** `yellow-600` (in-progress, caution)
- **Backgrounds:** `bg-white` (main), `bg-gray-50` (secondary)
- **Text:** `text-gray-900` (primary), `text-gray-600` (secondary)
- **Borders:** `border-gray-200` (subtle), `border-blue-200` (accent)

## Navigation Patterns

Screen navigation follows these patterns:

```typescript
// Forward navigation
navigation.navigate('Dimensions')
navigation.navigate('Estimate')
navigation.navigate('Settings')

// Backward navigation
navigation.goBack()

// Replace (for auth flows)
navigation.replace('Login')
```

## Error Handling

All screens implement proper error handling:

- **API Errors:** Alert dialogs with retry options
- **Validation:** User-friendly messages in Uzbek
- **Fallback States:** Empty states with helpful CTAs
- **Loading States:** Activity indicators with status text

## Language Support

All text is in Uzbek with proper grammar and terminology:
- UI labels and buttons
- Helper text and descriptions
- Alert messages
- Placeholder text

## Responsive Design

Screens are designed to work across device sizes:
- Proper `flex` and `flex-row` layouts
- Responsive padding/margins
- Scrollable content areas
- Touch-friendly button sizes (min 44px)

## Accessibility

Screens include accessibility features:
- Semantic text hierarchy (font sizes, weights)
- Good color contrast
- Touch targets > 44x44px
- Clear visual feedback for interactive elements
- Descriptive labels and hints

## Testing Considerations

For testing these screens, consider:

### Unit Tests:
- Store integration (setLanguage, setTheme, etc.)
- Data transformations (cost calculations)
- Status badge color logic

### Integration Tests:
- Navigation flows between screens
- Settings persistence
- Filter functionality in HistoryScreen

### E2E Tests:
- Complete estimate viewing flow
- Settings changes
- History filtering and sorting
- Logout confirmation

## Future Enhancements

Potential improvements for production:
- Replace simulated data with real API calls
- Add photo/video capture with actual camera APIs
- Implement real PDF export functionality
- Add data persistence (AsyncStorage)
- Implement proper push notifications
- Add image upload to cloud storage
- Real LiDAR data integration for iOS
- Pagination for large project histories
- Search/sort functionality in history
- Analytics tracking

## File Locations

All screens are located in:
`/home/rimefara/projects/tamir_uy_mobile/src/screens/`

Files:
- `A3_EntrySheet.tsx` (0.7 KB)
- `A4_LiDARCapture.tsx` (4.2 KB)
- `A5_360PhotoCapture.tsx` (5.1 KB)
- `EstimateScreen.tsx` (6.8 KB)
- `SettingsScreen.tsx` (7.3 KB)
- `HistoryScreen.tsx` (7.9 KB)

**Total: ~32 KB of new functionality**

## Usage Example

```typescript
import EntrySheet from './screens/A3_EntrySheet'
import LiDARCapture from './screens/A4_LiDARCapture'
import EstimateScreen from './screens/EstimateScreen'
import SettingsScreen from './screens/SettingsScreen'
import HistoryScreen from './screens/HistoryScreen'

// In navigation config
<Stack.Screen name="EntrySheet" component={EntrySheet} />
<Stack.Screen name="LiDARCapture" component={LiDARCapture} />
<Stack.Screen name="Estimate" component={EstimateScreen} />
<Stack.Screen name="Settings" component={SettingsScreen} />
<Stack.Screen name="History" component={HistoryScreen} />
```

---

**Status:** ✅ Ready for integration and testing
**Language:** Uzbek (Uz)
**Theme:** Blue color scheme
**State:** Zustand-based store integration
