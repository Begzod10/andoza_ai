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
import { useRoomStateStore } from '../store/roomStateStore'
import { updateRoomState } from '../api/roomStateApi'
import { UyTamirTheme } from '../theme/colors'
import { RoomStateType } from '../types'

interface RoomStateOption {
  value: RoomStateType
  label: string
  labelUz: string
  color: string
  description: string
  icon: string
}

const ROOM_STATES: RoomStateOption[] = [
  {
    value: 'korobka',
    label: 'Box Stage',
    labelUz: 'Korobka (Qurilish bosqichi)',
    color: UyTamirTheme.states.korobka.color,
    description: 'Devor va shiftni tuza va korobka holati. Faqat konstruktiv elementlar mavjud.',
    icon: '🏗️',
  },
  {
    value: 'suvoq',
    label: 'Drying',
    labelUz: 'Suvoq (Qurutirish)',
    color: UyTamirTheme.states.suvoq.color,
    description: 'Xona quritilgan, lekin tugatilmagan. Plasterdan tashqari hamma narsa',
    icon: '💨',
  },
  {
    value: 'shpaklovka',
    label: 'Finishing',
    labelUz: 'Shpaklovka (Tekislash)',
    color: UyTamirTheme.states.shpaklovka.color,
    description: 'Devarlar shpaklovka bilan tekislangan va bo\'yash uchun tayyor.',
    icon: '✨',
  },
]

interface B1RoomStateProps {
  navigation?: any
}

export default function B1RoomStateScreen({ navigation }: B1RoomStateProps) {
  const activeRoom = useAppStore((state) => state.activeRoom)
  const setRoomState = useAppStore((state) => state.setRoomState)

  const selectedState = useRoomStateStore((state) => state.selectedState)
  const setSelectedState = useRoomStateStore((state) => state.setSelectedState)
  const markStageComplete = useRoomStateStore((state) => state.markStageComplete)

  const [loading, setLoading] = useState(false)

  if (!activeRoom) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <Text className="text-lg text-gray-600">Xona tanlanmagan</Text>
      </View>
    )
  }

  const handleStateSelection = async (state: RoomStateType) => {
    setSelectedState(state)
  }

  const handleSaveState = async () => {
    if (!selectedState) {
      Alert.alert('Xato', 'Iltimos, xona holatini tanlang')
      return
    }

    setLoading(true)
    try {
      const updatedState = await updateRoomState(activeRoom.id, selectedState)
      setRoomState(updatedState)
      markStageComplete(0) // Mark stage 0 as complete

      Alert.alert('Muvaffaqiyat', 'Xona holati saqlandi', [
        {
          text: 'Keyingi',
          onPress: () => {
            navigation?.navigate('B2_3DEntry')
          },
        },
      ])
    } catch (error) {
      Alert.alert('Xato', 'Xona holatini saqlashda xato yuz berdi')
      console.error('Failed to save room state:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView className="flex-1 bg-white">
      {/* Header */}
      <View className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-6">
        <Text className="text-3xl font-bold text-white mb-2">Xona holati</Text>
        <Text className="text-blue-100">
          Xonangizning hozirgi tutatish bosqichini tanlang
        </Text>
      </View>

      {/* Progress bar */}
      <View className="px-4 py-4">
        <View className="flex-row items-center gap-2 mb-2">
          <View className="flex-1 h-1 bg-blue-600 rounded-full" />
          <View className="flex-1 h-1 bg-gray-300 rounded-full" />
          <View className="flex-1 h-1 bg-gray-300 rounded-full" />
        </View>
        <Text className="text-xs text-gray-500">Bosqich 1/3</Text>
      </View>

      {/* State selection options */}
      <View className="px-4 py-6 space-y-4">
        {ROOM_STATES.map((option) => (
          <TouchableOpacity
            key={option.value}
            onPress={() => handleStateSelection(option.value)}
            className={`rounded-xl overflow-hidden border-2 transition-all ${
              selectedState === option.value
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            {/* Color indicator */}
            <View
              className="h-1"
              style={{ backgroundColor: option.color }}
            />

            {/* Content */}
            <View className="p-4">
              {/* Header with icon and label */}
              <View className="flex-row items-center gap-3 mb-3">
                <Text className="text-3xl">{option.icon}</Text>
                <View className="flex-1">
                  <Text className="text-lg font-bold text-gray-900">
                    {option.labelUz}
                  </Text>
                </View>

                {/* Radio button */}
                <View
                  className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                    selectedState === option.value
                      ? 'border-blue-600 bg-blue-600'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {selectedState === option.value && (
                    <Text className="text-white text-xs font-bold">✓</Text>
                  )}
                </View>
              </View>

              {/* Description */}
              <Text className="text-gray-600 text-sm leading-5">
                {option.description}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Additional info */}
      <View className="px-4 py-4 bg-blue-50 mx-4 rounded-lg border border-blue-200 mb-6">
        <Text className="text-xs font-semibold text-blue-900 mb-2">
          💡 Maslahat
        </Text>
        <Text className="text-xs text-blue-800 leading-4">
          Xona holatini to'g'ri tanlash 3D vizualizatsiya va taxminning
          aniqligini yaxshilaydi.
        </Text>
      </View>

      {/* Action buttons */}
      <View className="px-4 py-6 gap-3">
        {/* Save button */}
        <TouchableOpacity
          onPress={handleSaveState}
          disabled={!selectedState || loading}
          className={`rounded-lg py-4 items-center justify-center ${
            selectedState && !loading
              ? 'bg-blue-600'
              : 'bg-gray-300'
          }`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-base">
              {selectedState ? 'Davom et' : 'Tanlang va davom et'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Cancel button */}
        <TouchableOpacity
          onPress={() => navigation?.goBack()}
          className="rounded-lg py-3 items-center justify-center border border-gray-300"
        >
          <Text className="text-gray-700 font-semibold">Orqaga</Text>
        </TouchableOpacity>
      </View>

      {/* Footer spacer */}
      <View className="h-4" />
    </ScrollView>
  )
}
