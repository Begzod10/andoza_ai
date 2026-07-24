import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  Alert,
} from 'react-native'
import { PanGestureHandler, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useAnimatedGestureHandler,
  Easing,
  useAnimatedReaction,
  runOnJS,
} from 'react-native-reanimated'
import { useDecorationStore } from '../store/decorationStore'
import { useAppStore } from '../store/appStore'

const { width, height } = Dimensions.get('window')
const WALL_WIDTH = width - 32
const WALL_HEIGHT = 200

interface Wall {
  id: string
  name: string
  label: string
  emoji: string
}

const WALLS: Wall[] = [
  { id: 'A', name: 'A devari', label: 'A', emoji: '🪟' },
  { id: 'B', name: 'B devari', label: 'B', emoji: '🚪' },
  { id: 'C', name: 'C devari', label: 'C', emoji: '🪟' },
  { id: 'D', name: 'D devari', label: 'D', emoji: '🪟' },
]

const DraggableSwatch = ({ material, onDrop }: any) => {
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const scale = useSharedValue(1)
  const [isOverWall, setIsOverWall] = useState<string | null>(null)

  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_event, _context: any) => {
      scale.value = withSpring(1.2)
    },
    onActive: (event, _context: any) => {
      translateX.value = event.translationX
      translateY.value = event.translationY

      // Check which wall is being dragged over
      const wallIndex = Math.floor((event.absoluteY - 200) / (WALL_HEIGHT + 20))
      const detectedWall = WALLS[wallIndex]?.id

      runOnJS(setIsOverWall)(detectedWall || null)
    },
    onEnd: (_event, _context: any) => {
      if (isOverWall) {
        runOnJS(onDrop)(isOverWall)
      }

      translateX.value = withSpring(0)
      translateY.value = withSpring(0)
      scale.value = withSpring(1)
      runOnJS(setIsOverWall)(null)
    },
  })

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }))

  return (
    <PanGestureHandler onGestureEvent={gestureHandler}>
      <Animated.View
        style={[
          {
            width: 80,
            height: 80,
            borderRadius: 12,
            marginBottom: 12,
            backgroundColor: material.color || '#E5E7EB',
            justifyContent: 'flex-end',
            paddingBottom: 6,
            alignItems: 'center',
            borderWidth: 2,
            borderColor: isOverWall ? '#2563EB' : '#D1D5DB',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          },
          animatedStyle,
        ]}
      >
        <Text className="text-xs font-semibold text-gray-800 text-center px-1">
          {material.name}
        </Text>
      </Animated.View>
    </PanGestureHandler>
  )
}

const WallDropZone = ({ wall, material, isOver, onDrop }: any) => {
  const scaleValue = useSharedValue(1)

  const animatedWallStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
    borderWidth: isOver ? 3 : 2,
  }))

  React.useEffect(() => {
    if (isOver) {
      scaleValue.value = withSpring(1.05)
    } else {
      scaleValue.value = withSpring(1)
    }
  }, [isOver])

  return (
    <Animated.View
      style={[
        {
          width: WALL_WIDTH,
          height: WALL_HEIGHT,
          backgroundColor: material?.color || '#F3F4F6',
          borderRadius: 12,
          borderColor: isOver ? '#2563EB' : '#D1D5DB',
          marginBottom: 12,
          padding: 16,
          justifyContent: 'space-between',
        },
        animatedWallStyle,
      ]}
    >
      {/* Wall Label */}
      <View className="flex-row items-center gap-2">
        <Text className="text-2xl">{wall.emoji}</Text>
        <View>
          <Text className="font-bold text-lg text-gray-900">{wall.label} devari</Text>
          <Text className="text-xs text-gray-600">{wall.name}</Text>
        </View>
      </View>

      {/* Material Info */}
      {material ? (
        <View className="bg-white rounded-lg p-3">
          <Text className="font-semibold text-gray-800">{material.name}</Text>
          <Text className="text-xs text-blue-600 mt-1">✓ Qo'llanildi</Text>
        </View>
      ) : (
        <View className="bg-white rounded-lg p-3 opacity-50">
          <Text className="text-gray-600 text-sm">Material tanlash uchun suring</Text>
          <Text className="text-xs text-gray-500 mt-1">← Rangni surish uchun</Text>
        </View>
      )}
    </Animated.View>
  )
}

export default function C2_DragAnimation({ navigation }: any) {
  const { selectedMaterial, setWallMaterial, setCurrentDecorStep } = useDecorationStore()
  const { activeRoom } = useAppStore()

  const [appliedWalls, setAppliedWalls] = useState<Record<string, any>>({})
  const [dragSource, setDragSource] = useState<any>(selectedMaterial)

  const handleDrop = useCallback((wallId: string) => {
    if (!dragSource) return

    setAppliedWalls((prev) => ({
      ...prev,
      [wallId]: dragSource,
    }))

    setWallMaterial(wallId, dragSource)

    Alert.alert('✓ Muvaffaqiyat', `${dragSource.name} ${wallId} devariga qo'llanildi`)
  }, [dragSource, setWallMaterial])

  const handleClearWall = (wallId: string) => {
    setAppliedWalls((prev) => {
      const updated = { ...prev }
      delete updated[wallId]
      return updated
    })
  }

  const canProceed = WALLS.some((wall) => appliedWalls[wall.id])

  const handleProceed = () => {
    if (!canProceed) {
      Alert.alert('⚠️ Ogohlantirish', 'Iltimos, hech bo\'lmaganda bitta devarga material qo\'llang')
      return
    }
    setCurrentDecorStep(3)
    navigation.navigate('C3_MaterialApplied')
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-white">
        {/* Header */}
        <View className="bg-gradient-to-r from-blue-600 to-blue-400 px-4 py-6">
          <Text className="text-2xl font-bold text-white mb-1">Drag & Drop qo'llash</Text>
          <Text className="text-blue-100 text-sm">2-bosqich: Devarlarga material qo'llang</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          {/* Instructions */}
          <View className="mx-4 mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <Text className="font-bold text-blue-900 mb-2">📝 Ko'rsatma</Text>
            <Text className="text-sm text-blue-800">
              Yuqoridagi rangni surgi devarlarga qo'llang. Har bir devarni alohida material bilan
              bezashingiz mumkin.
            </Text>
          </View>

          {/* Draggable Swatch */}
          <View className="mx-4 mt-6">
            <Text className="font-semibold text-gray-800 mb-2">Qo'llash uchun suring:</Text>
            <DraggableSwatch material={dragSource} onDrop={handleDrop} />
          </View>

          {/* Walls */}
          <View className="mx-4 mt-8">
            <Text className="font-semibold text-gray-900 mb-4 text-lg">Devarlar</Text>

            {WALLS.map((wall) => (
              <View key={wall.id}>
                <WallDropZone
                  wall={wall}
                  material={appliedWalls[wall.id]}
                  isOver={false}
                />

                {appliedWalls[wall.id] && (
                  <TouchableOpacity
                    onPress={() => handleClearWall(wall.id)}
                    className="mx-4 mb-4 p-2 bg-red-100 rounded"
                  >
                    <Text className="text-red-700 font-semibold text-center text-sm">
                      ✕ Ochirish
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Bottom Action */}
        {canProceed && (
          <View className="absolute bottom-0 left-0 right-0 bg-white border-t-2 border-blue-300 p-4">
            <TouchableOpacity
              onPress={handleProceed}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 py-3 rounded-lg"
            >
              <Text className="text-center text-white font-bold text-lg">
                Davom etish → Tasdiqlash
              </Text>
            </TouchableOpacity>
            <Text className="text-center text-xs text-gray-600 mt-2">
              {Object.keys(appliedWalls).length} devar tanlanildi
            </Text>
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  )
}
