import React, { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native'
import { useAppStore } from '../store/appStore'
import apiClient from '../config/api'

export default function RoomDimensionsScreen({ navigation }: any) {
  const activeProject = useAppStore((state) => state.activeProject)
  const activeRoom = useAppStore((state) => state.activeRoom)
  const setMeasurementRoomId = useAppStore((state) => state.setMeasurementRoomId)
  const setMeasurementCeilingHeight = useAppStore((state) => state.setMeasurementCeilingHeight)
  const setMeasurementDoorCount = useAppStore((state) => state.setMeasurementDoorCount)
  const setMeasurementWindowCount = useAppStore((state) => state.setMeasurementWindowCount)

  const [ceilingHeight, setCeilingHeight] = useState('270')
  const [doorCount, setDoorCount] = useState('2')
  const [windowCount, setWindowCount] = useState('1')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    const height = parseFloat(ceilingHeight)
    if (!ceilingHeight || isNaN(height) || height <= 0) {
      newErrors.ceilingHeight = 'Balandlik noto\'g\'ri'
    }
    if (height < 200 || height > 400) {
      newErrors.ceilingHeight = 'Balandlik 200-400 sm oralig\'ida bo\'lishi kerak'
    }

    const doors = parseInt(doorCount, 10)
    if (!doorCount || isNaN(doors) || doors < 0) {
      newErrors.doorCount = 'Eshiklar soni noto\'g\'ri'
    }

    const windows = parseInt(windowCount, 10)
    if (!windowCount || isNaN(windows) || windows < 0) {
      newErrors.windowCount = 'Derazalar soni noto\'g\'ri'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleContinue = async () => {
    if (!validateForm() || !activeRoom || !activeProject) return

    try {
      setLoading(true)

      const heightInMeters = parseFloat(ceilingHeight) / 100
      const doorsInt = parseInt(doorCount, 10)
      const windowsInt = parseInt(windowCount, 10)

      await apiClient.post(`/projects/${activeProject.id}/rooms/${activeRoom.id}/dimensions`, {
        ceiling_height: heightInMeters,
        door_count: doorsInt,
        window_count: windowsInt,
      })

      setMeasurementRoomId(activeRoom.id)
      setMeasurementCeilingHeight(heightInMeters)
      setMeasurementDoorCount(doorsInt)
      setMeasurementWindowCount(windowsInt)

      navigation.navigate('WallMeasurement')
    } catch (error) {
      console.error('Error saving dimensions:', error)
      setErrors({ submit: 'Saqlashda xatolik. Qayta urinib ko\'ring.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="px-4 py-6">
        <Text className="text-2xl font-bold text-gray-900 mb-1">Xona o'lchamlari</Text>
        <Text className="text-gray-600 mb-6">Xonaning asosiy o'lchamlarini kiriting</Text>

        {errors.submit && (
          <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <Text className="text-red-800 text-sm">{errors.submit}</Text>
          </View>
        )}

        <View className="space-y-5">
          <View>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-gray-900 font-semibold">Shiftning balandligi</Text>
              <Text className="text-blue-600 font-semibold">{ceilingHeight} sm</Text>
            </View>
            <TextInput
              value={ceilingHeight}
              onChangeText={setCeilingHeight}
              placeholder="Masalan: 270"
              keyboardType="decimal-pad"
              className={`w-full border-2 rounded-lg px-4 py-3 text-base font-semibold ${
                errors.ceilingHeight ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-gray-50'
              }`}
              placeholderTextColor="#999"
            />
            {errors.ceilingHeight && (
              <Text className="text-red-600 text-xs mt-1">{errors.ceilingHeight}</Text>
            )}
            <Text className="text-gray-500 text-xs mt-2">
              Standart balandlik 250-300 sm oralig\'ida bo\'ladi
            </Text>
          </View>

          <View className="border-t border-gray-200 pt-5">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-gray-900 font-semibold">Eshiklar soni</Text>
              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  onPress={() => setDoorCount(Math.max(0, parseInt(doorCount, 10) - 1).toString())}
                  className="bg-blue-100 rounded-lg p-2"
                >
                  <Text className="text-blue-600 font-bold">−</Text>
                </TouchableOpacity>
                <Text className="text-2xl font-bold text-blue-600 w-8 text-center">
                  {doorCount}
                </Text>
                <TouchableOpacity
                  onPress={() => setDoorCount((parseInt(doorCount, 10) + 1).toString())}
                  className="bg-blue-100 rounded-lg p-2"
                >
                  <Text className="text-blue-600 font-bold">+</Text>
                </TouchableOpacity>
              </View>
            </View>
            {errors.doorCount && (
              <Text className="text-red-600 text-xs">{errors.doorCount}</Text>
            )}
          </View>

          <View className="border-t border-gray-200 pt-5">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-gray-900 font-semibold">Derazalar soni</Text>
              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  onPress={() => setWindowCount(Math.max(0, parseInt(windowCount, 10) - 1).toString())}
                  className="bg-blue-100 rounded-lg p-2"
                >
                  <Text className="text-blue-600 font-bold">−</Text>
                </TouchableOpacity>
                <Text className="text-2xl font-bold text-blue-600 w-8 text-center">
                  {windowCount}
                </Text>
                <TouchableOpacity
                  onPress={() => setWindowCount((parseInt(windowCount, 10) + 1).toString())}
                  className="bg-blue-100 rounded-lg p-2"
                >
                  <Text className="text-blue-600 font-bold">+</Text>
                </TouchableOpacity>
              </View>
            </View>
            {errors.windowCount && (
              <Text className="text-red-600 text-xs">{errors.windowCount}</Text>
            )}
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

        <View className="mt-6 bg-blue-50 rounded-lg p-4 border border-blue-200">
          <Text className="text-blue-900 text-sm font-semibold mb-2">💡 Maslahat</Text>
          <Text className="text-blue-800 text-xs">
            Xonaning haqiqiy o'lchamlarini aniq o'lchash uchun santimetrli ruletka ishlatish tavsiya etiladi.
          </Text>
        </View>
      </View>
    </ScrollView>
  )
}
