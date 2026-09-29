import React, { useState, useEffect } from 'react'
import { View, TextInput, TouchableOpacity, Text, ActivityIndicator, Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAppStore } from '../../store/appStore'
import api from '../../config/api'

export default function OTPScreen({ route, navigation }: any) {
  const { phone } = route.params
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [timer, setTimer] = useState(60)
  const [canResend, setCanResend] = useState(false)
  const setUser = useAppStore((state) => state.setUser)

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer((t) => t - 1), 1000)
      return () => clearInterval(interval)
    } else {
      setCanResend(true)
    }
  }, [timer])

  const handleVerifyOTP = async () => {
    if (code.length !== 6) {
      Alert.alert('Xato', '6 xonali kod kiriting')
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/auth/otp/verify', {
        phone,
        code
      })

      if (response.status === 200) {
        const userData = response.data.user
        await AsyncStorage.setItem('access_token', response.data.access_token)
        await AsyncStorage.setItem('refresh_token', response.data.refresh_token)

        setUser(userData)
        navigation.navigate('HomeTab')
      }
    } catch (error: any) {
      Alert.alert('Xato', error.response?.data?.detail || 'OTP tekshirisida xato')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  const handleResendOTP = async () => {
    setLoading(true)
    try {
      await api.post('/auth/otp/request', { phone })
      setTimer(60)
      setCanResend(false)
      setCode('')
      Alert.alert('Muvaffaqiyat', 'Yangi kod yuborildi')
    } catch (error: any) {
      Alert.alert('Xato', error.response?.data?.detail || 'Kodni qayta yuborisida xato')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className="flex-1 justify-center px-6 bg-white">
      {/* Header */}
      <View className="mb-8">
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text className="text-blue-600 font-semibold mb-4">← Orqaga</Text>
        </TouchableOpacity>
        <Text className="text-3xl font-bold text-gray-900 mb-2">Kod kiriting</Text>
        <Text className="text-gray-600">
          {phone} raqamiga yuborilgan 6 xonali kodni kiriting
        </Text>
      </View>

      {/* OTP Input */}
      <View className="mb-8">
        <Text className="text-sm font-semibold text-gray-700 mb-3">Tasdiqlash kodi</Text>
        <TextInput
          placeholder="000000"
          placeholderTextColor="#ccc"
          value={code}
          onChangeText={(text) => setCode(text.replace(/[^\d]/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          editable={!loading}
          className={`w-full text-center text-4xl font-bold tracking-widest border-2 ${
            code.length === 6 ? 'border-green-500' : 'border-gray-300'
          } rounded-lg py-4 bg-gray-50`}
        />
        <Text className="text-xs text-gray-500 mt-2">
          {code.length}/6 belgi
        </Text>
      </View>

      {/* Verify Button */}
      <TouchableOpacity
        onPress={handleVerifyOTP}
        disabled={loading || code.length !== 6}
        className={`py-4 rounded-lg mb-4 ${
          loading || code.length !== 6 ? 'bg-gray-300' : 'bg-green-600'
        }`}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white text-center font-bold text-lg">Kirish</Text>
        )}
      </TouchableOpacity>

      {/* Resend OTP */}
      <View className="flex-row justify-center items-center">
        <Text className="text-gray-600">Kod kelmadimi? </Text>
        {canResend ? (
          <TouchableOpacity onPress={handleResendOTP} disabled={loading}>
            <Text className="text-blue-600 font-semibold">Qayta yuborish</Text>
          </TouchableOpacity>
        ) : (
          <Text className="text-blue-600 font-semibold">{timer}s kuting</Text>
        )}
      </View>

      {/* Info */}
      <View className="mt-12 bg-yellow-50 p-4 rounded-lg border border-yellow-200">
        <Text className="text-sm text-gray-700">
          ⏱️ Kod 5 minut davomida amal qiladi. Agar xato bo'lsa qayta yuborishga harakat qiling.
        </Text>
      </View>
    </View>
  )
}
