import React from 'react'
import { View, Text, TouchableOpacity } from 'react-native'

interface RoomStateCardProps {
  label: string
  description: string
  icon: string
  color: string
  isSelected: boolean
  onPress: () => void
}

export function RoomStateCard({
  label,
  description,
  icon,
  color,
  isSelected,
  onPress,
}: RoomStateCardProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`rounded-xl overflow-hidden border-2 transition-all ${
        isSelected
          ? 'border-blue-600 bg-blue-50'
          : 'border-gray-200 bg-white'
      }`}
    >
      {/* Color indicator */}
      <View
        className="h-1"
        style={{ backgroundColor: color }}
      />

      {/* Content */}
      <View className="p-4">
        {/* Header */}
        <View className="flex-row items-center gap-3 mb-3">
          <Text className="text-3xl">{icon}</Text>
          <View className="flex-1">
            <Text className="text-lg font-bold text-gray-900">
              {label}
            </Text>
          </View>

          {/* Radio button */}
          <View
            className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
              isSelected
                ? 'border-blue-600 bg-blue-600'
                : 'border-gray-300 bg-white'
            }`}
          >
            {isSelected && (
              <Text className="text-white text-xs font-bold">✓</Text>
            )}
          </View>
        </View>

        {/* Description */}
        <Text className="text-gray-600 text-sm leading-5">
          {description}
        </Text>
      </View>
    </TouchableOpacity>
  )
}
