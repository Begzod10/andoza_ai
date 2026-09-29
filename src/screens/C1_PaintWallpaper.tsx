import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Dimensions,
} from 'react-native'
import { useDecorationStore } from '../store/decorationStore'
import { useAppStore } from '../store/appStore'
import apiClient from '../config/api'
import { Material } from '../types'

const { width } = Dimensions.get('window')
const SWATCH_SIZE = (width - 32) / 2 - 4

interface MaterialWithPrice extends Material {
  price?: number
}

export default function C1_PaintWallpaper({ navigation }: any) {
  const {
    availablePaints,
    availableWallpapers,
    setAvailablePaints,
    setAvailableWallpapers,
    selectedMaterial,
    setSelectedMaterial,
    setCurrentDecorStep,
  } = useDecorationStore()

  const activeRoom = useAppStore((state) => state.activeRoom)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [materialType, setMaterialType] = useState<'paint' | 'wallpaper'>('paint')

  useEffect(() => {
    loadMaterials()
  }, [])

  const loadMaterials = async () => {
    try {
      setLoading(true)
      setError(null)

      const [paintRes, wallpaperRes] = await Promise.all([
        apiClient.get('/materials?type=paint'),
        apiClient.get('/materials?type=wallpaper'),
      ])

      setAvailablePaints(paintRes.data.data || [])
      setAvailableWallpapers(wallpaperRes.data.data || [])
    } catch (err) {
      setError('Materiallarni yuklashda xato')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const currentMaterials = materialType === 'paint' ? availablePaints : availableWallpapers

  const handleSelectMaterial = (material: MaterialWithPrice) => {
    setSelectedMaterial(material)
  }

  const handleProceed = () => {
    if (!selectedMaterial) {
      setError('Iltimos, material tanlang')
      return
    }
    setCurrentDecorStep(2)
    navigation.navigate('C2_DragAnimation')
  }

  const renderMaterialSwatch = ({ item }: { item: MaterialWithPrice }) => {
    const isSelected = selectedMaterial?.id === item.id

    return (
      <TouchableOpacity
        onPress={() => handleSelectMaterial(item)}
        className={`${isSelected ? 'border-4 border-blue-600' : 'border-2 border-gray-200'} rounded-lg overflow-hidden`}
        style={{ width: SWATCH_SIZE, height: SWATCH_SIZE }}
      >
        {/* Color/Pattern Preview */}
        <View
          className="flex-1 justify-end p-3"
          style={{
            backgroundColor: item.color || '#E5E7EB',
          }}
        >
          {/* Pattern indicator for wallpapers */}
          {item.pattern && (
            <View className="absolute top-2 right-2 bg-blue-100 px-2 py-1 rounded">
              <Text className="text-xs text-blue-700 font-semibold">👁️ Naqsh</Text>
            </View>
          )}

          {/* Material info */}
          <View className="bg-white rounded p-2">
            <Text className="text-xs font-semibold text-gray-800 mb-1">{item.name}</Text>
            {item.price !== undefined && (
              <Text className="text-xs text-blue-600 font-bold">{item.price.toLocaleString()} so'm</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-4 text-gray-600">Materiallar yuklanyapti...</Text>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="bg-gradient-to-r from-blue-600 to-blue-400 px-4 py-6">
        <Text className="text-2xl font-bold text-white mb-1">Bo'yoq va Oboi</Text>
        <Text className="text-blue-100 text-sm">1-bosqich: Material tanlash</Text>
      </View>

      {/* Type Tabs */}
      <View className="flex-row px-4 py-4 gap-3 border-b border-gray-200">
        <TouchableOpacity
          onPress={() => setMaterialType('paint')}
          className={`flex-1 py-3 px-4 rounded-lg ${
            materialType === 'paint'
              ? 'bg-blue-600 border-2 border-blue-700'
              : 'bg-gray-100 border-2 border-gray-300'
          }`}
        >
          <Text
            className={`text-center font-semibold ${
              materialType === 'paint' ? 'text-white' : 'text-gray-700'
            }`}
          >
            🎨 Bo'yoq
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMaterialType('wallpaper')}
          className={`flex-1 py-3 px-4 rounded-lg ${
            materialType === 'wallpaper'
              ? 'bg-blue-600 border-2 border-blue-700'
              : 'bg-gray-100 border-2 border-gray-300'
          }`}
        >
          <Text
            className={`text-center font-semibold ${
              materialType === 'wallpaper' ? 'text-white' : 'text-gray-700'
            }`}
          >
            🌸 Oboi
          </Text>
        </TouchableOpacity>
      </View>

      {/* Error Message */}
      {error && (
        <View className="mx-4 mt-4 p-3 bg-red-100 rounded-lg border border-red-300">
          <Text className="text-red-700 font-semibold">{error}</Text>
        </View>
      )}

      {/* Materials Grid */}
      <FlatList
        data={currentMaterials}
        renderItem={renderMaterialSwatch}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 8, justifyContent: 'space-between' }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListEmptyComponent={
          <View className="py-12 items-center">
            <Text className="text-gray-500 text-lg">Materiallar topilmadi</Text>
          </View>
        }
      />

      {/* Selection Info */}
      {selectedMaterial && (
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t-2 border-blue-300 p-4">
          <View className="flex-row items-center gap-3 mb-3">
            <View
              className="w-12 h-12 rounded-lg"
              style={{ backgroundColor: selectedMaterial.color || '#E5E7EB' }}
            />
            <View className="flex-1">
              <Text className="font-semibold text-gray-800">{selectedMaterial.name}</Text>
              {(selectedMaterial as MaterialWithPrice).price && (
                <Text className="text-blue-600 font-bold">
                  {(selectedMaterial as MaterialWithPrice).price?.toLocaleString()} so'm
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            onPress={handleProceed}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 py-3 rounded-lg"
          >
            <Text className="text-center text-white font-bold text-lg">
              Davom etish → Drag & Drop
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}
