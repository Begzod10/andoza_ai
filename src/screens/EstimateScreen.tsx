import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native'
import { useAppStore } from '../store/appStore'

interface EstimateLine {
  id: string
  category: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
}

interface EstimateData {
  materials: EstimateLine[]
  labor: EstimateLine[]
  other: EstimateLine[]
  subtotal: number
  vat: number
  total: number
}

interface CategorySectionProps {
  title: string
  items: EstimateLine[]
  categoryId: string
  isExpanded: boolean
  onToggle: (categoryId: string) => void
}

function CategorySection({
  title,
  items,
  categoryId,
  isExpanded,
  onToggle,
}: CategorySectionProps) {
  const categoryTotal = items.reduce((sum, item) => sum + item.total, 0)

  return (
    <View className="mb-4 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
      <TouchableOpacity
        onPress={() => onToggle(categoryId)}
        className="px-4 py-4 flex-row justify-between items-center bg-gray-100"
      >
        <View className="flex-1">
          <Text className="font-bold text-gray-900">{title}</Text>
          <Text className="text-xs text-gray-600 mt-1">
            {items.length} yozuv
          </Text>
        </View>
        <View className="items-end">
          <Text className="font-bold text-blue-600">
            {categoryTotal.toLocaleString('uz-UZ')} so'm
          </Text>
          <Text className="text-lg text-gray-400">
            {isExpanded ? '▼' : '▶'}
          </Text>
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View className="px-4 py-4 space-y-3">
          {items.map((item) => (
            <View key={item.id} className="border-b border-gray-200 pb-3">
              <View className="flex-row justify-between items-start mb-2">
                <Text className="font-semibold text-gray-900 flex-1">
                  {item.description}
                </Text>
                <Text className="font-bold text-blue-600 ml-2">
                  {item.total.toLocaleString('uz-UZ')} so'm
                </Text>
              </View>
              <View className="flex-row justify-between text-xs text-gray-500">
                <Text>
                  {item.quantity} {item.unit} × {item.unitPrice.toLocaleString('uz-UZ')} so'm
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

export default function EstimateScreen({ navigation }: any) {
  const [estimate, setEstimate] = useState<EstimateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedCategory, setExpandedCategory] = useState<string | null>('materials')

  const activeRoom = useAppStore((state) => state.activeRoom)
  const activeProject = useAppStore((state) => state.activeProject)

  useEffect(() => {
    loadEstimate()
  }, [])

  const loadEstimate = async () => {
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500))

      const mockEstimate: EstimateData = {
        materials: [
          {
            id: '1',
            category: 'Qurilish materiallari',
            description: 'Qum 25 kg',
            quantity: 4,
            unit: 'qop',
            unitPrice: 15000,
            total: 60000,
          },
          {
            id: '2',
            category: 'Qurilish materiallari',
            description: 'Tsement 25 kg',
            quantity: 3,
            unit: 'qop',
            unitPrice: 20000,
            total: 60000,
          },
          {
            id: '3',
            category: 'Qurilish materiallari',
            description: 'Shurkeli aralama',
            quantity: 50,
            unit: 'kg',
            unitPrice: 2000,
            total: 100000,
          },
          {
            id: '4',
            category: "Bo'yoq va antiseptik",
            description: "Ekologik bo'yoq (10L)",
            quantity: 2,
            unit: 'dona',
            unitPrice: 250000,
            total: 500000,
          },
          {
            id: '5',
            category: "Bo'yoq va antiseptik",
            description: 'Kuch beruvchi antiseptik',
            quantity: 1,
            unit: 'dona',
            unitPrice: 80000,
            total: 80000,
          },
        ],
        labor: [
          {
            id: '6',
            category: 'Mehnat',
            description: 'Devor tayyorlash va plastering',
            quantity: 25,
            unit: 'm²',
            unitPrice: 50000,
            total: 1250000,
          },
          {
            id: '7',
            category: 'Mehnat',
            description: "Bo'yash ishlari",
            quantity: 25,
            unit: 'm²',
            unitPrice: 30000,
            total: 750000,
          },
          {
            id: '8',
            category: 'Mehnat',
            description: "Pol qo'yish",
            quantity: 25,
            unit: 'm²',
            unitPrice: 100000,
            total: 2500000,
          },
        ],
        other: [
          {
            id: '9',
            category: 'Boshqa',
            description: 'Transport xizmatlari',
            quantity: 1,
            unit: 'dona',
            unitPrice: 200000,
            total: 200000,
          },
          {
            id: '10',
            category: 'Boshqa',
            description: 'Loyihachilik va monitoring',
            quantity: 1,
            unit: 'dona',
            unitPrice: 150000,
            total: 150000,
          },
        ],
        subtotal: 5650000,
        vat: 565000,
        total: 6215000,
      }

      setEstimate(mockEstimate)
      setLoading(false)
    } catch (error) {
      setLoading(false)
      Alert.alert('Xato', "Taxminni yuklashda xato yuz berdi. Iltimos, qayta urinib ko'ring.")
    }
  }

  const handleShare = async () => {
    if (!estimate) return

    try {
      await Share.share({
        message: `Taxmin ${activeProject?.name || 'Loyiha'} - ${activeRoom?.name || 'Xona'}\nJami summa: ${estimate.total.toLocaleString('uz-UZ')} so'm`,
      })
    } catch (error) {
      Alert.alert('Xato', "Ulashishda xato yuz berdi")
    }
  }

  const handleExport = () => {
    // In a real app, this would generate and share a PDF
    Alert.alert('Eksport', 'PDF sifatida yuklab olish (real ilovada amalga oshiriladi)')
  }

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#0066cc" />
        <Text className="mt-4 text-gray-600">Taxmin hisoblaniyor...</Text>
      </View>
    )
  }

  if (!estimate) {
    return (
      <View className="flex-1 justify-center items-center bg-white px-4">
        <Text className="text-5xl mb-4">⚠️</Text>
        <Text className="text-xl font-semibold text-gray-900 mb-2">
          Xato yuz berdi
        </Text>
        <Text className="text-gray-600 text-center mb-6">
          Taxminni yuklashda xato yuz berdi. Iltimos, qayta urinib ko'ring.
        </Text>
        <TouchableOpacity
          onPress={loadEstimate}
          className="bg-blue-600 px-8 py-3 rounded-lg"
        >
          <Text className="text-white font-semibold">Qayta urinish</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-6 bg-gradient-to-r from-blue-600 to-blue-400">
        <Text className="text-2xl font-bold text-white mb-1">Taxmin</Text>
        <Text className="text-blue-100 text-sm">
          {activeProject?.name || 'Loyiha'} • {activeRoom?.name || 'Xona'}
        </Text>
      </View>

      {/* Content */}
      <ScrollView className="flex-1 px-4 py-6">
        {/* Total Summary Card */}
        <View className="bg-gradient-to-br from-blue-50 to-cyan-50 p-6 rounded-xl border-2 border-blue-200 mb-6">
          <Text className="text-gray-600 text-sm mb-2">Jami summa</Text>
          <Text className="text-4xl font-bold text-blue-600 mb-4">
            {estimate.total.toLocaleString('uz-UZ')} so'm
          </Text>
          <View className="space-y-2 pt-4 border-t border-blue-200">
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Oraliq summa:</Text>
              <Text className="text-gray-900 font-semibold">
                {estimate.subtotal.toLocaleString('uz-UZ')} so'm
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-600">QQS (10%):</Text>
              <Text className="text-gray-900 font-semibold">
                {estimate.vat.toLocaleString('uz-UZ')} so'm
              </Text>
            </View>
          </View>
        </View>

        {/* Timeline */}
        <View className="bg-amber-50 p-4 rounded-lg border border-amber-200 mb-6">
          <Text className="font-semibold text-gray-900 mb-2">⏱ Vaqt behudi</Text>
          <Text className="text-sm text-gray-600">
            Taxminiy vaqt: 15-20 kun (hamma ishlari jumlasida)
          </Text>
          <Text className="text-xs text-gray-500 mt-2">
            Ob-hava va mavjud shartlar asosida o'zgarishi mumkin
          </Text>
        </View>

        {/* Categories */}
        <Text className="font-bold text-gray-900 mb-4 text-lg">Xarajat tafsiloti</Text>

        <CategorySection
          title="🏗️ Qurilish materiallari"
          items={estimate.materials}
          categoryId="materials"
          isExpanded={expandedCategory === 'materials'}
          onToggle={(categoryId) =>
            setExpandedCategory(expandedCategory === categoryId ? null : categoryId)
          }
        />

        <CategorySection
          title="👷 Mehnat xizmatlari"
          items={estimate.labor}
          categoryId="labor"
          isExpanded={expandedCategory === 'labor'}
          onToggle={(categoryId) =>
            setExpandedCategory(expandedCategory === categoryId ? null : categoryId)
          }
        />

        <CategorySection
          title="📦 Boshqa xarajatlar"
          items={estimate.other}
          categoryId="other"
          isExpanded={expandedCategory === 'other'}
          onToggle={(categoryId) =>
            setExpandedCategory(expandedCategory === categoryId ? null : categoryId)
          }
        />

        {/* Notes */}
        <View className="bg-gray-100 p-4 rounded-lg mb-6 border border-gray-300">
          <Text className="font-semibold text-gray-900 mb-2">📝 Shartlar</Text>
          <Text className="text-sm text-gray-600 leading-5">
            • Narxlar o'z vaqtidagi bozor qiymatiga asoslangan{'\n'}• Tovar yetkazish
            xizmasi qo'shildi{'\n'}• Mashinali ishlar qo'shildi{'\n'}• 10% QQS qo'shildi
          </Text>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View className="border-t border-gray-200 px-4 py-4 space-y-3">
        <TouchableOpacity
          onPress={handleExport}
          className="bg-green-600 py-4 rounded-lg flex-row justify-center items-center"
        >
          <Text className="text-white font-bold text-lg">📄 PDF sifatida yuklab olish</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleShare}
          className="bg-blue-600 py-4 rounded-lg flex-row justify-center items-center"
        >
          <Text className="text-white font-bold text-lg">📤 Ulashish</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="bg-gray-300 py-3 rounded-lg"
        >
          <Text className="text-center text-gray-700 font-semibold">Orqaga qaytish</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
