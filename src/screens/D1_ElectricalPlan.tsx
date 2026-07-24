import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native'
import { useAppStore } from '../store/appStore'
import apiClient from '../config/api'
import type { ElectricalDevice } from '../types'

// Simple UUID v4-like generator
const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Constants
const MAX_DEVICE_HEIGHT_CM = 280
const MAX_WALL_POSITION_M = 6
const DEFAULT_DEVICE_HEIGHT_CM = 110
const DEVICE_HEIGHT_PRESETS = [80, 110, 150, 200]
const WALL_POSITION_PRESETS = [1, 2, 3, 4, 5]

interface FloorPlanMeasurements {
  width: number
  height: number
  scaleX: number
  scaleY: number
}

export default function D1_ElectricalPlanScreen({ navigation }: any) {
  const { activeRoom, electricalDevices, setElectricalDevices, addDevice, removeDevice } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedWall, setSelectedWall] = useState<'A' | 'B' | 'C' | 'D' | 'ceiling'>('A')
  const [deviceHeight, setDeviceHeight] = useState(DEFAULT_DEVICE_HEIGHT_CM)
  const [devicePosition, setDevicePosition] = useState(1)
  const [floorPlan, setFloorPlan] = useState<FloorPlanMeasurements | null>(null)

  const screenWidth = Dimensions.get('window').width
  const planWidth = screenWidth - 32 // padding
  const planHeight = 300

  useEffect(() => {
    if (!activeRoom) {
      navigation.goBack()
      return
    }
    fetchElectricalData()
  }, [activeRoom, navigation])

  const fetchElectricalData = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiClient.get(`/rooms/${activeRoom?.id}/electrical`)
      const data = response.data

      // FIX: Replace (not append) devices for this room
      if (data.success && Array.isArray(data.data?.devices)) {
        const roomDevices = data.data.devices.filter(
          (d: ElectricalDevice) => d.room_id === activeRoom?.id
        )
        setElectricalDevices(roomDevices)
      } else if (data.success) {
        setElectricalDevices([])
      }

      // Calculate floor plan dimensions
      const height = activeRoom?.ceiling_h || 2800 // mm
      const area = activeRoom?.floor_area || 20 // m²
      const estimatedLength = Math.sqrt(area) * 1000 // mm

      setFloorPlan({
        width: planWidth,
        height: planHeight,
        scaleX: planWidth / estimatedLength,
        scaleY: planHeight / height,
      })
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Elektr ma\'lumotlarini yuklab bo\'lmadi'
      setError(errorMsg)
      // Note: Use a proper logger instead of console.error in production
    } finally {
      setLoading(false)
    }
  }

  const handleAddDevice = () => {
    if (!activeRoom) return

    // FIX: Create generic placeholder device without type/variant
    // D2 will assign actual type and variant
    const newDevice: ElectricalDevice = {
      id: generateId(),
      room_id: activeRoom.id,
      type: 'box', // Placeholder type
      // variant intentionally undefined - will be set in D2
      wall: selectedWall,
      height: deviceHeight,
      position: devicePosition,
      placed_at: new Date().toISOString(),
    }

    addDevice(newDevice)
    setDeviceHeight(DEFAULT_DEVICE_HEIGHT_CM)
    setDevicePosition(1)
  }

  const handleRemoveDevice = (deviceId: string) => {
    Alert.alert(
      'O\'chirish tasdig\'i',
      'Ushbu qurilmani o\'chirmoqchimisiz?',
      [
        { text: 'Bekor qilish', onPress: () => {}, style: 'cancel' },
        {
          text: 'O\'chirish',
          onPress: () => removeDevice(deviceId),
          style: 'destructive',
        },
      ]
    )
  }

  const getWallLabel = (wall: string) => {
    const labels: Record<string, string> = {
      A: 'A devori',
      B: 'B devori',
      C: 'C devori',
      D: 'D devori',
      ceiling: 'Shiftning ichida',
    }
    return labels[wall] || wall
  }

  const getDeviceIcon = (type: string, variant?: string) => {
    const icons: Record<string, string> = {
      light_spot: '💡',
      light_chandelier: '🔆',
      light_strip: '✨',
      socket: '🔌',
      switch: '🔘',
      box: '📦',
    }
    return icons[`${type}_${variant}`] || '⚡'
  }

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="mt-3 text-gray-600">Elektr plani yuklanmoqda...</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View className="flex-1 bg-white px-4 py-8">
        <View className="flex-1 justify-center items-center">
          <Text className="text-lg font-semibold text-red-600 mb-4">Xato</Text>
          <Text className="text-center text-gray-600 mb-6">{error}</Text>
          <TouchableOpacity
            onPress={fetchElectricalData}
            className="bg-blue-600 px-6 py-2 rounded-lg"
          >
            <Text className="text-white font-semibold">Qayta urinish</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <ScrollView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-6 bg-gradient-to-r from-blue-600 to-blue-400">
        <Text className="text-2xl font-bold text-white mb-1">Elektr sxemasi</Text>
        <Text className="text-blue-100">{activeRoom?.name} - Qo'shimcha qurilmalar</Text>
      </View>

      {/* Floor Plan */}
      <View className="px-4 py-6">
        <Text className="text-lg font-semibold text-gray-900 mb-4">Xona rejasi</Text>
        <View className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4" style={{ height: planHeight }}>
          {/* Grid background */}
          <View className="absolute inset-0 opacity-5">
            <View className="flex-1 flex-row">
              {Array.from({ length: 5 }).map((_, i) => (
                <View key={`v-${i}`} className="flex-1 border-l border-blue-600" />
              ))}
            </View>
          </View>

          {/* Devices visualization */}
          {electricalDevices
            .filter((d) => d.room_id === activeRoom?.id && d.wall === selectedWall)
            .map((device) => {
            // FIX: Remove extra division - scaleX/Y already converts to pixels
            const x = device.position * 1000 * (floorPlan?.scaleX || 1)
            const y = device.height * (floorPlan?.scaleY || 1)

            return (
              <TouchableOpacity
                key={device.id}
                onPress={() => handleRemoveDevice(device.id)}
                style={{
                  position: 'absolute',
                  left: Math.min(Math.max(x, 0), planWidth - 30),
                  top: Math.min(Math.max(y, 0), planHeight - 30),
                }}
                className="w-8 h-8 bg-blue-600 rounded-full items-center justify-center border-2 border-white shadow"
              >
                <Text className="text-lg">⚡</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        <Text className="text-xs text-gray-500 mt-2">
          Qurilmani o'chirish uchun ustiga bosing
        </Text>
      </View>

      {/* Wall Selection */}
      <View className="px-4 py-4 border-t border-gray-200">
        <Text className="text-lg font-semibold text-gray-900 mb-3">Devor tanlang</Text>
        <View className="flex-row gap-2">
          {(['A', 'B', 'C', 'D', 'ceiling'] as const).map((wall) => (
            <TouchableOpacity
              key={wall}
              onPress={() => setSelectedWall(wall)}
              className={`flex-1 py-3 px-2 rounded-lg border-2 items-center justify-center ${
                selectedWall === wall
                  ? 'bg-blue-600 border-blue-600'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <Text
                className={`font-semibold text-sm ${
                  selectedWall === wall ? 'text-white' : 'text-gray-700'
                }`}
              >
                {wall === 'ceiling' ? 'Tavan' : wall}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Device Positioning */}
      <View className="px-4 py-6 border-t border-gray-200">
        <Text className="text-lg font-semibold text-gray-900 mb-4">
          Qurilma qo'shish
        </Text>

        {/* Height Slider */}
        <View className="mb-6">
          <View className="flex-row justify-between mb-2">
            <Text className="text-sm font-medium text-gray-700">Balandlik: {deviceHeight} sm</Text>
            <Text className="text-xs text-gray-500">(0-{MAX_DEVICE_HEIGHT_CM} sm)</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="text-sm text-gray-600">0</Text>
            <View className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <View
                className="h-full bg-blue-600"
                style={{ width: `${(deviceHeight / MAX_DEVICE_HEIGHT_CM) * 100}%` }}
              />
            </View>
            <Text className="text-sm text-gray-600">{MAX_DEVICE_HEIGHT_CM}</Text>
          </View>
          <View className="flex-row gap-2 mt-2">
            {DEVICE_HEIGHT_PRESETS.map((h) => (
              <TouchableOpacity
                key={h}
                onPress={() => setDeviceHeight(h)}
                className={`flex-1 py-2 px-2 rounded border ${
                  deviceHeight === h
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-gray-100 border-gray-300'
                }`}
              >
                <Text
                  className={`text-xs text-center font-semibold ${
                    deviceHeight === h ? 'text-white' : 'text-gray-700'
                  }`}
                >
                  {h} sm
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Position Slider */}
        <View className="mb-6">
          <View className="flex-row justify-between mb-2">
            <Text className="text-sm font-medium text-gray-700">
              Devordagi pozitsiya: {devicePosition.toFixed(1)} m
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="text-sm text-gray-600">0</Text>
            <View className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <View
                className="h-full bg-blue-600"
                style={{ width: `${(devicePosition / MAX_WALL_POSITION_M) * 100}%` }}
              />
            </View>
            <Text className="text-sm text-gray-600">{MAX_WALL_POSITION_M}</Text>
          </View>
          <View className="flex-row gap-2 mt-2">
            {WALL_POSITION_PRESETS.map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setDevicePosition(p)}
                className={`flex-1 py-2 px-2 rounded border ${
                  devicePosition === p
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-gray-100 border-gray-300'
                }`}
              >
                <Text
                  className={`text-xs text-center font-semibold ${
                    devicePosition === p ? 'text-white' : 'text-gray-700'
                  }`}
                >
                  {p}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Add Button */}
        <TouchableOpacity
          onPress={handleAddDevice}
          className="bg-blue-600 py-3 px-4 rounded-lg items-center justify-center mb-4"
        >
          <Text className="text-white font-bold text-lg">+ Qurilma qo'shish</Text>
        </TouchableOpacity>
      </View>

      {/* Current Devices List */}
      {(() => {
        const roomDevices = electricalDevices.filter(d => d.room_id === activeRoom?.id)
        return roomDevices.length > 0 ? (
        <View className="px-4 py-6 border-t border-gray-200">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg font-semibold text-gray-900">
              Qo'shilgan qurilmalar ({roomDevices.length})
            </Text>
          </View>

          {roomDevices.map((device) => (
            <View
              key={device.id}
              className="bg-gray-50 p-3 rounded-lg mb-2 flex-row justify-between items-center"
            >
              <View className="flex-1">
                <Text className="font-semibold text-gray-900">
                  {getDeviceIcon(device.type, device.variant)} {device.variant || device.type}
                </Text>
                <Text className="text-xs text-gray-600 mt-1">
                  {getWallLabel(device.wall || 'A')} • {device.height} sm • {device.position.toFixed(1)} m
                </Text>
              </View>
            </View>
          ))}
        </View>
        ) : null
      })()}

      {/* Navigation Buttons */}
      <View className="flex-row gap-3 px-4 py-6 border-t border-gray-200">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="flex-1 py-3 px-4 rounded-lg border-2 border-gray-300 items-center justify-center"
        >
          <Text className="text-gray-700 font-bold">Orqaga</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('D2_DeviceSelection')}
          disabled={electricalDevices.filter(d => d.room_id === activeRoom?.id).length === 0}
          className={`flex-1 py-3 px-4 rounded-lg items-center justify-center ${
            electricalDevices.filter(d => d.room_id === activeRoom?.id).length === 0
              ? 'bg-gray-300'
              : 'bg-blue-600'
          }`}
        >
          <Text className={`font-bold ${electricalDevices.filter(d => d.room_id === activeRoom?.id).length === 0 ? 'text-gray-500' : 'text-white'}`}>
            Keyingi {electricalDevices.filter(d => d.room_id === activeRoom?.id).length > 0 ? '→' : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}
