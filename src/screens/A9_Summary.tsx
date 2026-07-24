import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useAppStore } from '../store/appStore'
import apiClient from '../config/api'

const WALL_LABELS = [
  { key: 0, label: 'Devor A', emoji: '📐', color: 'bg-blue-100' },
  { key: 1, label: 'Devor B', emoji: '📐', color: 'bg-green-100' },
  { key: 2, label: 'Devor C', emoji: '📐', color: 'bg-purple-100' },
  { key: 3, label: 'Devor D', emoji: '📐', color: 'bg-orange-100' },
]

const OPENING_EMOJI = {
  eshik: '🚪',
  deraza: '🪟',
  balkon_eshigi: '🚪',
}

const OPENING_LABEL = {
  eshik: 'Eshik',
  deraza: 'Deraza',
  balkon_eshigi: 'Balkon eshigi',
}

export default function SummaryScreen({ navigation }: any) {
  const activeProject = useAppStore((state) => state.activeProject)
  const measurement = useAppStore((state) => state.measurement)
  const [loading, setLoading] = useState(false)

  const calculateFloorArea = (): number => {
    if (measurement.walls.length < 4) return 0
    const perimeter = measurement.walls.reduce((sum, wall) => sum + wall.length, 0)
    const length = measurement.walls[0].length
    const width = measurement.walls[1].length
    return length * width
  }

  const calculateWallArea = (): number => {
    const perimeter = measurement.walls.reduce((sum, wall) => sum + wall.length, 0)
    const openingArea = measurement.walls.reduce((sum, wall) => {
      return (
        sum +
        wall.openings.reduce((wallSum, opening) => {
          return wallSum + opening.width * opening.height
        }, 0)
      )
    }, 0)
    const grossArea = perimeter * measurement.ceilingHeight
    return grossArea - openingArea
  }

  const getPerimeter = (): number => {
    return measurement.walls.reduce((sum, wall) => sum + wall.length, 0)
  }

  const getTotalOpenings = (): number => {
    return measurement.walls.reduce((sum, wall) => sum + wall.openings.length, 0)
  }

  const getOpeningsByType = (type: string): number => {
    return measurement.walls.reduce((sum, wall) => {
      return sum + wall.openings.filter((o) => o.type === type).length
    }, 0)
  }

  const handleConfirm = async () => {
    if (!activeProject || !measurement.roomId) return

    try {
      setLoading(true)

      await apiClient.post(
        `/projects/${activeProject.id}/rooms/${measurement.roomId}/measurement/confirm`,
        {
          floor_area: calculateFloorArea(),
          wall_area_netto: calculateWallArea(),
          perimeter: getPerimeter(),
        }
      )

      Alert.alert('Muvaffaqiyat', "O'lchamlar saqlandi!", [
        {
          text: 'OK',
          onPress: () => {
            navigation.navigate('RoomState')
          },
        },
      ])
    } catch (error) {
      console.error('Error confirming measurement:', error)
      Alert.alert('Xatolik', 'Saqlashda xatolik yuz berdi. Qayta urinib ko\'ring.')
    } finally {
      setLoading(false)
    }
  }

  const floorArea = calculateFloorArea()
  const wallArea = calculateWallArea()
  const perimeter = getPerimeter()

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="px-4 py-6">
        <Text className="text-2xl font-bold text-gray-900 mb-1">O'lchamlar xulosa</Text>
        <Text className="text-gray-600 mb-6">Barcha ma'lumotlarni tekshiring</Text>

        <View className="space-y-5">
          <View className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg p-4 border-2 border-blue-300">
            <Text className="text-blue-900 font-bold mb-3">📊 Asosiy o'lchamlar</Text>
            <View className="space-y-2">
              <View className="flex-row justify-between">
                <Text className="text-gray-700">Pol maydoni:</Text>
                <Text className="font-bold text-blue-600">{floorArea.toFixed(2)} m²</Text>
              </View>
              <View className="h-px bg-blue-200" />
              <View className="flex-row justify-between">
                <Text className="text-gray-700">Devor maydoni (oynasiz):</Text>
                <Text className="font-bold text-blue-600">{wallArea.toFixed(2)} m²</Text>
              </View>
              <View className="h-px bg-blue-200" />
              <View className="flex-row justify-between">
                <Text className="text-gray-700">Perimetr:</Text>
                <Text className="font-bold text-blue-600">{perimeter.toFixed(2)} m</Text>
              </View>
              <View className="h-px bg-blue-200" />
              <View className="flex-row justify-between">
                <Text className="text-gray-700">Balandlik:</Text>
                <Text className="font-bold text-blue-600">
                  {(measurement.ceilingHeight * 100).toFixed(0)} sm
                </Text>
              </View>
            </View>
          </View>

          <View className="border-t border-gray-200 pt-5">
            <Text className="text-gray-900 font-bold mb-3">🚪 Oynalar va eshiklar</Text>
            <View className="bg-gray-50 rounded-lg p-3 mb-3">
              <Text className="text-gray-700 font-semibold">
                Jami: {getTotalOpenings()} ta
              </Text>
              {getOpeningsByType('eshik') > 0 && (
                <Text className="text-gray-600 text-sm mt-1">
                  🚪 Eshiklar: {getOpeningsByType('eshik')} ta
                </Text>
              )}
              {getOpeningsByType('deraza') > 0 && (
                <Text className="text-gray-600 text-sm">
                  🪟 Derazalar: {getOpeningsByType('deraza')} ta
                </Text>
              )}
              {getOpeningsByType('balkon_eshigi') > 0 && (
                <Text className="text-gray-600 text-sm">
                  🚪 Balkon eshiklari: {getOpeningsByType('balkon_eshigi')} ta
                </Text>
              )}
            </View>

            <View className="space-y-2">
              {measurement.walls.map((wall, index) => {
                const labelConfig = WALL_LABELS[index]
                if (wall.openings.length === 0) return null

                return (
                  <View key={index} className={`${labelConfig.color} rounded-lg p-3`}>
                    <Text className="font-bold text-gray-900 mb-2">
                      {labelConfig.emoji} {labelConfig.label}
                    </Text>
                    <View className="space-y-1">
                      {wall.openings.map((opening) => (
                        <Text
                          key={opening.id}
                          className="text-gray-700 text-sm"
                        >
                          • {OPENING_EMOJI[opening.type]} {OPENING_LABEL[opening.type]}: {opening.width.toFixed(2)}×{opening.height.toFixed(2)} m
                        </Text>
                      ))}
                    </View>
                  </View>
                )
              })}
            </View>
          </View>

          <View className="border-t border-gray-200 pt-5">
            <Text className="text-gray-900 font-bold mb-3">📐 Devor o'lchamlari</Text>
            <View className="space-y-2">
              {measurement.walls.map((wall, index) => {
                const labelConfig = WALL_LABELS[index]
                const wallArea = wall.length * measurement.ceilingHeight

                return (
                  <View key={index} className={`${labelConfig.color} rounded-lg p-3`}>
                    <View className="flex-row justify-between items-center">
                      <Text className="font-bold text-gray-900">
                        {labelConfig.emoji} {labelConfig.label}
                      </Text>
                      <Text className="text-gray-700 text-sm">
                        {wall.length.toFixed(2)} m × {(measurement.ceilingHeight * 100).toFixed(0)} sm
                      </Text>
                    </View>
                    <Text className="text-gray-600 text-xs mt-1">
                      Maydoni: {wallArea.toFixed(2)} m²
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>

          <View className="bg-green-50 rounded-lg p-4 border border-green-200 mt-6">
            <Text className="text-green-900 text-sm font-semibold">
              ✓ Barcha ma'lumotlar to'liq kiritildi
            </Text>
          </View>
        </View>

        <View className="mt-8 space-y-3">
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={loading}
            className={`w-full py-4 rounded-lg items-center justify-center ${
              loading ? 'bg-green-300' : 'bg-green-600'
            }`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-base">✓ Tasdiqlash</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="w-full py-3 rounded-lg items-center justify-center border border-gray-300"
          >
            <Text className="text-gray-700 font-semibold">Orqaga</Text>
          </TouchableOpacity>
        </View>

        <View className="mt-6 mb-8 bg-blue-50 rounded-lg p-4 border border-blue-200">
          <Text className="text-blue-900 text-sm font-semibold mb-2">
            💡 Keyingi qadamlar
          </Text>
          <Text className="text-blue-800 text-xs leading-5">
            Tasdiqdan so'ng, xonaning holatini belgilashingiz va remontni rejalashtira boshla olasiz.
          </Text>
        </View>
      </View>
    </ScrollView>
  )
}
