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
import MeasurementScreen from '../screens/A6_RoomDimensions'
import WallMeasurementScreen from '../screens/A7_WallMeasurement'
import RoomStateScreen from '../screens/B1_RoomState'
import RoomEntryScreen from '../screens/B2_3DEntry'

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
      <Stack.Screen name="Measurement" component={MeasurementScreen} />
      <Stack.Screen name="WallMeasurement" component={WallMeasurementScreen} />
      <Stack.Screen name="RoomState" component={RoomStateScreen} />
      <Stack.Screen name="RoomEntry" component={RoomEntryScreen} />
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
