import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useAppStore } from '../store/appStore'

interface CapturedPhoto {
  id: string
  corner: 'NW' | 'NE' | 'SE' | 'SW'
  uri: string
  timestamp: Date
}

export default function Photo360CaptureScreen({ navigation }: any) {
  const [photos, setPhotos] = useState<CapturedPhoto[]>([])
  const [currentCorner, setCurrentCorner] = useState<'NW' | 'NE' | 'SE' | 'SW'>('NW')
  const [processing, setProcessing] = useState(false)
  const [dimensions, setDimensions] = useState<{
    length: number
    width: number
    height: number
  } | null>(null)

  const setMeasurementCeilingHeight = useAppStore(
    (state) => state.setMeasurementCeilingHeight
  )

  const corners = [
    { id: 'NW', label: "Shimol-G'arbiy", emoji: '↖️' },
    { id: 'NE', label: 'Shimol-Sharqiy', emoji: '↗️' },
    { id: 'SE', label: 'Janub-Sharqiy', emoji: '↘️' },
    { id: 'SW', label: "Janub-G'arbiy", emoji: '↙️' },
  ] as const

  const handleCapturePhoto = () => {
    if (photos.length >= 4) {
      Alert.alert('Ogohlantirish', 'Barcha suratlar olingan')
      return
    }

    // Simulate photo capture
    const newPhoto: CapturedPhoto = {
      id: `photo_${Date.now()}`,
      corner: currentCorner,
      uri: `https://via.placeholder.com/300x400?text=${currentCorner}`,
      timestamp: new Date(),
    }

    const updatedPhotos = [...photos, newPhoto]
    setPhotos(updatedPhotos)

    // Move to next corner
    const nextIndex = (corners.findIndex((c) => c.id === currentCorner) + 1) % 4
    setCurrentCorner(corners[nextIndex].id as 'NW' | 'NE' | 'SE' | 'SW')

    if (updatedPhotos.length === 4) {
      Alert.alert('Muvaffaqiyat', 'Barcha suratlar olingan! Qayta ishlashni boshlash mumkin.')
    }
  }

  const handleProcessPhotos = async () => {
    if (photos.length < 4) {
      Alert.alert('Xato', 'Iltimos, 4 ta surattan oling')
      return
    }

    setProcessing(true)
    try {
      // Simulate AI processing
      await new Promise((resolve) => setTimeout(resolve, 2500))

      const processedDimensions = {
        length: Math.round((Math.random() * 2.5 + 3) * 100) / 100,
        width: Math.round((Math.random() * 2.5 + 3) * 100) / 100,
        height: Math.round((Math.random() * 1 + 2.5) * 100) / 100,
      }

      setDimensions(processedDimensions)
      setMeasurementCeilingHeight(processedDimensions.height * 1000) // mm
      setProcessing(false)
    } catch (error) {
      Alert.alert('Xato', 'Suratlarni qayta ishlashda xato yuz berdi')
      setProcessing(false)
    }
  }

  const handleRetake = (corner: string) => {
    setPhotos(photos.filter((p) => p.corner !== corner))
  }

  const handleRemoveAll = () => {
    Alert.alert('Tasdiqlash', "Barcha suratlarni o'chirmoqchisiz?", [
      { text: 'Bekor qilish', onPress: () => {} },
      {
        text: "O'chirish",
        onPress: () => {
          setPhotos([])
          setDimensions(null)
          setCurrentCorner('NW')
        },
      },
    ])
  }

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-6 bg-blue-600">
        <Text className="text-2xl font-bold text-white">360° Suratlar</Text>
        <Text className="text-blue-100 text-sm mt-1">
          Xonaning 4 burchagidan suratlar oling
        </Text>
      </View>

      {/* Content */}
      <ScrollView className="flex-1 px-4 py-6">
        {/* Instructions */}
        <View className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
          <Text className="font-semibold text-gray-900 mb-2">📸 Ko'rsatmalar</Text>
          <Text className="text-sm text-gray-600 leading-5">
            Xonaning har bir burchagida turub, devoriyle arava, pol va shiftga qarab
            suratlang. Barcha ochilmalarni ko'rsinish juda muhim.
          </Text>
        </View>

        {/* Corner Status */}
        <View className="mb-6">
          <Text className="font-semibold text-gray-900 mb-3">Burchaklar holati</Text>
          <View className="grid grid-cols-2 gap-3">
            {corners.map((corner) => {
              const photo = photos.find((p) => p.corner === corner.id)
              const isNext = currentCorner === corner.id && photos.length < 4
              return (
                <View
                  key={corner.id}
                  className={`p-4 rounded-lg border-2 ${
                    photo
                      ? 'bg-green-50 border-green-300'
                      : isNext
                        ? 'bg-yellow-50 border-yellow-300'
                        : 'bg-gray-50 border-gray-300'
                  }`}
                >
                  <Text className="text-3xl mb-2 text-center">{corner.emoji}</Text>
                  <Text className="text-xs font-semibold text-gray-900 text-center">
                    {corner.label}
                  </Text>
                  <Text className="text-xs text-gray-600 text-center mt-1">
                    {photo ? '✓ Olingan' : 'Kutilmoqda'}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>

        {/* Photo Preview Grid */}
        {photos.length > 0 && (
          <View className="mb-6">
            <Text className="font-semibold text-gray-900 mb-3">Olingan suratlar</Text>
            <View className="space-y-3">
              {photos.map((photo) => {
                const corner = corners.find((c) => c.id === photo.corner)
                return (
                  <View
                    key={photo.id}
                    className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex-row items-center justify-between"
                  >
                    <View className="flex-row items-center flex-1">
                      <View className="w-16 h-16 bg-gradient-to-br from-blue-200 to-blue-400 rounded-lg mr-3 justify-center items-center">
                        <Text className="text-2xl">{corner?.emoji}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="font-semibold text-gray-900">
                          {corner?.label}
                        </Text>
                        <Text className="text-xs text-gray-500 mt-1">
                          {photo.timestamp.toLocaleTimeString('uz-UZ')}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRetake(photo.corner)}
                      className="bg-red-100 p-2 rounded-lg"
                    >
                      <Text className="text-red-600 text-lg">↻</Text>
                    </TouchableOpacity>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Dimensions Result */}
        {dimensions && (
          <View className="bg-green-50 p-6 rounded-lg border border-green-200 mb-6">
            <Text className="font-bold text-gray-900 mb-4 text-lg">
              Hisoblab chiqilgan o'lchamlar
            </Text>
            <View className="space-y-3">
              <View className="flex-row justify-between items-center bg-white p-3 rounded-lg">
                <Text className="text-gray-600">Uzunligi:</Text>
                <Text className="font-bold text-green-600">
                  {dimensions.length.toFixed(2)} m
                </Text>
              </View>
              <View className="flex-row justify-between items-center bg-white p-3 rounded-lg">
                <Text className="text-gray-600">Kengligini:</Text>
                <Text className="font-bold text-green-600">
                  {dimensions.width.toFixed(2)} m
                </Text>
              </View>
              <View className="flex-row justify-between items-center bg-white p-3 rounded-lg">
                <Text className="text-gray-600">Balandligi:</Text>
                <Text className="font-bold text-green-600">
                  {dimensions.height.toFixed(2)} m
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Current Status */}
        {photos.length < 4 && !processing && (
          <View className="bg-gradient-to-b from-yellow-50 to-orange-50 p-6 rounded-lg border border-yellow-300 text-center mb-6">
            <Text className="text-5xl mb-3">📍</Text>
            <Text className="font-bold text-gray-900 mb-1">
              {corners.find((c) => c.id === currentCorner)?.label}
            </Text>
            <Text className="text-sm text-gray-600 mb-3">
              {photos.length}/4 suratlandi
            </Text>
            <View className="bg-white bg-opacity-50 rounded py-2 px-3 flex-row justify-center items-center">
              <Text className="text-gray-600 text-xs">
                {corners.findIndex((c) => c.id === currentCorner) + 1}-bosqich
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Action Buttons */}
      <View className="border-t border-gray-200 px-4 py-4 space-y-3">
        {!dimensions && (
          <>
            <TouchableOpacity
              onPress={handleCapturePhoto}
              disabled={photos.length >= 4 || processing}
              className={`py-4 rounded-lg flex-row justify-center items-center ${
                photos.length >= 4 ? 'bg-gray-400' : 'bg-blue-600'
              }`}
            >
              <Text className="text-white font-bold text-lg">
                📸 {photos.length >= 4 ? 'Barcha suratlar olingan' : 'Suratlash'}
              </Text>
            </TouchableOpacity>

            {photos.length === 4 && (
              <TouchableOpacity
                onPress={handleProcessPhotos}
                disabled={processing}
                className="bg-green-600 py-4 rounded-lg flex-row justify-center items-center"
              >
                {processing ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white font-bold text-lg">
                    🔄 AI bilan qayta ishlash
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {photos.length > 0 && (
              <TouchableOpacity onPress={handleRemoveAll} className="bg-gray-300 py-3 rounded-lg">
                <Text className="text-center text-gray-700 font-semibold">
                  Ularni o'chirish
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {dimensions && (
          <TouchableOpacity
            onPress={() => navigation.navigate('RoomDimensions')}
            className="bg-green-600 py-4 rounded-lg flex-row justify-center items-center"
          >
            <Text className="text-white font-bold text-lg">✓ Davom etish</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}
