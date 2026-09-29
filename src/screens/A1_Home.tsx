import React from 'react'
import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import { useAppStore } from '../store/appStore'

export default function HomeScreen({ navigation }: any) {
  const user = useAppStore((state) => state.user)

  const quickActions = [
    { id: 1, label: '+ Yangi loyiha', icon: '📋', onPress: () => navigation.navigate('Projects') },
    { id: 2, label: 'Loyihalarim', icon: '📂', onPress: () => navigation.navigate('Projects') },
    { id: 3, label: 'Do\'kon', icon: '🛒', onPress: () => navigation.navigate('DokonTab') },
    { id: 4, label: 'Ustalar', icon: '👷', onPress: () => navigation.navigate('UstalarTab') },
  ]

  return (
    <ScrollView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-6 bg-gradient-to-r from-blue-600 to-blue-400">
        <Text className="text-3xl font-bold text-white mb-1">
          Salom, {user?.username || 'Foydalanuvchi'}! 👋
        </Text>
        <Text className="text-blue-100">Uyingizni remontlashga tayyor bo'lasizmi?</Text>
      </View>

      {/* Empty State or Projects */}
      <View className="px-4 py-8">
        <Text className="text-lg font-semibold text-gray-900 mb-4">Tez harakat</Text>

        {/* Quick Actions Grid */}
        <View className="flex-wrap flex-row justify-between gap-3">
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.id}
              onPress={action.onPress}
              className="w-[48%] bg-gray-50 p-4 rounded-lg border border-gray-200 items-center justify-center py-6"
            >
              <Text className="text-3xl mb-2">{action.icon}</Text>
              <Text className="text-center text-sm font-semibold text-gray-800">
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Stats */}
      <View className="px-4 py-8 border-t border-gray-200">
        <Text className="text-lg font-semibold text-gray-900 mb-4">Statistika</Text>
        <View className="flex-row gap-3">
          <View className="flex-1 bg-blue-50 p-4 rounded-lg">
            <Text className="text-2xl font-bold text-blue-600">0</Text>
            <Text className="text-xs text-gray-600 mt-1">Faol loyihalar</Text>
          </View>
          <View className="flex-1 bg-green-50 p-4 rounded-lg">
            <Text className="text-2xl font-bold text-green-600">0</Text>
            <Text className="text-xs text-gray-600 mt-1">Yakunlangan</Text>
          </View>
        </View>
      </View>

      {/* Features */}
      <View className="px-4 py-8">
        <Text className="text-lg font-semibold text-gray-900 mb-4">Imkoniyatlar</Text>
        <View className="space-y-3">
          <View className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200">
            <Text className="font-semibold text-gray-900">📐 Barcha o'lchamlar</Text>
            <Text className="text-sm text-gray-600 mt-1">Xonaning o'lchamlarini oling</Text>
          </View>
          <View className="bg-gradient-to-r from-orange-50 to-yellow-50 p-4 rounded-lg border border-orange-200">
            <Text className="font-semibold text-gray-900">🎨 Rang va material</Text>
            <Text className="text-sm text-gray-600 mt-1">Eng yaxshi variantlarni tanlang</Text>
          </View>
          <View className="bg-gradient-to-r from-cyan-50 to-blue-50 p-4 rounded-lg border border-cyan-200">
            <Text className="font-semibold text-gray-900">💰 Taxmin</Text>
            <Text className="text-sm text-gray-600 mt-1">To'liq narx hisob-kitobini oling</Text>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View className="px-4 py-8 border-t border-gray-200">
        <Text className="text-center text-xs text-gray-500">
          UyTa'mir v1.0 • Barcha huquqlar saqlanmoqda
        </Text>
      </View>
    </ScrollView>
  )
}
