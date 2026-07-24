import React, { useState } from 'react'
import { View, TextInput, TouchableOpacity, Text, ActivityIndicator, Alert } from 'react-native'
import { useAppStore } from '../../store/appStore'
import api from '../../config/api'

export default function LoginScreen({ navigation }: any) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const setProjects = useAppStore((state) => state.setProjects)

  const handleRequestOTP = async () => {
    if (!phone.trim()) {
      Alert.alert('Xato', 'Telefon raqamini kiriting')
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/auth/otp/request', { phone })
      if (response.status === 200) {
        navigation.navigate('OTP', { phone })
      }
    } catch (error: any) {
      Alert.alert('Xato', error.response?.data?.detail || 'OTP yuborisida xato')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className="flex-1 justify-center px-6 bg-white">
      {/* Header */}
      <View className="mb-8">
        <Text className="text-4xl font-bold text-gray-900 mb-2">Salom 👋</Text>
        <Text className="text-lg text-gray-600">UyTa'mir-ga xush kelibsiz</Text>
      </View>

      {/* Phone Input */}
      <View className="mb-6">
        <Text className="text-sm font-semibold text-gray-700 mb-2">Telefon raqam</Text>
        <View className="flex-row items-center border-2 border-blue-300 rounded-lg px-4 py-3 bg-blue-50">
          <Text className="text-gray-600 font-medium">+998</Text>
          <TextInput
            placeholder="90 123 45 67"
            placeholderTextColor="#999"
            value={phone.replace(/\+998/, '')}
            onChangeText={(text) => setPhone(`+998${text.replace(/[^\d]/g, '')}`)}
            keyboardType="phone-pad"
            editable={!loading}
            className="flex-1 ml-2 text-gray-900 font-medium text-base"
          />
        </View>
        <Text className="text-xs text-gray-500 mt-2">
          Loginiga uchun telefon raqam talab qilinadi
        </Text>
      </View>

      {/* Request OTP Button */}
      <TouchableOpacity
        onPress={handleRequestOTP}
        disabled={loading || !phone}
        className={`py-4 rounded-lg ${
          loading || !phone ? 'bg-gray-300' : 'bg-blue-600'
        }`}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white text-center font-bold text-lg">OTP Yuborish</Text>
        )}
      </TouchableOpacity>

      {/* Info */}
      <View className="mt-12 bg-blue-50 p-4 rounded-lg">
        <Text className="text-sm text-gray-700">
          📱 Siz kiritgan raqamga 6 xonali kod yuboriladi. Agar SMS kelmaydigan bo'lsa, 2-3 minutdan keyin qayta urinib ko'ring.
        </Text>
      </View>
    </View>
  )
}
