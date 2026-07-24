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

interface LiDARPoint {
  x: number
  y: number
  z: number
  confidence: number
}

export default function LiDARCaptureScreen({ navigation }: any) {
  const [capturing, setCapturing] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [points, setPoints] = useState<LiDARPoint[]>([])
  const [roomDimensions, setRoomDimensions] = useState<{
    length: number
    width: number
    height: number
  } | null>(null)

  const setMeasurementCeilingHeight = useAppStore(
    (state) => state.setMeasurementCeilingHeight
  )

  // Simulate LiDAR capture
  const handleStartCapture = async () => {
    if (capturing) {
      handleStopCapture()
      return
    }

    setCapturing(true)
    setProgress(0)

    try {
      // Simulate LiDAR data collection
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval)
            return 100
          }
          return prev + Math.random() * 30
        })
      }, 500)

      // Simulate point cloud generation
      setTimeout(() => {
        clearInterval(interval)
        const simulatedPoints: LiDARPoint[] = Array.from({ length: 1000 }, () => ({
          x: Math.random() * 5,
          y: Math.random() * 5,
          z: Math.random() * 3,
          confidence: Math.random() * 100,
        }))
        setPoints(simulatedPoints)
        setProgress(100)
        setCapturing(false)
      }, 3000)
    } catch (error) {
      Alert.alert('Xato', "LiDAR ma'lumotlarini olishda xato yuz berdi")
      setCapturing(false)
    }
  }

  const handleStopCapture = () => {
    setCapturing(false)
  }

  const handleProcessData = async () => {
    if (points.length === 0) {
      Alert.alert('Xato', "Iltimos, avval ma'lumot oling")
      return
    }

    setProcessing(true)
    try {
      // Simulate AI processing
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const dimensions = {
        length: Math.round((Math.random() * 3 + 3) * 100) / 100,
        width: Math.round((Math.random() * 3 + 3) * 100) / 100,
        height: Math.round((Math.random() * 1 + 2.5) * 100) / 100,
      }

      setRoomDimensions(dimensions)
      setMeasurementCeilingHeight(dimensions.height * 1000) // Convert to mm
      setProcessing(false)

      Alert.alert('Muvaffaqiyat', "O'lchamlar hisoblandi", [
        {
          text: 'Davom etish',
          onPress: () => navigation.navigate('RoomDimensions'),
        },
      ])
    } catch (error) {
      Alert.alert('Xato', 'Serverda xato yuz berdi')
      setProcessing(false)
    }
  }

  const handleRetry = () => {
    setPoints([])
    setRoomDimensions(null)
    setProgress(0)
  }

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-6 bg-blue-600">
        <Text className="text-2xl font-bold text-white">LiDAR o'lchash</Text>
        <Text className="text-blue-100 text-sm mt-1">
          Telefoningizni poydevordan asta-sekin ko'tarib aylantirib yuring
        </Text>
      </View>

      {/* Content */}
      <ScrollView className="flex-1 px-4 py-6">
        {/* Camera Preview / Status */}
        <View className="bg-gradient-to-b from-blue-50 to-cyan-50 rounded-xl border-2 border-dashed border-blue-300 h-64 justify-center items-center mb-6">
          {capturing ? (
            <View className="items-center">
              <ActivityIndicator size="large" color="#0066cc" />
              <Text className="text-gray-700 font-semibold mt-4">
                Ma'lumot olinmoqda...
              </Text>
              <Text className="text-sm text-gray-600 mt-2">
                {Math.round(progress)}% yakunlandi
              </Text>
            </View>
          ) : points.length > 0 ? (
            <View className="items-center">
              <Text className="text-4xl mb-3">✓</Text>
              <Text className="text-green-700 font-bold">
                {points.length} nuqta olingan
              </Text>
              <Text className="text-sm text-gray-600 mt-2">
                AI bilan qayta ishlashga tayyor
              </Text>
            </View>
          ) : (
            <View className="items-center">
              <Text className="text-5xl mb-3">📱</Text>
              <Text className="text-gray-700 font-semibold">
                Boshlash uchun tugmani bosing
              </Text>
            </View>
          )}
        </View>

        {/* Progress Info */}
        {points.length > 0 && (
          <View className="bg-green-50 p-4 rounded-lg border border-green-200 mb-6">
            <Text className="font-semibold text-gray-900 mb-2">📊 Ma'lumot tahlili</Text>
            <Text className="text-sm text-gray-600">
              Jami nuqtalar: {points.length}
            </Text>
            <Text className="text-sm text-gray-600 mt-1">
              O'rtacha ishonch: {Math.round((points.reduce((a, p) => a + p.confidence, 0) / points.length))}%
            </Text>
          </View>
        )}

        {/* Results */}
        {roomDimensions && (
          <View className="bg-blue-50 p-6 rounded-lg border border-blue-200 mb-6">
            <Text className="font-bold text-gray-900 mb-4 text-lg">
              Hisoblab chiqilgan o'lchamlar
            </Text>
            <View className="space-y-3">
              <View className="flex-row justify-between items-center bg-white p-3 rounded-lg">
                <Text className="text-gray-600">Uzunligi:</Text>
                <Text className="font-bold text-blue-600">
                  {roomDimensions.length.toFixed(2)} m
                </Text>
              </View>
              <View className="flex-row justify-between items-center bg-white p-3 rounded-lg">
                <Text className="text-gray-600">Kengligini:</Text>
                <Text className="font-bold text-blue-600">
                  {roomDimensions.width.toFixed(2)} m
                </Text>
              </View>
              <View className="flex-row justify-between items-center bg-white p-3 rounded-lg">
                <Text className="text-gray-600">Balandligi:</Text>
                <Text className="font-bold text-blue-600">
                  {roomDimensions.height.toFixed(2)} m
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Tips */}
        <View className="bg-amber-50 p-4 rounded-lg border border-amber-200">
          <Text className="font-semibold text-gray-900 mb-2">💡 Eng yaxshi natijalari uchun</Text>
          <View className="space-y-1">
            <Text className="text-sm text-gray-600">• Xonaning barcha devoriylari ko'rinsin</Text>
            <Text className="text-sm text-gray-600">• Yeterli yorug'lik bo'lsin</Text>
            <Text className="text-sm text-gray-600">• Asta-sekin va aniq aylantirib yuring</Text>
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View className="border-t border-gray-200 px-4 py-4 space-y-3">
        <TouchableOpacity
          onPress={handleStartCapture}
          disabled={processing}
          className={`py-4 rounded-lg flex-row justify-center items-center ${
            capturing ? 'bg-red-600' : 'bg-blue-600'
          }`}
        >
          <Text className="text-white font-bold text-lg">
            {capturing ? "⏹ To'xtatish" : '▶ Boshlash'}
          </Text>
        </TouchableOpacity>

        {points.length > 0 && !roomDimensions && (
          <TouchableOpacity
            onPress={handleProcessData}
            disabled={processing}
            className="bg-green-600 py-4 rounded-lg flex-row justify-center items-center"
          >
            {processing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">🔄 Qayta ishlash</Text>
            )}
          </TouchableOpacity>
        )}

        {roomDimensions && (
          <TouchableOpacity
            onPress={() => navigation.navigate('RoomDimensions')}
            className="bg-green-600 py-4 rounded-lg flex-row justify-center items-center"
          >
            <Text className="text-white font-bold text-lg">✓ Davom etish</Text>
          </TouchableOpacity>
        )}

        {points.length > 0 && (
          <TouchableOpacity
            onPress={handleRetry}
            className="bg-gray-300 py-3 rounded-lg"
          >
            <Text className="text-center text-gray-700 font-semibold">
              Qayta o'lchash
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}
