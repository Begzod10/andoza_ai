import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Alert,
} from 'react-native'
import { useDecorationStore } from '../store/decorationStore'
import { useAppStore } from '../store/appStore'
import apiClient from '../config/api'
import { Material } from '../types'

const { width } = Dimensions.get('window')
const CARD_WIDTH = width - 32

interface FloorMaterialWithSize extends Material {
  price?: number
  sizes?: string[] // e.g., ["30x30", "40x40", "50x50"]
}

const FLOOR_TYPES = [
  { id: 'tile', name: 'Plitkalar', emoji: '🟫' },
  { id: 'laminate', name: 'Laminat', emoji: '🟩' },
  { id: 'parquet', name: 'Parchis', emoji: '🟨' },
] as const

export default function C4_FloorSelection({ navigation }: any) {
  const { availableFloorMaterials, setAvailableFloorMaterials, setFloorMaterial, setCurrentDecorStep } =
    useDecorationStore()

  const { activeRoom } = useAppStore()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [floorType, setFloorType] = useState<'tile' | 'laminate' | 'parquet'>('tile')
  const [selectedMaterial, setSelectedMaterial] = useState<FloorMaterialWithSize | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)

  useEffect(() => {
    loadFloorMaterials()
  }, [])

  const loadFloorMaterials = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiClient.get('/materials?type=floor')
      setAvailableFloorMaterials(response.data.data || [])
    } catch (err) {
      setError('Pol materiallarini yuklashda xato')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const currentMaterials = availableFloorMaterials.filter(
    (m) => m.type === floorType
  ) as FloorMaterialWithSize[]

  const handleSelectMaterial = (material: FloorMaterialWithSize) => {
    setSelectedMaterial(material)
    setSelectedSize(material.sizes?.[0] || null)
  }

  const handleProceed = () => {
    if (!selectedMaterial) {
      Alert.alert('⚠️ Ogohlantirish', 'Iltimos, pol material tanlang')
      return
    }

    setFloorMaterial(selectedMaterial)
    Alert.alert('✓ Muvaffaqiyat', `${selectedMaterial.name} pol material tanlanildi`, [
      {
        text: 'Davom',
        onPress: () => {
          setCurrentDecorStep(5)
          navigation.navigate('C5_Summary')
        },
      },
    ])
  }

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-4 text-gray-600">Pol materiallar yuklanyapti...</Text>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="bg-gradient-to-r from-blue-600 to-blue-400 px-4 py-6">
        <Text className="text-2xl font-bold text-white mb-1">Pol Material</Text>
        <Text className="text-blue-100 text-sm">4-bosqich: Pol uchun material tanlash</Text>
      </View>

      {/* Error Message */}
      {error && (
        <View className="mx-4 mt-4 p-3 bg-red-100 rounded-lg border border-red-300">
          <Text className="text-red-700 font-semibold">{error}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Floor Type Selection */}
        <View className="px-4 py-4">
          <Text className="font-semibold text-gray-900 mb-3">Material turi:</Text>
          <View className="flex-row gap-2">
            {FLOOR_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                onPress={() => {
                  setFloorType(type.id)
                  setSelectedMaterial(null)
                  setSelectedSize(null)
                }}
                className={`flex-1 py-3 px-2 rounded-lg ${
                  floorType === type.id
                    ? 'bg-blue-600 border-2 border-blue-700'
                    : 'bg-gray-100 border-2 border-gray-300'
                }`}
              >
                <Text className="text-center text-xl mb-1">{type.emoji}</Text>
                <Text
                  className={`text-center font-semibold text-xs ${
                    floorType === type.id ? 'text-white' : 'text-gray-700'
                  }`}
                >
                  {type.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Materials Grid */}
        <View className="px-4">
          <Text className="font-semibold text-gray-900 mb-3">Variantlar:</Text>

          {currentMaterials.length === 0 ? (
            <View className="p-4 bg-gray-50 rounded-lg items-center">
              <Text className="text-gray-600">Bu turdagi materiallar topilmadi</Text>
            </View>
          ) : (
            <View className="gap-3">
              {currentMaterials.map((material) => {
                const isSelected = selectedMaterial?.id === material.id

                return (
                  <TouchableOpacity
                    key={material.id}
                    onPress={() => handleSelectMaterial(material)}
                    className={`bg-white rounded-lg border-2 p-4 ${
                      isSelected ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
                    }`}
                  >
                    {/* Material Header */}
                    <View className="flex-row items-center gap-3 mb-3">
                      <View
                        className="w-16 h-16 rounded-lg"
                        style={{ backgroundColor: material.color || '#E5E7EB' }}
                      />
                      <View className="flex-1">
                        <Text className="font-bold text-gray-900">{material.name}</Text>
                        <Text className="text-xs text-gray-600 mt-1">
                          Turi: {material.type === 'tile' ? 'Plitka' : material.type === 'laminate' ? 'Laminat' : 'Parchis'}
                        </Text>
                        {material.pattern && (
                          <Text className="text-xs text-blue-600 mt-1">
                            Naqsh: {material.pattern}
                          </Text>
                        )}
                      </View>
                      {(material as any).price && (
                        <Text className="font-bold text-blue-600">
                          {((material as any).price || 0).toLocaleString()} so'm
                        </Text>
                      )}
                    </View>

                    {/* Size Selector (for tiles) */}
                    {material.sizes && material.sizes.length > 0 && (
                      <View className="mt-3 pt-3 border-t border-gray-200">
                        <Text className="text-xs font-semibold text-gray-700 mb-2">
                          O'lchami tanlang:
                        </Text>
                        <View className="flex-row gap-2 flex-wrap">
                          {material.sizes.map((size) => (
                            <TouchableOpacity
                              key={size}
                              onPress={() => setSelectedSize(size)}
                              className={`px-3 py-2 rounded ${
                                selectedSize === size && isSelected
                                  ? 'bg-blue-600'
                                  : 'bg-gray-100 border border-gray-300'
                              }`}
                            >
                              <Text
                                className={`text-xs font-semibold ${
                                  selectedSize === size && isSelected
                                    ? 'text-white'
                                    : 'text-gray-700'
                                }`}
                              >
                                {size}cm
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Selection Indicator */}
                    {isSelected && (
                      <View className="mt-3 p-2 bg-green-100 rounded items-center">
                        <Text className="text-green-700 font-semibold text-sm">✓ Tanlanildi</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>

        {/* Info Box */}
        <View className="mx-4 mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <Text className="font-bold text-blue-900 mb-2">💡 Maslahat</Text>
          <Text className="text-sm text-blue-800">
            Pol material turi xonaning vazifasi va ishlatiladigan joyiga qarab tanlang. Vanna
            xonasi uchun plitkalar, yotoq xonasi uchun laminat yaxshi.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Action */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t-2 border-blue-300 p-4 gap-3">
        <TouchableOpacity
          onPress={handleProceed}
          disabled={!selectedMaterial}
          className={`w-full py-3 rounded-lg ${
            selectedMaterial ? 'bg-gradient-to-r from-blue-600 to-blue-500' : 'bg-gray-400'
          }`}
        >
          <Text className="text-center text-white font-bold text-lg">
            Davom etish → Xulosa
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setCurrentDecorStep(3)
            navigation.goBack()
          }}
          className="w-full border-2 border-gray-300 py-3 rounded-lg"
        >
          <Text className="text-center text-gray-700 font-semibold">← Orqaga</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
