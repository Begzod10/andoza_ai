import React, { useState, useEffect } from 'react'
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

// Wire length estimates per device type (meters)
const WIRE_LENGTHS = {
  yoritgich: 25,
  rozeta: 20,
  kalit: 15,
} as const

// Pricing (som)
const PRICING = {
  WIRE_PER_METER: 8000,
  CONDUIT_PER_METER: 5000,
  DEVICE_AVERAGE: 50000,
  CONDUIT_FACTOR: 1.3,
} as const

interface WireCalculation {
  type: string
  quantity: number
  estimatedLength: number // meters
}

export default function D4_ElectricalSummaryScreen({ navigation }: any) {
  const { activeRoom, electricalDevices, setCurrentStage } = useAppStore()
  const [saving, setSaving] = useState(false)
  const [wireCalculations, setWireCalculations] = useState<WireCalculation[]>([])
  const [totalWireLength, setTotalWireLength] = useState(0)
  const [conduitNeeded, setConduitNeeded] = useState(0)

  useEffect(() => {
    calculateEstimates()
  }, [electricalDevices, activeRoom])

  const calculateEstimates = () => {
    // FIX: Filter by room to avoid cross-room data leakage
    const roomDevices = electricalDevices.filter(d => d.room_id === activeRoom?.id)

    // Group devices by type
    const typeCount: Record<string, number> = {}
    const typeByVariant: Record<string, string> = {
      spot: 'yoritgich',
      chandelier: 'yoritgich',
      strip: 'yoritgich',
      single_socket: 'rozeta',
      double_socket: 'rozeta',
      single_switch: 'kalit',
      double_switch: 'kalit',
      sensor_switch: 'kalit',
    }

    roomDevices.forEach((device) => {
      const typeLabel = typeByVariant[device.variant || 'unknown'] || 'boshqa'
      typeCount[typeLabel] = (typeCount[typeLabel] || 0) + 1
    })

    // Calculate wire lengths using constants
    const calculations: WireCalculation[] = []
    let totalLength = 0

    Object.entries(typeCount).forEach(([type, quantity]) => {
      const lengthPerUnit = WIRE_LENGTHS[type as keyof typeof WIRE_LENGTHS] || 20
      const totalLength_unit = quantity * lengthPerUnit
      calculations.push({
        type,
        quantity,
        estimatedLength: totalLength_unit,
      })
      totalLength += totalLength_unit
    })

    setWireCalculations(calculations)
    setTotalWireLength(totalLength)
    // Conduit safety factor
    setConduitNeeded(totalLength * PRICING.CONDUIT_FACTOR)
  }

  const handleSaveElectricalPlan = async () => {
    if (!activeRoom) {
      Alert.alert('Xato', 'Xona tanlangan emas')
      return
    }

    try {
      setSaving(true)

      // Prepare payload
      const payload = {
        room_id: activeRoom.id,
        devices: electricalDevices,
        total_wire_length: totalWireLength,
        wire_by_type: wireCalculations.reduce(
          (acc, calc) => {
            acc[calc.type] = calc.estimatedLength
            return acc
          },
          {} as Record<string, number>
        ),
        conduit_needed: conduitNeeded,
        device_count: electricalDevices.length,
      }

      // Save to backend
      const response = await apiClient.post(`/rooms/${activeRoom.id}/electrical`, payload)

      if (response.data.success) {
        Alert.alert(
          'Muvaffaqiyat',
          'Elektr sxemasi saqlandi',
          [
            {
              text: 'Davom etish',
              onPress: () => {
                setCurrentStage(8)
                navigation.navigate('Finish') // Replace with actual next screen
              },
            },
          ]
        )
      } else {
        Alert.alert('Xato', response.data.error || 'Saqlashda xatolik')
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Elektr sxemasi saqlanmadi'
      Alert.alert('Xato', errorMsg)
      // Note: Use a proper logger instead of console.error in production
    } finally {
      setSaving(false)
    }
  }

  const getDeviceIcon = (type: string) => {
    const icons: Record<string, string> = {
      yoritgich: '💡',
      rozeta: '🔌',
      kalit: '🔘',
      boshqa: '⚡',
    }
    return icons[type] || '⚡'
  }

  const getDeviceLabel = (type: string) => {
    const labels: Record<string, string> = {
      yoritgich: 'Yoritgich qurilmalar',
      rozeta: 'Elektr rozetalari',
      kalit: 'O\'chirgich kalitleri',
      boshqa: 'Boshqa qurilmalar',
    }
    return labels[type] || type
  }

  return (
    <ScrollView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-6 bg-gradient-to-r from-blue-600 to-blue-400">
        <Text className="text-2xl font-bold text-white mb-1">Elektr sxemasi xulosa</Text>
        <Text className="text-blue-100">{activeRoom?.name} - Yakuniy rejalar</Text>
      </View>

      {/* Progress */}
      <View className="mx-4 mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="font-semibold text-gray-900">Bosqich</Text>
          <Text className="font-bold text-blue-600">4/4</Text>
        </View>
        <View className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <View className="h-full w-full bg-blue-600" />
        </View>
      </View>

      {/* Device Summary */}
      <View className="px-4 py-6 border-b border-gray-200">
        <Text className="text-lg font-semibold text-gray-900 mb-4">
          Qurilmalar xulosa
        </Text>

        {/* Total devices card */}
        <View className="bg-gradient-to-r from-blue-50 to-cyan-50 p-4 rounded-lg border border-blue-200 mb-4">
          <View className="flex-row justify-between items-start">
            <View>
              <Text className="text-xs text-gray-600 mb-1">Jami qurilmalar</Text>
              <Text className="text-3xl font-bold text-blue-600">
                {electricalDevices.filter(d => d.room_id === activeRoom?.id).length}
              </Text>
              <Text className="text-xs text-gray-500 mt-2">ta qurilma</Text>
            </View>
            <View className="bg-white p-3 rounded-lg">
              <Text className="text-2xl">⚡</Text>
            </View>
          </View>
        </View>

        {/* Device breakdown */}
        {wireCalculations.map((calc, index) => (
          <View
            key={index}
            className="flex-row justify-between items-center p-3 bg-gray-50 rounded-lg mb-2 border border-gray-200"
          >
            <View className="flex-row items-center gap-3 flex-1">
              <Text className="text-2xl">{getDeviceIcon(calc.type)}</Text>
              <View>
                <Text className="font-semibold text-gray-900">
                  {getDeviceLabel(calc.type)}
                </Text>
                <Text className="text-xs text-gray-600 mt-1">
                  {calc.estimatedLength.toFixed(1)} m sim
                </Text>
              </View>
            </View>
            <View className="items-end">
              <Text className="font-bold text-gray-900">×{calc.quantity}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Wire Calculations */}
      <View className="px-4 py-6 border-b border-gray-200">
        <Text className="text-lg font-semibold text-gray-900 mb-4">
          Elektr simlarining hisob-kitobı
        </Text>

        {/* Wire calculation cards */}
        <View className="space-y-3">
          {/* Total wire */}
          <View className="bg-gradient-to-r from-orange-50 to-yellow-50 p-4 rounded-lg border border-orange-200">
            <View className="flex-row justify-between items-center">
              <View>
                <Text className="text-sm text-gray-700 font-medium">
                  Elektr simlari (jami)
                </Text>
                <Text className="text-xs text-gray-600 mt-1">
                  Hamma qurilmalari uchun
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-2xl font-bold text-orange-600">
                  {totalWireLength.toFixed(1)}
                </Text>
                <Text className="text-xs text-gray-600">metr</Text>
              </View>
            </View>
          </View>

          {/* Conduit needed */}
          <View className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200">
            <View className="flex-row justify-between items-center">
              <View>
                <Text className="text-sm text-gray-700 font-medium">
                  Gofra (qo'rg'oshin)
                </Text>
                <Text className="text-xs text-gray-600 mt-1">
                  Simlarini himoya qilish uchun
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-2xl font-bold text-purple-600">
                  {conduitNeeded.toFixed(1)}
                </Text>
                <Text className="text-xs text-gray-600">metr</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Recommendations */}
      <View className="px-4 py-6 border-b border-gray-200">
        <Text className="text-lg font-semibold text-gray-900 mb-4">
          Tavsiyalar
        </Text>

        <View className="space-y-2">
          <View className="flex-row gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <Text className="text-lg">💡</Text>
            <Text className="text-sm text-gray-700 flex-1">
              LED yoritgichlardan foydalanish energiyani tejaydi
            </Text>
          </View>

          <View className="flex-row gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
            <Text className="text-lg">🔌</Text>
            <Text className="text-sm text-gray-700 flex-1">
              Har bir burchakda minimal 2 ta rozeta o'rnatish tavsiya etiladi
            </Text>
          </View>

          <View className="flex-row gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <Text className="text-lg">⚡</Text>
            <Text className="text-sm text-gray-700 flex-1">
              Avtomatik sirkit kesgichni o'rnatishni unutmang
            </Text>
          </View>
        </View>
      </View>

      {/* Cost Estimate (Optional) */}
      <View className="px-4 py-6 border-b border-gray-200">
        <Text className="text-lg font-semibold text-gray-900 mb-4">
          Taxminiy xarajat
        </Text>

        {/* Material costs */}
        <View className="space-y-2">
          <View className="flex-row justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
            <View>
              <Text className="font-semibold text-gray-900">Elektr simlari</Text>
              <Text className="text-xs text-gray-600 mt-1">
                {totalWireLength.toFixed(1)} m × {PRICING.WIRE_PER_METER.toLocaleString('uz-UZ')} so'm/m
              </Text>
            </View>
            <Text className="font-bold text-gray-900">
              {(totalWireLength * PRICING.WIRE_PER_METER).toLocaleString('uz-UZ')} so'm
            </Text>
          </View>

          <View className="flex-row justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
            <View>
              <Text className="font-semibold text-gray-900">Gofra</Text>
              <Text className="text-xs text-gray-600 mt-1">
                {conduitNeeded.toFixed(1)} m × {PRICING.CONDUIT_PER_METER.toLocaleString('uz-UZ')} so'm/m
              </Text>
            </View>
            <Text className="font-bold text-gray-900">
              {(conduitNeeded * PRICING.CONDUIT_PER_METER).toLocaleString('uz-UZ')} so'm
            </Text>
          </View>

          <View className="flex-row justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
            <View>
              <Text className="font-semibold text-gray-900">Qurilmalar</Text>
              <Text className="text-xs text-gray-600 mt-1">
                {electricalDevices.filter(d => d.room_id === activeRoom?.id).length} ta × o'rtacha {PRICING.DEVICE_AVERAGE.toLocaleString('uz-UZ')} so'm
              </Text>
            </View>
            <Text className="font-bold text-gray-900">
              {(electricalDevices.filter(d => d.room_id === activeRoom?.id).length * PRICING.DEVICE_AVERAGE).toLocaleString('uz-UZ')} so'm
            </Text>
          </View>

          {/* Total */}
          <View className="flex-row justify-between items-center p-4 mt-2 bg-gradient-to-r from-blue-100 to-cyan-100 rounded-lg border-2 border-blue-300">
            <Text className="font-bold text-gray-900 text-lg">Jami:</Text>
            <Text className="font-bold text-blue-600 text-2xl">
              {(
                totalWireLength * PRICING.WIRE_PER_METER +
                conduitNeeded * PRICING.CONDUIT_PER_METER +
                electricalDevices.filter(d => d.room_id === activeRoom?.id).length * PRICING.DEVICE_AVERAGE
              ).toLocaleString('uz-UZ')}{' '}
              so'm
            </Text>
          </View>
        </View>
      </View>

      {/* Navigation Buttons */}
      <View className="flex-row gap-3 px-4 py-6 border-t border-gray-200">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          disabled={saving}
          className={`flex-1 py-3 px-4 rounded-lg border-2 border-gray-300 items-center justify-center ${
            saving ? 'opacity-50' : ''
          }`}
        >
          <Text className="text-gray-700 font-bold">Orqaga</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSaveElectricalPlan}
          disabled={saving}
          className={`flex-1 py-3 px-4 rounded-lg items-center justify-center ${
            saving ? 'bg-blue-300' : 'bg-blue-600'
          }`}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold">Saqlash va Davom →</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}
