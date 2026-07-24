import React, { useState, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native'
import { useAppStore } from '../store/appStore'

// Simple hash for deterministic seed from device ID
const hashCode = (str: string): number => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

// Seeded random based on hash
const seededRandom = (seed: number): number => {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

interface Light3D {
  id: string
  x: number
  y: number
  z: number
  intensity: number
  type: string
}

export default function D3_LightingPreviewScreen({ navigation }: any) {
  const { activeRoom, electricalDevices, setCurrentStage } = useAppStore()
  const [rotationX, setRotationX] = useState(0.3)
  const [rotationY, setRotationY] = useState(0.4)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [selectedLight, setSelectedLight] = useState<string | null>(null)
  const [lightIntensities, setLightIntensities] = useState<Record<string, number>>({})

  const screenWidth = Dimensions.get('window').width
  const previewSize = screenWidth - 32

  // Initialize light intensities
  useEffect(() => {
    const intensities: Record<string, number> = {}
    electricalDevices.forEach((device) => {
      intensities[device.id] = 0.7
    })
    setLightIntensities(intensities)
  }, [electricalDevices])

  const convert3DPoint = (x: number, y: number, z: number) => {
    // Simple perspective projection
    const rx = rotationX
    const ry = rotationY

    // Apply rotations
    let rotatedX = x * Math.cos(ry) - z * Math.sin(ry)
    let rotatedZ = x * Math.sin(ry) + z * Math.cos(ry)
    let rotatedY = y * Math.cos(rx) - rotatedZ * Math.sin(rx)

    // Apply zoom and center
    const centerX = previewSize / 2
    const centerY = previewSize / 2
    const scale = (previewSize / 4) * zoomLevel

    return {
      x: centerX + rotatedX * scale,
      y: centerY - rotatedY * scale,
      size: Math.max(1, 20 + rotatedZ * 10),
    }
  }

  const handleRotateLeft = () => {
    setRotationY((prev) => prev - 0.2)
  }

  const handleRotateRight = () => {
    setRotationY((prev) => prev + 0.2)
  }

  const handleRotateUp = () => {
    setRotationX((prev) => Math.min(Math.PI / 2, prev + 0.2))
  }

  const handleRotateDown = () => {
    setRotationX((prev) => Math.max(-Math.PI / 2, prev - 0.2))
  }

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(2, prev + 0.2))
  }

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(0.5, prev - 0.2))
  }

  const handleResetView = () => {
    setRotationX(0.3)
    setRotationY(0.4)
    setZoomLevel(1)
  }

  const handleIntensityChange = (deviceId: string, delta: number) => {
    setLightIntensities((prev) => {
      const current = prev[deviceId] || 0.7
      const newIntensity = Math.max(0, Math.min(1, current + delta))
      return { ...prev, [deviceId]: newIntensity }
    })
  }

  const getTotalLightOutput = () => {
    return Object.values(lightIntensities)
      .reduce((sum, intensity) => sum + intensity, 0)
      .toFixed(1)
  }

  const proceed = () => {
    setCurrentStage(7)
    navigation.navigate('D4_ElectricalSummary')
  }

  return (
    <ScrollView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-6 bg-gradient-to-r from-blue-600 to-blue-400">
        <Text className="text-2xl font-bold text-white mb-1">Yorug'lik ko'rinishi</Text>
        <Text className="text-blue-100">{activeRoom?.name} - 3D ko'rish</Text>
      </View>

      {/* 3D Preview */}
      <View className="px-4 pt-6">
        <Text className="text-lg font-semibold text-gray-900 mb-4">Xona modelsi</Text>
        <View
          className="bg-gradient-to-b from-blue-100 to-blue-50 rounded-lg border-2 border-blue-200 overflow-hidden"
          style={{
            height: previewSize,
            width: previewSize,
          }}
        >
          {/* Background gradient (sky to floor) */}
          <View className="absolute inset-0">
            <View className="flex-1 bg-gradient-to-b from-sky-200 via-sky-50 to-gray-100" />
          </View>

          {/* Lights visualization */}
          {electricalDevices
            .filter((d) => d.room_id === activeRoom?.id && d.type === 'light')
            .map((device) => {
            const x = device.position || 0
            const y = device.height / 280
            // FIX: Use deterministic z based on device ID instead of Math.random()
            const z = (seededRandom(hashCode(device.id)) * 2 - 1) * 0.5

            const pos = convert3DPoint(x, y, z)
            const intensity = lightIntensities[device.id] || 0.7
            const isSelected = selectedLight === device.id

            return (
              <TouchableOpacity
                key={device.id}
                onPress={() => setSelectedLight(device.id)}
                style={{
                  position: 'absolute',
                  left: pos.x - pos.size / 2,
                  top: pos.y - pos.size / 2,
                  width: pos.size,
                  height: pos.size,
                }}
                className={`rounded-full items-center justify-center ${
                  isSelected ? 'border-4 border-white' : 'border-2 border-yellow-300'
                }`}
              >
                {/* Light glow */}
                <View
                  className="absolute inset-0 rounded-full"
                  style={{
                    backgroundColor: `rgba(255, 200, 0, ${intensity * 0.3})`,
                  }}
                />
                {/* Light core */}
                <View
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: `rgba(255, 220, 0, ${0.5 + intensity * 0.5})`,
                  }}
                />
              </TouchableOpacity>
            )
          })}

          {/* No lights message */}
          {electricalDevices.length === 0 && (
            <View className="absolute inset-0 items-center justify-center">
              <Text className="text-gray-500 font-semibold">
                Avvalo yoritgichlarni qo'shib oling
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Rotation Controls */}
      <View className="px-4 pt-6">
        <Text className="text-sm font-semibold text-gray-900 mb-3">
          Aylantirish
        </Text>

        {/* Horizontal rotation */}
        <View className="flex-row gap-2 mb-3 items-center justify-center">
          <TouchableOpacity
            onPress={handleRotateLeft}
            className="bg-blue-100 p-3 rounded-lg"
          >
            <Text className="text-xl">⬅️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleResetView}
            className="flex-1 bg-gray-100 py-2 px-3 rounded-lg items-center"
          >
            <Text className="text-xs font-semibold text-gray-700">
              Boshlang'ich
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRotateRight}
            className="bg-blue-100 p-3 rounded-lg"
          >
            <Text className="text-xl">➡️</Text>
          </TouchableOpacity>
        </View>

        {/* Vertical rotation */}
        <View className="flex-row gap-2 items-center justify-center">
          <TouchableOpacity
            onPress={handleRotateUp}
            className="bg-blue-100 p-3 rounded-lg"
          >
            <Text className="text-xl">⬆️</Text>
          </TouchableOpacity>
          <Text className="text-xs text-gray-500 mx-3">Vertikal</Text>
          <TouchableOpacity
            onPress={handleRotateDown}
            className="bg-blue-100 p-3 rounded-lg"
          >
            <Text className="text-xl">⬇️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Zoom Controls */}
      <View className="px-4 pt-6 pb-6">
        <Text className="text-sm font-semibold text-gray-900 mb-3">
          Kattalashtirish ({(zoomLevel * 100).toFixed(0)}%)
        </Text>
        <View className="flex-row gap-2 items-center">
          <TouchableOpacity
            onPress={handleZoomOut}
            className="flex-1 bg-blue-100 py-2 px-3 rounded-lg items-center"
          >
            <Text className="text-lg">−</Text>
          </TouchableOpacity>
          <View className="flex-1 mx-2 h-2 bg-gray-200 rounded-full overflow-hidden">
            <View
              className="h-full bg-blue-600"
              style={{ width: `${(zoomLevel / 2) * 100}%` }}
            />
          </View>
          <TouchableOpacity
            onPress={handleZoomIn}
            className="flex-1 bg-blue-100 py-2 px-3 rounded-lg items-center"
          >
            <Text className="text-lg">+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Light Control */}
      {selectedLight && (
        <View className="mx-4 mb-6 p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200">
          <Text className="font-semibold text-gray-900 mb-3">
            Yorug\'lik kuchini sozlang
          </Text>
          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              onPress={() => handleIntensityChange(selectedLight, -0.1)}
              className="bg-yellow-100 px-3 py-2 rounded-lg"
            >
              <Text className="text-yellow-600 font-bold">−</Text>
            </TouchableOpacity>
            <View className="flex-1">
              <View className="h-3 bg-yellow-200 rounded-full overflow-hidden">
                <View
                  className="h-full bg-yellow-500"
                  style={{
                    width: `${(lightIntensities[selectedLight] || 0.7) * 100}%`,
                  }}
                />
              </View>
              <Text className="text-xs text-gray-600 mt-1 text-center">
                {((lightIntensities[selectedLight] || 0.7) * 100).toFixed(0)}%
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => handleIntensityChange(selectedLight, 0.1)}
              className="bg-yellow-100 px-3 py-2 rounded-lg"
            >
              <Text className="text-yellow-600 font-bold">+</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Stats */}
      <View className="mx-4 mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <View className="flex-row justify-around">
          <View className="items-center">
            <Text className="text-xs text-gray-600 mb-1">Yoritgichlar</Text>
            <Text className="text-2xl font-bold text-blue-600">
              {electricalDevices.filter(d => d.room_id === activeRoom?.id && d.type === 'light').length}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-xs text-gray-600 mb-1">O'rtacha kuch</Text>
            <Text className="text-2xl font-bold text-blue-600">
              {getTotalLightOutput()}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-xs text-gray-600 mb-1">Bosqich</Text>
            <Text className="text-2xl font-bold text-blue-600">3/4</Text>
          </View>
        </View>
      </View>

      {/* Navigation Buttons */}
      <View className="flex-row gap-3 px-4 py-6 border-t border-gray-200">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="flex-1 py-3 px-4 rounded-lg border-2 border-gray-300 items-center justify-center"
        >
          <Text className="text-gray-700 font-bold">Orqaga</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={proceed}
          className="flex-1 py-3 px-4 rounded-lg bg-blue-600 items-center justify-center"
        >
          <Text className="text-white font-bold">Keyingi →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}
