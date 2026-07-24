import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  FlatList,
  Dimensions,
  Alert,
} from 'react-native'
import { useAppStore } from '../store/appStore'
import apiClient from '../config/api'
import { Material } from '../types'

interface TextureItem extends Material {
  price: number
  category: string
  coverage: number // m² per unit
}

const TEXTURE_CATEGORIES = [
  { id: 'paint', label: 'Бўйоқ', emoji: '🎨' },
  { id: 'wallpaper', label: 'Обой', emoji: '📄' },
  { id: 'tile', label: 'Плитка', emoji: '🧱' },
  { id: 'laminate', label: 'Ламинат', emoji: '🪵' },
  { id: 'parquet', label: 'Паркет', emoji: '🌳' },
  { id: 'marble', label: 'Мрамор', emoji: '💎' },
  { id: 'granite', label: 'Гранит', emoji: '⛰️' },
  { id: 'fabric', label: 'Матъа', emoji: '🧵' },
  { id: 'metal', label: 'Металл', emoji: '🔩' },
]

const ROOM_SURFACES = [
  { id: 'walls', label: 'Девор', emoji: '📐' },
  { id: 'floor', label: 'Пол', emoji: '⬜' },
  { id: 'ceiling', label: 'Шифт', emoji: '☁️' },
]

export default function TextureSelectionScreen({ navigation }: any) {
  const activeRoom = useAppStore((state) => state.activeRoom)
  const wallFinishes = useAppStore((state) => state.wallFinishes)
  const setWallFinish = useAppStore((state) => state.setWallFinish)

  const [selectedCategory, setSelectedCategory] = useState<string>('paint')
  const [selectedSurface, setSelectedSurface] = useState<string>('walls')
  const [textures, setTextures] = useState<TextureItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTexture, setSelectedTexture] = useState<TextureItem | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<string>('')
  const [quantity, setQuantity] = useState(1)
  const [previewWalls, setPreviewWalls] = useState(true)

  useEffect(() => {
    loadTextures()
  }, [selectedCategory])

  const loadTextures = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get('/materials', {
        params: { type: selectedCategory },
      })
      setTextures(response.data.data || [])
    } catch (err: any) {
      setError(err.response?.data?.error || '材料 юклашда хатолик')
    } finally {
      setLoading(false)
    }
  }

  const handleApplyTexture = () => {
    if (!selectedTexture || !activeRoom) return

    try {
      setWallFinish(selectedSurface, {
        id: selectedTexture.id,
        type: selectedTexture.type as any,
        name: selectedTexture.name,
        color: selectedVariant || selectedTexture.color,
        pattern: selectedTexture.pattern,
        image_url: selectedTexture.image_url,
      })

      Alert.alert('Сўрови', `${selectedTexture.name} қўлланилди`)
      setShowModal(false)
      setSelectedTexture(null)
      setSelectedVariant('')
      setQuantity(1)
    } catch (err) {
      Alert.alert('Хатолик', 'Материални қўллашда хатолик')
    }
  }

  const calculateCost = () => {
    if (!selectedTexture || !activeRoom) return 0
    const area = activeRoom.floor_area || 0
    return Math.ceil((area / selectedTexture.coverage) * selectedTexture.price)
  }

  const renderTextureCard = ({ item }: { item: TextureItem }) => (
    <TouchableOpacity
      onPress={() => {
        setSelectedTexture(item)
        setSelectedVariant(item.color || '')
        setShowModal(true)
      }}
      className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-3"
    >
      <View className="flex-row">
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            className="w-20 h-20 bg-gray-100"
            resizeMode="cover"
          />
        ) : (
          <View className="w-20 h-20 bg-gradient-to-br from-gray-200 to-gray-300 items-center justify-center">
            <Text className="text-2xl">📦</Text>
          </View>
        )}
        <View className="flex-1 p-3 justify-between">
          <View>
            <Text className="font-semibold text-gray-900 text-sm">
              {item.name}
            </Text>
            {item.color && (
              <Text className="text-xs text-gray-600 mt-1">{item.color}</Text>
            )}
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-gray-500">
              {item.coverage}м² / уп
            </Text>
            <Text className="font-bold text-blue-600">
              {item.price.toLocaleString()} сўм
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-200 px-4 py-4">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mb-3">
          <Text className="text-blue-600 font-semibold">← Орқага</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-gray-900">
          Бўйоқ ва материал
        </Text>
        <Text className="text-sm text-gray-600 mt-1">
          Хонанизнинг сўрфасларини безатинг
        </Text>
      </View>

      {/* Surface Selection */}
      <View className="bg-white border-b border-gray-200 px-4 py-3">
        <Text className="text-xs font-semibold text-gray-600 mb-2">
          СУТКА ҚАЙСИ ЖОЙИ?
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {ROOM_SURFACES.map((surface) => (
              <TouchableOpacity
                key={surface.id}
                onPress={() => setSelectedSurface(surface.id)}
                className={`px-4 py-2 rounded-full flex-row items-center gap-2 ${
                  selectedSurface === surface.id
                    ? 'bg-blue-600'
                    : 'bg-gray-100'
                }`}
              >
                <Text className="text-lg">{surface.emoji}</Text>
                <Text
                  className={`font-semibold text-sm ${
                    selectedSurface === surface.id
                      ? 'text-white'
                      : 'text-gray-700'
                  }`}
                >
                  {surface.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Material Type Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="bg-white border-b border-gray-200"
      >
        <View className="px-4 flex-row gap-2 py-3">
          {TEXTURE_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setSelectedCategory(cat.id)}
              className={`px-3 py-2 rounded-full flex-row items-center gap-1 ${
                selectedCategory === cat.id
                  ? 'bg-blue-600'
                  : 'bg-gray-100'
              }`}
            >
              <Text className="text-base">{cat.emoji}</Text>
              <Text
                className={`font-semibold text-xs ${
                  selectedCategory === cat.id
                    ? 'text-white'
                    : 'text-gray-700'
                }`}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563eb" />
          <Text className="text-gray-600 mt-3">Юклинмоқда...</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-red-600 font-semibold text-center">{error}</Text>
          <TouchableOpacity
            onPress={loadTextures}
            className="mt-4 bg-blue-600 px-6 py-2 rounded-lg"
          >
            <Text className="text-white font-semibold">Қайта уринг</Text>
          </TouchableOpacity>
        </View>
      ) : textures.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-2xl mb-2">📦</Text>
          <Text className="text-gray-600 text-center">
            Бу материалда элемент йўқ
          </Text>
        </View>
      ) : (
        <FlatList
          data={textures}
          renderItem={renderTextureCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
          scrollEnabled={true}
        />
      )}

      {/* Texture Detail Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50">
          <View className="bg-white rounded-t-3xl mt-auto max-h-[85%]">
            {/* Modal Header */}
            <View className="flex-row items-center justify-between px-4 py-4 border-b border-gray-200">
              <View className="flex-1">
                <Text className="text-lg font-bold text-gray-900">
                  {selectedTexture?.name}
                </Text>
                {selectedSurface && (
                  <Text className="text-xs text-gray-600 mt-1">
                    {ROOM_SURFACES.find((s) => s.id === selectedSurface)?.label}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text className="text-2xl text-gray-400">✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="px-4 py-4">
              {/* Preview Image */}
              {selectedTexture?.image_url ? (
                <Image
                  source={{ uri: selectedTexture.image_url }}
                  className="w-full h-40 bg-gray-100 rounded-lg mb-4"
                  resizeMode="cover"
                />
              ) : (
                <View className="w-full h-40 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg items-center justify-center mb-4">
                  <Text className="text-5xl">🎨</Text>
                </View>
              )}

              {/* Material Details */}
              <View className="bg-gray-50 rounded-lg p-4 mb-4">
                <Text className="font-bold text-gray-900 mb-3">
                  Маълумот
                </Text>
                <View className="gap-2">
                  <View className="flex-row justify-between">
                    <Text className="text-gray-600">Намуна</Text>
                    <Text className="font-semibold text-gray-900">
                      {selectedTexture?.pattern || 'Йўқ'}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-gray-600">Қопламанинг майдони</Text>
                    <Text className="font-semibold text-gray-900">
                      {selectedTexture?.coverage}м²
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-gray-600">Бирлик нархи</Text>
                    <Text className="font-semibold text-gray-900">
                      {selectedTexture?.price.toLocaleString()} сўм
                    </Text>
                  </View>
                </View>
              </View>

              {/* Color/Variant Selection */}
              {selectedTexture && selectedTexture.type !== 'paint' && (
                <View className="mb-4">
                  <Text className="font-bold text-gray-900 mb-3">
                    Турлари
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {['Стандарт', 'Люкс', 'Премиум'].map((variant) => (
                      <TouchableOpacity
                        key={variant}
                        onPress={() => setSelectedVariant(variant)}
                        className={`px-4 py-2 rounded-full border-2 ${
                          selectedVariant === variant
                            ? 'bg-blue-100 border-blue-600'
                            : 'bg-gray-100 border-gray-300'
                        }`}
                      >
                        <Text
                          className={`font-semibold text-sm ${
                            selectedVariant === variant
                              ? 'text-blue-600'
                              : 'text-gray-700'
                          }`}
                        >
                          {variant}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Quantity */}
              <View className="mb-4">
                <Text className="font-bold text-gray-900 mb-3">
                  Қимматини сон сифатида
                </Text>
                <View className="flex-row items-center gap-3 bg-gray-50 rounded-lg p-3">
                  <TouchableOpacity
                    onPress={() => setQuantity(Math.max(1, quantity - 1))}
                    className="bg-white rounded-lg w-10 h-10 items-center justify-center border border-gray-200"
                  >
                    <Text className="text-lg font-bold text-gray-900">−</Text>
                  </TouchableOpacity>
                  <Text className="flex-1 text-center font-bold text-gray-900 text-lg">
                    {quantity}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setQuantity(quantity + 1)}
                    className="bg-white rounded-lg w-10 h-10 items-center justify-center border border-gray-200"
                  >
                    <Text className="text-lg font-bold text-gray-900">+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Cost Calculation */}
              <View className="bg-green-50 rounded-lg p-4 border border-green-200 mb-4">
                <Text className="text-xs text-green-600 mb-1">ЖАМИ НАРХ</Text>
                <Text className="text-3xl font-bold text-green-600">
                  {calculateCost().toLocaleString()} сўм
                </Text>
                <Text className="text-xs text-green-600 mt-2">
                  {quantity} × {selectedTexture?.coverage}м² = ≈{' '}
                  {(quantity * (selectedTexture?.coverage || 0)).toFixed(1)}м²
                </Text>
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View className="px-4 py-4 gap-3 border-t border-gray-200 bg-white">
              <TouchableOpacity
                onPress={handleApplyTexture}
                className="bg-blue-600 rounded-lg py-4 items-center"
              >
                <Text className="font-bold text-white text-lg">
                  Қўллан ✓
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                className="border border-gray-300 rounded-lg py-4 items-center"
              >
                <Text className="font-semibold text-gray-900">Бекор қил</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}
