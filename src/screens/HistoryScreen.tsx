import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native'
import { useAppStore } from '../store/appStore'

interface HistoryItem {
  id: string
  projectName: string
  roomName: string
  status: 'draft' | 'completed' | 'in-progress'
  estimatedCost: number
  createdDate: Date
  completedDate?: Date
  roomDimensions?: {
    length: number
    width: number
    height: number
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
      return { bg: 'bg-green-100', text: 'text-green-700', label: '✓ Yakunlangan' }
    case 'in-progress':
      return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '⟳ Jarayonda' }
    case 'draft':
      return { bg: 'bg-gray-100', text: 'text-gray-700', label: '📝 Qoralama' }
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-700', label: '?' }
  }
}

interface HistoryCardProps {
  item: HistoryItem
  onViewDetails: (item: HistoryItem) => void
  onExportProject: (item: HistoryItem) => void
}

function HistoryCard({ item, onViewDetails, onExportProject }: HistoryCardProps) {
  const statusColor = getStatusColor(item.status)
  const daysAgo = Math.floor(
    (new Date().getTime() - item.createdDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  return (
    <TouchableOpacity
      onPress={() => onViewDetails(item)}
      className="bg-white border border-gray-200 rounded-lg p-4 mb-3"
    >
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-1">
          <Text className="text-lg font-bold text-gray-900 mb-1">
            {item.projectName}
          </Text>
          <Text className="text-sm text-gray-600">🚪 {item.roomName}</Text>
        </View>
        <View className={`px-3 py-1 rounded-full ${statusColor.bg}`}>
          <Text className={`text-xs font-semibold ${statusColor.text}`}>
            {statusColor.label}
          </Text>
        </View>
      </View>

      {/* Room Dimensions */}
      {item.roomDimensions && (
        <View className="bg-gray-50 p-3 rounded-lg mb-3">
          <Text className="text-xs font-semibold text-gray-600 mb-2">
            📐 Xona o'lchamlari
          </Text>
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-700">
              {item.roomDimensions.length}m × {item.roomDimensions.width}m ×{' '}
              {item.roomDimensions.height}m
            </Text>
            <Text className="text-sm text-gray-500">
              {Math.round(
                item.roomDimensions.length * item.roomDimensions.width
              )} m²
            </Text>
          </View>
        </View>
      )}

      {/* Cost & Date */}
      <View className="flex-row justify-between items-center mb-3">
        <View>
          <Text className="text-xs text-gray-500">💰 Taxmini summa</Text>
          <Text className="text-lg font-bold text-blue-600">
            {item.estimatedCost.toLocaleString('uz-UZ')} so'm
          </Text>
        </View>
        <View className="text-right">
          <Text className="text-xs text-gray-500">📅 {daysAgo} kun oldin</Text>
          {item.completedDate && (
            <Text className="text-xs text-green-600 mt-1">
              ✓ Yakunlandi: {item.completedDate.toLocaleDateString('uz-UZ')}
            </Text>
          )}
        </View>
      </View>

      {/* Actions */}
      <View className="flex-row gap-2 pt-3 border-t border-gray-100">
        <TouchableOpacity
          onPress={() => onViewDetails(item)}
          className="flex-1 bg-blue-50 py-2 rounded-lg"
        >
          <Text className="text-center text-blue-600 font-semibold text-sm">
            Ko'rish
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onExportProject(item)}
          className="flex-1 bg-gray-100 py-2 rounded-lg"
        >
          <Text className="text-center text-gray-700 font-semibold text-sm">
            Yuklab olish
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
}

export default function HistoryScreen({ navigation }: any) {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'draft' | 'completed' | 'in-progress'>('all')

  const projects = useAppStore((state) => state.projects)
  const activeRoom = useAppStore((state) => state.activeRoom)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1200))

      const mockHistory: HistoryItem[] = [
        {
          id: '1',
          projectName: 'Shaharif Qaromat viloyati, Uchtepa',
          roomName: 'Yotoqxona',
          status: 'completed',
          estimatedCost: 6250000,
          createdDate: new Date('2024-11-01'),
          completedDate: new Date('2024-12-15'),
          roomDimensions: { length: 4.5, width: 3.8, height: 2.8 },
        },
        {
          id: '2',
          projectName: 'Yunusabad, 5-qavat',
          roomName: 'Mehmonxona',
          status: 'in-progress',
          estimatedCost: 8500000,
          createdDate: new Date('2024-12-01'),
          roomDimensions: { length: 5.2, width: 4.5, height: 2.9 },
        },
        {
          id: '3',
          projectName: "Mirzo Ulug'bek, Yangi uy",
          roomName: 'Oshxona',
          status: 'draft',
          estimatedCost: 4750000,
          createdDate: new Date('2024-12-20'),
          roomDimensions: { length: 4.0, width: 3.2, height: 2.75 },
        },
        {
          id: '4',
          projectName: 'Chilonzor, 3-qavat',
          roomName: 'Vanna xonasi',
          status: 'completed',
          estimatedCost: 3200000,
          createdDate: new Date('2024-10-15'),
          completedDate: new Date('2024-11-20'),
          roomDimensions: { length: 2.5, width: 2.2, height: 2.7 },
        },
        {
          id: '5',
          projectName: 'Sergeli, Townhome',
          roomName: 'Koridori',
          status: 'completed',
          estimatedCost: 1850000,
          createdDate: new Date('2024-09-20'),
          completedDate: new Date('2024-10-10'),
          roomDimensions: { length: 3.8, width: 1.5, height: 2.8 },
        },
      ]

      setHistory(mockHistory)
      setLoading(false)
    } catch (error) {
      setLoading(false)
      Alert.alert('Xato', "Tarixni yuklashda xato yuz berdi. Iltimos, qayta urinib ko'ring.")
    }
  }

  const filteredHistory = history.filter((item) => {
    if (filter === 'all') return true
    return item.status === filter
  })

  const handleViewDetails = (item: HistoryItem) => {
    navigation.navigate('Projects', { projectId: item.id })
  }

  const handleExportProject = (item: HistoryItem) => {
    Alert.alert(
      'Eksport',
      `"${item.projectName}" - "${item.roomName}" eksport qilinmoqda...`,
      [
        { text: 'Bekor qilish' },
        { text: 'PDF sifatida', onPress: () => {} },
        { text: 'Rasm sifatida', onPress: () => {} },
      ]
    )
  }

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#0066cc" />
        <Text className="mt-4 text-gray-600">Tarix yuklaniyor...</Text>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-6 bg-blue-600">
        <Text className="text-2xl font-bold text-white">Tarix</Text>
        <Text className="text-blue-100 text-sm mt-1">
          Oldingi loyihalaringiz va taxminlar
        </Text>
      </View>

      {/* Filter Tabs */}
      <View className="px-4 py-4 flex-row gap-2 bg-gray-50 border-b border-gray-200">
        {[
          { id: 'all', label: 'Barchasi', count: history.length },
          {
            id: 'draft',
            label: 'Qoralama',
            count: history.filter((h) => h.status === 'draft').length,
          },
          {
            id: 'in-progress',
            label: 'Jarayonda',
            count: history.filter((h) => h.status === 'in-progress').length,
          },
          {
            id: 'completed',
            label: 'Yakunlangan',
            count: history.filter((h) => h.status === 'completed').length,
          },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            onPress={() =>
              setFilter(tab.id as 'all' | 'draft' | 'completed' | 'in-progress')
            }
            className={`px-3 py-2 rounded-full ${
              filter === tab.id
                ? 'bg-blue-600'
                : 'bg-white border border-gray-300'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                filter === tab.id ? 'text-white' : 'text-gray-600'
              }`}
            >
              {tab.label} ({tab.count})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {filteredHistory.length === 0 ? (
        <View className="flex-1 justify-center items-center px-4">
          <Text className="text-5xl mb-4">📭</Text>
          <Text className="text-xl font-semibold text-gray-900 mb-2">
            Hozircha loyiha yo'q
          </Text>
          <Text className="text-gray-600 text-center mb-6">
            Yangi loyihani yaratib, xona o'lchamlarini oling
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Projects')}
            className="bg-blue-600 px-8 py-3 rounded-lg"
          >
            <Text className="text-white font-semibold">+ Yangi loyiha</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredHistory}
          renderItem={({ item }) => (
            <HistoryCard
              item={item}
              onViewDetails={handleViewDetails}
              onExportProject={handleExportProject}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          scrollEnabled={true}
        />
      )}

      {/* Summary Card */}
      {filteredHistory.length > 0 && (
        <View className="border-t border-gray-200 px-4 py-4">
          <View className="bg-gradient-to-r from-blue-50 to-cyan-50 p-4 rounded-lg border border-blue-200">
            <Text className="text-sm font-semibold text-gray-600 mb-2">
              📊 Umumiy statistika
            </Text>
            <View className="flex-row justify-between">
              <View>
                <Text className="text-2xl font-bold text-blue-600">
                  {filteredHistory.length}
                </Text>
                <Text className="text-xs text-gray-600 mt-1">Loyihalar</Text>
              </View>
              <View>
                <Text className="text-2xl font-bold text-green-600">
                  {filteredHistory
                    .reduce((sum, item) => sum + item.estimatedCost, 0)
                    .toLocaleString('uz-UZ', { maximumFractionDigits: 0 })}
                </Text>
                <Text className="text-xs text-gray-600 mt-1">Jami sum</Text>
              </View>
              <View>
                <Text className="text-2xl font-bold text-purple-600">
                  {filteredHistory.filter((h) => h.status === 'completed').length}
                </Text>
                <Text className="text-xs text-gray-600 mt-1">Yakunlangan</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
