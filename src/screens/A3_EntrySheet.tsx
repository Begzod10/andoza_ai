import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, Modal, Dimensions } from 'react-native'

interface EntrySheetProps {
  visible: boolean
  onClose: () => void
  onSelectMethod: (method: 'lidar' | 'photo360' | 'manual') => void
}

export default function EntrySheet({ visible, onClose, onSelectMethod }: EntrySheetProps) {
  const { height } = Dimensions.get('window')

  const entryMethods = [
    {
      id: 'lidar',
      title: 'LiDAR o\'lchash',
      description: 'Telefoningiz kamerasidan foydalanib aniq o\'lchamlar oling',
      icon: '📱',
      color: 'from-blue-50 to-cyan-50',
      borderColor: 'border-blue-200',
      onPress: () => {
        onSelectMethod('lidar')
        onClose()
      },
    },
    {
      id: 'photo360',
      title: '360° Suratlar',
      description: '4 burchakdan suratlar olib, AI o\'lchamlarni hisoblaydi',
      icon: '📸',
      color: 'from-purple-50 to-pink-50',
      borderColor: 'border-purple-200',
      onPress: () => {
        onSelectMethod('photo360')
        onClose()
      },
    },
    {
      id: 'manual',
      title: 'Qo\'lda kiritish',
      description: 'O\'lchamlarni qo\'lda to\'ldirib, xonani belgilang',
      icon: '✏️',
      color: 'from-orange-50 to-yellow-50',
      borderColor: 'border-orange-200',
      onPress: () => {
        onSelectMethod('manual')
        onClose()
      },
    },
  ]

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/50">
        <View
          style={{ height: height * 0.85 }}
          className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
        >
          {/* Header */}
          <View className="px-4 py-6 border-b border-gray-200">
            <View className="flex-row justify-between items-center">
              <Text className="text-2xl font-bold text-gray-900">
                O'lchash usulini tanlang
              </Text>
              <TouchableOpacity onPress={onClose} className="p-2">
                <Text className="text-2xl">✕</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-gray-600 text-sm mt-2">
              Xonaning o'lchamlarini qanday olmoqchisiz?
            </Text>
          </View>

          {/* Methods List */}
          <ScrollView className="flex-1 px-4 py-6">
            <View className="space-y-4">
              {entryMethods.map((method) => (
                <TouchableOpacity
                  key={method.id}
                  onPress={method.onPress}
                  className={`bg-gradient-to-r ${method.color} p-6 rounded-xl border ${method.borderColor} active:opacity-70`}
                >
                  <View className="flex-row items-start">
                    <Text className="text-5xl mr-4">{method.icon}</Text>
                    <View className="flex-1">
                      <Text className="text-lg font-bold text-gray-900">
                        {method.title}
                      </Text>
                      <Text className="text-sm text-gray-600 mt-2 leading-5">
                        {method.description}
                      </Text>
                      <View className="mt-3 flex-row items-center">
                        <Text className="text-blue-600 font-semibold text-sm">
                          Davom etish →
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Info Box */}
            <View className="mt-8 bg-blue-50 p-4 rounded-lg border border-blue-200">
              <Text className="font-semibold text-gray-900 mb-2">💡 Maslahat</Text>
              <Text className="text-sm text-gray-600 leading-5">
                LiDAR usuli eng aniq natijalarni beradi. Agar telefoningizda LiDAR
                yo'q bo'lsa, 360° suratlar yaxshi alternativa hisoblanadi.
              </Text>
            </View>
          </ScrollView>

          {/* Footer */}
          <View className="border-t border-gray-200 px-4 py-4">
            <TouchableOpacity
              onPress={onClose}
              className="bg-gray-100 py-3 rounded-lg"
            >
              <Text className="text-center text-gray-700 font-semibold">
                Bekor qilish
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}
