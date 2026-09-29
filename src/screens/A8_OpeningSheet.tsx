import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native'
import { useAppStore } from '../store/appStore'
import apiClient from '../config/api'

const OPENING_TYPES = [
  { id: 'eshik', label: 'Eshik 🚪' },
  { id: 'deraza', label: 'Deraza 🪟' },
  { id: 'balkon_eshigi', label: 'Balkon eshigi 🚪' },
]

const SIZE_PRESETS = {
  eshik: [
    { width: 0.9, height: 2.05, label: '90×205 sm' },
    { width: 0.8, height: 2.05, label: '80×205 sm' },
    { width: 0.7, height: 2.05, label: '70×205 sm' },
  ],
  deraza: [
    { width: 1.5, height: 1.0, label: '150×100 sm' },
    { width: 1.2, height: 1.0, label: '120×100 sm' },
    { width: 0.9, height: 0.9, label: '90×90 sm' },
    { width: 0.6, height: 0.9, label: '60×90 sm' },
  ],
  balkon_eshigi: [
    { width: 0.8, height: 2.05, label: '80×205 sm' },
    { width: 1.2, height: 2.05, label: '120×205 sm' },
  ],
}

const WALL_LABELS = ['Devor A', 'Devor B', 'Devor C', 'Devor D']

export default function OpeningSheetScreen({ navigation }: any) {
  const activeProject = useAppStore((state) => state.activeProject)
  const measurement = useAppStore((state) => state.measurement)
  const addWallOpening = useAppStore((state) => state.addWallOpening)

  const [selectedWallIndex, setSelectedWallIndex] = useState(0)
  const [selectedType, setSelectedType] = useState<'eshik' | 'deraza' | 'balkon_eshigi'>('eshik')
  const [width, setWidth] = useState('0.9')
  const [height, setHeight] = useState('2.05')
  const [position, setPosition] = useState('1.0')
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [showPresetModal, setShowPresetModal] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const currentWall = measurement.walls[selectedWallIndex]
  const presets = SIZE_PRESETS[selectedType]

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    const w = parseFloat(width)
    if (!width || isNaN(w) || w <= 0) {
      newErrors.width = 'En noto\'g\'ri'
    }
    if (w > currentWall.length) {
      newErrors.width = `En ${currentWall.length}m dan oshmasligi kerak`
    }

    const h = parseFloat(height)
    if (!height || isNaN(h) || h <= 0) {
      newErrors.height = 'Balandlik noto\'g\'ri'
    }
    if (h > measurement.ceilingHeight) {
      newErrors.height = `Balandlik ${measurement.ceilingHeight}m dan oshmasligi kerak`
    }

    const pos = parseFloat(position)
    if (!position || isNaN(pos) || pos < 0) {
      newErrors.position = 'Joylashuv noto\'g\'ri'
    }
    if (pos + w > currentWall.length) {
      newErrors.position = 'Oyna/eshik devordan tashqari chiqadi'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleAddOpening = async () => {
    if (!validateForm() || !activeProject || !measurement.roomId) return

    try {
      setLoading(true)

      const opening = {
        id: `opening_${Date.now()}`,
        type: selectedType,
        width: parseFloat(width),
        height: parseFloat(height),
        position: parseFloat(position),
      }

      await apiClient.post(
        `/projects/${activeProject.id}/rooms/${measurement.roomId}/walls/${currentWall.direction}/openings`,
        opening
      )

      addWallOpening(selectedWallIndex, opening)

      setWidth('0.9')
      setHeight('2.05')
      setPosition('1.0')
      setErrors({})
    } catch (error) {
      console.error('Error adding opening:', error)
      setErrors({ submit: 'Saqlashda xatolik. Qayta urinib ko\'ring.' })
    } finally {
      setLoading(false)
    }
  }

  const handleSelectPreset = (preset: { width: number; height: number }) => {
    setWidth(preset.width.toString())
    setHeight(preset.height.toString())
    setShowPresetModal(false)
  }

  const handleContinue = () => {
    navigation.navigate('Summary')
  }

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="px-4 py-6">
        <Text className="text-2xl font-bold text-gray-900 mb-1">Oynalar va eshiklar</Text>
        <Text className="text-gray-600 mb-6">Har bir oyna/eshikni qo'shing</Text>

        {errors.submit && (
          <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <Text className="text-red-800 text-sm">{errors.submit}</Text>
          </View>
        )}

        <View className="space-y-5">
          <View>
            <Text className="text-gray-900 font-semibold mb-2">Devor tanlang</Text>
            <View className="flex-row gap-2">
              {measurement.walls.map((wall, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => setSelectedWallIndex(index)}
                  className={`flex-1 py-3 rounded-lg border-2 items-center ${
                    selectedWallIndex === index
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-gray-100 border-gray-300'
                  }`}
                >
                  <Text
                    className={`font-bold ${
                      selectedWallIndex === index ? 'text-white' : 'text-gray-700'
                    }`}
                  >
                    {wall.direction}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text className="text-gray-600 text-xs mt-2">
              Tanlangan devor: {WALL_LABELS[selectedWallIndex]} ({currentWall.length.toFixed(2)} m)
            </Text>
          </View>

          <View className="border-t border-gray-200 pt-5">
            <Text className="text-gray-900 font-semibold mb-2">Oyna/eshik turi</Text>
            <TouchableOpacity
              onPress={() => setShowTypeModal(true)}
              className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 bg-gray-50 flex-row justify-between items-center"
            >
              <Text className="text-gray-900 font-semibold">
                {OPENING_TYPES.find((t) => t.id === selectedType)?.label}
              </Text>
              <Text className="text-gray-400">⋮</Text>
            </TouchableOpacity>
          </View>

          <View className="border-t border-gray-200 pt-5">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-gray-900 font-semibold">O'lchamlar</Text>
              <TouchableOpacity
                onPress={() => setShowPresetModal(true)}
                className="bg-blue-100 px-3 py-1 rounded-lg"
              >
                <Text className="text-blue-600 text-xs font-bold">Shablonlar</Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row gap-3 mb-3">
              <View className="flex-1">
                <Text className="text-gray-700 text-xs mb-1 font-semibold">En (m)</Text>
                <TextInput
                  value={width}
                  onChangeText={setWidth}
                  placeholder="0.9"
                  keyboardType="decimal-pad"
                  className={`border-2 rounded-lg px-3 py-2 text-base font-semibold ${
                    errors.width ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-gray-50'
                  }`}
                  placeholderTextColor="#999"
                />
                {errors.width && (
                  <Text className="text-red-600 text-xs mt-1">{errors.width}</Text>
                )}
              </View>

              <View className="flex-1">
                <Text className="text-gray-700 text-xs mb-1 font-semibold">Balandlik (m)</Text>
                <TextInput
                  value={height}
                  onChangeText={setHeight}
                  placeholder="2.05"
                  keyboardType="decimal-pad"
                  className={`border-2 rounded-lg px-3 py-2 text-base font-semibold ${
                    errors.height ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-gray-50'
                  }`}
                  placeholderTextColor="#999"
                />
                {errors.height && (
                  <Text className="text-red-600 text-xs mt-1">{errors.height}</Text>
                )}
              </View>
            </View>
          </View>

          <View className="border-t border-gray-200 pt-5">
            <Text className="text-gray-900 font-semibold mb-2">Devorning boshidan masofa (m)</Text>
            <TextInput
              value={position}
              onChangeText={setPosition}
              placeholder="1.0"
              keyboardType="decimal-pad"
              className={`w-full border-2 rounded-lg px-4 py-3 text-base font-semibold ${
                errors.position ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-gray-50'
              }`}
              placeholderTextColor="#999"
            />
            {errors.position && (
              <Text className="text-red-600 text-xs mt-1">{errors.position}</Text>
            )}
          </View>

          <View className="bg-blue-50 rounded-lg p-3 border border-blue-200 mt-4">
            <Text className="text-blue-900 text-xs font-semibold">
              Qo'shilgan oynalar: {currentWall.openings.length}
            </Text>
            {currentWall.openings.length > 0 && (
              <View className="mt-2 space-y-1">
                {currentWall.openings.map((opening) => (
                  <Text key={opening.id} className="text-blue-800 text-xs">
                    • {opening.type}: {opening.width}×{opening.height} m
                  </Text>
                ))}
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={handleAddOpening}
            disabled={loading}
            className={`w-full py-3 rounded-lg items-center justify-center mt-4 ${
              loading ? 'bg-green-300' : 'bg-green-600'
            }`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold">+ Qo'shish</Text>
            )}
          </TouchableOpacity>
        </View>

        <View className="mt-8 space-y-3">
          <TouchableOpacity
            onPress={handleContinue}
            className="w-full py-4 rounded-lg items-center justify-center bg-blue-600"
          >
            <Text className="text-white font-bold text-base">Xulosa ko'ring</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="w-full py-3 rounded-lg items-center justify-center border border-gray-300"
          >
            <Text className="text-gray-700 font-semibold">Orqaga</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showTypeModal} transparent={true} animationType="fade">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-2xl p-4">
            <Text className="text-lg font-bold text-gray-900 mb-4">Turi tanlang</Text>
            <FlatList
              data={OPENING_TYPES}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedType(item.id as any)
                    setShowTypeModal(false)
                    setWidth('0.9')
                    setHeight('2.05')
                  }}
                  className={`py-3 px-4 border-b border-gray-200 ${
                    selectedType === item.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <Text
                    className={`text-base font-semibold ${
                      selectedType === item.id ? 'text-blue-600' : 'text-gray-900'
                    }`}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              onPress={() => setShowTypeModal(false)}
              className="mt-4 py-3 bg-gray-100 rounded-lg"
            >
              <Text className="text-center text-gray-900 font-semibold">Yopish</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showPresetModal} transparent={true} animationType="fade">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-2xl p-4">
            <Text className="text-lg font-bold text-gray-900 mb-4">O'lcham shablonlari</Text>
            <FlatList
              data={presets}
              keyExtractor={(item) => item.label}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSelectPreset(item)}
                  className="py-3 px-4 border-b border-gray-200"
                >
                  <Text className="text-base font-semibold text-blue-600">{item.label}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              onPress={() => setShowPresetModal(false)}
              className="mt-4 py-3 bg-gray-100 rounded-lg"
            >
              <Text className="text-center text-gray-900 font-semibold">Yopish</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}
