import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  PanResponder,
  GestureResponderEvent,
  ActivityIndicator,
} from 'react-native'
import { useAppStore } from '../store/appStore'
import { useRoomStateStore } from '../store/roomStateStore'
import { getRoomState } from '../api/roomStateApi'
import { calculateTransform3D, getWallColor, getWallTexturePattern } from '../utils/perspective3D'

interface B2_3DEntryProps {
  navigation?: any
}

export default function B2_3DEntryScreen({ navigation }: B2_3DEntryProps) {
  const activeRoom = useAppStore((state) => state.activeRoom)
  const roomStateData = useAppStore((state) => state.roomState)

  const selectedState = useRoomStateStore((state) => state.selectedState)
  const cameraRotationX = useRoomStateStore((state) => state.cameraRotationX)
  const cameraRotationY = useRoomStateStore((state) => state.cameraRotationY)
  const cameraZoom = useRoomStateStore((state) => state.cameraZoom)
  const setCameraRotation = useRoomStateStore((state) => state.setCameraRotation)
  const setCameraZoom = useRoomStateStore((state) => state.setCameraZoom)
  const resetCamera = useRoomStateStore((state) => state.resetCamera)

  const [loading, setLoading] = useState(!roomStateData)
  const [isDragging, setIsDragging] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const startRotX = useRef(0)
  const startRotY = useRef(0)

  // Load room state if not loaded
  useEffect(() => {
    if (!roomStateData && activeRoom) {
      loadRoomState()
    }
  }, [activeRoom])

  const loadRoomState = async () => {
    if (!activeRoom) return
    setLoading(true)
    try {
      const state = await getRoomState(activeRoom.id)
      useAppStore.getState().setRoomState(state)
    } catch (error) {
      console.error('Failed to load room state:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!activeRoom || !roomStateData) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        {loading ? (
          <ActivityIndicator size="large" color="#0052CC" />
        ) : (
          <Text className="text-lg text-gray-600">Xona ma'lumotini yuklashda xato</Text>
        )}
      </View>
    )
  }

  // Get current state for styling
  const currentState = roomStateData.current_state || selectedState || 'korobka'
  const wallColor = getWallColor(currentState)
  const wallPattern = getWallTexturePattern(currentState)

  // Calculate transforms
  const transform = calculateTransform3D(cameraRotationX, cameraRotationY, cameraZoom)

  const handleMouseDown = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent
    setIsDragging(true)
    startX.current = pageX
    startY.current = pageY
    startRotX.current = cameraRotationX
    startRotY.current = cameraRotationY
  }

  const handleMouseMove = (e: GestureResponderEvent) => {
    if (!isDragging) return

    const { pageX, pageY } = e.nativeEvent
    const deltaX = pageX - startX.current
    const deltaY = pageY - startY.current

    // 1px drag = 0.5 degree rotation
    const newRotY = startRotY.current + deltaX * 0.5
    const newRotX = startRotX.current - deltaY * 0.5

    // Clamp X rotation to -45 to 45 degrees
    const clampedRotX = Math.max(-45, Math.min(45, newRotX))
    setCameraRotation(clampedRotX, newRotY)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleZoomIn = () => {
    setCameraZoom(cameraZoom + 0.2)
  }

  const handleZoomOut = () => {
    setCameraZoom(Math.max(0.5, cameraZoom - 0.2))
  }

  const handleReset = () => {
    resetCamera()
  }

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-4">
        <Text className="text-2xl font-bold text-white">3D Xona Ko'rinishi</Text>
        <Text className="text-blue-100 text-sm">
          {currentState === 'korobka' && 'Korobka bosqichi'}
          {currentState === 'suvoq' && 'Qurutirish bosqichi'}
          {currentState === 'shpaklovka' && 'Shpaklovka bosqichi'}
        </Text>
      </View>

      {/* 3D Room Container */}
      <View
        className="flex-1 bg-gray-100 relative"
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => isDragging}
        onResponderGrant={handleMouseDown}
        onResponderMove={handleMouseMove}
        onResponderRelease={handleMouseUp}
      >
        {/* Perspective container */}
        <View
          style={{
            perspective: transform.perspective,
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {/* 3D Room Box */}
          <View
            style={{
              width: 280,
              height: 280,
              position: 'relative',
              transformOrigin: 'center',
              transform: [
                { perspective: transform.perspective },
                { rotateX: transform.rotateX },
                { rotateY: transform.rotateY },
                { scale: transform.scale },
              ],
            }}
          >
            {/* Back wall (far) */}
            <View
              className="absolute bg-white border border-gray-300"
              style={{
                width: 280,
                height: 200,
                top: 40,
                left: 0,
                backgroundColor: wallColor,
                backgroundImage: wallPattern,
                borderColor: '#D1D5DB',
                borderWidth: 1,
                zIndex: 1,
              }}
            >
              <View className="w-full h-full" />
            </View>

            {/* Right wall */}
            <View
              className="absolute bg-gray-50 border border-gray-300"
              style={{
                width: 100,
                height: 200,
                top: 40,
                right: -100,
                backgroundColor: '#F3F4F6',
                transform: [{ perspective: transform.perspective }, { rotateY: '45deg' }],
                borderColor: '#D1D5DB',
                borderWidth: 1,
                zIndex: 0,
              }}
            >
              <View className="w-full h-full" />
            </View>

            {/* Left wall */}
            <View
              className="absolute bg-gray-100 border border-gray-300"
              style={{
                width: 100,
                height: 200,
                top: 40,
                left: -100,
                backgroundColor: '#E5E7EB',
                transform: [{ perspective: transform.perspective }, { rotateY: '-45deg' }],
                borderColor: '#D1D5DB',
                borderWidth: 1,
                zIndex: 0,
              }}
            >
              <View className="w-full h-full" />
            </View>

            {/* Floor */}
            <View
              className="absolute border border-gray-300"
              style={{
                width: 280,
                height: 100,
                top: 240,
                left: 0,
                backgroundColor: '#D4A574',
                transform: [{ perspective: transform.perspective }, { rotateX: '90deg' }],
                borderColor: '#A0826D',
                borderWidth: 1,
                zIndex: 0,
              }}
            >
              <View className="w-full h-full" />
            </View>

            {/* Ceiling */}
            <View
              className="absolute border border-gray-300"
              style={{
                width: 280,
                height: 100,
                top: 40,
                left: 0,
                backgroundColor: '#E8E3D8',
                transform: [{ perspective: transform.perspective }, { rotateX: '-90deg' }],
                borderColor: '#D1C7BA',
                borderWidth: 1,
                zIndex: 0,
              }}
            >
              <View className="w-full h-full" />
            </View>
          </View>

          {/* Info overlay */}
          <View className="absolute bottom-4 left-4 right-4 bg-black/60 rounded-lg px-3 py-2">
            <Text className="text-white text-xs font-semibold">
              Qo'l bilan buraklab, kamera harakat ettiring
            </Text>
          </View>
        </View>
      </View>

      {/* Controls panel */}
      <View className="bg-white border-t border-gray-200 px-4 py-4">
        {/* Camera controls */}
        <View className="flex-row gap-2 mb-4">
          <TouchableOpacity
            onPress={handleZoomOut}
            className="flex-1 bg-gray-100 rounded-lg py-3 items-center border border-gray-300"
          >
            <Text className="text-xl">−</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleZoomIn}
            className="flex-1 bg-gray-100 rounded-lg py-3 items-center border border-gray-300"
          >
            <Text className="text-xl">+</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleReset}
            className="flex-1 bg-blue-100 rounded-lg py-3 items-center border border-blue-300"
          >
            <Text className="text-sm font-semibold text-blue-600">Qayta o'rnatish</Text>
          </TouchableOpacity>
        </View>

        {/* Camera values display */}
        <View className="bg-gray-50 rounded-lg p-3 mb-4">
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-gray-600">Burilish X:</Text>
            <Text className="text-xs font-semibold text-gray-900">
              {Math.round(cameraRotationX)}°
            </Text>
          </View>
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-gray-600">Burilish Y:</Text>
            <Text className="text-xs font-semibold text-gray-900">
              {Math.round(cameraRotationY)}°
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-xs text-gray-600">Kattalashma:</Text>
            <Text className="text-xs font-semibold text-gray-900">
              {cameraZoom.toFixed(1)}x
            </Text>
          </View>
        </View>

        {/* Navigation buttons */}
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={() => navigation?.goBack()}
            className="flex-1 rounded-lg py-3 items-center border border-gray-300 bg-white"
          >
            <Text className="text-gray-700 font-semibold">Orqaga</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation?.navigate('B3_OnboardingRail')}
            className="flex-1 rounded-lg py-3 items-center bg-blue-600"
          >
            <Text className="text-white font-semibold">Keyingi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}
