import React, { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native'
import { useAppStore } from '../store/appStore'
import apiClient from '../config/api'

const WALL_LABELS = [
  { key: 0, label: 'Devor A', color: 'bg-blue-100', textColor: 'text-blue-600' },
  { key: 1, label: 'Devor B', color: 'bg-green-100', textColor: 'text-green-600' },
  { key: 2, label: 'Devor C', color: 'bg-purple-100', textColor: 'text-purple-600' },
  { key: 3, label: 'Devor D', color: 'bg-orange-100', textColor: 'text-orange-600' },
]

export default function WallMeasurementScreen({ navigation }: any) {
  const activeProject = useAppStore((state) => state.activeProject)
  const measurement = useAppStore((state) => state.measurement)
  const updateWall = useAppStore((state) => state.updateWall)
  const [wallLengths, setWallLengths] = useState<Record<number, string>>({
    0: '3.5',
    1: '4.0',
    2: '3.5',
    3: '4.0',
  })
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)

  const calculateArea = (length: number): number => {
    if (!measurement.ceilingHeight) return 0
    return length * measurement.ceilingHeight
  }

  const calculatePerimeter = (): number => {
    return measurement.walls.reduce((sum, wall) => sum + wall.length, 0)
  }

  const validateForm = (): boolean => {
    const newErrors: Record<number, string> = {}

    measurement.walls.forEach((wall, index) => {
      const length = parseFloat(wallLengths[index] || '0')
      if (!wallLengths[index] || isNaN(length) || length <= 0) {
        newErrors[index] = 'Uzunlik noto\'g\'ri'
      }
      if (length > 20) {
        newErrors[index] = 'Uzunlik 20 m dan oshmasligi kerak'
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleContinue = async () => {
    if (!validateForm() || !activeProject || !measurement.roomId) return

    try {
      setLoading(true)

      const updatedWalls = measurement.walls.map((wall, index) => ({
        ...wall,
        length: parseFloat(wallLengths[index] || '0'),
      }))

      await apiClient.post(
        `/projects/${activeProject.id}/rooms/${measurement.roomId}/walls`,
        {
          walls: updatedWalls.map((wall) => ({
            direction: wall.direction,
            length: wall.length,
          })),
        }
      )

      updatedWalls.forEach((wall, index) => {
        updateWall(index, wall)
      })

      navigation.navigate('OpeningSheet')
    } catch (error) {
      console.error('Error saving walls:', error)
      setErrors({ 0: 'Saqlashda xatolik. Qayta urinib ko\'ring.' })
    } finally {
      setLoading(false)
    }
  }

  const handleWallLengthChange = (index: number, value: string) => {
    setWallLengths({ ...wallLengths, [index]: value })
    if (errors[index]) {
      const newErrors = { ...errors }
      delete newErrors[index]
      setErrors(newErrors)
    }
  }

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="px-4 py-6">
        <Text className="text-2xl font-bold text-gray-900 mb-1">Devor o'lchamlari</Text>
        <Text className="text-gray-600 mb-6">Har bir devorning uzunligini kiriting</Text>

        {errors[0] && !wallLengths[0] && (
          <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <Text className="text-red-800 text-sm">{errors[0]}</Text>
          </View>
        )}

        <View className="space-y-4">
          {measurement.walls.map((wall, index) => {
            const labelConfig = WALL_LABELS[index]
            const length = parseFloat(wallLengths[index] || '0')
            const area = calculateArea(length)

            return (
              <View key={index} className={`${labelConfig.color} rounded-lg p-4`}>
                <View className="flex-row items-center justify-between mb-3">
                  <Text className={`text-lg font-bold ${labelConfig.textColor}`}>
                    {labelConfig.label}
                  </Text>
                  {length > 0 && (
                    <Text className="text-sm font-semibold text-gray-700">
                      Maydoni: {area.toFixed(2)} m²
                    </Text>
                  )}
                </View>

                <TextInput
                  value={wallLengths[index]}
                  onChangeText={(value) => handleWallLengthChange(index, value)}
                  placeholder="Masalan: 3.5"
                  keyboardType="decimal-pad"
                  className={`w-full border-2 rounded-lg px-3 py-2 text-base font-semibold ${
                    errors[index] ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                  }`}
                  placeholderTextColor="#999"
                />

                {errors[index] && (
                  <Text className="text-red-600 text-xs mt-1">{errors[index]}</Text>
                )}
              </View>
            )
          })}
        </View>

        <View className="mt-6 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg p-4 border border-blue-200">
          <Text className="text-gray-900 font-bold mb-3">📊 Xulosa:</Text>
          <View className="space-y-2">
            <View className="flex-row justify-between">
              <Text className="text-gray-700">Perimetr:</Text>
              <Text className="font-bold text-blue-600">{calculatePerimeter().toFixed(2)} m</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-700">Umumiy devor maydoni:</Text>
              <Text className="font-bold text-blue-600">
                {(calculatePerimeter() * measurement.ceilingHeight).toFixed(2)} m²
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-700">Shiftning balandligi:</Text>
              <Text className="font-bold text-gray-900">{(measurement.ceilingHeight * 100).toFixed(0)} sm</Text>
            </View>
          </View>
        </View>

        <View className="mt-8 space-y-3">
          <TouchableOpacity
            onPress={handleContinue}
            disabled={loading}
            className={`w-full py-4 rounded-lg items-center justify-center ${
              loading ? 'bg-blue-300' : 'bg-blue-600'
            }`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-base">Davom etish</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="w-full py-3 rounded-lg items-center justify-center border border-gray-300"
          >
            <Text className="text-gray-700 font-semibold">Orqaga</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}
