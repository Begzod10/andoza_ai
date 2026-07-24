import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  PanResponder,
} from 'react-native'
import { useAppStore } from '../store/appStore'
import { useRoomStateStore } from '../store/roomStateStore'
import { UyTamirTheme } from '../theme/colors'

interface PaintColor {
  name: string
  hex: string
  id: string
}

interface ColorGroup {
  title: string
  colors: readonly PaintColor[]
}

const PAINT_COLORS: ColorGroup[] = [
  {
    title: 'Oq Ranglar',
    colors: UyTamirTheme.paintColors.whites,
  },
  {
    title: 'Ko\'k Ranglar',
    colors: UyTamirTheme.paintColors.blues,
  },
  {
    title: 'Kulrang Ranglar',
    colors: UyTamirTheme.paintColors.grays,
  },
  {
    title: 'Aksent Ranglar',
    colors: UyTamirTheme.paintColors.accent,
  },
]

const STAGES = [
  { id: 0, name: 'Suvoq', uz: 'Suvoq' },
  { id: 1, name: 'Shpaklovka', uz: 'Shpaklovka' },
  { id: 2, name: 'Bo\'yoq', uz: 'Bo\'yoq/Oboi' },
  { id: 3, name: 'Pol', uz: 'Pol' },
  { id: 4, name: 'Mebel', uz: 'Mebel' },
  { id: 5, name: 'Elektr', uz: 'Elektr' },
  { id: 6, name: 'Yorug\'lik', uz: 'Yorug\'lik' },
  { id: 7, name: 'Santexnika', uz: 'Santexnika' },
]

interface B3OnboardingRailProps {
  navigation?: any
}

export default function B3OnboardingRailScreen({ navigation }: B3OnboardingRailProps) {
  const activeRoom = useAppStore((state) => state.activeRoom)
  const roomState = useAppStore((state) => state.roomState)

  const selectedPaintColor = useRoomStateStore((state) => state.selectedPaintColor)
  const setSelectedPaintColor = useRoomStateStore((state) => state.setSelectedPaintColor)
  const isRailOpen = useRoomStateStore((state) => state.isRailOpen)
  const toggleRail = useRoomStateStore((state) => state.toggleRail)
  const completedStages = useRoomStateStore((state) => state.completedStages)
  const markStageComplete = useRoomStateStore((state) => state.markStageComplete)

  const [slideAnim] = useState(new Animated.Value(0))
  const [draggedColor, setDraggedColor] = useState<string | null>(null)

  // Animate rail open/close
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isRailOpen ? 0 : 1,
      duration: 300,
      useNativeDriver: false,
    }).start()
  }, [isRailOpen])

  if (!activeRoom || !roomState) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <Text className="text-lg text-gray-600">Xona ma'lumotini yuklashda xato</Text>
      </View>
    )
  }

  const handleColorSelect = (colorId: string) => {
    setSelectedPaintColor(colorId)
  }

  const handleDragStart = (colorId: string) => {
    setDraggedColor(colorId)
  }

  const handleDragEnd = () => {
    setDraggedColor(null)
    if (draggedColor) {
      // Animate to show the drag was successful
      setSelectedPaintColor(draggedColor)
    }
  }

  const railTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 300],
  })

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-4">
        <Text className="text-2xl font-bold text-white">Material Tanlash</Text>
        <Text className="text-blue-100 text-sm">
          Rang va materiallarni tanlang, buraklab saqlang
        </Text>
      </View>

      <View className="flex-1 flex-row relative">
        {/* Main content area */}
        <ScrollView className="flex-1 bg-white">
          {/* Stage progress indicator */}
          <View className="px-4 py-6 bg-gradient-to-b from-blue-50 to-white">
            <Text className="text-sm font-semibold text-gray-700 mb-4">
              Qoplash bosqichlari
            </Text>

            {/* Vertical progress line */}
            <View className="space-y-0">
              {STAGES.map((stage, index) => {
                const isCompleted = completedStages.has(stage.id)
                const isLast = index === STAGES.length - 1

                return (
                  <View key={stage.id} className="flex-row items-center">
                    {/* Timeline dot */}
                    <View
                      className={`w-4 h-4 rounded-full border-2 z-10 ${
                        isCompleted
                          ? 'bg-green-500 border-green-600'
                          : 'bg-white border-gray-300'
                      }`}
                    />

                    {/* Timeline line */}
                    {!isLast && (
                      <View
                        className={`absolute left-1.5 top-7 w-0.5 h-12 ${
                          isCompleted ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      />
                    )}

                    {/* Stage label */}
                    <TouchableOpacity
                      onPress={() => {
                        if (!isCompleted) {
                          markStageComplete(stage.id)
                        }
                      }}
                      className="ml-4 py-2 px-3 rounded-lg flex-1 flex-row justify-between items-center"
                    >
                      <View>
                        <Text
                          className={`text-sm font-semibold ${
                            isCompleted
                              ? 'text-green-600'
                              : 'text-gray-700'
                          }`}
                        >
                          {stage.uz}
                        </Text>
                      </View>
                      {isCompleted && (
                        <Text className="text-green-600 font-bold">✓</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )
              })}
            </View>

            {/* Progress summary */}
            <View className="mt-6 bg-blue-100 rounded-lg p-3 border border-blue-300">
              <Text className="text-xs font-semibold text-blue-900">
                {completedStages.size}/{STAGES.length} bosqich tugallandi
              </Text>
              <View className="w-full h-2 bg-blue-200 rounded-full mt-2 overflow-hidden">
                <View
                  className="h-full bg-blue-600 rounded-full"
                  style={{
                    width: `${(completedStages.size / STAGES.length) * 100}%`,
                  }}
                />
              </View>
            </View>
          </View>

          {/* Info section */}
          <View className="px-4 py-6 border-t border-gray-200">
            <Text className="text-sm font-semibold text-gray-700 mb-3">
              Hozirgi Holat
            </Text>
            <View className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg p-4 border border-orange-200">
              <View className="flex-row items-center gap-2 mb-2">
                <Text className="text-2xl">
                  {roomState.current_state === 'korobka' && '🏗️'}
                  {roomState.current_state === 'suvoq' && '💨'}
                  {roomState.current_state === 'shpaklovka' && '✨'}
                </Text>
                <Text className="text-sm font-semibold text-gray-900">
                  {roomState.current_state === 'korobka' &&
                    'Korobka (Qurilish bosqichi)'}
                  {roomState.current_state === 'suvoq' &&
                    'Suvoq (Qurutirish)'}
                  {roomState.current_state === 'shpaklovka' &&
                    'Shpaklovka (Tekislash)'}
                </Text>
              </View>
              <Text className="text-xs text-gray-700 leading-4">
                Xonaning hozirgi tutatish bosqichi yuqorida ko'rsatilgan. Rang va
                materiallarni shu bosqichga mos tanlang.
              </Text>
            </View>
          </View>

          {/* Spacer for rail interaction hint */}
          <View className="h-12" />
        </ScrollView>

        {/* Material rail - right side */}
        <Animated.View
          style={{
            transform: [{ translateX: railTranslateX }],
            width: 300,
            backgroundColor: '#F9FAFB',
            borderLeftWidth: 1,
            borderLeftColor: '#E5E7EB',
          }}
          className="absolute right-0 top-0 bottom-0 z-50"
        >
          <View className="flex-1 flex-col">
            {/* Rail header */}
            <View className="px-4 py-4 bg-gradient-to-r from-blue-600 to-blue-500 flex-row items-center justify-between">
              <Text className="text-white font-bold text-sm">Ranglar</Text>
              <TouchableOpacity
                onPress={toggleRail}
                className="w-8 h-8 items-center justify-center"
              >
                <Text className="text-white text-xl">{isRailOpen ? '❯' : '❮'}</Text>
              </TouchableOpacity>
            </View>

            {/* Color swatches - vertical column */}
            <ScrollView
              className="flex-1 px-3 py-4"
              showsVerticalScrollIndicator={false}
            >
              {PAINT_COLORS.map((group) => (
                <View key={group.title} className="mb-6">
                  <Text className="text-xs font-bold text-gray-700 mb-3 px-1">
                    {group.title}
                  </Text>

                  {group.colors.map((color) => (
                    <TouchableOpacity
                      key={color.id}
                      onPress={() => handleColorSelect(color.id)}
                      onLongPress={() => handleDragStart(color.id)}
                      className={`mb-2 rounded-lg overflow-hidden border-2 transition-all ${
                        selectedPaintColor === color.id
                          ? 'border-blue-600 scale-105'
                          : 'border-gray-300'
                      } ${draggedColor === color.id ? 'opacity-70' : 'opacity-100'}`}
                    >
                      <View
                        className="w-full h-16"
                        style={{ backgroundColor: color.hex }}
                      >
                        <View className="flex-1 justify-end items-center pb-1">
                          {selectedPaintColor === color.id && (
                            <Text className="text-xs font-bold text-blue-600">
                              ✓
                            </Text>
                          )}
                        </View>
                      </View>

                      {/* Color label */}
                      <View className="bg-white px-2 py-1">
                        <Text className="text-xs font-semibold text-gray-900">
                          {color.name}
                        </Text>
                        <Text className="text-xs text-gray-500">{color.hex}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>

            {/* Rail footer hint */}
            <View className="px-3 py-3 bg-blue-50 border-t border-gray-200">
              <Text className="text-xs text-blue-700 font-semibold">
                💡 Rangni uzoq bosib buraklab tayyorlang
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Rail toggle button - when rail is closed */}
        {!isRailOpen && (
          <TouchableOpacity
            onPress={toggleRail}
            className="absolute right-0 top-1/2 transform -translate-y-12 bg-blue-600 rounded-l-lg px-2 py-4 z-40"
          >
            <Text className="text-white font-bold">❮</Text>
            <Text className="text-white text-xs font-semibold mt-1">Ranglar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom navigation */}
      <View className="bg-white border-t border-gray-200 px-4 py-4 flex-row gap-3">
        <TouchableOpacity
          onPress={() => navigation?.goBack()}
          className="flex-1 rounded-lg py-3 items-center border border-gray-300"
        >
          <Text className="text-gray-700 font-semibold">Orqaga</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            if (selectedPaintColor) {
              navigation?.navigate('Estimate')
            }
          }}
          disabled={!selectedPaintColor}
          className={`flex-1 rounded-lg py-3 items-center ${
            selectedPaintColor ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <Text className="text-white font-semibold">
            {selectedPaintColor ? 'Davom et' : 'Rang tanlang'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
