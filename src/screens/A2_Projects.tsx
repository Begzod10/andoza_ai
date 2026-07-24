import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native'
import { useAppStore } from '../store/appStore'
import api from '../config/api'

export default function ProjectsScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true)
  const projects = useAppStore((state) => state.projects)
  const setProjects = useAppStore((state) => state.setProjects)
  const setActiveProject = useAppStore((state) => state.setActiveProject)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      const response = await api.get('/projects')
      if (response.data.success) {
        setProjects(response.data.data || [])
      }
    } catch (error) {
      console.error('Error loading projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectProject = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    if (project) {
      setActiveProject(project)
      navigation.navigate('Measurement')
    }
  }

  const handleCreateProject = () => {
    // Navigate to entry sheet
    navigation.navigate('Projects')
  }

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#0066cc" />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-6 bg-blue-600">
        <Text className="text-2xl font-bold text-white">Loyihalarim</Text>
        <Text className="text-blue-100 text-sm mt-1">
          {projects.length} loyiha
        </Text>
      </View>

      {projects.length === 0 ? (
        // Empty State
        <View className="flex-1 justify-center items-center px-4">
          <Text className="text-5xl mb-4">📭</Text>
          <Text className="text-xl font-semibold text-gray-900 mb-2">
            Hozircha loyiha yo'q
          </Text>
          <Text className="text-gray-600 text-center mb-6">
            Birinchi loyihangizni yaratib, remontlash jarayonini boshlang
          </Text>
          <TouchableOpacity
            onPress={handleCreateProject}
            className="bg-blue-600 px-8 py-3 rounded-lg"
          >
            <Text className="text-white font-semibold">+ Yangi loyiha</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // Projects List
        <ScrollView className="flex-1 px-4 py-6">
          {projects.map((project: any) => (
            <TouchableOpacity
              key={project.id}
              onPress={() => handleSelectProject(project.id)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-3"
            >
              <View className="flex-row justify-between items-start">
                <View className="flex-1">
                  <Text className="text-lg font-semibold text-gray-900">
                    {project.name || 'Nomatsiz loyiha'}
                  </Text>
                  <Text className="text-sm text-gray-600 mt-1">
                    {project.rooms?.length || 0} xona
                  </Text>
                </View>
                <Text className="text-2xl">→</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Add New Button */}
      {projects.length > 0 && (
        <View className="border-t border-gray-200 px-4 py-4">
          <TouchableOpacity
            onPress={handleCreateProject}
            className="bg-blue-600 py-4 rounded-lg"
          >
            <Text className="text-white font-semibold text-center">+ Yangi loyiha</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}
