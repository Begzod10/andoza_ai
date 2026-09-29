import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useDecorationStore } from '../store/decorationStore'
import { useAppStore } from '../store/appStore'
import apiClient from '../config/api'

interface SummaryItem {
  wall: string
  material: string
  color: string
  price: number
  type: string
}

export default function C5_Summary({ navigation }: any) {
  const {
    appliedWallMaterials,
    appliedFloorMaterial,
    totalCost,
    calculateTotalCost,
    reset,
    setCurrentDecorStep,
  } = useDecorationStore()

  const { activeRoom, setCurrentStage } = useAppStore()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summaryItems, setSummaryItems] = useState<SummaryItem[]>([])

  useEffect(() => {
    calculateTotalCost()
    buildSummary()
  }, [])

  const buildSummary = () => {
    const items: SummaryItem[] = []

    // Wall materials
    appliedWallMaterials.forEach((applied) => {
      items.push({
        wall: applied.wallId,
        material: applied.material.name,
        color: applied.material.color || '#E5E7EB',
        price: (applied.material as any).price || 0,
        type: 'Devar',
      })
    })

    // Floor material
    if (appliedFloorMaterial) {
      items.push({
        wall: 'Pol',
        material: appliedFloorMaterial.material.name,
        color: appliedFloorMaterial.material.color || '#E5E7EB',
        price: (appliedFloorMaterial.material as any).price || 0,
        type: 'Pol',
      })
    }

    setSummaryItems(items)
  }

  const handleCompleteDecoration = async () => {
    if (!activeRoom) {
      Alert.alert('❌ Xato', 'Xona tanlanmagan')
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Save decoration stage completion
      await apiClient.post(`/rooms/${activeRoom.id}/stage-complete`, {
        stage: 2, // Decoration stage
        total_cost: totalCost,
        materials_count: summaryItems.length,
      })

      // Move to next stage (floor/furniture)
      setCurrentStage(3)
      setCurrentDecorStep(1)
      reset()

      Alert.alert('✓ Muvaffaqiyat', 'Dekorasyon bosqichi yakunlandi!', [
        {
          text: 'OK',
          onPress: () => {
            navigation.navigate('B3_Furniture') // or next stage
          },
        },
      ])
    } catch (err) {
      setError('Bosqichni yakunlashda xato')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSkipDecoration = () => {
    Alert.alert(
      '⚠️ Tasdiqlash',
      'Dekorasyon bosqichini o\'tkazib yubormoqchisiz?',
      [
        {
          text: 'Bekor qilish',
          onPress: () => {},
        },
        {
          text: 'Ha, o\'tkazish',
          onPress: () => {
            setCurrentStage(3)
            setCurrentDecorStep(1)
            reset()
            navigation.navigate('B3_Furniture')
          },
        },
      ]
    )
  }

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="bg-gradient-to-r from-blue-600 to-blue-400 px-4 py-6">
        <Text className="text-2xl font-bold text-white mb-1">Xulosa va Tasdiqlash</Text>
        <Text className="text-blue-100 text-sm">5-bosqich: Yakuniy ko'rib chiqish</Text>
      </View>

      {/* Error Message */}
      {error && (
        <View className="mx-4 mt-4 p-3 bg-red-100 rounded-lg border border-red-300">
          <Text className="text-red-700 font-semibold">{error}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Room Info */}
        {activeRoom && (
          <View className="mx-4 mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <Text className="font-bold text-blue-900 mb-1">🏠 Xona</Text>
            <Text className="text-blue-800 font-semibold">{activeRoom.name}</Text>
            <View className="flex-row gap-4 mt-3">
              <View>
                <Text className="text-xs text-blue-700">Balandlik</Text>
                <Text className="text-sm font-bold text-blue-900">{activeRoom.ceiling_h} mm</Text>
              </View>
              {activeRoom.floor_area && (
                <View>
                  <Text className="text-xs text-blue-700">Maydoni</Text>
                  <Text className="text-sm font-bold text-blue-900">{activeRoom.floor_area} m²</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Applied Materials Summary */}
        <View className="mx-4 mt-6">
          <Text className="font-bold text-lg text-gray-900 mb-4">Qo'llangan Materiallar</Text>

          {summaryItems.length === 0 ? (
            <View className="p-4 bg-gray-50 rounded-lg items-center">
              <Text className="text-gray-600">Materiallar tanlanmagan</Text>
            </View>
          ) : (
            <View className="space-y-2">
              {summaryItems.map((item, idx) => (
                <View
                  key={`${item.wall}-${idx}`}
                  className="bg-white rounded-lg border border-gray-200 p-3 flex-row items-center gap-3"
                >
                  {/* Color Preview */}
                  <View
                    className="w-10 h-10 rounded"
                    style={{ backgroundColor: item.color }}
                  />

                  {/* Material Info */}
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-1">
                      <View className="bg-blue-100 px-2 py-0.5 rounded">
                        <Text className="text-xs font-bold text-blue-700">
                          {item.type === 'Pol' ? '🪵' : item.type === 'Devar' ? `${item.wall}` : ''}
                        </Text>
                      </View>
                      <Text className="font-semibold text-gray-900 text-sm">{item.material}</Text>
                    </View>
                    <Text className="text-xs text-gray-600">
                      {item.type === 'Devar' ? `Devar: ${item.wall}` : 'Pol materialni'}
                    </Text>
                  </View>

                  {/* Price */}
                  <Text className="font-bold text-blue-600 text-sm">
                    {item.price.toLocaleString()} so'm
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Cost Breakdown */}
        <View className="mx-4 mt-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-300">
          <View className="mb-3 pb-3 border-b border-green-300">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-gray-700">Materiallar:</Text>
              <Text className="font-bold text-gray-900">
                {summaryItems.length} dona
              </Text>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-gray-700">Devarlar:</Text>
              <Text className="font-bold text-gray-900">
                {appliedWallMaterials.size} dona
              </Text>
            </View>
          </View>

          <View className="flex-row justify-between items-center">
            <Text className="font-bold text-lg text-gray-900">Jami:</Text>
            <Text className="font-bold text-2xl text-green-600">
              {totalCost.toLocaleString()} so'm
            </Text>
          </View>
        </View>

        {/* Warnings/Info */}
        <View className="mx-4 mt-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
          <Text className="font-bold text-orange-900 mb-2">ℹ️ Eslatma</Text>
          <Text className="text-sm text-orange-800 mb-2">
            • Bu narx materiallarning sotib olinish narxidir
          </Text>
          <Text className="text-sm text-orange-800 mb-2">
            • Ish haqi alohida hisoblanadi
          </Text>
          <Text className="text-sm text-orange-800">
            • Keyingi bosqichda furnitura tanlay olasiz
          </Text>
        </View>

        {/* Stage Progress */}
        <View className="mx-4 mt-6">
          <Text className="font-semibold text-gray-900 mb-3">Bosqichlar:</Text>
          <View className="space-y-2">
            {[
              { name: 'Material Tanlash', done: true },
              { name: 'Drag & Drop', done: true },
              { name: 'Tasdiqlash', done: true },
              { name: 'Pol Material', done: true },
              { name: 'Xulosa', done: true },
            ].map((stage, idx) => (
              <View key={idx} className="flex-row items-center gap-2">
                <View
                  className={`w-6 h-6 rounded-full items-center justify-center ${
                    stage.done ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <Text className="text-white font-bold text-xs">
                    {stage.done ? '✓' : idx + 1}
                  </Text>
                </View>
                <Text className={stage.done ? 'text-green-700 font-semibold' : 'text-gray-600'}>
                  {stage.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t-2 border-blue-300 p-4 gap-3">
        <TouchableOpacity
          onPress={handleCompleteDecoration}
          disabled={loading}
          className={`w-full py-3 rounded-lg ${
            loading ? 'bg-gray-400' : 'bg-gradient-to-r from-green-600 to-green-500'
          }`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-center text-white font-bold text-lg">
              ✓ Bosqichni Yakunlash
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSkipDecoration}
          className="w-full border-2 border-orange-300 py-3 rounded-lg"
        >
          <Text className="text-center text-orange-700 font-semibold">
            ⏭️ Dekorasyonni O'tkazish
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setCurrentDecorStep(4)
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
