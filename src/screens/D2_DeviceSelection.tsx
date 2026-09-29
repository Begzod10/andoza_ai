import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native'
import { useAppStore } from '../store/appStore'
import type { ElectricalDevice, DeviceVariant } from '../types'

interface DeviceCategory {
  id: string
  name: string
  icon: string
  variants: Array<{
    id: DeviceVariant
    name: string
    description: string
    icon: string
    color: string
  }>
}

const DEVICE_CATEGORIES: DeviceCategory[] = [
  {
    id: 'lighting',
    name: 'Yoritish',
    icon: '💡',
    variants: [
      {
        id: 'spot',
        name: 'Spot yorug\'lik',
        description: 'Nuqtaviy yorug\'lik',
        icon: '💡',
        color: 'yellow',
      },
      {
        id: 'chandelier',
        name: 'Lyustra',
        description: 'Markaziy yoritgi',
        icon: '🔆',
        color: 'yellow',
      },
      {
        id: 'strip',
        name: 'LED lenta',
        description: 'Uzunroq yoritgi',
        icon: '✨',
        color: 'yellow',
      },
    ],
  },
  {
    id: 'outlets',
    name: 'Rozetkalar',
    icon: '🔌',
    variants: [
      {
        id: 'single_socket',
        name: 'Bitta rozeta',
        description: 'Oddiy elektr rozeta',
        icon: '🔌',
        color: 'orange',
      },
      {
        id: 'double_socket',
        name: 'Ikki rozeta',
        description: 'Juftlik rozeta',
        icon: '🔌',
        color: 'orange',
      },
    ],
  },
  {
    id: 'switches',
    name: 'Kalitlar',
    icon: '🔘',
    variants: [
      {
        id: 'single_switch',
        name: 'Bitta kalit',
        description: 'Oddiy kalit',
        icon: '🔘',
        color: 'blue',
      },
      {
        id: 'double_switch',
        name: 'Ikki kalitli',
        description: 'Juft kalit bloki',
        icon: '🔘',
        color: 'blue',
      },
      {
        id: 'sensor_switch',
        name: 'Sensor kalit',
        description: 'Harakat sensorli',
        icon: '📡',
        color: 'purple',
      },
    ],
  },
]

export default function D2_DeviceSelectionScreen({ navigation }: any) {
  const { activeRoom, electricalDevices, updateDevice, setCurrentStage } = useAppStore()
  const [expandedCategory, setExpandedCategory] = useState<string | null>('lighting')
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, { variant: DeviceVariant; quantity: number }>
  >({})

  const screenWidth = Dimensions.get('window').width

  const handleVariantSelect = (variantId: DeviceVariant) => {
    setSelectedVariants((prev) => {
      const current = prev[variantId] || { variant: variantId, quantity: 0 }
      const newQuantity = current.quantity === 0 ? 1 : current.quantity

      if (newQuantity === 0) {
        const { [variantId]: _, ...rest } = prev
        return rest
      }

      return {
        ...prev,
        [variantId]: { variant: variantId, quantity: newQuantity },
      }
    })
  }

  const handleQuantityChange = (variantId: DeviceVariant, delta: number) => {
    setSelectedVariants((prev) => {
      const current = prev[variantId]
      if (!current) return prev

      const newQuantity = Math.max(0, current.quantity + delta)
      if (newQuantity === 0) {
        const { [variantId]: _, ...rest } = prev
        return rest
      }

      return {
        ...prev,
        [variantId]: { ...current, quantity: newQuantity },
      }
    })
  }

  const getTotalQuantity = () => {
    return Object.values(selectedVariants).reduce((sum, item) => sum + item.quantity, 0)
  }

  const applySelections = () => {
    const roomDevices = electricalDevices.filter(d => d.room_id === activeRoom?.id)

    if (roomDevices.length === 0) {
      Alert.alert('Ogohlantirish', 'Avvalo qurilmalarni rejaga qo\'shib oling')
      return
    }

    // Map variant selections to device type + variant updates
    let updateCount = 0
    let appliedPerVariant: Record<string, number> = {}
    let deviceIndex = 0

    for (const variantId in selectedVariants) {
      const { quantity } = selectedVariants[variantId as DeviceVariant]
      appliedPerVariant[variantId] = 0

      // Determine type based on variant
      let deviceType: 'light' | 'socket' | 'switch' = 'light'
      if (variantId.includes('socket')) deviceType = 'socket'
      if (variantId.includes('switch')) deviceType = 'switch'

      // Apply updates to unassigned devices
      for (let i = 0; i < quantity && deviceIndex < roomDevices.length; i++) {
        const device = roomDevices[deviceIndex++]
        updateDevice(device.id, {
          type: deviceType,
          variant: variantId as DeviceVariant,
        })
        appliedPerVariant[variantId]++
        updateCount++
      }
    }

    // FIX: Warn if not all selections were applied
    let warningMsg = ''
    for (const variantId in selectedVariants) {
      const requested = selectedVariants[variantId as DeviceVariant].quantity
      const applied = appliedPerVariant[variantId]
      if (applied < requested) {
        warningMsg += `${variantId}: ${requested} talab etdi, ${applied} qo'shildi\n`
      }
    }

    if (warningMsg) {
      Alert.alert('Eslatma', warningMsg + '\nQo\'shilgan qurilmalar soni kichik')
      return
    }

    setCurrentStage(6)
    navigation.navigate('D3_LightingPreview')
  }

  const getVariantCount = (variants: DeviceVariant[]) => {
    return variants.reduce((sum, v) => {
      const selected = selectedVariants[v]
      return sum + (selected ? selected.quantity : 0)
    }, 0)
  }

  return (
    <ScrollView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-6 bg-gradient-to-r from-blue-600 to-blue-400">
        <Text className="text-2xl font-bold text-white mb-1">Qurilma turini tanlang</Text>
        <Text className="text-blue-100">
          {activeRoom?.name} - Qurilmalari
        </Text>
      </View>

      {/* Summary */}
      <View className="mx-4 mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-xs text-gray-600 mb-1">Jami qurilmalar</Text>
            <Text className="text-2xl font-bold text-blue-600">
              {electricalDevices.length}
            </Text>
          </View>
          <View>
            <Text className="text-xs text-gray-600 mb-1">Tanlangan turlar</Text>
            <Text className="text-2xl font-bold text-blue-600">
              {getTotalQuantity()}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-xs text-gray-600 mb-1">Bosqich</Text>
            <Text className="text-2xl font-bold text-blue-600">2/4</Text>
          </View>
        </View>
      </View>

      {/* Device Categories */}
      <View className="px-4 py-6">
        <Text className="text-lg font-semibold text-gray-900 mb-4">Qurilma turlari</Text>

        {DEVICE_CATEGORIES.map((category) => (
          <View key={category.id} className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
            {/* Category Header */}
            <TouchableOpacity
              onPress={() =>
                setExpandedCategory(
                  expandedCategory === category.id ? null : category.id
                )
              }
              className="bg-gray-50 flex-row justify-between items-center p-4"
            >
              <View className="flex-row items-center gap-3">
                <Text className="text-2xl">{category.icon}</Text>
                <View>
                  <Text className="font-semibold text-gray-900">{category.name}</Text>
                  <Text className="text-xs text-gray-500 mt-1">
                    {category.variants.length} xil variant
                  </Text>
                </View>
              </View>
              <Text className="text-2xl text-gray-600">
                {expandedCategory === category.id ? '−' : '+'}
              </Text>
            </TouchableOpacity>

            {/* Category Variants */}
            {expandedCategory === category.id && (
              <View className="bg-white p-4 space-y-3">
                {category.variants.map((variant) => {
                  const selected = selectedVariants[variant.id]
                  const isSelected = selected && selected.quantity > 0

                  return (
                    <View
                      key={variant.id}
                      className={`border-2 rounded-lg p-4 flex-row justify-between items-center ${
                        isSelected
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2 mb-1">
                          <Text className="text-2xl">{variant.icon}</Text>
                          <View>
                            <Text className="font-semibold text-gray-900">
                              {variant.name}
                            </Text>
                            <Text className="text-xs text-gray-600 mt-1">
                              {variant.description}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Quantity Controls */}
                      {isSelected ? (
                        <View className="flex-row items-center gap-2 bg-white border border-blue-600 rounded-lg overflow-hidden">
                          <TouchableOpacity
                            onPress={() =>
                              handleQuantityChange(variant.id, -1)
                            }
                            className="px-3 py-2"
                          >
                            <Text className="text-blue-600 font-bold">−</Text>
                          </TouchableOpacity>
                          <Text className="px-3 py-2 font-bold text-gray-900 min-w-[40px] text-center">
                            {selected.quantity}
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              handleQuantityChange(variant.id, 1)
                            }
                            className="px-3 py-2"
                          >
                            <Text className="text-blue-600 font-bold">+</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleVariantSelect(variant.id)}
                          className="bg-blue-100 px-4 py-2 rounded-lg"
                        >
                          <Text className="text-blue-600 font-semibold text-sm">
                            Qo'shish
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Selection Summary */}
      {getTotalQuantity() > 0 && (
        <View className="mx-4 mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
          <Text className="font-semibold text-gray-900 mb-3">Tanlangan:</Text>
          {Object.entries(selectedVariants).map(([variantId, { quantity }]) => {
            const allVariants = DEVICE_CATEGORIES.flatMap((cat) => cat.variants)
            const variant = allVariants.find((v) => v.id === variantId)
            return (
              <View
                key={variantId}
                className="flex-row justify-between py-1 border-b border-green-200 last:border-b-0"
              >
                <Text className="text-sm text-gray-700">
                  {variant?.icon} {variant?.name}
                </Text>
                <Text className="text-sm font-semibold text-gray-900">
                  × {quantity}
                </Text>
              </View>
            )
          })}
        </View>
      )}

      {/* Navigation Buttons */}
      <View className="flex-row gap-3 px-4 py-6 border-t border-gray-200">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="flex-1 py-3 px-4 rounded-lg border-2 border-gray-300 items-center justify-center"
        >
          <Text className="text-gray-700 font-bold">Orqaga</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={applySelections}
          disabled={getTotalQuantity() === 0}
          className={`flex-1 py-3 px-4 rounded-lg items-center justify-center ${
            getTotalQuantity() === 0
              ? 'bg-gray-300'
              : 'bg-blue-600'
          }`}
        >
          <Text
            className={`font-bold ${
              getTotalQuantity() === 0 ? 'text-gray-500' : 'text-white'
            }`}
          >
            Keyingi →
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}
