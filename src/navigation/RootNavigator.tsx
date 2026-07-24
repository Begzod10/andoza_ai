import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Feather } from '@expo/vector-icons'
import { useAppStore } from '../store/appStore'

// Screens - Auth Stack
import LoginScreen from '../screens/Auth/LoginScreen'
import OTPScreen from '../screens/Auth/OTPScreen'

// Screens - App Stack
import HomeScreen from '../screens/A1_Home'
import ProjectsScreen from '../screens/A2_Projects'
import EntrySheetScreen from '../screens/A3_EntrySheet'
import LiDARCaptureScreen from '../screens/A4_LiDARCapture'
import Photo360CaptureScreen from '../screens/A5_360PhotoCapture'
import MeasurementScreen from '../screens/A6_RoomDimensions'
import WallMeasurementScreen from '../screens/A7_WallMeasurement'
import OpeningSheetScreen from '../screens/A8_OpeningSheet'
import SummaryScreen from '../screens/A9_Summary'
import RoomStateScreen from '../screens/B1_RoomState'
import RoomEntryScreen from '../screens/B2_3DEntry'
import OnboardingRailScreen from '../screens/B3_OnboardingRail'

// Screens - Decoration Stack
import C1_PaintWallpaper from '../screens/C1_PaintWallpaper'
import C2_DragAnimation from '../screens/C2_DragAnimation'
import C3_MaterialApplied from '../screens/C3_MaterialApplied'
import C4_FloorSelection from '../screens/C4_FloorSelection'
import C5_Summary from '../screens/C5_Summary'
import C6_FurnitureSelection from '../screens/C6_FurnitureSelection'
import C7_FurnitureLayout from '../screens/C7_FurnitureLayout'
import C8_TextureSelection from '../screens/C8_TextureSelection'
import C9_FinalReview from '../screens/C9_FinalReview'

// Screens - Electrical Stack
import D1_ElectricalPlan from '../screens/D1_ElectricalPlan'
import D2_DeviceSelection from '../screens/D2_DeviceSelection'
import D3_LightingPreview from '../screens/D3_LightingPreview'
import D4_ElectricalSummary from '../screens/D4_ElectricalSummary'

// Screens - Utility Screens
import EstimateScreen from '../screens/EstimateScreen'
import HistoryScreen from '../screens/HistoryScreen'
import SettingsScreen from '../screens/SettingsScreen'

// Screens - Bottom Tab Screens
import ShopScreen from '../screens/Shop/ShopScreen'
import ContractorsScreen from '../screens/Contractors/ContractorsScreen'
import ProfileScreen from '../screens/Profile/ProfileScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

// ============================================================================
// Auth Stack
// ============================================================================

function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#FFFFFF' },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="OTP" component={OTPScreen} />
    </Stack.Navigator>
  )
}

// ============================================================================
// App Stack (with Bottom Tabs)
// ============================================================================

function HomeTabStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="HomeTab" component={HomeScreen} />
      <Stack.Screen name="Projects" component={ProjectsScreen} />
      <Stack.Screen name="EntrySheet" component={EntrySheetScreen} />
      <Stack.Screen name="LiDARCapture" component={LiDARCaptureScreen} />
      <Stack.Screen name="Photo360Capture" component={Photo360CaptureScreen} />
      <Stack.Screen name="Measurement" component={MeasurementScreen} />
      <Stack.Screen name="WallMeasurement" component={WallMeasurementScreen} />
      <Stack.Screen name="OpeningSheet" component={OpeningSheetScreen} />
      <Stack.Screen name="Summary" component={SummaryScreen} />
      <Stack.Screen name="RoomState" component={RoomStateScreen} />
      <Stack.Screen name="RoomEntry" component={RoomEntryScreen} />
      <Stack.Screen name="OnboardingRail" component={OnboardingRailScreen} />

      {/* Decoration Workflow */}
      <Stack.Screen name="C1_PaintWallpaper" component={C1_PaintWallpaper} />
      <Stack.Screen name="C2_DragAnimation" component={C2_DragAnimation} />
      <Stack.Screen name="C3_MaterialApplied" component={C3_MaterialApplied} />
      <Stack.Screen name="C4_FloorSelection" component={C4_FloorSelection} />
      <Stack.Screen name="C5_Summary" component={C5_Summary} />
      <Stack.Screen name="C6_FurnitureSelection" component={C6_FurnitureSelection} />
      <Stack.Screen name="C7_FurnitureLayout" component={C7_FurnitureLayout} />
      <Stack.Screen name="C8_TextureSelection" component={C8_TextureSelection} />
      <Stack.Screen name="C9_FinalReview" component={C9_FinalReview} />

      {/* Electrical Workflow */}
      <Stack.Screen name="D1_ElectricalPlan" component={D1_ElectricalPlan} />
      <Stack.Screen name="D2_DeviceSelection" component={D2_DeviceSelection} />
      <Stack.Screen name="D3_LightingPreview" component={D3_LightingPreview} />
      <Stack.Screen name="D4_ElectricalSummary" component={D4_ElectricalSummary} />

      {/* Utility Screens */}
      <Stack.Screen name="Estimate" component={EstimateScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="AppSettings" component={SettingsScreen} />
    </Stack.Navigator>
  )
}

function AppTabs() {
  const activeTab = useAppStore((state) => state.activeBottomTab)

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any

          if (route.name === 'UyTab') {
            iconName = focused ? 'home' : 'home'
          } else if (route.name === 'DokonTab') {
            iconName = focused ? 'shopping-bag' : 'shopping-bag'
          } else if (route.name === 'UstalarTab') {
            iconName = focused ? 'tool' : 'tool'
          } else if (route.name === 'ProfilTab') {
            iconName = focused ? 'user' : 'user'
          }

          return <Feather name={iconName} size={size} color={color} />
        },
        tabBarActiveTintColor: '#1E3A8A',
        tabBarInactiveTintColor: '#98A2BC',
        tabBarStyle: {
          height: 94,
          paddingBottom: 24,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: '#E2E7F2',
          backgroundColor: '#FFFFFF',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: activeTab === 'uy' || activeTab === 'dokon' || activeTab === 'ustalar' || activeTab === 'profil' ? '700' : '600',
        },
      })}
    >
      <Tab.Screen
        name="UyTab"
        component={HomeTabStack}
        options={{
          tabBarLabel: 'Uy',
        }}
      />
      <Tab.Screen
        name="DokonTab"
        component={ShopScreen}
        options={{
          tabBarLabel: "Do'kon",
        }}
      />
      <Tab.Screen
        name="UstalarTab"
        component={ContractorsScreen}
        options={{
          tabBarLabel: 'Ustalar',
        }}
      />
      <Tab.Screen
        name="ProfilTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profil',
        }}
      />
    </Tab.Navigator>
  )
}

// ============================================================================
// Root Navigator
// ============================================================================

export function RootNavigator() {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated)

  return (
    <NavigationContainer>
      {isAuthenticated ? <AppTabs /> : <AuthStack />}
    </NavigationContainer>
  )
}

export default RootNavigator
