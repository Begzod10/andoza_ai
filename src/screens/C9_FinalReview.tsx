import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  Linking,
} from 'react-native'
import { useAppStore } from '../store/appStore'
import apiClient from '../config/api'
import { Estimate, EstimateLine } from '../types'

interface ProjectSummary {
  room: any
  furniture_count: number
  materials: any[]
  total_area: number
  estimated_cost: number
  estimate: Estimate
}

export default function FinalReviewScreen({ navigation }: any) {
  const activeRoom = useAppStore((state) => state.activeRoom)
  const activeProject = useAppStore((state) => state.activeProject)
  const placedFurniture = useAppStore((state) => state.placedFurniture)
  const wallFinishes = useAppStore((state) => state.wallFinishes)

  const [summary, setSummary] = useState<ProjectSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    summary: true,
    furniture: true,
    materials: true,
    estimate: true,
  })

  useEffect(() => {
    loadProjectSummary()
  }, [placedFurniture, wallFinishes])

  const loadProjectSummary = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get(
        `/rooms/${activeRoom?.id}/project-summary`
      )
      setSummary(response.data.data)
    } catch (error) {
      console.error('Сўмма юклашда хатолик:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleGeneratePDF = async () => {
    try {
      setGenerating(true)
      const response = await apiClient.post(
        `/rooms/${activeRoom?.id}/estimate/pdf`,
        {
          project_name: activeProject?.name,
          room_name: activeRoom?.name,
        },
        {
          responseType: 'blob',
        }
      )

      // Create a downloadable link
      const url = URL.createObjectURL(response.data)
      await Linking.openURL(url)
      Alert.alert('Сўрови', 'PDF юкланди')
    } catch (error: any) {
      Alert.alert('Хатолик', error.response?.data?.error || 'PDF юклашда хатолик')
    } finally {
      setGenerating(false)
    }
  }

  const handleShareProject = async () => {
    try {
      const message = `
🏠 ${activeProject?.name}
📍 ${activeRoom?.name}

💰 Жами нарх: ${summary?.estimated_cost.toLocaleString()} сўм
🛋️ Мебелнинг сони: ${summary?.furniture_count}
📐 Жалпи майдон: ${summary?.total_area}м²

UyTa'mir • Ремонт планирования ва сметалашни ўз қўлида
      `.trim()

      await Share.share({
        message,
        title: `${activeProject?.name} - ${activeRoom?.name}`,
      })
    } catch (error) {
      console.error('Улашда хатолик:', error)
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="text-gray-600 mt-3">Юклинмоқда...</Text>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-200 px-4 py-4">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mb-3">
          <Text className="text-blue-600 font-semibold">← Орқага</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-gray-900">
          Лойиханинг ишчи кўриниши
        </Text>
        <Text className="text-sm text-gray-600 mt-1">
          Сўрови ва ҳамма жиҳатлари
        </Text>
      </View>

      <ScrollView className="flex-1 px-4 py-4">
        {/* Quick Stats */}
        <View className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg p-4 mb-4 text-white">
          <View className="flex-row justify-between mb-3">
            <View>
              <Text className="text-white/80 text-xs mb-1">ЖАМИ НАРХ</Text>
              <Text className="text-3xl font-bold text-white">
                {summary?.estimated_cost.toLocaleString()} сўм
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-white/80 text-xs mb-1">ЖАЛПИ МАЙДОН</Text>
              <Text className="text-2xl font-bold text-white">
                {summary?.total_area}м²
              </Text>
            </View>
          </View>
          <View className="bg-white/20 h-1 rounded-full" />
          <View className="flex-row justify-between mt-3">
            <View>
              <Text className="text-white/70 text-xs">Лойиха</Text>
              <Text className="text-white font-semibold text-sm">
                {activeProject?.name}
              </Text>
            </View>
            <View>
              <Text className="text-white/70 text-xs">Хона</Text>
              <Text className="text-white font-semibold text-sm">
                {activeRoom?.name}
              </Text>
            </View>
          </View>
        </View>

        {/* Summary Section */}
        <View className="bg-white rounded-lg border border-gray-200 mb-4 overflow-hidden">
          <TouchableOpacity
            onPress={() => toggleSection('summary')}
            className="px-4 py-3 flex-row items-center justify-between border-b border-gray-200"
          >
            <Text className="font-bold text-gray-900">📊 Сўмма</Text>
            <Text className="text-gray-500">
              {expandedSections.summary ? '▼' : '▶'}
            </Text>
          </TouchableOpacity>
          {expandedSections.summary && (
            <View className="px-4 py-3 gap-3">
              <View className="flex-row justify-between py-2 border-b border-gray-100">
                <Text className="text-gray-600">Хонанинг бўйи</Text>
                <Text className="font-semibold text-gray-900">
                  {activeRoom?.ceiling_h}mm
                </Text>
              </View>
              <View className="flex-row justify-between py-2 border-b border-gray-100">
                <Text className="text-gray-600">Жалпи майдон</Text>
                <Text className="font-semibold text-gray-900">
                  {activeRoom?.floor_area || summary?.total_area}м²
                </Text>
              </View>
              <View className="flex-row justify-between py-2 border-b border-gray-100">
                <Text className="text-gray-600">Девор майдони (саф)</Text>
                <Text className="font-semibold text-gray-900">
                  {activeRoom?.net_wall_area || 0}м²
                </Text>
              </View>
              <View className="flex-row justify-between py-2">
                <Text className="text-gray-600">Периметр</Text>
                <Text className="font-semibold text-gray-900">
                  {activeRoom?.perimeter || 0}m
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Furniture Section */}
        <View className="bg-white rounded-lg border border-gray-200 mb-4 overflow-hidden">
          <TouchableOpacity
            onPress={() => toggleSection('furniture')}
            className="px-4 py-3 flex-row items-center justify-between border-b border-gray-200"
          >
            <View className="flex-row items-center gap-2">
              <Text className="font-bold text-gray-900">🛋️ Мебел</Text>
              <View className="bg-blue-100 rounded-full px-2 py-1">
                <Text className="text-blue-600 text-xs font-semibold">
                  {summary?.furniture_count || 0}
                </Text>
              </View>
            </View>
            <Text className="text-gray-500">
              {expandedSections.furniture ? '▼' : '▶'}
            </Text>
          </TouchableOpacity>
          {expandedSections.furniture && (
            <View className="px-4 py-3">
              {placedFurniture.length === 0 ? (
                <Text className="text-gray-600 text-center py-4">
                  Мебел қўшилмаган
                </Text>
              ) : (
                placedFurniture.map((item, index) => (
                  <View
                    key={item.id}
                    className={`py-2 ${
                      index < placedFurniture.length - 1
                        ? 'border-b border-gray-100'
                        : ''
                    }`}
                  >
                    <Text className="font-semibold text-gray-900">
                      {index + 1}. {item.furniture_id}
                    </Text>
                    <View className="flex-row gap-4 mt-1">
                      <View>
                        <Text className="text-xs text-gray-600">Жойлашув</Text>
                        <Text className="text-sm text-gray-700">
                          X: {Math.round(item.position.x)}см, Y:{' '}
                          {Math.round(item.position.y)}см
                        </Text>
                      </View>
                      <View>
                        <Text className="text-xs text-gray-600">Айланиш</Text>
                        <Text className="text-sm text-gray-700">
                          {Math.round(item.rotation)}°
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        {/* Materials Section */}
        <View className="bg-white rounded-lg border border-gray-200 mb-4 overflow-hidden">
          <TouchableOpacity
            onPress={() => toggleSection('materials')}
            className="px-4 py-3 flex-row items-center justify-between border-b border-gray-200"
          >
            <View className="flex-row items-center gap-2">
              <Text className="font-bold text-gray-900">🎨 Материалар</Text>
              <View className="bg-purple-100 rounded-full px-2 py-1">
                <Text className="text-purple-600 text-xs font-semibold">
                  {wallFinishes.size}
                </Text>
              </View>
            </View>
            <Text className="text-gray-500">
              {expandedSections.materials ? '▼' : '▶'}
            </Text>
          </TouchableOpacity>
          {expandedSections.materials && (
            <View className="px-4 py-3">
              {wallFinishes.size === 0 ? (
                <Text className="text-gray-600 text-center py-4">
                  Материал сўмма қўшилмаган
                </Text>
              ) : (
                Array.from(wallFinishes.entries()).map(([wallId, material], index) => (
                  <View
                    key={wallId}
                    className={`py-2 ${
                      index < wallFinishes.size - 1
                        ? 'border-b border-gray-100'
                        : ''
                    }`}
                  >
                    <Text className="font-semibold text-gray-900">
                      {material.name}
                    </Text>
                    <View className="flex-row gap-2 mt-1">
                      {material.color && (
                        <View className="flex-row items-center gap-1">
                          <View
                            className="w-4 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: material.color }}
                          />
                          <Text className="text-xs text-gray-600">
                            {material.color}
                          </Text>
                        </View>
                      )}
                      {material.pattern && (
                        <Text className="text-xs text-gray-600">
                          📐 {material.pattern}
                        </Text>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        {/* Estimate Section */}
        <View className="bg-white rounded-lg border border-gray-200 mb-4 overflow-hidden">
          <TouchableOpacity
            onPress={() => toggleSection('estimate')}
            className="px-4 py-3 flex-row items-center justify-between border-b border-gray-200"
          >
            <Text className="font-bold text-gray-900">💰 Сметалаш</Text>
            <Text className="text-gray-500">
              {expandedSections.estimate ? '▼' : '▶'}
            </Text>
          </TouchableOpacity>
          {expandedSections.estimate && (
            <View className="px-4 py-3">
              {summary?.estimate?.lines && summary.estimate.lines.length > 0 ? (
                <>
                  {summary.estimate.lines.map((line: EstimateLine, index: number) => (
                    <View
                      key={line.id}
                      className={`py-3 ${
                        index < summary.estimate.lines.length - 1
                          ? 'border-b border-gray-100'
                          : 'border-b border-gray-300'
                      }`}
                    >
                      <View className="flex-row justify-between mb-1">
                        <Text className="text-gray-900 flex-1 font-semibold text-sm">
                          {line.description}
                        </Text>
                        <Text className="font-bold text-gray-900">
                          {line.total.toLocaleString()} сўм
                        </Text>
                      </View>
                      <Text className="text-xs text-gray-600">
                        {line.quantity} {line.unit} × {line.unit_price.toLocaleString()} сўм
                      </Text>
                    </View>
                  ))}

                  {/* Totals */}
                  <View className="py-3 mt-2">
                    <View className="flex-row justify-between py-2">
                      <Text className="text-gray-600">Қисм жамасы</Text>
                      <Text className="font-semibold text-gray-900">
                        {summary.estimate.subtotal.toLocaleString()} сўм
                      </Text>
                    </View>
                    {summary.estimate.tax && (
                      <View className="flex-row justify-between py-2 border-b border-gray-100">
                        <Text className="text-gray-600">Сўсти қўшимчаси</Text>
                        <Text className="font-semibold text-gray-900">
                          {summary.estimate.tax.toLocaleString()} сўм
                        </Text>
                      </View>
                    )}
                    <View className="flex-row justify-between py-3 bg-blue-50 px-3 rounded-lg mt-2">
                      <Text className="font-bold text-gray-900">ЖАМИ</Text>
                      <Text className="font-bold text-blue-600 text-lg">
                        {summary.estimate.total.toLocaleString()} сўм
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <Text className="text-gray-600 text-center py-4">
                  Сметалиш йўқ
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View className="px-4 py-4 gap-3 bg-white border-t border-gray-200">
        <TouchableOpacity
          onPress={handleGeneratePDF}
          disabled={generating}
          className="bg-green-600 rounded-lg py-4 items-center flex-row justify-center gap-2"
        >
          {generating ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <Text className="text-lg">📄</Text>
              <Text className="font-bold text-white">PDF юклаш</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleShareProject}
          className="bg-blue-600 rounded-lg py-4 items-center flex-row justify-center gap-2"
        >
          <Text className="text-lg">📤</Text>
          <Text className="font-bold text-white">Улаш</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="border border-gray-300 rounded-lg py-4 items-center"
        >
          <Text className="font-semibold text-gray-900">Бекор қил</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
