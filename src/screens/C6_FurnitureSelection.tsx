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
} from 'react-native'
import { useAppStore } from '../store/appStore'
import apiClient from '../config/api'
import { Furniture } from '../types'

interface FurnitureItem extends Furniture {
  stock: number
  price: number
}

const CATEGORIES = [
  { id: 'mehmonxona', label: 'Mehmonxona', emoji: '🛋️' },
  { id: 'oshxona', label: 'Oshxona', emoji: '🍽️' },
  { id: 'yotoqxona', label: 'Yotoqxona', emoji: '🛏️' },
  { id: 'vanna', label: 'Vanna', emoji: '🚿' },
]

const COLORS = ['#FFFFFF', '#8B4513', '#000000', '#A0826D', '#C0C0C0', '#D4AF37']

export default function FurnitureSelectionScreen({ navigation }: any) {
  const activeRoom = useAppStore((state) => state.activeRoom)
  const addFurniture = useAppStore((state) => state.addFurniture)

  const [selectedCategory, setSelectedCategory] = useState<string>('mehmonxona')
  const [furniture, setFurniture] = useState<FurnitureItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFurniture, setSelectedFurniture] = useState<FurnitureItem | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string>('#FFFFFF')
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    loadFurniture()
  }, [selectedCategory])

  const loadFurniture = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get('/furniture', {
        params: { category: selectedCategory },
      })
      setFurniture(response.data.data || [])
    } catch (err: any) {
      setError(err.response?.data?.error || 'Mebel yuklash xatosi')
    } finally {
      setLoading(false)
    }
  }

  const handleAddFurniture = () => {
    if (!selectedFurniture || !activeRoom) return

    for (let i = 0; i < quantity; i++) {
      addFurniture({
        id: `${selectedFurniture.id}-${Date.now()}-${i}`,
        room_id: activeRoom.id,
        furniture_id: selectedFurniture.id,
        position: { x: 100 + i * 50, y: 100 + i * 50 },
        rotation: 0,
        color: selectedColor,
        placed_at: new Date().toISOString(),
      })
    }

    setShowModal(false)
    setSelectedFurniture(null)
    setSelectedColor('#FFFFFF')
    setQuantity(1)
  }

  const renderFurnitureCard = ({ item }: { item: FurnitureItem }) => (
    <TouchableOpacity
      onPress={() => {
        setSelectedFurniture(item)
        setSelectedColor(item.colors[0] || '#FFFFFF')
        setShowModal(true)
      }}
      className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4 mr-2"
      style={{ width: Dimensions.get('window').width / 2 - 24 }}
    >
      {item.image_url ? (
        <Image
          source={{ uri: item.image_url }}
          className="w-full h-32 bg-gray-100"
          resizeMode="cover"
        />
      ) : (
        <View className="w-full h-32 bg-gradient-to-br from-gray-100 to-gray-200 items-center justify-center">
          <Text className="text-3xl">🛋️</Text>
        </View>
      )}
      <View className="p-3">
        <Text className="font-semibold text-gray-900 text-sm" numberOfLines={2}>
          {item.name}
        </Text>
        <Text className="text-xs text-gray-600 mt-1">
          {item.width}cm × {item.depth}cm × {item.height}cm
        </Text>
        <View className="flex-row items-center justify-between mt-2">
          <Text className="font-bold text-blue-600">
            {item.price.toLocaleString()} сўм
          </Text>
          {item.stock > 0 ? (
            <Text className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
              {item.stock} шт
            </Text>
          ) : (
            <Text className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
              Йўқ
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-200 px-4 py-4">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="mb-3"
        >
          <Text className="text-blue-600 font-semibold">← Орқага</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-gray-900">Мебелни танла</Text>
        <Text className="text-sm text-gray-600 mt-1">
          Ўз хонаңиз учун мебелни қўшинг
        </Text>
      </View>

      {/* Category Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="bg-white border-b border-gray-200">
        <View className="px-4 flex-row gap-2 py-3">
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-full flex-row items-center gap-2 ${
                selectedCategory === cat.id
                  ? 'bg-blue-600'
                  : 'bg-gray-100'
              }`}
            >
              <Text className="text-lg">{cat.emoji}</Text>
              <Text
                className={`font-semibold ${
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
            onPress={loadFurniture}
            className="mt-4 bg-blue-600 px-6 py-2 rounded-lg"
          >
            <Text className="text-white font-semibold">Қайта уринг</Text>
          </TouchableOpacity>
        </View>
      ) : furniture.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-2xl mb-2">📦</Text>
          <Text className="text-gray-600 text-center">
            Бу категорияда мебел йўқ
          </Text>
        </View>
      ) : (
        <FlatList
          data={furniture}
          renderItem={renderFurnitureCard}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ paddingHorizontal: 12, gap: 8 }}
          contentContainerStyle={{ paddingVertical: 12 }}
          scrollEnabled={true}
        />
      )}

      {/* Furniture Detail Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50">
          <View className="bg-white rounded-t-3xl mt-auto max-h-[85%]">
            {/* Modal Header */}
            <View className="flex-row items-center justify-between px-4 py-4 border-b border-gray-200">
              <Text className="text-lg font-bold text-gray-900">
                {selectedFurniture?.name}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text className="text-2xl text-gray-400">✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="px-4 py-4">
              {/* Image */}
              {selectedFurniture?.image_url ? (
                <Image
                  source={{ uri: selectedFurniture.image_url }}
                  className="w-full h-48 bg-gray-100 rounded-lg mb-4"
                  resizeMode="cover"
                />
              ) : (
                <View className="w-full h-48 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg items-center justify-center mb-4">
                  <Text className="text-5xl">🛋️</Text>
                </View>
              )}

              {/* Specifications */}
              <View className="bg-gray-50 rounded-lg p-4 mb-4">
                <Text className="font-bold text-gray-900 mb-3">Ўлчами</Text>
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="text-xs text-gray-600">Кенглиги</Text>
                    <Text className="font-semibold text-gray-900">
                      {selectedFurniture?.width}cm
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs text-gray-600">Чуқурлиги</Text>
                    <Text className="font-semibold text-gray-900">
                      {selectedFurniture?.depth}cm
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs text-gray-600">Бўйи</Text>
                    <Text className="font-semibold text-gray-900">
                      {selectedFurniture?.height}cm
                    </Text>
                  </View>
                </View>
              </View>

              {/* Color Selection */}
              <View className="mb-4">
                <Text className="font-bold text-gray-900 mb-3">Ранги</Text>
                <View className="flex-row gap-3 flex-wrap">
                  {selectedFurniture?.colors.map((color) => (
                    <TouchableOpacity
                      key={color}
                      onPress={() => setSelectedColor(color)}
                      className={`w-12 h-12 rounded-full border-2 ${
                        selectedColor === color
                          ? 'border-blue-600'
                          : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </View>
              </View>

              {/* Quantity */}
              <View className="mb-4">
                <Text className="font-bold text-gray-900 mb-3">
                  Миқдори
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

              {/* Price */}
              <View className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
                <Text className="text-xs text-blue-600 mb-1">Жами нарх</Text>
                <Text className="text-2xl font-bold text-blue-600">
                  {(selectedFurniture?.price! * quantity).toLocaleString()} сўм
                </Text>
                <Text className="text-xs text-blue-600 mt-1">
                  {quantity} × {selectedFurniture?.price?.toLocaleString()} сўм
                </Text>
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View className="px-4 py-4 gap-3 border-t border-gray-200 bg-white">
              <TouchableOpacity
                onPress={handleAddFurniture}
                className="bg-blue-600 rounded-lg py-4 items-center"
              >
                <Text className="font-bold text-white text-lg">
                  Хонага қўш
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
