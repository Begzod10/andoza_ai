import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Backend URL - adjust for environment
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
})

// Add auth token to requests
apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle token refresh on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        const response = await axios.post(`${API_URL}/auth/refresh`, {}, {
          withCredentials: true,
        })
        const { access_token } = response.data
        await AsyncStorage.setItem('access_token', access_token)
        originalRequest.headers.Authorization = `Bearer ${access_token}`
        return apiClient(originalRequest)
      } catch (err) {
        // Redirect to login
        await AsyncStorage.removeItem('access_token')
        // TODO: Navigate to login
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
