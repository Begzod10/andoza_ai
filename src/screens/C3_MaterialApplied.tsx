import React, { useState, useEffect } from 'react'
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

export default function C3_MaterialApplied({ navigation }: any) {
  const { appliedWallMaterials, setCurrentDecorStep } = useDecorationStore()
  const { activeRoom } = useAppStore()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const appliedList = Array.from(appliedWallMaterials.values())

  const handleSubmitFinishes = async () => {
    if (!activeRoom) {
      Alert.alert('❌ Xato', 'Xona tanlanmagan')
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Submit each wall finish
      const promises = appliedList.map((applied) => {
        return apiClient.post(`/rooms/${activeRoom.id}/finishes`, {
          wall_id: applied.wallId,
          material_id: applied.material.id,
          material_type: applied.material.type,
        })
      })

      await Promise.all(promises)

      setSubmitted(true)

      // Show success toast
      Alert.alert('✓ Muvaffaqiyat', 'Shpaklovka qo\'llanildi', [
        {
          text: 'Davom',
          onPress: () => {
            setCurrentDecorStep(4)
            navigation.navigate('C4_FloorSelection')
          },
        },
      ])
    } catch (err) {
      setError('Materiallar saqlashda xato')
      console.error(err)
      Alert.alert('❌ Xato', 'Materiallar saqlashda xato yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  const totalCost = appliedList.reduce((sum, applied) => {
    return sum + ((applied.material as any).price || 0)
  }, 0)

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="bg-gradient-to-r from-blue-600 to-blue-400 px-4 py-6">
        <Text className="text-2xl font-bold text-white mb-1">Material Qo'llanish</Text>
        <Text className="text-blue-100 text-sm">3-bosqich: Tasdiqlash va saqlash</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Success Animation */}
        {submitted && (
          <View className="mx-4 mt-6 p-6 bg-green-50 rounded-lg border-2 border-green-400 items-center">
            <Text className="text-4xl mb-3">✓</Text>
            <Text className="font-bold text-green-900 text-lg mb-1">Muvaffaqiyat!</Text>
            <Text className="text-green-800 text-sm text-center">
              Shpaklovka qo'llanildi. Davom etishga tayyor!
            </Text>
          </View>
        )}

        {/* Applied Materials List */}
        <View className="mx-4 mt-6">
          <Text className="font-bold text-lg text-gray-900 mb-4">Qo'llangan Materiallar</Text>

          {appliedList.length === 0 ? (
            <View className="p-4 bg-gray-50 rounded-lg items-center">
              <Text className="text-gray-600">Materiallar tanlanmagan</Text>
            </View>
          ) : (
            <View className="space-y-3">
              {appliedList.map((applied, idx) => (
                <View key={`${applied.wallId}-${idx}`} className="bg-white rounded-lg border border-gray-200 p-4">
                  {/* Wall Label */}
                  <View className="flex-row items-center justify-between mb-3">
                    <View className="flex-row items-center gap-2">
                      <View className="w-8 h-8 rounded bg-blue-600 items-center justify-center">
                        <Text className="text-white font-bold text-sm">{applied.wallId}</Text>
                      </View>
                      <Text className="font-semibold text-gray-900">
                        {applied.wallId} devari
                      </Text>
                    </View>
                    <Text className="text-xs text-gray-500">
                      {new Date(applied.appliedAt).toLocaleTimeString('uz-UZ')}
                    </Text>
                  </View>

                  {/* Material Info */}
                  <View className="flex-row items-center gap-3">
                    <View
                      className="w-12 h-12 rounded"
                      style={{ backgroundColor: applied.material.color || '#E5E7EB' }}
                    />
                    <View className="flex-1">
                      <Text className="font-semibold text-gray-800">{applied.material.name}</Text>
                      <Text className="text-xs text-gray-600 mt-1">
                        Turi: {applied.material.type}
                      </Text>
                    </View>
                    {(applied.material as any).price && (
                      <Text className="font-bold text-blue-600">
                        {((applied.material as any).price || 0).toLocaleString()} so'm
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Cost Summary */}
        <View className="mx-4 mt-8 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="font-semibold text-gray-800">Jami narxi:</Text>
            <Text className="font-bold text-blue-600 text-lg">
              {totalCost.toLocaleString()} so'm
            </Text>
          </View>
          <View className="h-px bg-blue-300" />
          <View className="flex-row justify-between items-center mt-3">
            <Text className="text-sm text-gray-700">Qo'llangan materiallar soni:</Text>
            <Text className="font-bold text-gray-900">{appliedList.length} dona</Text>
          </View>
        </View>

        {/* Info Box */}
        <View className="mx-4 mt-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
          <Text className="font-bold text-orange-900 mb-2">ℹ️ Eslatma</Text>
          <Text className="text-sm text-orange-800">
            Shpaklovka (shiftlar) o'lash uchun zarur materiallar qo'llanildi. Keyingi bosqichda
            pol material turini tanlashingiz mumkin.
          </Text>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t-2 border-blue-300 p-4 gap-3">
        {!submitted ? (
          <TouchableOpacity
            onPress={handleSubmitFinishes}
            disabled={loading || appliedList.length === 0}
            className={`w-full py-3 rounded-lg ${
              loading || appliedList.length === 0
                ? 'bg-gray-400'
                : 'bg-gradient-to-r from-blue-600 to-blue-500'
            }`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-center text-white font-bold text-lg">
                ✓ Tasdiqlash va Saqlash
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => {
              setCurrentDecorStep(4)
              navigation.navigate('C4_FloorSelection')
            }}
            className="w-full bg-gradient-to-r from-green-600 to-green-500 py-3 rounded-lg"
          >
            <Text className="text-center text-white font-bold text-lg">
              Davom etish → Pol Material
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => {
            setCurrentDecorStep(2)
            navigation.goBack()
          }}
          className="w-full border-2 border-gray-300 py-3 rounded-lg"
        >
          <Text className="text-center text-gray-700 font-semibold">
            ← Orqaga
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
