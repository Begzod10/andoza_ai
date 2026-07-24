import React from 'react'
import { View, Text, TouchableOpacity } from 'react-native'

interface Stage {
  id: number
  uz: string
  name: string
}

interface StageProgressIndicatorProps {
  stages: Stage[]
  completedStages: Set<number>
  onStagePress?: (stageId: number) => void
}

export function StageProgressIndicator({
  stages,
  completedStages,
  onStagePress,
}: StageProgressIndicatorProps) {
  const progressPercentage = Math.round(
    (completedStages.size / stages.length) * 100
  )

  return (
    <View className="space-y-0">
      {stages.map((stage, index) => {
        const isCompleted = completedStages.has(stage.id)
        const isLast = index === stages.length - 1

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
              onPress={() => onStagePress?.(stage.id)}
              className="ml-4 py-2 px-3 rounded-lg flex-1 flex-row justify-between items-center"
            >
              <View>
                <Text
                  className={`text-sm font-semibold ${
                    isCompleted ? 'text-green-600' : 'text-gray-700'
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

      {/* Progress summary */}
      <View className="mt-6 bg-blue-100 rounded-lg p-3 border border-blue-300">
        <Text className="text-xs font-semibold text-blue-900 mb-2">
          {completedStages.size}/{stages.length} bosqich tugallandi
        </Text>
        <View className="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
          <View
            className="h-full bg-blue-600 rounded-full"
            style={{ width: `${progressPercentage}%` }}
          />
        </View>
      </View>
    </View>
  )
}
