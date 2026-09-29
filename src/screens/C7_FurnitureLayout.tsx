import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  GestureResponderEvent,
  Dimensions,
  Alert,
  Modal,
} from 'react-native'
import { useAppStore } from '../store/appStore'
import apiClient from '../config/api'
import { PlacedFurniture, Furniture } from '../types'

interface FurnitureWithDetails extends PlacedFurniture {
  details?: Furniture
}

const GRID_SIZE = 20 // cm per grid cell

export default function FurnitureLayoutScreen({ navigation }: any) {
  const activeRoom = useAppStore((state) => state.activeRoom)
  const placedFurniture = useAppStore((state) => state.placedFurniture)
  const removeFurniture = useAppStore((state) => state.removeFurniture)

  const [furnitureWithDetails, setFurnitureWithDetails] = useState<FurnitureWithDetails[]>([])
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRotationModal, setShowRotationModal] = useState(false)
  const [selectedRotation, setSelectedRotation] = useState(0)
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')

  const screenWidth = Dimensions.get('window').width - 32
  const screenHeight = 400

  useEffect(() => {
    loadFurnitureDetails()
  }, [placedFurniture])

  const loadFurnitureDetails = async () => {
    try {
      setLoading(true)
      const roomFurniture = placedFurniture.filter(
        (f) => f.room_id === activeRoom?.id
      )

      const withDetails = await Promise.all(
        roomFurniture.map(async (furniture) => {
          try {
            const response = await apiClient.get(
              `/furniture/${furniture.furniture_id}`
            )
            return {
              ...furniture,
              details: response.data.data,
            }
          } catch {
            return furniture
          }
        })
      )

      setFurnitureWithDetails(withDetails)
    } finally {
      setLoading(false)
    }
  }

  const handleMoveFurniture = (id: string, x: number, y: number) => {
    setFurnitureWithDetails((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, position: { x, y } } : f
      )
    )
  }

  const handleRotateFurniture = (id: string, rotation: number) => {
    setFurnitureWithDetails((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, rotation: (rotation + 360) % 360 } : f
      )
    )
  }

  const handleSaveLayout = async () => {
    try {
      setLoading(true)
      await apiClient.post(`/rooms/${activeRoom?.id}/furniture/layout`, {
        furniture: furnitureWithDetails.map((f) => ({
          id: f.id,
          position: f.position,
          rotation: f.rotation,
        })),
      })
      Alert.alert('Сўрови', 'Мебелнинг жойлашуви сақланди')
      navigation.goBack()
    } catch (error: any) {
      Alert.alert('Хатолик', error.response?.data?.error || 'Сақлашда хатолик')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteFurniture = (id: string) => {
    Alert.alert('Сўрови', 'Мебелни ўчиб тасити?', [
      { text: 'Бекор қил', style: 'cancel' },
      {
        text: 'Ўчир',
        style: 'destructive',
        onPress: () => {
          removeFurniture(id)
          setSelectedFurnitureId(null)
        },
      },
    ])
  }

  if (loading && furnitureWithDetails.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="text-gray-600 mt-3">Юклинмоқда...</Text>
      </View>
    )
  }

  const roomWidth = activeRoom?.floor_area ? Math.sqrt(activeRoom.floor_area) : 5
  const scaleX = screenWidth / (roomWidth * 100)
  const scaleY = screenHeight / (roomWidth * 100)

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-200 px-4 py-4">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mb-3">
          <Text className="text-blue-600 font-semibold">← Орқага</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-gray-900">Мебелни жойлаш</Text>
        <Text className="text-sm text-gray-600 mt-1">
          Мебелни суратда сўйт қилиб жойлаштир
        </Text>
      </View>

      {/* View Mode Toggle */}
      <View className="flex-row gap-2 px-4 py-3 bg-white border-b border-gray-200">
        <TouchableOpacity
          onPress={() => setViewMode('2d')}
          className={`flex-1 py-2 rounded-lg border-2 items-center ${
            viewMode === '2d'
              ? 'border-blue-600 bg-blue-50'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <Text
            className={`font-semibold ${
              viewMode === '2d' ? 'text-blue-600' : 'text-gray-600'
            }`}
          >
            📐 2D Кўриниш
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setViewMode('3d')}
          className={`flex-1 py-2 rounded-lg border-2 items-center ${
            viewMode === '3d'
              ? 'border-blue-600 bg-blue-50'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <Text
            className={`font-semibold ${
              viewMode === '3d' ? 'text-blue-600' : 'text-gray-600'
            }`}
          >
            🎯 3D Кўриниш
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4 py-4">
        {/* Room Canvas */}
        <View className="bg-white rounded-lg border-2 border-gray-300 mb-4 overflow-hidden">
          <View
            style={{
              width: screenWidth,
              height: screenHeight,
              backgroundColor: '#f5f5f5',
              position: 'relative',
            }}
          >
            {/* Grid Background */}
            <View
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                backgroundColor: 'transparent',
              }}
            >
              {Array.from({ length: Math.ceil(screenWidth / GRID_SIZE) }).map(
                (_, i) => (
                  <View
                    key={`v-${i}`}
                    style={{
                      position: 'absolute',
                      left: i * GRID_SIZE,
                      top: 0,
                      width: 1,
                      height: '100%',
                      backgroundColor: '#e5e7eb',
                    }}
                  />
                )
              )}
              {Array.from({ length: Math.ceil(screenHeight / GRID_SIZE) }).map(
                (_, i) => (
                  <View
                    key={`h-${i}`}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: i * GRID_SIZE,
                      width: '100%',
                      height: 1,
                      backgroundColor: '#e5e7eb',
                    }}
                  />
                )
              )}
            </View>

            {/* Furniture Items */}
            {furnitureWithDetails.map((furniture) => {
              const posX = furniture.position.x * scaleX
              const posY = furniture.position.y * scaleY
              const width = (furniture.details?.width || 80) * scaleX
              const height = (furniture.details?.depth || 80) * scaleY
              const isSelected = selectedFurnitureId === furniture.id

              return (
                <TouchableOpacity
                  key={furniture.id}
                  onPress={() => setSelectedFurnitureId(furniture.id)}
                  style={{
                    position: 'absolute',
                    left: posX,
                    top: posY,
                    width: width,
                    height: height,
                    transform: [{ rotate: `${furniture.rotation}deg` }],
                  }}
                  className={`items-center justify-center rounded border-2 ${
                    isSelected
                      ? 'bg-blue-200 border-blue-600'
                      : 'bg-amber-100 border-amber-500'
                  }`}
                >
                  <Text className="text-lg">🛋️</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Selected Furniture Controls */}
        {selectedFurnitureId && (
          <View className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="font-bold text-gray-900">Танланган мебел</Text>
              <TouchableOpacity
                onPress={() => setSelectedFurnitureId(null)}
                className="bg-white rounded-full w-8 h-8 items-center justify-center"
              >
                <Text className="text-gray-600">✕</Text>
              </TouchableOpacity>
            </View>

            <Text className="text-sm text-gray-600 mb-3">
              {
                furnitureWithDetails.find((f) => f.id === selectedFurnitureId)
                  ?.details?.name
              }
            </Text>

            {/* Rotation Controls */}
            <View className="mb-4">
              <Text className="text-xs font-semibold text-gray-700 mb-2">
                Айланиш: {selectedFurnitureId && Math.round(furnitureWithDetails.find((f) => f.id === selectedFurnitureId)?.rotation || 0)}°
              </Text>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => {
                    const furniture = furnitureWithDetails.find(
                      (f) => f.id === selectedFurnitureId
                    )
                    if (furniture) {
                      handleRotateFurniture(selectedFurnitureId, furniture.rotation - 45)
                    }
                  }}
                  className="flex-1 bg-white border border-gray-300 rounded-lg py-2 items-center"
                >
                  <Text className="font-semibold text-gray-700">↺ 45°</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const furniture = furnitureWithDetails.find(
                      (f) => f.id === selectedFurnitureId
                    )
                    if (furniture) {
                      handleRotateFurniture(selectedFurnitureId, furniture.rotation + 45)
                    }
                  }}
                  className="flex-1 bg-white border border-gray-300 rounded-lg py-2 items-center"
                >
                  <Text className="font-semibold text-gray-700">45° ↻</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleRotateFurniture(selectedFurnitureId, 0)}
                  className="flex-1 bg-white border border-gray-300 rounded-lg py-2 items-center"
                >
                  <Text className="font-semibold text-gray-700">0°</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Delete Button */}
            <TouchableOpacity
              onPress={() => handleDeleteFurniture(selectedFurnitureId)}
              className="bg-red-100 border border-red-300 rounded-lg py-3 items-center"
            >
              <Text className="font-semibold text-red-600">🗑️ Ўчир</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Info Box */}
        {furnitureWithDetails.length === 0 && (
          <View className="bg-blue-50 rounded-lg p-4 border border-blue-200 mb-4 items-center">
            <Text className="text-lg mb-2">📦</Text>
            <Text className="text-gray-700 text-center">
              Мебелни қўшиш учун "Мебелни танла" боғини кўринг
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action Buttons */}
      <View className="px-4 py-4 gap-3 bg-white border-t border-gray-200">
        <TouchableOpacity
          onPress={handleSaveLayout}
          className="bg-blue-600 rounded-lg py-4 items-center"
        >
          <Text className="font-bold text-white text-lg">💾 Сақла</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="border border-gray-300 rounded-lg py-4 items-center"
        >
          <Text className="font-semibold text-gray-900">Бекор қил</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
